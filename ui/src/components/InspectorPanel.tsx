import { useState } from 'react'
import { Check, Copy, FolderOpen, RefreshCw, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export function InspectorPanel() {
  const inspectorOpen = useAppStore((s) => s.inspectorOpen)
  const setInspectorOpen = useAppStore((s) => s.setInspectorOpen)
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
    <aside className="flex h-full w-72 shrink-0 flex-col py-3 pr-3">
      <div className="flex h-full flex-col overflow-hidden rounded-lg border border-[#D8D5CB] bg-[#FAF9F5]">
        <div className="flex items-center justify-between border-b border-[#D8D5CB] px-4 py-2.5">
          <span className="font-mono-tabular text-[11px] font-semibold uppercase tracking-[0.12em] text-[#575652]">
            会话详情
          </span>
          <div className="flex items-center gap-1">
            {session?.persisted && (
              <button
                type="button"
                onClick={() => void loadSessionHistory(session.sessionId, true)}
                title="从 ~/.dsh 重新加载历史消息"
                className="rounded p-1 text-[#575652] hover:bg-[#ECEAE2] hover:text-[#141413]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setInspectorOpen(false)}
              title="关闭详情面板"
              className="rounded p-1 text-[#575652] hover:bg-[#ECEAE2] hover:text-[#141413]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
          <section className="space-y-2.5">
            <div className="font-mono-tabular text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8A8880]">
              会话信息
            </div>

            {session ? (
              <div className="divide-y divide-[#ECEAE2] rounded border border-[#D8D5CB] bg-[#F4F3EE]/60 px-3 text-[11px]">
                <div className="flex items-center justify-between py-2">
                  <span className="text-[#8A8880]">编号</span>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="font-mono-tabular inline-flex items-center gap-1 text-[#141413] hover:text-[#1E4D9B]"
                    title={session.sessionId}
                  >
                    <span>{session.sessionId.slice(0, 12)}</span>
                    {copied ? (
                      <Check className="h-3 w-3 text-[#246A4D]" />
                    ) : (
                      <Copy className="h-3 w-3 opacity-60" />
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-between py-2">
                  <span className="text-[#8A8880]">状态</span>
                  <span
                    className={`font-mono-tabular text-[10px] font-semibold uppercase ${
                      session.status === 'running' ? 'text-[#D13B27]' : 'text-[#246A4D]'
                    }`}
                  >
                    {session.status === 'running' ? '运行中' : '空闲'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 py-2">
                  <span className="text-[#8A8880]">当前路由</span>
                  <span className="font-mono-tabular truncate text-right text-[#141413]">
                    {meta?.provider ?? config?.provider ?? '-'} / {meta?.model ?? config?.model ?? '-'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-2">
                  <span className="text-[#8A8880]">消息数</span>
                  <span className="font-mono-tabular text-[#141413]">{messages.length}</span>
                </div>

                <div className="py-2">
                  <div className="mb-1 text-[#8A8880]">工作目录</div>
                  <button
                    type="button"
                    onClick={() => void pickAndSetWorkingDirectory()}
                    className="font-mono-tabular flex w-full items-center gap-1.5 rounded border border-[#D8D5CB] bg-[#FAF9F5] px-2 py-1 text-left text-[10px] text-[#141413] hover:border-[#1E4D9B]"
                    title={session.cwd}
                  >
                    <FolderOpen className="h-3 w-3 shrink-0 text-[#1E4D9B]" />
                    <span className="truncate">{session.cwd}</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-[#8A8880]">尚未选择会话</p>
            )}
          </section>

          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8A8880]">
                子代理
              </span>
              <span className="font-mono-tabular text-[10px] text-[#8A8880]">{subagents.length}</span>
            </div>

            {subagents.length === 0 ? (
              <div className="rounded border border-dashed border-[#D8D5CB] px-3 py-4 text-center text-[11px] text-[#8A8880]">
                当前会话无子代理分支
              </div>
            ) : (
              <ul className="relative space-y-2 border-l border-[#D8D5CB] pl-3">
                {subagents.map((sa) => (
                  <li
                    key={sa.childSessionId}
                    className="relative rounded border border-[#D8D5CB] bg-[#F4F3EE]/60 px-2.5 py-2 text-[11px]"
                  >
                    <span
                      className={`absolute -left-[16.5px] top-3 h-2 w-2 rotate-45 ${
                        sa.kind === 'started'
                          ? 'bg-[#1E4D9B] animate-pulse'
                          : sa.status === 'ok'
                            ? 'bg-[#246A4D]'
                            : 'bg-[#D13B27]'
                      }`}
                    />
                    <div className="flex items-center justify-between">
                      <span className="font-mono-tabular font-medium text-[#141413]">
                        {sa.childSessionId.slice(0, 10)}
                      </span>
                      <span className="font-mono-tabular text-[10px] uppercase text-[#575652]">
                        {sa.status ?? sa.kind}
                      </span>
                    </div>
                    {sa.stopReason && (
                      <div className="mt-1 text-[10px] text-[#8A8880]">
                        停止原因 · {sa.stopReason}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(pendingApprovals.length > 0 || pendingQuestions.length > 0) && (
            <section className="space-y-1.5 rounded border border-[#C4881C]/50 bg-[#C4881C]/8 p-3 text-[11px]">
              <div className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-[#8E6210]">
                待处理操作
              </div>
              {pendingApprovals.length > 0 && (
                <div className="text-[#141413]">{pendingApprovals.length} 项工具审批待确认</div>
              )}
              {pendingQuestions.length > 0 && (
                <div className="text-[#1E4D9B]">{pendingQuestions.length} 项结构化问答待回复</div>
              )}
            </section>
          )}
        </div>
      </div>
    </aside>
  )
}
