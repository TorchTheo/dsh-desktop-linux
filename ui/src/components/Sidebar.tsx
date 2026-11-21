import { useMemo } from 'react'
import {
  Archive,
  FolderOpen,
  Loader2,
  Pin,
  Plus,
  Search,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

function basename(path: string): string {
  const parts = path.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || path
}

function formatRelativeTime(ms: number): string {
  if (!ms) return ''
  const diff = Date.now() - ms
  if (diff < 60_000) return 'NOW'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  const d = new Date(ms)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

export function Sidebar() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const workspaces = useAppStore((s) => s.workspaces)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const selectedWorkspaceId = useAppStore((s) => s.selectedWorkspaceId)
  const searchQuery = useAppStore((s) => s.searchQuery)
  const showArchived = useAppStore((s) => s.showArchived)
  const loadingHistoryId = useAppStore((s) => s.loadingHistoryId)
  const workerStatus = useAppStore((s) => s.workerStatus)

  const selectSession = useAppStore((s) => s.selectSession)
  const createSession = useAppStore((s) => s.createSession)
  const setSelectedWorkspaceId = useAppStore((s) => s.setSelectedWorkspaceId)
  const setSearchQuery = useAppStore((s) => s.setSearchQuery)
  const setShowArchived = useAppStore((s) => s.setShowArchived)

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

  if (!sidebarOpen) return null

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col py-3 pl-3">
      <div className="flex h-full flex-col overflow-hidden rounded-lg border border-[#D8D5CB] bg-[#FAF9F5]">
        <div className="flex items-center justify-between border-b border-[#D8D5CB] px-3.5 py-2.5">
          <span className="font-mono-tabular text-[11px] font-semibold uppercase tracking-[0.12em] text-[#575652]">
            Sessions
          </span>
          <button
            type="button"
            onClick={() => void createSession()}
            disabled={workerStatus.state !== 'ready'}
            title="新建会话"
            className="inline-flex items-center gap-1 rounded border border-[#141413] bg-[#141413] px-2 py-1 text-[11px] font-medium text-[#FAF9F5] transition hover:bg-[#D13B27] hover:border-[#D13B27] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Plus className="h-3 w-3" />
            新建
          </button>
        </div>

        <div className="space-y-2 border-b border-[#D8D5CB] px-3 py-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-[#8A8880]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="检索会话或目录..."
              className="w-full rounded border border-[#D8D5CB] bg-[#F4F3EE] py-1.5 pl-8 pr-2.5 text-xs text-[#141413] placeholder-[#8A8880] focus:border-[#141413] focus:bg-[#FAF9F5] focus:outline-none"
            />
          </div>

          {workspaces.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setSelectedWorkspaceId(null)}
                className={`rounded px-2 py-0.5 font-mono-tabular text-[10px] font-medium transition ${
                  selectedWorkspaceId === null
                    ? 'bg-[#141413] text-[#FAF9F5]'
                    : 'bg-[#ECEAE2] text-[#575652] hover:bg-[#E5E2D8] hover:text-[#141413]'
                }`}
              >
                ALL · {sessions.length}
              </button>
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() =>
                    setSelectedWorkspaceId(selectedWorkspaceId === ws.id ? null : ws.id)
                  }
                  title={ws.path}
                  className={`max-w-[135px] truncate rounded px-2 py-0.5 text-[10px] font-medium transition ${
                    selectedWorkspaceId === ws.id
                      ? 'bg-[#1E4D9B] text-[#FAF9F5]'
                      : 'bg-[#ECEAE2] text-[#575652] hover:bg-[#E5E2D8] hover:text-[#141413]'
                  }`}
                >
                  {ws.title || basename(ws.path)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-1.5">
          {filteredSessions.length === 0 ? (
            <div className="px-3 py-10 text-center text-xs text-[#8A8880]">
              {searchQuery ? '无匹配会话' : '暂无会话记录'}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {filteredSessions.map((session) => {
                const active = session.sessionId === activeSessionId
                const isLoading = loadingHistoryId === session.sessionId
                return (
                  <li key={session.sessionId}>
                    <button
                      type="button"
                      onClick={() => void selectSession(session.sessionId)}
                      className={`relative flex w-full flex-col rounded-md px-2.5 py-2 text-left transition ${
                        active
                          ? 'bg-[#ECEAE2] text-[#141413]'
                          : 'text-[#575652] hover:bg-[#F4F3EE] hover:text-[#141413]'
                      }`}
                    >
                      {active && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] bg-[#D13B27]" />
                      )}
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {session.status === 'running' || isLoading ? (
                            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[#D13B27]" />
                          ) : session.pinned ? (
                            <Pin className="h-3 w-3 shrink-0 text-[#C4881C]" />
                          ) : null}
                          <span className="truncate text-xs font-medium text-[#141413]">
                            {session.title}
                          </span>
                        </div>
                        <span className="font-mono-tabular shrink-0 text-[10px] text-[#8A8880]">
                          {formatRelativeTime(session.updatedAt)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-1 text-[10px] text-[#8A8880]">
                        <span className="flex min-w-0 items-center gap-1">
                          <FolderOpen className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate" title={session.cwd}>
                            {basename(session.cwd)}
                          </span>
                        </span>
                        {session.persisted && (
                          <span className="font-mono-tabular shrink-0 uppercase tracking-wider text-[9px] text-[#8A8880]">
                            LOG
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

        <div className="flex items-center justify-between border-t border-[#D8D5CB] bg-[#F4F3EE]/60 px-3 py-2 text-[10px] text-[#8A8880]">
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
          <span className="font-mono-tabular">{filteredSessions.length} ITEMS</span>
        </div>
      </div>
    </aside>
  )
}
