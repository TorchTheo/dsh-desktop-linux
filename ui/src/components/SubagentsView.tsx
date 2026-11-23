import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bot,
  GitBranch,
  Loader2,
  RefreshCw,
  User,
  AlertCircle,
  Clock,
  Cpu,
} from 'lucide-react'
import * as api from '../api/tauri'
import { useAppStore } from '../store/useAppStore'
import type { SubagentNode, UiSessionDetail } from '../types/domain'
import {
  flattenSubagentTree,
  formatStopReason,
  formatSubagentStatusLabel,
  mergeSubagentTree,
  subagentStatusBadgeClass,
  subagentStatusDotClass,
} from '../utils/subagentStatus'
import {
  formatClock,
  groupMessagesIntoTurns,
  ProcessGroupDisclosure,
  renderBlock,
} from './ChatStream'

function formatTimeShort(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

function SubagentTreeBranch({
  nodes,
  depth,
  selectedId,
  onSelect,
}: {
  nodes: SubagentNode[]
  depth: number
  selectedId: string | null
  onSelect: (sessionId: string) => void
}) {
  return (
    <ul className={depth === 0 ? 'space-y-2' : 'mt-2 space-y-2'}>
      {nodes.map((node, index) => {
        const isLast = index === nodes.length - 1
        const isSelected = selectedId === node.sessionId
        const statusLabel = formatSubagentStatusLabel(node.status)
        const stopReasonText = formatStopReason(node.stopReason)

        return (
          <li key={node.sessionId} className="relative pl-6">
            {/* Vertical connector line */}
            <span
              aria-hidden="true"
              className={`absolute left-2 top-0 w-px bg-[var(--border-strong)] ${
                isLast ? 'h-5' : 'bottom-0'
              }`}
            />
            {/* Horizontal branch tick */}
            <span
              aria-hidden="true"
              className="absolute left-2 top-5 h-px w-4 bg-[var(--border-strong)]"
            />

            <button
              type="button"
              onClick={() => onSelect(node.sessionId)}
              className={`group block w-full rounded-lg border px-3 py-2.5 text-left transition ${
                isSelected
                  ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/8 shadow-xs'
                  : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]/60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${subagentStatusDotClass(node.status)}`}
                    />
                    <span className="truncate text-xs font-semibold text-[var(--ink-primary)]">
                      {node.label || node.name || `子代理 ${node.sessionId.slice(0, 8)}`}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono-tabular text-[10px] text-[var(--ink-muted)]">
                    <span>{node.sessionId.slice(0, 8)}</span>
                    {node.name && node.label && <span>· {node.name}</span>}
                    {node.model && (
                      <span className="inline-flex items-center gap-0.5 text-[var(--ink-secondary)]">
                        <Cpu className="h-2.5 w-2.5" />
                        {node.model}
                      </span>
                    )}
                    {node.createdAt > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {formatTimeShort(node.createdAt)}
                      </span>
                    )}
                  </div>
                </div>

                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${subagentStatusBadgeClass(node.status)}`}
                >
                  {statusLabel}
                </span>
              </div>

              {stopReasonText && (
                <div className="mt-1.5 text-[11px] text-[var(--ink-secondary)]">
                  原因：{stopReasonText}
                </div>
              )}
            </button>

            {node.children.length > 0 && (
              <div className="ml-2">
                <SubagentTreeBranch
                  nodes={node.children}
                  depth={depth + 1}
                  selectedId={selectedId}
                  onSelect={onSelect}
                />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function SubagentsView() {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const sessions = useAppStore((s) => s.sessions)
  const subagentTreeBySession = useAppStore((s) => s.subagentTreeBySession)
  const subagentsBySession = useAppStore((s) => s.subagentsBySession)
  const selectedSubagentBySession = useAppStore((s) => s.selectedSubagentBySession)
  const setSelectedSubagent = useAppStore((s) => s.setSelectedSubagent)
  const loadSessionHistory = useAppStore((s) => s.loadSessionHistory)

  const activeSession = sessions.find((s) => s.sessionId === activeSessionId)

  const treeNodes = useMemo(() => {
    if (!activeSessionId) return []
    const diskTree = subagentTreeBySession[activeSessionId] ?? []
    const liveEvents = subagentsBySession[activeSessionId] ?? []
    return mergeSubagentTree(diskTree, liveEvents, activeSessionId)
  }, [activeSessionId, subagentTreeBySession, subagentsBySession])

  const flatNodes = useMemo(() => flattenSubagentTree(treeNodes), [treeNodes])

  const selectedId =
    (activeSessionId ? selectedSubagentBySession[activeSessionId] : null) ??
    flatNodes[0]?.sessionId ??
    null

  const selectedNode = useMemo(
    () => flatNodes.find((n) => n.sessionId === selectedId) ?? null,
    [flatNodes, selectedId],
  )

  const [detailByChildId, setDetailByChildId] = useState<Record<string, UiSessionDetail>>({})
  const [loadingChildId, setLoadingChildId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const fetchChildTranscript = useCallback(async (childId: string) => {
    setLoadingChildId(childId)
    setLoadError(null)
    try {
      const detail = await api.loadSessionHistory(childId)
      setDetailByChildId((prev) => ({ ...prev, [childId]: detail }))
    } catch (error) {
      setLoadError(`无法加载子代理对话记录：${String(error)}`)
    } finally {
      setLoadingChildId((cur) => (cur === childId ? null : cur))
    }
  }, [])

  useEffect(() => {
    if (!selectedId) return
    if (!detailByChildId[selectedId]) {
      void fetchChildTranscript(selectedId)
    }
  }, [selectedId, detailByChildId, fetchChildTranscript])

  const selectedDetail = selectedId ? detailByChildId[selectedId] : undefined
  const childTurns = useMemo(
    () => groupMessagesIntoTurns(selectedDetail?.messages ?? []),
    [selectedDetail?.messages],
  )

  if (!activeSessionId || !activeSession) {
    return (
      <section className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[var(--bg-canvas)] px-6 text-center">
        <GitBranch className="mb-3 h-8 w-8 text-[var(--ink-muted)]" />
        <p className="text-sm font-medium text-[var(--ink-primary)]">尚未创建会话</p>
        <p className="mt-1 text-xs text-[var(--ink-secondary)]">
          发送消息开始对话后，该会话派生的子代理树与执行记录将在此展示。
        </p>
      </section>
    )
  }

  return (
    <section className="flex min-h-0 flex-1 overflow-hidden bg-[var(--bg-canvas)]">
      {/* Left pane: Subagent Relationship Tree */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-[var(--border-hairline)] bg-[var(--bg-recessed)]/35 lg:w-96">
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <GitBranch className="h-3.5 w-3.5 text-[var(--brand-primary)]" />
            <span className="text-xs font-semibold text-[var(--ink-primary)]">子代理关系树</span>
            <span className="rounded bg-[var(--bg-recessed)] px-1.5 py-0.5 font-mono-tabular text-[10px] text-[var(--ink-secondary)]">
              {flatNodes.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              void loadSessionHistory(activeSessionId, true)
              if (selectedId) void fetchChildTranscript(selectedId)
            }}
            title="刷新子代理树与对话记录"
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-[var(--ink-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--ink-primary)]"
          >
            <RefreshCw className="h-3 w-3" />
            <span>刷新</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {/* Root Session Node */}
          <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2.5 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-semibold text-[var(--ink-primary)]">
                主会话 · {activeSession.title === 'New session' ? '新建会话' : activeSession.title}
              </span>
              <span className="shrink-0 rounded border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/10 px-1.5 py-0.5 font-mono-tabular text-[10px] text-[var(--brand-primary)]">
                根节点
              </span>
            </div>
            <div className="mt-1 font-mono-tabular text-[10px] text-[var(--ink-muted)]">
              {activeSession.sessionId.slice(0, 8)} · 共 {flatNodes.length} 个子代理
            </div>
          </div>

          {treeNodes.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-[var(--border-hairline)] bg-[var(--bg-surface)]/50 px-4 py-8 text-center">
              <GitBranch className="mx-auto mb-2 h-6 w-6 text-[var(--ink-muted)]" />
              <p className="text-xs font-medium text-[var(--ink-secondary)]">当前会话暂无子代理</p>
              <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
                当主会话派发后台子任务时，子代理层级树会实时展示在这里。
              </p>
            </div>
          ) : (
            <div className="mt-2">
              <SubagentTreeBranch
                nodes={treeNodes}
                depth={0}
                selectedId={selectedId}
                onSelect={(childId) => {
                  setSelectedSubagent(activeSessionId, childId)
                }}
              />
            </div>
          )}
        </div>
      </aside>

      {/* Right pane: Selected Subagent Conversation Viewer */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg-canvas)]">
        {!selectedNode ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-xs text-[var(--ink-muted)]">
            在左侧关系树中点击任意子代理节点，即可查看该子代理的完整对话与执行过程。
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)] px-5 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${subagentStatusDotClass(selectedNode.status)}`}
                  />
                  <h3 className="truncate text-sm font-semibold text-[var(--ink-primary)]">
                    {selectedNode.label || selectedNode.name || '子代理会话'}
                  </h3>
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${subagentStatusBadgeClass(selectedNode.status)}`}
                  >
                    {formatSubagentStatusLabel(selectedNode.status)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono-tabular text-[11px] text-[var(--ink-muted)]">
                  <span>ID: {selectedNode.sessionId.slice(0, 12)}</span>
                  {selectedNode.name && <span>名称: {selectedNode.name}</span>}
                  {(selectedDetail?.model || selectedNode.model) && (
                    <span>模型: {selectedDetail?.model || selectedNode.model}</span>
                  )}
                  {selectedDetail?.telemetry && selectedDetail.telemetry.turnCount > 0 && (
                    <span>轮次: {selectedDetail.telemetry.turnCount}</span>
                  )}
                  {formatStopReason(selectedNode.stopReason) && (
                    <span className="text-[var(--ink-secondary)]">
                      · {formatStopReason(selectedNode.stopReason)}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void fetchChildTranscript(selectedNode.sessionId)}
                disabled={loadingChildId === selectedNode.sessionId}
                className="inline-flex items-center gap-1.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1 text-xs text-[var(--ink-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--ink-primary)] disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3 w-3 ${loadingChildId === selectedNode.sessionId ? 'animate-spin' : ''}`}
                />
                <span>刷新对话</span>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {loadingChildId === selectedNode.sessionId && !selectedDetail ? (
                <div className="flex items-center justify-center gap-2 py-12 text-xs text-[var(--ink-secondary)]">
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--brand-primary)]" />
                  <span>正在加载子代理对话记录...</span>
                </div>
              ) : loadError ? (
                <div className="mx-auto max-w-2xl rounded-lg border border-[var(--status-danger)]/35 bg-[var(--status-danger)]/8 px-4 py-3 text-xs text-[var(--status-danger-text)]">
                  {loadError}
                </div>
              ) : childTurns.length === 0 ? (
                <div className="py-12 text-center text-xs text-[var(--ink-muted)]">
                  该子代理暂无可展示的对话记录。
                </div>
              ) : (
                <div className="mx-auto max-w-4xl space-y-5">
                  {childTurns.map((turn) => {
                    if (turn.kind === 'user') {
                      return (
                        <div key={turn.id} className="flex justify-end">
                          <div className="max-w-[85%] rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-user-bubble)] px-4 py-3">
                            <div className="mb-1.5 flex items-center justify-between gap-3 text-[10px] text-[var(--ink-muted)]">
                              <span className="inline-flex items-center gap-1 font-medium text-[var(--ink-secondary)]">
                                <User className="h-3 w-3" />
                                派发任务
                              </span>
                              {turn.timestamp > 0 && (
                                <span className="font-mono-tabular">{formatClock(turn.timestamp)}</span>
                              )}
                            </div>
                            <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--ink-primary)]">
                              {turn.userText}
                            </div>
                          </div>
                        </div>
                      )
                    }

                    if (turn.kind === 'system') {
                      return (
                        <div
                          key={turn.id}
                          className="rounded-lg border border-[var(--status-danger)]/35 bg-[var(--status-danger)]/8 px-3.5 py-2.5 text-xs text-[var(--status-danger-text)]"
                        >
                          <div className="flex items-center gap-1.5 font-medium">
                            <AlertCircle className="h-3.5 w-3.5" />
                            <span>系统消息</span>
                          </div>
                          <div className="mt-1">
                            {turn.systemMessage?.blocks.map((b, i) => renderBlock(b, i))}
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div key={turn.id} className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--brand-primary)]">
                          <Bot className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-2 text-[11px] text-[var(--ink-muted)]">
                            <span className="font-medium text-[var(--ink-secondary)]">
                              {selectedNode.name || '子代理'}
                            </span>
                            {turn.timestamp > 0 && (
                              <span className="font-mono-tabular">{formatClock(turn.timestamp)}</span>
                            )}
                          </div>

                          {turn.processBlocks.length > 0 && (
                            <ProcessGroupDisclosure blocks={turn.processBlocks} />
                          )}

                          {turn.finalBlocks.length > 0 ? (
                            <div className="space-y-2">
                              {turn.finalBlocks.map((b, idx) => renderBlock(b, idx))}
                            </div>
                          ) : (
                            turn.processBlocks.length > 0 && (
                              <p className="text-xs italic text-[var(--ink-muted)]">
                                （该轮次在产生最终回复前已结束，可展开上方「执行过程」查看详细步骤）
                              </p>
                            )
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
