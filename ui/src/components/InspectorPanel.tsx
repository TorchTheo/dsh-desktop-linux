import { useState } from 'react'
import { Check, Copy, FolderOpen, RefreshCw, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

function formatNum(n: number): string {
  return n.toLocaleString('zh-CN')
}

function formatDateTime(ms: number): string {
  if (!ms) return '--'
  const d = new Date(ms)
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function mapSandbox(mode: string | null | undefined): string {
  if (!mode) return '默认'
  if (mode === 'danger-full-access') return '完全访问'
  if (mode === 'workspace-write') return '工作区可写'
  if (mode === 'read-only') return '只读模式'
  return mode
}

function mapApproval(policy: string | null | undefined): string {
  if (!policy) return '默认'
  if (policy === 'never') return '自动放行'
  if (policy === 'on-request') return '按需审批'
  if (policy === 'always') return '每次审批'
  return policy
}

export function InspectorPanel() {
  const inspectorOpen = useAppStore((s) => s.inspectorOpen)
  const setInspectorOpen = useAppStore((s) => s.setInspectorOpen)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const sessions = useAppStore((s) => s.sessions)
  const config = useAppStore((s) => s.config)
  const bridgeCapabilities = useAppStore((s) => s.bridgeCapabilities)
  const sessionMetaById = useAppStore((s) => s.sessionMetaById)
  const telemetryBySession = useAppStore((s) => s.telemetryBySession)
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
  const telemetry = activeSessionId ? telemetryBySession[activeSessionId] : undefined
  const messages = activeSessionId ? (messagesBySession[activeSessionId] ?? []) : []
  const subagents = activeSessionId ? (subagentsBySession[activeSessionId] ?? []) : []
  const pendingApprovals = approvals.filter(
    (a) => !activeSessionId || a.sessionId === activeSessionId,
  )
  const pendingQuestions = questions.filter(
    (q) => !activeSessionId || q.sessionId === activeSessionId,
  )

  const totalInput = telemetry ? telemetry.uncachedInputTokens + telemetry.cacheReadTokens : 0
  const cacheRate = totalInput > 0 ? Math.round((telemetry!.cacheReadTokens / totalInput) * 1000) / 10 : 0
  const totalTokens = telemetry ? totalInput + telemetry.cacheWriteTokens + telemetry.outputTokens : 0
  const contextPct =
    telemetry?.surfaceTokens && telemetry.contextWindow
      ? Math.min(100, Math.round((telemetry.surfaceTokens / telemetry.contextWindow) * 1000) / 10)
      : null

  const handleCopyId = () => {
    if (!session) return
    void navigator.clipboard?.writeText(session.sessionId)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <aside className="flex h-full min-h-0 w-80 shrink-0 flex-col py-3 pr-3">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[#D8D5CB] bg-[#FAF9F5]">
        <div className="flex items-center justify-between border-b border-[#D8D5CB] px-4 py-2.5">
          <span className="text-xs font-semibold tracking-wide text-[#141413]">会话详情</span>
          <div className="flex items-center gap-1">
            {session?.persisted && (
              <button
                type="button"
                onClick={() => void loadSessionHistory(session.sessionId, true)}
                title="重新加载本地历史记录"
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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 text-xs">
          {/* 会话基础信息 */}
          <section className="space-y-2">
            <div className="text-[11px] font-semibold text-[#575652]">会话概览</div>

            {session ? (
              <div className="divide-y divide-[#ECEAE2] rounded border border-[#D8D5CB] bg-[#F4F3EE]/60 px-3 text-[11px]">
                <div className="flex items-center justify-between py-2">
                  <span className="text-[#8A8880]">会话编号</span>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="font-mono-tabular inline-flex items-center gap-1 text-[#141413] hover:text-[#1E4D9B]"
                    title={session.sessionId}
                  >
                    <span>{session.sessionId.slice(0, 12)}</span>
                    {copied ? <Check className="h-3 w-3 text-[#246A4D]" /> : <Copy className="h-3 w-3 opacity-60" />}
                  </button>
                </div>

                <div className="flex items-center justify-between py-2">
                  <span className="text-[#8A8880]">运行状态</span>
                  <span className={`font-semibold ${session.status === 'running' ? 'text-[#D13B27]' : 'text-[#246A4D]'}`}>
                    {session.status === 'running' ? '运行中' : '空闲'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 py-2">
                  <span className="text-[#8A8880]">模型路由</span>
                  <span className="font-mono-tabular truncate text-right text-[#141413]">
                    {meta?.provider ?? config?.provider ?? '-'} / {meta?.model ?? config?.model ?? '-'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-2">
                  <span className="text-[#8A8880]">回合 / 消息</span>
                  <span className="font-mono-tabular text-[#141413]">
                    {telemetry?.turnCount ?? 0} 回合 · {messages.length} 条
                  </span>
                </div>

                <div className="flex items-center justify-between py-2">
                  <span className="text-[#8A8880]">创建时间</span>
                  <span className="font-mono-tabular text-[#575652]">{formatDateTime(session.createdAt)}</span>
                </div>

                <div className="flex items-center justify-between py-2">
                  <span className="text-[#8A8880]">最近活跃</span>
                  <span className="font-mono-tabular text-[#575652]">{formatDateTime(session.updatedAt)}</span>
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

          {/* Token 与缓存统计 */}
          <section className="space-y-2">
            <div className="text-[11px] font-semibold text-[#575652]">Token 与缓存统计</div>
            <div className="space-y-2.5 rounded border border-[#D8D5CB] bg-[#F4F3EE]/60 p-3 text-[11px]">
              <div className="flex items-baseline justify-between">
                <span className="text-[#8A8880]">缓存命中率</span>
                <span className="font-mono-tabular text-base font-semibold text-[#246A4D]">
                  {totalInput > 0 ? `${cacheRate}%` : '--'}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-sm bg-[#ECEAE2]">
                <div
                  style={{ width: `${Math.min(100, cacheRate)}%` }}
                  className="h-full bg-[#246A4D]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 font-mono-tabular">
                <div className="rounded border border-[#ECEAE2] bg-[#FAF9F5] px-2 py-1.5">
                  <div className="text-[10px] text-[#8A8880]">缓存读取</div>
                  <div className="mt-0.5 font-semibold text-[#141413]">
                    {formatNum(telemetry?.cacheReadTokens ?? 0)}
                  </div>
                </div>
                <div className="rounded border border-[#ECEAE2] bg-[#FAF9F5] px-2 py-1.5">
                  <div className="text-[10px] text-[#8A8880]">未缓存输入</div>
                  <div className="mt-0.5 font-semibold text-[#141413]">
                    {formatNum(telemetry?.uncachedInputTokens ?? 0)}
                  </div>
                </div>
                <div className="rounded border border-[#ECEAE2] bg-[#FAF9F5] px-2 py-1.5">
                  <div className="text-[10px] text-[#8A8880]">输出 Token</div>
                  <div className="mt-0.5 font-semibold text-[#141413]">
                    {formatNum(telemetry?.outputTokens ?? 0)}
                  </div>
                </div>
                <div className="rounded border border-[#ECEAE2] bg-[#FAF9F5] px-2 py-1.5">
                  <div className="text-[10px] text-[#8A8880]">累计总计</div>
                  <div className="mt-0.5 font-semibold text-[#141413]">{formatNum(totalTokens)}</div>
                </div>
              </div>
            </div>
          </section>

          {/* 上下文窗口构成 */}
          {telemetry && (telemetry.surfaceTokens !== null || telemetry.systemTokens !== null) && (
            <section className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-[#575652]">上下文构成</span>
                {contextPct !== null && (
                  <span className="font-mono-tabular text-[#8A8880]">{contextPct}%</span>
                )}
              </div>
              <div className="divide-y divide-[#ECEAE2] rounded border border-[#D8D5CB] bg-[#F4F3EE]/60 px-3 text-[11px]">
                {telemetry.surfaceTokens !== null && telemetry.contextWindow !== null && (
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-[#8A8880]">当前窗口</span>
                    <span className="font-mono-tabular text-[#141413]">
                      {formatNum(telemetry.surfaceTokens)} / {formatNum(telemetry.contextWindow)}
                    </span>
                  </div>
                )}
                {telemetry.systemTokens !== null && (
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-[#8A8880]">系统提示词</span>
                    <span className="font-mono-tabular text-[#141413]">{formatNum(telemetry.systemTokens)}</span>
                  </div>
                )}
                {telemetry.toolsTokens !== null && (
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-[#8A8880]">工具定义</span>
                    <span className="font-mono-tabular text-[#141413]">{formatNum(telemetry.toolsTokens)}</span>
                  </div>
                )}
                {telemetry.messageTokens !== null && (
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-[#8A8880]">对话消息</span>
                    <span className="font-mono-tabular text-[#141413]">{formatNum(telemetry.messageTokens)}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 安全策略与工作区快照 */}
          <section className="space-y-2">
            <div className="text-[11px] font-semibold text-[#575652]">安全与运行能力</div>
            <div className="divide-y divide-[#ECEAE2] rounded border border-[#D8D5CB] bg-[#F4F3EE]/60 px-3 text-[11px]">
              <div className="flex items-center justify-between py-1.5">
                <span className="text-[#8A8880]">沙箱权限</span>
                <span className="text-[#141413]">{mapSandbox(telemetry?.sandboxMode)}</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-[#8A8880]">审批策略</span>
                <span className="text-[#141413]">{mapApproval(telemetry?.approvalPolicy)}</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-[#8A8880]">工作区快照</span>
                <span className="font-mono-tabular text-[#141413]">
                  {telemetry?.snapshotCount ?? 0} 个可回滚点
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-[#8A8880]">桥接能力</span>
                <span className="text-[#575652]">
                  {[
                    bridgeCapabilities.streamDelta && '流式',
                    bridgeCapabilities.abort && '中断',
                    bridgeCapabilities.modelControl && '热切',
                  ]
                    .filter(Boolean)
                    .join(' · ') || '基础模式'}
                </span>
              </div>
            </div>
          </section>

          {/* 子代理 */}
          <section className="space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-[#575652]">子代理</span>
              <span className="font-mono-tabular text-[#8A8880]">{subagents.length}</span>
            </div>

            {subagents.length === 0 ? (
              <div className="rounded border border-dashed border-[#D8D5CB] px-3 py-3 text-center text-[11px] text-[#8A8880]">
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
                      <span className="text-[10px] text-[#575652]">
                        {sa.kind === 'started' ? '运行中' : sa.status === 'ok' ? '已完成' : '异常'}
                      </span>
                    </div>
                    {sa.stopReason && (
                      <div className="mt-1 text-[10px] text-[#8A8880]">停止原因：{sa.stopReason}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(pendingApprovals.length > 0 || pendingQuestions.length > 0) && (
            <section className="space-y-1.5 rounded border border-[#C4881C]/50 bg-[#C4881C]/8 p-3 text-[11px]">
              <div className="font-semibold text-[#8E6210]">待处理操作</div>
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
