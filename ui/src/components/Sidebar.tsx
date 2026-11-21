import { useMemo, useState } from 'react'
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Loader2,
  Pin,
  Plus,
  Search,
} from 'lucide-react'
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
  const workspaces = useAppStore((s) => s.workspaces)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const searchQuery = useAppStore((s) => s.searchQuery)
  const showArchived = useAppStore((s) => s.showArchived)
  const loadingHistoryId = useAppStore((s) => s.loadingHistoryId)
  const workerStatus = useAppStore((s) => s.workerStatus)

  const selectSession = useAppStore((s) => s.selectSession)
  const createSession = useAppStore((s) => s.createSession)
  const setSearchQuery = useAppStore((s) => s.setSearchQuery)
  const setShowArchived = useAppStore((s) => s.setShowArchived)

  const DEFAULT_VISIBLE = 5
  const [collapsedDirs, setCollapsedDirs] = useState<Record<string, boolean>>({})
  const [expandedAllDirs, setExpandedAllDirs] = useState<Record<string, boolean>>({})

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
    <aside className="flex h-full w-68 shrink-0 flex-col py-3 pl-3">
      <div className="flex h-full flex-col overflow-hidden rounded-lg border border-[#D8D5CB] bg-[#FAF9F5]">
        <div className="flex items-center justify-between border-b border-[#D8D5CB] px-3.5 py-2.5">
          <span className="text-xs font-semibold tracking-wide text-[#141413]">工作区与会话</span>
          <button
            type="button"
            onClick={() => void createSession()}
            disabled={workerStatus.state !== 'ready'}
            title="新建会话"
            className="inline-flex items-center gap-1 rounded border border-[#141413] bg-[#141413] px-2 py-1 text-[11px] font-medium text-[#FAF9F5] transition hover:border-[#D13B27] hover:bg-[#D13B27] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Plus className="h-3 w-3" />
            新建
          </button>
        </div>

        <div className="border-b border-[#D8D5CB] px-3 py-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-[#8A8880]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索工作区或会话..."
              className="w-full rounded border border-[#D8D5CB] bg-[#F4F3EE] py-1.5 pl-8 pr-2.5 text-xs text-[#141413] placeholder-[#8A8880] focus:border-[#141413] focus:bg-[#FAF9F5] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {tree.length === 0 ? (
            <div className="px-3 py-10 text-center text-xs text-[#8A8880]">
              {searchQuery ? '未找到匹配的会话' : '暂无工作区或会话'}
            </div>
          ) : (
            <div className="space-y-1.5">
              {tree.map((node) => {
                const isExpanded = searchQuery.trim().length > 0 || !collapsedDirs[node.key]
                return (
                  <div key={node.key}>
                    <div className="group flex items-center justify-between gap-1 rounded px-1.5 py-1.5 hover:bg-[#ECEAE2]/70">
                      <button
                        type="button"
                        onClick={() => toggleDir(node.key)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                        title={node.path}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#8A8880]" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#8A8880]" />
                        )}
                        {isExpanded ? (
                          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#1E4D9B]" />
                        ) : (
                          <Folder className="h-3.5 w-3.5 shrink-0 text-[#575652]" />
                        )}
                        <span className="truncate text-xs font-semibold text-[#141413]">
                          {node.title}
                        </span>
                        <span className="font-mono-tabular shrink-0 text-[10px] text-[#8A8880]">
                          ({node.sessions.length})
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={workerStatus.state !== 'ready'}
                        onClick={() => void createSession(node.path)}
                        title={`在「${node.title}」中新建会话`}
                        className="rounded p-0.5 text-[#8A8880] opacity-0 transition hover:bg-[#D8D5CB]/70 hover:text-[#141413] group-hover:opacity-100 disabled:opacity-0"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {isExpanded && (
                      <ul className="ml-3.5 mt-0.5 space-y-0.5 border-l border-[#D8D5CB] pl-2">
                        {node.sessions.length === 0 ? (
                          <li className="px-2 py-1.5 text-[11px] text-[#8A8880]">暂无会话</li>
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
                                  className={`relative flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left transition ${
                                    active
                                      ? 'bg-[#ECEAE2] text-[#141413]'
                                      : 'text-[#575652] hover:bg-[#F4F3EE] hover:text-[#141413]'
                                  }`}
                                >
                                  {active && (
                                    <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-[#D13B27]" />
                                  )}
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    {session.status === 'running' || isLoading ? (
                                      <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[#D13B27]" />
                                    ) : session.pinned ? (
                                      <Pin className="h-3 w-3 shrink-0 text-[#C4881C]" />
                                    ) : null}
                                    <span className="truncate text-xs">{displayTitle}</span>
                                  </div>
                                  <span className="font-mono-tabular shrink-0 text-[10px] text-[#8A8880]">
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
                              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] text-[#8A8880] transition hover:bg-[#F4F3EE] hover:text-[#141413]"
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

        <div className="flex items-center justify-between border-t border-[#D8D5CB] bg-[#F4F3EE]/60 px-3 py-2 text-[11px] text-[#8A8880]">
          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition ${
              showArchived ? 'bg-[#ECEAE2] text-[#141413]' : 'hover:text-[#141413]'
            }`}
          >
            <Archive className="h-3 w-3" />
            {showArchived ? '隐藏归档' : '显示归档'}
          </button>
          <span className="font-mono-tabular">共 {totalVisible} 条会话</span>
        </div>
      </div>
    </aside>
  )
}
