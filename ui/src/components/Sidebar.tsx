import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Folder,
  Copy,
  FolderOpen,
  GitFork,
  Pencil,
  Loader2,
  Pin,
  Plus,
  Search,
} from 'lucide-react'
import { useDshSlots } from '../plugins/dshPluginHost'
import { useAppStore } from '../store/useAppStore'
import type { SessionSummary } from '../types/domain'

function basename(path: string): string {
  const parts = path.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || path
}

function formatRelativeTime(ms: number): string {
  if (!ms) return ''
  const diff = Date.now() - ms
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`
  const d = new Date(ms)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

interface WorkspaceTreeNode {
  key: string
  title: string
  path: string
  sessions: SessionSummary[]
}

export function Sidebar() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const activeView = useAppStore((s) => s.activeView)
  const activePluginPanelKey = useAppStore((s) => s.activePluginPanelKey)
  const openPluginPanel = useAppStore((s) => s.openPluginPanel)
  const panelSlots = useDshSlots('sidebar.panellist')
  const workspaces = useAppStore((s) => s.workspaces)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const searchQuery = useAppStore((s) => s.searchQuery)
  const showArchived = useAppStore((s) => s.showArchived)
  const loadingHistoryId = useAppStore((s) => s.loadingHistoryId)
  const workerStatus = useAppStore((s) => s.workerStatus)

  const selectSession = useAppStore((s) => s.selectSession)
  const createSession = useAppStore((s) => s.createSession)
  const forkSession = useAppStore((s) => s.forkSession)
  const updateSessionMeta = useAppStore((s) => s.updateSessionMeta)
  const setSearchQuery = useAppStore((s) => s.setSearchQuery)
  const setShowArchived = useAppStore((s) => s.setShowArchived)

  const DEFAULT_VISIBLE = 5
  const [collapsedDirs, setCollapsedDirs] = useState<Record<string, boolean>>({})
  const [expandedAllDirs, setExpandedAllDirs] = useState<Record<string, boolean>>({})
  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    session: SessionSummary
    x: number
    y: number
  } | null>(null)
  const [renameTarget, setRenameTarget] = useState<{
    sessionId: string
    value: string
  } | null>(null)

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
    }
  }, [contextMenu])

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      useAppStore.setState({ noticeBanner: `已复制${label}` })
    } catch {
      useAppStore.setState({ errorBanner: `复制${label}失败` })
    }
  }

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      const el = listScrollRef.current
      if (!el) return
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight)
      if (maxScroll === 0) {
        el.scrollTop = 0
      } else if (el.scrollTop > maxScroll) {
        el.scrollTop = maxScroll
      }
    })
    return () => window.cancelAnimationFrame(raf)
  }, [expandedAllDirs, collapsedDirs, searchQuery, showArchived, sessions.length])

  const tree = useMemo<WorkspaceTreeNode[]>(() => {
    const q = searchQuery.trim().toLowerCase()
    const visibleSessions = sessions
      .filter((s) => (showArchived ? true : !s.archived))
      .filter((s) => {
        if (!q) return true
        return s.title.toLowerCase().includes(q) || s.cwd.toLowerCase().includes(q)
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return b.updatedAt - a.updatedAt
      })

    const map = new Map<string, WorkspaceTreeNode>()
    for (const ws of workspaces) {
      map.set(ws.path, {
        key: ws.path,
        title: ws.title || basename(ws.path),
        path: ws.path,
        sessions: [],
      })
    }

    for (const session of visibleSessions) {
      let targetKey = session.cwd || '/'
      const matchedWs = workspaces.find(
        (w) => w.sessionIds.includes(session.sessionId) || w.path === session.cwd,
      )
      if (matchedWs) {
        targetKey = matchedWs.path
      }
      if (!map.has(targetKey)) {
        map.set(targetKey, {
          key: targetKey,
          title: basename(targetKey),
          path: targetKey,
          sessions: [],
        })
      }
      map.get(targetKey)!.sessions.push(session)
    }

    return Array.from(map.values())
      .filter((node) => node.sessions.length > 0 || (!q && workspaces.some((w) => w.path === node.path)))
      .sort((a, b) => {
        const latestA = a.sessions[0]?.updatedAt ?? 0
        const latestB = b.sessions[0]?.updatedAt ?? 0
        return latestB - latestA
      })
  }, [workspaces, sessions, searchQuery, showArchived])

  const totalVisible = useMemo(
    () => tree.reduce((acc, node) => acc + node.sessions.length, 0),
    [tree],
  )

  if (!sidebarOpen) return null

  const toggleDir = (key: string) => {
    setCollapsedDirs((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <aside className="flex h-full min-h-0 w-68 shrink-0 flex-col py-3 pl-3">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-3.5 py-2.5">
          <span className="text-xs font-semibold tracking-wide text-[var(--ink-primary)]">工作区与会话</span>
          <button
            type="button"
            onClick={() => void createSession()}
            disabled={workerStatus.state !== 'ready'}
            title="新建会话"
            className="inline-flex items-center gap-1 rounded border border-[var(--ink-primary)] bg-[var(--ink-primary)] px-2 py-1 text-[11px] font-medium text-[var(--bg-surface)] transition hover:border-[var(--brand-primary)] hover:bg-[var(--brand-primary)] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Plus className="h-3 w-3" />
            新建
          </button>
        </div>

        <div className="border-b border-[var(--border-hairline)] px-3 py-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-[var(--ink-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索工作区或会话..."
              className="w-full rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] py-1.5 pl-8 pr-2.5 text-xs text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:border-[var(--ink-primary)] focus:bg-[var(--bg-surface)] focus:outline-none"
            />
          </div>
        </div>

        <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          {tree.length === 0 ? (
            <div className="px-3 py-10 text-center text-xs text-[var(--ink-muted)]">
              {searchQuery ? '未找到匹配的会话' : '暂无工作区或会话'}
            </div>
          ) : (
            <div className="space-y-1.5">
              {tree.map((node) => {
                const isExpanded = searchQuery.trim().length > 0 || !collapsedDirs[node.key]
                return (
                  <div key={node.key}>
                    <div className="group flex items-center justify-between gap-1 rounded px-1.5 py-1.5 hover:bg-[var(--bg-recessed)]/70">
                      <button
                        type="button"
                        onClick={() => toggleDir(node.key)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                        title={node.path}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--ink-muted)]" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--ink-muted)]" />
                        )}
                        {isExpanded ? (
                          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--brand-secondary)]" />
                        ) : (
                          <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--ink-secondary)]" />
                        )}
                        <span className="truncate text-xs font-semibold text-[var(--ink-primary)]">
                          {node.title}
                        </span>
                        <span className="font-mono-tabular shrink-0 text-[10px] text-[var(--ink-muted)]">
                          ({node.sessions.length})
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={workerStatus.state !== 'ready'}
                        onClick={() => void createSession(node.path)}
                        title={`在「${node.title}」中新建会话`}
                        className="rounded p-0.5 text-[var(--ink-muted)] opacity-0 transition hover:bg-[var(--border-hairline)]/70 hover:text-[var(--ink-primary)] group-hover:opacity-100 disabled:opacity-0"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {isExpanded && (
                      <ul className="ml-3.5 mt-0.5 space-y-0.5 border-l border-[var(--border-hairline)] pl-2">
                        {node.sessions.length === 0 ? (
                          <li className="px-2 py-1.5 text-[11px] text-[var(--ink-muted)]">暂无会话</li>
                        ) : (
                          (searchQuery.trim() || expandedAllDirs[node.key] ? node.sessions : node.sessions.slice(0, DEFAULT_VISIBLE)).map((session) => {
                            const active = session.sessionId === activeSessionId
                            const isLoading = loadingHistoryId === session.sessionId
                            const displayTitle =
                              session.title === 'New session' || session.title === 'Untitled session'
                                ? '新建会话'
                                : session.title
                            return (
                              <li key={session.sessionId}>
                                <button
                                  type="button"
                                  onClick={() => void selectSession(session.sessionId)}
                                  onContextMenu={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    const menuW = 192
                                    const menuH = 260
                                    const x = Math.min(e.clientX, window.innerWidth - menuW - 8)
                                    const y = Math.min(e.clientY, window.innerHeight - menuH - 8)
                                    setContextMenu({ session, x: Math.max(8, x), y: Math.max(8, y) })
                                  }}
                                  className={`relative flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left transition ${
                                    active
                                      ? 'bg-[var(--bg-recessed)] text-[var(--ink-primary)]'
                                      : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-canvas)] hover:text-[var(--ink-primary)]'
                                  }`}
                                >
                                  {active && (
                                    <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-[var(--brand-primary)]" />
                                  )}
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    {session.status === 'running' || isLoading ? (
                                      <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[var(--brand-primary)]" />
                                    ) : session.pinned ? (
                                      <Pin className="h-3 w-3 shrink-0 text-[var(--status-warn)]" />
                                    ) : null}
                                    <span className="truncate text-xs">{displayTitle}</span>
                                  </div>
                                  <span className="font-mono-tabular shrink-0 text-[10px] text-[var(--ink-muted)]">
                                    {formatRelativeTime(session.updatedAt)}
                                  </span>
                                </button>
                              </li>
                            )
                          })
                        )}
                        {!searchQuery.trim() && node.sessions.length > DEFAULT_VISIBLE && (
                          <li>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedAllDirs((prev) => ({
                                  ...prev,
                                  [node.key]: !prev[node.key],
                                }))
                              }
                              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] text-[var(--ink-muted)] transition hover:bg-[var(--bg-canvas)] hover:text-[var(--ink-primary)]"
                            >
                              <span className="font-mono-tabular font-semibold tracking-widest">...</span>
                              <span>
                                {expandedAllDirs[node.key]
                                  ? "收起"
                                  : `展开其余 ${node.sessions.length - DEFAULT_VISIBLE} 条`}
                              </span>
                            </button>
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {panelSlots.length > 0 && (
          <div className="shrink-0 border-t border-[var(--border-hairline)] bg-[var(--bg-canvas)]/70 px-2.5 py-2">
            <div className="mb-1.5 px-1 font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
              扩展面板
            </div>
            <div className="space-y-1">
              {panelSlots.map((entry) => {
                const panelKey = entry.id ?? entry.key ?? entry.uid
                const active = activeView === 'plugin-panel' && activePluginPanelKey === panelKey
                const IconComp = entry.Component
                return (
                  <button
                    key={entry.uid}
                    type="button"
                    onClick={() => openPluginPanel(panelKey)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium transition ${
                      active
                        ? 'bg-[var(--ink-primary)] text-[var(--bg-surface)]'
                        : 'text-[var(--ink-primary)] hover:bg-[var(--bg-recessed)]'
                    }`}
                  >
                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
                      <IconComp size={15} />
                    </span>
                    <span className="truncate">{entry.label ?? panelKey}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-[var(--border-hairline)] bg-[var(--bg-canvas)]/60 px-3 py-2 text-[11px] text-[var(--ink-muted)]">
          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition ${
              showArchived ? 'bg-[var(--bg-recessed)] text-[var(--ink-primary)]' : 'hover:text-[var(--ink-primary)]'
            }`}
          >
            <Archive className="h-3 w-3" />
            {showArchived ? '隐藏归档' : '显示归档'}
          </button>
          <span className="font-mono-tabular">共 {totalVisible} 条会话</span>
        </div>
      </div>

      {contextMenu && (
        <div
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          className="fixed z-50 w-48 overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] py-1 shadow-md"
        >
          <button
            type="button"
            onClick={() => {
              const s = contextMenu.session
              setContextMenu(null)
              void updateSessionMeta(s.sessionId, { pinned: !s.pinned })
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--ink-primary)] hover:bg-[var(--bg-recessed)]"
          >
            <Pin className="h-3.5 w-3.5 text-[var(--ink-secondary)]" />
            {contextMenu.session.pinned ? '取消置顶' : '置顶会话'}
          </button>

          <button
            type="button"
            onClick={() => {
              const s = contextMenu.session
              setContextMenu(null)
              const current =
                s.title === 'New session' || s.title === 'Untitled session' ? '' : s.title
              setRenameTarget({ sessionId: s.sessionId, value: current })
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--ink-primary)] hover:bg-[var(--bg-recessed)]"
          >
            <Pencil className="h-3.5 w-3.5 text-[var(--ink-secondary)]" />
            重命名会话
          </button>

          <button
            type="button"
            disabled={workerStatus.state !== 'ready'}
            onClick={() => {
              const s = contextMenu.session
              setContextMenu(null)
              void forkSession(s.sessionId)
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--ink-primary)] hover:bg-[var(--bg-recessed)] disabled:opacity-45"
          >
            <GitFork className="h-3.5 w-3.5 text-[var(--brand-secondary)]" />
            分叉会话（Fork）
          </button>

          <button
            type="button"
            onClick={() => {
              const s = contextMenu.session
              setContextMenu(null)
              void updateSessionMeta(s.sessionId, { archived: !s.archived })
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--ink-primary)] hover:bg-[var(--bg-recessed)]"
          >
            <Archive className="h-3.5 w-3.5 text-[var(--ink-secondary)]" />
            {contextMenu.session.archived ? '取消归档' : '归档会话'}
          </button>

          <div className="my-1 border-t border-[var(--bg-recessed)]" />

          <button
            type="button"
            onClick={() => {
              const id = contextMenu.session.sessionId
              setContextMenu(null)
              void copyText(id, '会话 ID')
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--ink-secondary)] hover:bg-[var(--bg-recessed)] hover:text-[var(--ink-primary)]"
          >
            <Copy className="h-3.5 w-3.5" />
            复制会话 ID
          </button>

          <button
            type="button"
            onClick={() => {
              const cwd = contextMenu.session.cwd
              setContextMenu(null)
              void copyText(cwd, '工作区路径')
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--ink-secondary)] hover:bg-[var(--bg-recessed)] hover:text-[var(--ink-primary)]"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            复制工作区路径
          </button>
        </div>
      )}

      {renameTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink-primary)]/35 p-4 backdrop-blur-[2px]"
          onMouseDown={() => setRenameTarget(null)}
        >
          <form
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              const trimmed = renameTarget.value.trim()
              if (!trimmed) return
              const id = renameTarget.sessionId
              setRenameTarget(null)
              void updateSessionMeta(id, { title: trimmed })
            }}
            className="w-full max-w-sm rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] p-4 shadow-md"
          >
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 bg-[var(--brand-primary)]" />
              <h3 className="text-xs font-semibold tracking-wide text-[var(--ink-primary)]">重命名会话</h3>
            </div>
            <input
              type="text"
              autoFocus
              value={renameTarget.value}
              onChange={(e) => setRenameTarget({ ...renameTarget, value: e.target.value })}
              placeholder="输入新的会话标题"
              className="mt-3 w-full rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:border-[var(--ink-primary)] focus:bg-[var(--bg-surface)] focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1 text-xs text-[var(--ink-secondary)] hover:bg-[var(--bg-recessed)] hover:text-[var(--ink-primary)]"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={!renameTarget.value.trim()}
                className="rounded bg-[var(--ink-primary)] px-3 py-1 text-xs font-medium text-[var(--bg-surface)] hover:bg-[var(--ink-hover)] disabled:opacity-45"
              >
                保存
              </button>
            </div>
          </form>
        </div>
      )}
    </aside>
  )
}
