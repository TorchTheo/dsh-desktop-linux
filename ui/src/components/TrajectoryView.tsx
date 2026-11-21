import { useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import type { SubagentEvent, UiMessage } from '../types/domain'

type FilterKind = 'all' | 'thinking' | 'tool' | 'subagent' | 'error'

interface TraceNode {
  id: string
  indexLabel: string
  kind: 'turn' | 'thinking' | 'tool' | 'response' | 'subagent' | 'error'
  title: string
  summary: string
  timestamp: number
  callId?: string
  status?: 'ok' | 'error' | 'running'
  input?: unknown
  output?: unknown
  textBody?: string
}

function stringifyPretty(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function summarizeText(text: string, max = 96): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine
}

function formatClock(ms: number): string {
  if (!ms) return '--:--:--'
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function buildTraceNodes(messages: UiMessage[], subagents: SubagentEvent[]): TraceNode[] {
  const resultByCallId = new Map<string, { content: unknown; isError: boolean }>()
  for (const msg of messages) {
    for (const block of msg.blocks) {
      if (block.type === 'toolResult') {
        resultByCallId.set(block.toolUseId, {
          content: block.content,
          isError: block.isError,
        })
      }
    }
  }

  const nodes: TraceNode[] = []
  let turn = 0
  let step = 0
  const pad = (n: number) => String(n).padStart(2, '0')

  for (const msg of messages) {
    if (msg.role === 'user') {
      turn += 1
      step = 0
      const text = msg.blocks
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
      nodes.push({
        id: `turn-${msg.id}`,
        indexLabel: `T${pad(turn)}`,
        kind: 'turn',
        title: `Turn ${pad(turn)} · User Prompt`,
        summary: summarizeText(text || '[Image Attachment]'),
        timestamp: msg.timestamp,
        textBody: text,
      })
      continue
    }

    if (msg.isError || msg.role === 'system') {
      step += 1
      const text = msg.blocks
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
      nodes.push({
        id: `err-${msg.id}`,
        indexLabel: `T${pad(Math.max(1, turn))}.S${pad(step)}`,
        kind: 'error',
        title: 'Runtime Error',
        summary: summarizeText(text || 'Execution attempt failed'),
        timestamp: msg.timestamp,
        status: 'error',
        textBody: text,
      })
      continue
    }

    for (let i = 0; i < msg.blocks.length; i += 1) {
      const block = msg.blocks[i]
      if (block.type === 'thinking') {
        step += 1
        nodes.push({
          id: `${msg.id}-think-${i}`,
          indexLabel: `T${pad(Math.max(1, turn))}.S${pad(step)}`,
          kind: 'thinking',
          title: 'Reasoning / Thinking',
          summary: summarizeText(block.thinking),
          timestamp: msg.timestamp,
          textBody: block.thinking,
        })
      } else if (block.type === 'toolUse') {
        step += 1
        const matched = resultByCallId.get(block.id)
        const inputStr = stringifyPretty(block.input)
        nodes.push({
          id: `${msg.id}-tool-${block.id}-${i}`,
          indexLabel: `T${pad(Math.max(1, turn))}.S${pad(step)}`,
          kind: 'tool',
          title: block.name,
          summary: summarizeText(inputStr || '(no arguments)'),
          timestamp: msg.timestamp,
          callId: block.id,
          status: matched ? (matched.isError ? 'error' : 'ok') : 'running',
          input: block.input,
          output: matched?.content,
        })
      } else if (block.type === 'text' && block.text.trim()) {
        step += 1
        nodes.push({
          id: `${msg.id}-text-${i}`,
          indexLabel: `T${pad(Math.max(1, turn))}.S${pad(step)}`,
          kind: 'response',
          title: 'Assistant Response',
          summary: summarizeText(block.text),
          timestamp: msg.timestamp,
          status: 'ok',
          textBody: block.text,
        })
      }
    }
  }

  for (const sa of subagents) {
    nodes.push({
      id: `subagent-${sa.childSessionId}`,
      indexLabel: 'SUB',
      kind: 'subagent',
      title: `Subagent · ${sa.childSessionId.slice(0, 10)}`,
      summary: sa.stopReason
        ? `${sa.status ?? sa.kind} · ${sa.stopReason}`
        : `status: ${sa.status ?? sa.kind}`,
      timestamp: Date.now(),
      status: sa.kind === 'started' ? 'running' : sa.status === 'ok' ? 'ok' : 'error',
      input: sa,
    })
  }

  return nodes
}

function NodeGlyph({ node }: { node: TraceNode }) {
  switch (node.kind) {
    case 'turn':
      return <span className="h-2.5 w-2.5 rounded-full bg-[#141413]" />
    case 'thinking':
      return <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-[#1E4D9B] bg-[#FAF9F5]" />
    case 'tool':
      return (
        <span
          className={`h-2.5 w-2.5 ${
            node.status === 'error'
              ? 'bg-[#D13B27]'
              : node.status === 'ok'
                ? 'bg-[#246A4D]'
                : 'bg-[#C4881C] animate-pulse'
          }`}
        />
      )
    case 'subagent':
      return <span className="h-2.5 w-2.5 rotate-45 bg-[#1E4D9B]" />
    case 'error':
      return <span className="h-2.5 w-2.5 bg-[#D13B27]" />
    case 'response':
      return <span className="h-2.5 w-2.5 rounded-full bg-[#246A4D]" />
  }
}

export function TrajectoryView() {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const messagesBySession = useAppStore((s) => s.messagesBySession)
  const subagentsBySession = useAppStore((s) => s.subagentsBySession)

  const [filter, setFilter] = useState<FilterKind>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const messages = activeSessionId ? (messagesBySession[activeSessionId] ?? []) : []
  const subagents = activeSessionId ? (subagentsBySession[activeSessionId] ?? []) : []

  const allNodes = useMemo(() => buildTraceNodes(messages, subagents), [messages, subagents])

  const counts = useMemo(
    () => ({
      all: allNodes.length,
      thinking: allNodes.filter((n) => n.kind === 'thinking').length,
      tool: allNodes.filter((n) => n.kind === 'tool').length,
      subagent: allNodes.filter((n) => n.kind === 'subagent').length,
      error: allNodes.filter((n) => n.kind === 'error' || n.status === 'error').length,
      turns: allNodes.filter((n) => n.kind === 'turn').length,
    }),
    [allNodes],
  )

  const visibleNodes = useMemo(() => {
    if (filter === 'all') return allNodes
    if (filter === 'error') return allNodes.filter((n) => n.kind === 'error' || n.status === 'error')
    return allNodes.filter((n) => n.kind === filter)
  }, [allNodes, filter])

  const selectedNode =
    visibleNodes.find((n) => n.id === selectedId) ?? visibleNodes[visibleNodes.length - 1] ?? null

  const copyText = (key: string, value: string) => {
    void navigator.clipboard?.writeText(value)
    setCopiedField(key)
    window.setTimeout(() => setCopiedField(null), 1400)
  }

  const filterTabs: { id: FilterKind; label: string; count: number }[] = [
    { id: 'all', label: '全部', count: counts.all },
    { id: 'thinking', label: '思考', count: counts.thinking },
    { id: 'tool', label: '工具调用', count: counts.tool },
    { id: 'subagent', label: '子代理', count: counts.subagent },
    { id: 'error', label: '错误', count: counts.error },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#F4F3EE]">
      {/* Filter & Telemetry Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D8D5CB] bg-[#FAF9F5]/80 px-5 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {filterTabs.map((tab) => {
            const active = filter === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`font-mono-tabular inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition ${
                  active
                    ? 'bg-[#141413] text-[#FAF9F5]'
                    : 'bg-[#ECEAE2] text-[#575652] hover:bg-[#E5E2D8] hover:text-[#141413]'
                }`}
              >
                <span>{tab.label}</span>
                <span className={active ? 'text-[#FAF9F5]/70' : 'text-[#8A8880]'}>{tab.count}</span>
              </button>
            )
          })}
        </div>

        <div className="font-mono-tabular text-[11px] uppercase tracking-wider text-[#575652]">
          {counts.turns} TURNS · {counts.tool} TOOLS · {counts.error} ERRORS
        </div>
      </div>

      {visibleNodes.length === 0 ? (
        <div className="bauhaus-dot-grid flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="rounded-lg border border-[#D8D5CB] bg-[#FAF9F5] px-8 py-6">
            <div className="font-mono-tabular text-xs font-semibold uppercase tracking-[0.12em] text-[#575652]">
              No Trajectory Events
            </div>
            <p className="mt-1.5 text-xs text-[#8A8880]">
              当前会话尚无匹配的执行轨迹节点，请先在 Studio 视图发送指令。
            </p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4 p-4">
          {/* Left 60%: Vertical Architectural Timeline */}
          <div className="min-w-0 flex-[3] overflow-y-auto pr-1">
            <div className="relative pl-6">
              <div className="pointer-events-none absolute bottom-3 left-[11px] top-3 w-px bg-[#D8D5CB]" />
              <ul className="space-y-1.5">
                {visibleNodes.map((node) => {
                  const selected = selectedNode?.id === node.id
                  return (
                    <li key={node.id} className="relative">
                      <span className="pointer-events-none absolute -left-[18px] top-3.5 flex h-3 w-3 items-center justify-center">
                        <NodeGlyph node={node} />
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedId(node.id)}
                        className={`relative flex w-full items-center justify-between gap-3 rounded-md border px-3.5 py-2.5 text-left transition ${
                          selected
                            ? 'border-[#1E4D9B] border-l-[3px] bg-[#FAF9F5] text-[#141413]'
                            : 'border-[#D8D5CB] bg-[#FAF9F5]/65 text-[#141413] hover:border-[#8A8880] hover:bg-[#FAF9F5]'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="font-mono-tabular w-14 shrink-0 text-[11px] font-semibold text-[#8A8880]">
                            {node.indexLabel}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-xs font-semibold text-[#141413]">
                                {node.title}
                              </span>
                              {node.status && (
                                <span
                                  className={`font-mono-tabular rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                                    node.status === 'error'
                                      ? 'bg-[#D13B27]/12 text-[#D13B27]'
                                      : node.status === 'ok'
                                        ? 'bg-[#246A4D]/12 text-[#246A4D]'
                                        : 'bg-[#C4881C]/15 text-[#8E6210]'
                                  }`}
                                >
                                  {node.status}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-[11px] text-[#575652]">
                              {node.summary}
                            </p>
                          </div>
                        </div>
                        <span className="font-mono-tabular shrink-0 text-[10px] text-[#8A8880]">
                          {formatClock(node.timestamp)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>

          {/* Right 40%: Step Detail Inspector */}
          <div className="flex min-w-0 flex-[2] flex-col overflow-hidden rounded-lg border border-[#D8D5CB] bg-[#FAF9F5]">
            {selectedNode ? (
              <>
                <div className="flex items-center justify-between border-b border-[#D8D5CB] px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-mono-tabular text-[10px] font-semibold uppercase tracking-[0.12em] text-[#1E4D9B]">
                      {selectedNode.indexLabel} · {selectedNode.kind}
                    </div>
                    <h3 className="truncate text-sm font-semibold text-[#141413]">
                      {selectedNode.title}
                    </h3>
                  </div>
                  <span className="font-mono-tabular text-[10px] text-[#8A8880]">
                    {formatClock(selectedNode.timestamp)}
                  </span>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
                  {selectedNode.callId && (
                    <div className="font-mono-tabular flex items-center justify-between rounded border border-[#D8D5CB] bg-[#F4F3EE] px-3 py-1.5 text-[11px]">
                      <span className="text-[#8A8880]">CALL_ID</span>
                      <span className="text-[#141413]">{selectedNode.callId}</span>
                    </div>
                  )}

                  {selectedNode.input !== undefined && (
                    <section className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-[0.12em] text-[#575652]">
                          Input Payload
                        </span>
                        <button
                          type="button"
                          onClick={() => copyText('input', stringifyPretty(selectedNode.input))}
                          className="inline-flex items-center gap-1 text-[10px] text-[#575652] hover:text-[#1E4D9B]"
                        >
                          {copiedField === 'input' ? (
                            <Check className="h-3 w-3 text-[#246A4D]" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          复制
                        </button>
                      </div>
                      <pre className="font-mono-tabular max-h-64 overflow-auto rounded border border-[#D8D5CB] bg-[#ECEAE2] p-3 text-[11px] whitespace-pre-wrap text-[#141413]">
                        {stringifyPretty(selectedNode.input)}
                      </pre>
                    </section>
                  )}

                  {selectedNode.output !== undefined && (
                    <section className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-[0.12em] text-[#575652]">
                          Output / Result
                        </span>
                        <button
                          type="button"
                          onClick={() => copyText('output', stringifyPretty(selectedNode.output))}
                          className="inline-flex items-center gap-1 text-[10px] text-[#575652] hover:text-[#1E4D9B]"
                        >
                          {copiedField === 'output' ? (
                            <Check className="h-3 w-3 text-[#246A4D]" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          复制
                        </button>
                      </div>
                      <pre className="font-mono-tabular max-h-80 overflow-auto rounded border border-[#D8D5CB] bg-[#ECEAE2] p-3 text-[11px] whitespace-pre-wrap text-[#141413]">
                        {stringifyPretty(selectedNode.output)}
                      </pre>
                    </section>
                  )}

                  {selectedNode.textBody !== undefined && (
                    <section className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-[0.12em] text-[#575652]">
                          Content
                        </span>
                        <button
                          type="button"
                          onClick={() => copyText('body', selectedNode.textBody ?? '')}
                          className="inline-flex items-center gap-1 text-[10px] text-[#575652] hover:text-[#1E4D9B]"
                        >
                          {copiedField === 'body' ? (
                            <Check className="h-3 w-3 text-[#246A4D]" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          复制
                        </button>
                      </div>
                      <div className="max-h-96 overflow-auto rounded border border-[#D8D5CB] bg-[#F4F3EE] p-3 text-xs leading-relaxed whitespace-pre-wrap text-[#141413]">
                        {selectedNode.textBody}
                      </div>
                    </section>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
