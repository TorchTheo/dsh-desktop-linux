import { useMemo } from 'react'
import {
  Archive,
  FolderOpen,
  History,
  Loader2,
  MessageSquare,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Settings,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

function basename(path: string): string {
  const parts = path.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || path
}

function formatRelativeTime(ms: number): string {
  if (!ms) return ''
  const diff = Date.now() - ms
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function Sidebar() {
  const workspaces = useAppStore((s) => s.workspaces)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const selectedWorkspaceId = useAppStore((s) => s.selectedWorkspaceId)
  const searchQuery = useAppStore((s) => s.searchQuery)
  const showArchived = useAppStore((s) => s.showArchived)
  const loadingHistoryId = useAppStore((s) => s.loadingHistoryId)
  const workerStatus = useAppStore((s) => s.workerStatus)
  const config = useAppStore((s) => s.config)

  const selectSession = useAppStore((s) => s.selectSession)
  const createSession = useAppStore((s) => s.createSession)
  const refreshSessions = useAppStore((s) => s.refreshSessions)
  const setSelectedWorkspaceId = useAppStore((s) => s.setSelectedWorkspaceId)
  const setSearchQuery = useAppStore((s) => s.setSearchQuery)
  const setShowArchived = useAppStore((s) => s.setShowArchived)
  const restartWorker = useAppStore((s) => s.restartWorker)
  const startWorker = useAppStore((s) => s.startWorker)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)

  const filteredSessions = useMemo(() => {
    const selectedWs = workspaces.find((w) => w.id === selectedWorkspaceId)
    const wsSessionSet = selectedWs ? new Set(selectedWs.sessionIds) : null
    const q = searchQuery.trim().toLowerCase()

    return sessions
      .filter((s) => (showArchived ? true : !s.archived))
      .filter((s) => {
        if (!selectedWs) return true
        return wsSessionSet!.has(s.sessionId) || s.cwd === selectedWs.path
      })
      .filter((s) => {
        if (!q) return true
        return s.title.toLowerCase().includes(q) || s.cwd.toLowerCase().includes(q)
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return b.updatedAt - a.updatedAt
      })
  }, [sessions, workspaces, selectedWorkspaceId, searchQuery, showArchived])

  const statusColor =
    workerStatus.state === 'ready'
      ? 'bg-emerald-400'
      : workerStatus.state === 'starting'
        ? 'bg-amber-400 animate-pulse'
        : workerStatus.state === 'error'
          ? 'bg-rose-500'
          : 'bg-slate-500'

  const statusLabel =
    workerStatus.state === 'ready'
      ? `SDK 就绪 (${workerStatus.serverVersion})`
      : workerStatus.state === 'starting'
        ? '正在启动 dsh sdk...'
        : workerStatus.state === 'error'
          ? '后端异常'
          : workerStatus.state === 'stopped'
            ? '后端已停止'
            : '未连接'

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-[#21262d] bg-[#0b0f14]">
      <div className="flex items-center justify-between border-b border-[#21262d] px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold tracking-wide text-[#e6edf3]">DSH Desktop</h1>
          {config && (
            <p className="truncate text-[11px] text-[#8b949e]" title={`${config.provider} / ${config.model}`}>
              {config.provider} · {config.model}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void refreshSessions()}
            title="刷新 ~/.dsh 历史会话"
            className="rounded-md p-1.5 text-[#8b949e] transition hover:bg-[#161b22] hover:text-[#e6edf3]"
          >
            <History className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void createSession()}
            disabled={workerStatus.state !== 'ready'}
            title="新建会话"
            className="inline-flex items-center gap-1 rounded-md border border-[#30363d] bg-[#161b22] px-2.5 py-1.5 text-xs font-medium text-[#e6edf3] transition hover:border-[#58a6ff] hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            新建
          </button>
        </div>
      </div>

      <div className="space-y-2 border-b border-[#21262d] px-3 py-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-[#6e7681]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索历史会话或目录..."
            className="w-full rounded-md border border-[#30363d] bg-[#0d1117] py-1.5 pl-8 pr-2.5 text-xs text-[#e6edf3] placeholder-[#6e7681] focus:border-blue-500 focus:outline-none"
          />
        </div>

        {workspaces.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setSelectedWorkspaceId(null)}
              className={`rounded-md px-2 py-0.5 text-[11px] transition ${
                selectedWorkspaceId === null
                  ? 'bg-blue-500/20 text-blue-200 ring-1 ring-blue-500/40'
                  : 'bg-[#161b22] text-[#8b949e] hover:text-[#e6edf3]'
              }`}
            >
              全部 ({sessions.length})
            </button>
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                type="button"
                onClick={() =>
                  setSelectedWorkspaceId(selectedWorkspaceId === ws.id ? null : ws.id)
                }
                title={ws.path}
                className={`max-w-[140px] truncate rounded-md px-2 py-0.5 text-[11px] transition ${
                  selectedWorkspaceId === ws.id
                    ? 'bg-blue-500/20 text-blue-200 ring-1 ring-blue-500/40'
                    : 'bg-[#161b22] text-[#8b949e] hover:text-[#e6edf3]'
                }`}
              >
                {ws.title || basename(ws.path)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {filteredSessions.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-[#6e7681]">
            {searchQuery ? '未找到匹配的会话' : '暂无会话，点击「新建」开始对话'}
          </div>
        ) : (
          <ul className="space-y-1">
            {filteredSessions.map((session) => {
              const active = session.sessionId === activeSessionId
              const isLoading = loadingHistoryId === session.sessionId
              return (
                <li key={session.sessionId}>
                  <button
                    type="button"
                    onClick={() => void selectSession(session.sessionId)}
                    className={`group flex w-full flex-col rounded-lg px-3 py-2 text-left transition ${
                      active
                        ? 'bg-[#1c2430] text-[#e6edf3] ring-1 ring-[#388bfd]/50'
                        : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#e6edf3]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {session.status === 'running' || isLoading ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-400" />
                        ) : session.pinned ? (
                          <Pin className="h-3 w-3 shrink-0 text-amber-400" />
                        ) : (
                          <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
                        )}
                        <span className="truncate text-xs font-medium">{session.title}</span>
                      </div>
                      <span className="shrink-0 text-[10px] text-[#6e7681]">
                        {formatRelativeTime(session.updatedAt)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-1 text-[11px] text-[#6e7681]">
                      <span className="flex min-w-0 items-center gap-1">
                        <FolderOpen className="h-3 w-3 shrink-0" />
                        <span className="truncate" title={session.cwd}>
                          {basename(session.cwd)}
                        </span>
                      </span>
                      {session.persisted && (
                        <span className="shrink-0 rounded bg-[#161b22] px-1 text-[10px] text-[#6e7681]">
                          历史
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-[#21262d] p-3">
        <div className="mb-2 flex items-center justify-between text-[11px] text-[#6e7681]">
          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition ${
              showArchived ? 'bg-[#161b22] text-[#e6edf3]' : 'hover:text-[#c9d1d9]'
            }`}
          >
            <Archive className="h-3 w-3" />
            {showArchived ? '隐藏归档' : '显示归档'}
          </button>
          <span>共 {filteredSessions.length} 个会话</span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${statusColor}`} />
            <span
              className="truncate text-xs text-[#8b949e]"
              title={workerStatus.state === 'error' ? workerStatus.message : statusLabel}
            >
              {statusLabel}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                void (workerStatus.state === 'ready' ? restartWorker() : startWorker())
              }
              title={workerStatus.state === 'ready' ? '重启 dsh sdk 后端' : '启动 dsh sdk 后端'}
              className="rounded-md p-1.5 text-[#8b949e] transition hover:bg-[#161b22] hover:text-[#e6edf3]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title="设置"
              className="rounded-md p-1.5 text-[#8b949e] transition hover:bg-[#161b22] hover:text-[#e6edf3]"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {workerStatus.state === 'error' && (
          <p className="mt-2 line-clamp-2 rounded bg-rose-950/50 px-2 py-1 text-[11px] text-rose-300">
            {workerStatus.message}
          </p>
        )}
      </div>
    </aside>
  )
}
