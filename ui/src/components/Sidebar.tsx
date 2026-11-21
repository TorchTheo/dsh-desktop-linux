import { FolderOpen, Loader2, MessageSquare, Plus, RefreshCw, Settings } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

function basename(path: string): string {
  const parts = path.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || path
}

export function Sidebar() {
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const workerStatus = useAppStore((s) => s.workerStatus)
  const config = useAppStore((s) => s.config)
  const selectSession = useAppStore((s) => s.selectSession)
  const createSession = useAppStore((s) => s.createSession)
  const restartWorker = useAppStore((s) => s.restartWorker)
  const startWorker = useAppStore((s) => s.startWorker)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)

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
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-[#21262d] bg-[#0b0f14]">
      <div className="flex items-center justify-between border-b border-[#21262d] px-4 py-3">
        <div>
          <h1 className="text-sm font-semibold tracking-wide text-[#e6edf3]">DSH Desktop</h1>
          {config && (
            <p className="truncate text-[11px] text-[#8b949e]" title={`${config.provider} / ${config.model}`}>
              {config.provider} · {config.model}
            </p>
          )}
        </div>
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

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {sessions.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-[#6e7681]">
            暂无会话，点击右上角「新建」或直接输入消息开始对话
          </div>
        ) : (
          <ul className="space-y-1">
            {sessions.map((session) => {
              const active = session.sessionId === activeSessionId
              return (
                <li key={session.sessionId}>
                  <button
                    type="button"
                    onClick={() => selectSession(session.sessionId)}
                    className={`group flex w-full flex-col rounded-lg px-3 py-2 text-left transition ${
                      active
                        ? 'bg-[#1c2430] text-[#e6edf3] ring-1 ring-[#388bfd]/50'
                        : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#e6edf3]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {session.status === 'running' ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-400" />
                      ) : (
                        <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      )}
                      <span className="truncate text-xs font-medium">{session.title}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-[#6e7681]">
                      <FolderOpen className="h-3 w-3 shrink-0" />
                      <span className="truncate" title={session.cwd}>
                        {basename(session.cwd)}
                      </span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-[#21262d] p-3">
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
