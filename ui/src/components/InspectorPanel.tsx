import { useState } from 'react'
import {
  Bot,
  Check,
  Copy,
  FolderOpen,
  GitBranch,
  HelpCircle,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export function InspectorPanel() {
  const inspectorOpen = useAppStore((s) => s.inspectorOpen)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const sessions = useAppStore((s) => s.sessions)
  const config = useAppStore((s) => s.config)
  const sessionMetaById = useAppStore((s) => s.sessionMetaById)
  const messagesBySession = useAppStore((s) => s.messagesBySession)
  const subagentsBySession = useAppStore((s) => s.subagentsBySession)
  const approvals = useAppStore((s) => s.approvals)
  const questions = useAppStore((s) => s.questions)
  const loadSessionHistory = useAppStore((s) => s.loadSessionHistory)
  const pickAndSetWorkingDirectory = useAppStore((s) => s.pickAndSetWorkingDirectory)

  const [copied, setCopied] = useState(false)

  if (!inspectorOpen) return null

  const session = sessions.find((s) => s.sessionId === activeSessionId)
  const meta = activeSessionId ? sessionMetaById[activeSessionId] : undefined
  const messages = activeSessionId ? (messagesBySession[activeSessionId] ?? []) : []
  const subagents = activeSessionId ? (subagentsBySession[activeSessionId] ?? []) : []
  const pendingApprovals = approvals.filter(
    (a) => !activeSessionId || a.sessionId === activeSessionId,
  )
  const pendingQuestions = questions.filter(
    (q) => !activeSessionId || q.sessionId === activeSessionId,
  )

  const handleCopyId = () => {
    if (!session) return
    void navigator.clipboard?.writeText(session.sessionId)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-[#21262d] bg-[#0b0f14]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#21262d] px-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#8b949e]">
          Inspector
        </span>
        {session?.persisted && (
          <button
            type="button"
            onClick={() => void loadSessionHistory(session.sessionId, true)}
            title="从 ~/.dsh 重新加载历史消息"
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-[#8b949e] hover:bg-[#161b22] hover:text-[#e6edf3]"
          >
            <RefreshCw className="h-3 w-3" />
            重载
          </button>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
        <section className="space-y-2 rounded-xl border border-[#21262d] bg-[#11161d] p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#8b949e]">
            <Bot className="h-3.5 w-3.5 text-blue-400" />
            会话上下文
          </div>

          {session ? (
            <div className="space-y-2 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#6e7681]">Session ID</span>
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="inline-flex items-center gap-1 font-mono text-[#c9d1d9] hover:text-blue-400"
                  title={session.sessionId}
                >
                  <span>{session.sessionId.slice(0, 12)}</span>
                  {copied ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3 opacity-70" />
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[#6e7681]">状态</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    session.status === 'running'
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'bg-[#1c2128] text-[#8b949e]'
                  }`}
                >
                  {session.status === 'running' ? '运行中' : '空闲'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[#6e7681]">路由</span>
                <span className="truncate text-right text-[#c9d1d9]">
                  {meta?.provider ?? config?.provider ?? '-'} / {meta?.model ?? config?.model ?? '-'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[#6e7681]">消息数</span>
                <span className="text-[#c9d1d9]">{messages.length}</span>
              </div>

              <div className="pt-1">
                <div className="mb-1 text-[#6e7681]">工作目录</div>
                <button
                  type="button"
                  onClick={() => void pickAndSetWorkingDirectory()}
                  className="flex w-full items-center gap-1.5 rounded-md border border-[#30363d] bg-[#0d1117] px-2 py-1.5 text-left text-[11px] text-[#c9d1d9] hover:border-blue-500"
                  title={session.cwd}
                >
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                  <span className="truncate">{session.cwd}</span>
                </button>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-[#6e7681]">尚未选择会话</p>
          )}
        </section>

        <section className="space-y-2 rounded-xl border border-[#21262d] bg-[#11161d] p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-[#8b949e]">
              <GitBranch className="h-3.5 w-3.5 text-purple-400" />
              子代理 (Subagents)
            </span>
            <span className="text-[10px] text-[#6e7681]">{subagents.length}</span>
          </div>

          {subagents.length === 0 ? (
            <p className="text-[11px] text-[#6e7681]">当前会话无活跃子代理</p>
          ) : (
            <ul className="space-y-1.5">
              {subagents.map((sa) => (
                <li
                  key={sa.childSessionId}
                  className="rounded-lg border border-[#21262d] bg-[#0d1117] px-2.5 py-2 text-[11px]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[#c9d1d9]">{sa.childSessionId.slice(0, 10)}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] ${
                        sa.kind === 'started'
                          ? 'bg-blue-500/20 text-blue-300'
                          : sa.status === 'ok'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {sa.status ?? sa.kind}
                    </span>
                  </div>
                  {sa.stopReason && (
                    <div className="mt-1 text-[10px] text-[#6e7681]">停止原因：{sa.stopReason}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {(pendingApprovals.length > 0 || pendingQuestions.length > 0) && (
          <section className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-950/15 p-3">
            <div className="text-[11px] font-medium text-amber-200">待处理交互</div>
            {pendingApprovals.length > 0 && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-300">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                {pendingApprovals.length} 项工具审批等待确认
              </div>
            )}
            {pendingQuestions.length > 0 && (
              <div className="flex items-center gap-1.5 text-[11px] text-blue-300">
                <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                {pendingQuestions.length} 项问答等待回复
              </div>
            )}
          </section>
        )}
      </div>
    </aside>
  )
}
