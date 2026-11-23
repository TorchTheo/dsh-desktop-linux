import { useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import type { SubagentNode, UiMessage } from '../types/domain'
import {
  flattenSubagentTree,
  formatStopReason,
  formatSubagentStatusLabel,
  mergeSubagentTree,
  normalizeSubagentStatus,
} from '../utils/subagentStatus'

type FilterKind = 'all' | 'thinking' | 'tool' | 'subagent' | 'error'

interface TraceStep {
  id: string
  stepLabel: string
  kind: 'thinking' | 'tool' | 'response' | 'subagent' | 'error'
  category: string
  title: string
  summary: string
  timestamp: number
  offsetMs: number
  durationMs: number
  callId?: string
  status?: 'ok' | 'error' | 'running'
  input?: unknown
  output?: unknown
  textBody?: string
}

interface TraceTurn {
  turnNumber: number
  id: string
  promptPreview: string
  promptFull: string
  timestamp: number
  endTimestamp: number
  totalDurationMs: number
  steps: TraceStep[]
  activityCounts: [string, number][]
  hasError: boolean
}

function classifyTool(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('read') || lower.includes('view')) return '读取'
  if (lower.includes('search') || lower.includes('grep') || lower.includes('find')) return '搜索'
  if (lower.includes('edit') || lower.includes('replace') || lower.includes('write')) return '编辑'
  if (lower.includes('bash') || lower.includes('shell') || lower.includes('cmd') || lower.includes('terminal')) return '命令'
  if (lower.includes('web') || lower.includes('fetch')) return '网络'
  if (lower.includes('subagent') || lower.includes('agent')) return '子代理'
  return '工具'
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

function summarizeText(text: string, max = 80): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine
}

function formatClock(ms: number): string {
  if (!ms) return '--:--:--'
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function formatMs(ms: number): string {
  if (ms <= 0) return '<0.1s'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const secs = ms / 1000
  if (secs < 60) return `${secs.toFixed(2)}s`
  const mins = Math.floor(secs / 60)
  const rem = Math.round(secs % 60)
  return `${mins}m${rem}s`
}

function stepBarColor(step: TraceStep): string {
  if (step.kind === 'error' || step.status === 'error') return '#D13B27'
  if (step.kind === 'thinking') return '#1E4D9B'
  if (step.kind === 'tool') return '#C4881C'
  if (step.kind === 'subagent') return '#575652'
  return '#246A4D'
}

function buildTurns(messages: UiMessage[], subagents: SubagentNode[]): TraceTurn[] {
  const resultByCallId = new Map<string, { content: unknown; isError: boolean; timestamp: number }>()
  for (const msg of messages) {
    for (const block of msg.blocks) {
      if (block.type === 'toolResult') {
        resultByCallId.set(block.toolUseId, {
          content: block.content,
          isError: block.isError,
          timestamp: msg.timestamp,
        })
      }
    }
  }

  const turns: TraceTurn[] = []
  let current: TraceTurn | null = null
  const pad = (n: number) => String(n).padStart(2, '0')

  const ensureTurn = (timestamp: number): TraceTurn => {
    if (!current) {
      const turnNumber = turns.length + 1
      current = {
        turnNumber,
        id: `turn-${turnNumber}`,
        promptPreview: '（系统或续聊回合）',
        promptFull: '',
        timestamp,
        endTimestamp: timestamp,
        totalDurationMs: 0,
        steps: [],
        activityCounts: [],
        hasError: false,
      }
      turns.push(current)
    }
    return current
  }

  for (const msg of messages) {
    if (msg.role === 'user') {
      const text = msg.blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
      const turnNumber = turns.length + 1
      current = {
        turnNumber,
        id: `turn-${msg.id}`,
        promptPreview: summarizeText(text || '（图片消息）', 72),
        promptFull: text,
        timestamp: msg.timestamp,
        endTimestamp: msg.timestamp,
        totalDurationMs: 0,
        steps: [],
        activityCounts: [],
        hasError: false,
      }
      turns.push(current)
      continue
    }

    const turn = ensureTurn(msg.timestamp)
    if (msg.timestamp > turn.endTimestamp) turn.endTimestamp = msg.timestamp

    if (msg.isError || msg.role === 'system') {
      const text = msg.blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
      turn.hasError = true
      turn.steps.push({
        id: `err-${msg.id}`,
        stepLabel: `步 ${pad(turn.steps.length + 1)}`,
        kind: 'error',
        category: '错误',
        title: '执行异常',
        summary: summarizeText(text || '请求或工具调用失败'),
        timestamp: msg.timestamp,
        offsetMs: 0,
        durationMs: 0,
        status: 'error',
        textBody: text,
      })
      continue
    }

    for (let i = 0; i < msg.blocks.length; i += 1) {
      const block = msg.blocks[i]
      if (block.type === 'thinking') {
        turn.steps.push({
          id: `${msg.id}-think-${i}`,
          stepLabel: `步 ${pad(turn.steps.length + 1)}`,
          kind: 'thinking',
          category: '思考',
          title: '推理思考',
          summary: summarizeText(block.thinking),
          timestamp: msg.timestamp,
          offsetMs: 0,
          durationMs: 0,
          textBody: block.thinking,
        })
      } else if (block.type === 'toolUse') {
        const matched = resultByCallId.get(block.id)
        const cat = classifyTool(block.name)
        const isErr = Boolean(matched?.isError)
        if (isErr) turn.hasError = true
        const exactDur =
          matched && matched.timestamp > msg.timestamp ? matched.timestamp - msg.timestamp : 0
        if (matched && matched.timestamp > turn.endTimestamp) turn.endTimestamp = matched.timestamp
        turn.steps.push({
          id: `${msg.id}-tool-${block.id}-${i}`,
          stepLabel: `步 ${pad(turn.steps.length + 1)}`,
          kind: 'tool',
          category: cat,
          title: `${cat} · ${block.name}`,
          summary: summarizeText(stringifyPretty(block.input) || '无参数'),
          timestamp: msg.timestamp,
          offsetMs: 0,
          durationMs: exactDur,
          callId: block.id,
          status: matched ? (isErr ? 'error' : 'ok') : 'running',
          input: block.input,
          output: matched?.content,
        })
      } else if (block.type === 'text' && block.text.trim()) {
        turn.steps.push({
          id: `${msg.id}-text-${i}`,
          stepLabel: `步 ${pad(turn.steps.length + 1)}`,
          kind: 'response',
          category: '回复',
          title: '助手回复',
          summary: summarizeText(block.text),
          timestamp: msg.timestamp,
          offsetMs: 0,
          durationMs: 0,
          status: 'ok',
          textBody: block.text,
        })
      }
    }
  }

  if (subagents.length > 0) {
    const target = ensureTurn(Date.now())
    for (const sa of subagents) {
      const norm = normalizeSubagentStatus(sa.status)
      const labelText = formatSubagentStatusLabel(sa.status)
      const reasonText = formatStopReason(sa.stopReason)
      target.steps.push({
        id: `subagent-${sa.sessionId}`,
        stepLabel: '子代理',
        kind: 'subagent',
        category: '子代理',
        title: `子代理 · ${sa.label || sa.name || sa.sessionId.slice(0, 8)}`,
        summary: reasonText ? `状态：${labelText} · ${reasonText}` : `状态：${labelText}`,
        timestamp: sa.createdAt || target.endTimestamp || Date.now(),
        offsetMs: 0,
        durationMs: 0,
        status: norm === 'running' ? 'running' : norm === 'error' ? 'error' : 'ok',
        input: sa,
      })
    }
  }

  for (const turn of turns) {
    const counts = new Map<string, number>()
    for (const step of turn.steps) {
      if (step.kind !== 'response') counts.set(step.category, (counts.get(step.category) ?? 0) + 1)
    }
    turn.activityCounts = Array.from(counts.entries())

    const baseStart = turn.timestamp
    let cursor = baseStart
    for (let i = 0; i < turn.steps.length; i += 1) {
      const step = turn.steps[i]
      const nextStep = turn.steps[i + 1]
      const stepStart = Math.max(cursor, step.timestamp || cursor)
      let dur = step.durationMs
      if (dur <= 0) {
        if (step.timestamp > cursor) {
          dur = step.timestamp - cursor
          step.offsetMs = Math.max(0, cursor - baseStart)
          cursor = step.timestamp
        } else if (nextStep && nextStep.timestamp > stepStart) {
          dur = nextStep.timestamp - stepStart
          step.offsetMs = Math.max(0, stepStart - baseStart)
          cursor = stepStart + dur
        } else {
          dur = Math.max(120, Math.min(1200, (step.textBody?.length ?? step.summary.length) * 3))
          step.offsetMs = Math.max(0, cursor - baseStart)
          cursor += dur
        }
      } else {
        step.offsetMs = Math.max(0, stepStart - baseStart)
        cursor = Math.max(cursor, stepStart + dur)
      }
      step.durationMs = dur
    }

    turn.totalDurationMs = Math.max(turn.endTimestamp - baseStart, cursor - baseStart, 1)
  }

  return turns
}

function StepGlyph({ step }: { step: TraceStep }) {
  switch (step.kind) {
    case 'thinking':
      return <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-[var(--brand-secondary)] bg-[var(--bg-surface)]" />
    case 'tool':
      return (
        <span
          className={`h-2.5 w-2.5 ${
            step.status === 'error'
              ? 'bg-[var(--brand-primary)]'
              : step.status === 'ok'
                ? 'bg-[var(--status-warn)]'
                : 'bg-[var(--status-warn)] animate-pulse'
          }`}
        />
      )
    case 'subagent':
      return <span className="h-2.5 w-2.5 rotate-45 bg-[var(--ink-secondary)]" />
    case 'error':
      return <span className="h-2.5 w-2.5 bg-[var(--brand-primary)]" />
    case 'response':
      return <span className="h-2.5 w-2.5 rounded-full bg-[var(--status-ok)]" />
  }
}

export function TrajectoryView() {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const messagesBySession = useAppStore((s) => s.messagesBySession)
  const subagentsBySession = useAppStore((s) => s.subagentsBySession)
  const subagentTreeBySession = useAppStore((s) => s.subagentTreeBySession)

  const [filter, setFilter] = useState<FilterKind>('all')
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [expandedTurns, setExpandedTurns] = useState<Record<string, boolean>>({})
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const messages = activeSessionId ? (messagesBySession[activeSessionId] ?? []) : []
  const subagents = useMemo(
    () =>
      activeSessionId
        ? flattenSubagentTree(
            mergeSubagentTree(
              subagentTreeBySession[activeSessionId] ?? [],
              subagentsBySession[activeSessionId] ?? [],
              activeSessionId,
            ),
          )
        : [],
    [activeSessionId, subagentTreeBySession, subagentsBySession],
  )

  const allTurns = useMemo(() => buildTurns(messages, subagents), [messages, subagents])
  const allSteps = useMemo(() => allTurns.flatMap((t) => t.steps), [allTurns])

  const counts = useMemo(
    () => ({
      all: allSteps.length,
      thinking: allSteps.filter((s) => s.kind === 'thinking').length,
      tool: allSteps.filter((s) => s.kind === 'tool').length,
      subagent: allSteps.filter((s) => s.kind === 'subagent').length,
      error: allSteps.filter((s) => s.kind === 'error' || s.status === 'error').length,
    }),
    [allSteps],
  )

  const durationSummary = useMemo(() => {
    let thinking = 0
    let tool = 0
    let response = 0
    let subagent = 0
    for (const s of allSteps) {
      if (s.kind === 'thinking') thinking += s.durationMs
      else if (s.kind === 'tool') tool += s.durationMs
      else if (s.kind === 'subagent') subagent += s.durationMs
      else if (s.kind === 'response') response += s.durationMs
    }
    const total = Math.max(1, thinking + tool + response + subagent)
    return { thinking, tool, response, subagent, total }
  }, [allSteps])

  const filteredTurns = useMemo(() => {
    if (filter === 'all') return allTurns
    return allTurns
      .map((turn) => ({
        ...turn,
        steps: turn.steps.filter((s) =>
          filter === 'error' ? s.kind === 'error' || s.status === 'error' : s.kind === filter,
        ),
      }))
      .filter((turn) => turn.steps.length > 0)
  }, [allTurns, filter])

  const visibleSteps = useMemo(() => filteredTurns.flatMap((t) => t.steps), [filteredTurns])
  const sessionTotalTurnMs = useMemo(
    () => Math.max(1, allTurns.reduce((sum, t) => sum + t.totalDurationMs, 0)),
    [allTurns],
  )
  const selectedStep =
    visibleSteps.find((s) => s.id === selectedStepId) ??
    visibleSteps[visibleSteps.length - 1] ??
    null

  const copyText = (key: string, value: string) => {
    void navigator.clipboard?.writeText(value)
    setCopiedField(key)
    window.setTimeout(() => setCopiedField(null), 1400)
  }

  const toggleAllTurns = (expand: boolean) => {
    const next: Record<string, boolean> = {}
    for (const turn of allTurns) next[turn.id] = expand
    setExpandedTurns(next)
  }

  const filterTabs: { id: FilterKind; label: string; count: number }[] = [
    { id: 'all', label: '全部步骤', count: counts.all },
    { id: 'thinking', label: '思考', count: counts.thinking },
    { id: 'tool', label: '工具调用', count: counts.tool },
    { id: 'subagent', label: '子代理', count: counts.subagent },
    { id: 'error', label: '错误', count: counts.error },
  ]

  const statusText = (status?: 'ok' | 'error' | 'running') =>
    status === 'ok' ? '成功' : status === 'error' ? '失败' : status === 'running' ? '执行中' : ''

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--bg-canvas)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)]/85 px-5 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {filterTabs.map((tab) => {
            const active = filter === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? 'bg-[var(--ink-primary)] text-[var(--bg-surface)]'
                    : 'bg-[var(--bg-recessed)] text-[var(--ink-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--ink-primary)]'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`font-mono-tabular ${active ? 'text-[var(--bg-surface)]/75' : 'text-[var(--ink-muted)]'}`}>
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-3 text-xs text-[var(--ink-secondary)]">
          <span className="font-mono-tabular">
            共 {allTurns.length} 回合 · {counts.tool} 次工具 · {counts.error} 个错误
          </span>
          {allTurns.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => toggleAllTurns(false)}
                className="rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-0.5 text-[11px] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)]"
              >
                全部展开
              </button>
              <button
                type="button"
                onClick={() => toggleAllTurns(true)}
                className="rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-0.5 text-[11px] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)]"
              >
                全部折叠
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 顶层回合概览流水线（宏观视角，点击可展开并定位到该回合） */}
      {allTurns.length > 0 && (
        <div className="border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-5 py-2.5">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-[var(--ink-secondary)]">
            <span className="font-semibold text-[var(--ink-primary)]">回合概览流水线</span>
            <span className="font-mono-tabular text-[var(--ink-muted)]">
              共 {allTurns.length} 个回合 · 点击色块展开对应回合
            </span>
          </div>
          <div className="flex h-7 w-full items-stretch gap-1 overflow-x-auto">
            {allTurns.map((turn) => {
              const pct = Math.max(6, (turn.totalDurationMs / sessionTotalTurnMs) * 100)
              const isExpanded = Boolean(expandedTurns[turn.id])
              const barBg = turn.hasError
                ? 'bg-[var(--brand-primary)]/15 border-[var(--brand-primary)]/60 text-[var(--status-danger-text)]'
                : isExpanded
                  ? 'bg-[var(--ink-primary)] border-[var(--ink-primary)] text-[var(--bg-surface)]'
                  : 'bg-[var(--bg-surface)] border-[var(--border-hairline)] text-[var(--ink-primary)] hover:border-[var(--brand-secondary)]'
              return (
                <button
                  key={turn.id}
                  type="button"
                  style={{ flexGrow: pct, flexBasis: '72px' }}
                  onClick={() => {
                    setExpandedTurns((prev) => ({ ...prev, [turn.id]: true }))
                    if (turn.steps[0]) setSelectedStepId(turn.steps[0].id)
                    document.getElementById(`trace-${turn.id}`)?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'nearest',
                    })
                  }}
                  title={`第 ${turn.turnNumber} 回合 · ${turn.promptPreview} · 耗时 ${formatMs(turn.totalDurationMs)}`}
                  className={`font-mono-tabular flex min-w-[72px] items-center justify-between gap-1.5 rounded border px-2 text-[10.5px] transition ${barBg}`}
                >
                  <span className="font-semibold">T{String(turn.turnNumber).padStart(2, '0')}</span>
                  <span className="truncate opacity-80">{formatMs(turn.totalDurationMs)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 全局流水线耗时构成条 */}
      {allSteps.length > 0 && (
        <div className="border-b border-[var(--border-hairline)] bg-[var(--bg-surface)] px-5 py-2.5">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex flex-wrap items-center gap-4 text-[var(--ink-secondary)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[var(--brand-secondary)]" />
                思考 {formatMs(durationSummary.thinking)}（{Math.round((durationSummary.thinking / durationSummary.total) * 100)}%）
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 bg-[var(--status-warn)]" />
                工具调用 {formatMs(durationSummary.tool)}（{Math.round((durationSummary.tool / durationSummary.total) * 100)}%）
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[var(--status-ok)]" />
                回复 {formatMs(durationSummary.response)}（{Math.round((durationSummary.response / durationSummary.total) * 100)}%）
              </span>
              {durationSummary.subagent > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rotate-45 bg-[var(--ink-secondary)]" />
                  子代理 {formatMs(durationSummary.subagent)}
                </span>
              )}
            </div>
            <span className="font-mono-tabular text-[var(--ink-muted)]">
              总耗时估算 {formatMs(durationSummary.total)}
            </span>
          </div>

          <div className="mt-2 space-y-1.5">
            {[
              { label: "思考推理", ms: durationSummary.thinking, color: "#1E4D9B" },
              { label: "工具调用", ms: durationSummary.tool, color: "#C4881C" },
              { label: "回复生成", ms: durationSummary.response, color: "#246A4D" },
              ...(durationSummary.subagent > 0
                ? [{ label: "子代理", ms: durationSummary.subagent, color: "#575652" }]
                : []),
            ].map((lane) => {
              const pct = Math.round((lane.ms / durationSummary.total) * 100)
              return (
                <div key={lane.label} className="grid grid-cols-[72px_1fr_84px] items-center gap-2 text-[11px]">
                  <span className="flex items-center gap-1.5 text-[var(--ink-secondary)]">
                    <span className="h-2 w-2 shrink-0 rounded-xs" style={{ backgroundColor: lane.color }} />
                    {lane.label}
                  </span>
                  <div className="h-2 w-full overflow-hidden rounded-sm bg-[var(--bg-recessed)]">
                    <div
                      style={{ width: `${Math.max(lane.ms > 0 ? 2 : 0, pct)}%`, backgroundColor: lane.color }}
                      className="h-full rounded-sm"
                    />
                  </div>
                  <span className="font-mono-tabular text-right text-[10px] text-[var(--ink-secondary)]">
                    {formatMs(lane.ms)} · {pct}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {filteredTurns.length === 0 ? (
        <div className="bauhaus-dot-grid flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-8 py-6">
            <div className="text-sm font-semibold text-[var(--ink-primary)]">暂无执行轨迹</div>
            <p className="mt-1.5 text-xs text-[var(--ink-muted)]">
              当前会话尚无匹配的执行步骤，请先在「对话」视图发送指令。
            </p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-4 p-4">
          <div className="min-w-0 flex-[3] space-y-3 overflow-y-auto pr-1">
            {filteredTurns.map((turn) => {
              const collapsed = !expandedTurns[turn.id]
              const turnTotal = Math.max(1, turn.totalDurationMs)
              return (
                <section
                  id={`trace-${turn.id}`}
                  key={turn.id}
                  className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedTurns((prev) => ({ ...prev, [turn.id]: !prev[turn.id] }))
                    }
                    className="flex w-full flex-col gap-2 bg-[var(--bg-recessed)]/55 px-3.5 py-2.5 text-left transition hover:bg-[var(--bg-recessed)]"
                  >
                    <div className="flex w-full items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2">
                        {collapsed ? (
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-secondary)]" />
                        ) : (
                          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-secondary)]" />
                        )}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono-tabular rounded bg-[var(--ink-primary)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--bg-surface)]">
                              第 {String(turn.turnNumber).padStart(2, '0')} 回合
                            </span>
                            <span className="truncate text-xs font-semibold text-[var(--ink-primary)]">
                              {turn.promptPreview}
                            </span>
                          </div>
                          {turn.activityCounts.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {turn.activityCounts.map(([cat, cnt]) => (
                                <span
                                  key={cat}
                                  className="font-mono-tabular rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[10px] text-[var(--ink-secondary)]"
                                >
                                  {cat} ×{cnt}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="font-mono-tabular shrink-0 text-right text-[10px] text-[var(--ink-muted)]">
                        <div>{formatClock(turn.timestamp)}</div>
                        <div className="mt-0.5 font-semibold text-[var(--ink-primary)]">
                          {formatMs(turnTotal)}
                        </div>
                      </div>
                    </div>

                    {turn.steps.length > 0 && (
                      <div className="mt-1 space-y-1 border-t border-[var(--border-hairline)]/70 pt-2">
                        {turn.steps.map((step) => {
                          const leftPct = Math.min(92, (step.offsetMs / turnTotal) * 100)
                          const widthPct = Math.max(
                            4,
                            Math.min(100 - leftPct, (step.durationMs / turnTotal) * 100),
                          )
                          return (
                            <div
                              key={step.id}
                              className="grid grid-cols-[112px_1fr_56px] items-center gap-2 text-[10px]"
                            >
                              <span className="flex min-w-0 items-center gap-1.5 text-[var(--ink-secondary)]">
                                <span
                                  className="h-1.5 w-1.5 shrink-0 rounded-xs"
                                  style={{ backgroundColor: stepBarColor(step) }}
                                />
                                <span className="truncate">{step.title}</span>
                              </span>
                              <div className="relative h-1.5 w-full overflow-hidden rounded-sm bg-[var(--border-hairline)]/65">
                                <div
                                  style={{
                                    left: `${leftPct}%`,
                                    width: `${widthPct}%`,
                                    backgroundColor: stepBarColor(step),
                                  }}
                                  className="absolute top-0 bottom-0 rounded-sm"
                                />
                              </div>
                              <span className="font-mono-tabular text-right text-[var(--ink-secondary)]">
                                {formatMs(step.durationMs)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </button>

                  {!collapsed && (
                    <div className="border-t border-[var(--border-hairline)] bg-[var(--bg-canvas)]/50 px-3.5 py-2.5">
                      <ul className="space-y-1.5">
                        {turn.steps.map((step) => {
                          const selected = selectedStep?.id === step.id
                          const leftPct = Math.min(92, (step.offsetMs / turnTotal) * 100)
                          const widthPct = Math.max(
                            4,
                            Math.min(100 - leftPct, (step.durationMs / turnTotal) * 100),
                          )
                          const sharePct = Math.round((step.durationMs / turnTotal) * 100)

                          return (
                            <li key={step.id}>
                              <button
                                type="button"
                                onClick={() => setSelectedStepId(step.id)}
                                className={`flex w-full flex-col gap-1.5 rounded border px-3 py-2 text-left transition ${
                                  selected
                                    ? 'border-[var(--brand-secondary)] border-l-[3px] bg-[var(--bg-surface)]'
                                    : 'border-[var(--border-hairline)] bg-[var(--bg-surface)]/80 hover:border-[var(--ink-muted)] hover:bg-[var(--bg-surface)]'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <StepGlyph step={step} />
                                    <span className="font-mono-tabular shrink-0 text-[10px] font-semibold text-[var(--ink-muted)]">
                                      {step.stepLabel}
                                    </span>
                                    <span className="truncate text-xs font-semibold text-[var(--ink-primary)]">
                                      {step.title}
                                    </span>
                                    {step.status && (
                                      <span
                                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                          step.status === 'error'
                                            ? 'bg-[var(--brand-primary)]/12 text-[var(--brand-primary)]'
                                            : step.status === 'ok'
                                              ? 'bg-[var(--status-ok)]/12 text-[var(--status-ok)]'
                                              : 'bg-[var(--status-warn)]/15 text-[var(--status-warn-text)]'
                                        }`}
                                      >
                                        {statusText(step.status)}
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-mono-tabular shrink-0 text-[10px] text-[var(--ink-secondary)]">
                                    {formatMs(step.durationMs)} · {sharePct}%
                                  </span>
                                </div>

                                <div className="relative h-2 w-full overflow-hidden rounded-sm bg-[var(--bg-recessed)]">
                                  <div
                                    style={{
                                      left: `${leftPct}%`,
                                      width: `${widthPct}%`,
                                      backgroundColor: stepBarColor(step),
                                    }}
                                    className="absolute top-0 bottom-0 rounded-sm opacity-90"
                                  />
                                </div>

                                <p className="truncate text-[11px] text-[var(--ink-secondary)]">
                                  {step.summary}
                                </p>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                </section>
              )
            })}
          </div>

          <div className="flex min-w-0 flex-[2] flex-col overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
            {selectedStep ? (
              <>
                <div className="flex items-center justify-between border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)]/70 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-[var(--brand-secondary)]">
                      {selectedStep.stepLabel} · {selectedStep.category} · {formatMs(selectedStep.durationMs)}
                    </div>
                    <h3 className="truncate text-sm font-semibold text-[var(--ink-primary)]">
                      {selectedStep.title}
                    </h3>
                  </div>
                  <span className="font-mono-tabular text-[11px] text-[var(--ink-muted)]">
                    {formatClock(selectedStep.timestamp)}
                  </span>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
                  {selectedStep.callId && (
                    <div className="font-mono-tabular flex items-center justify-between rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-[11px]">
                      <span className="text-[var(--ink-muted)]">调用编号</span>
                      <span className="text-[var(--ink-primary)]">{selectedStep.callId}</span>
                    </div>
                  )}

                  {selectedStep.input !== undefined && (
                    <section className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[var(--ink-secondary)]">输入参数</span>
                        <button
                          type="button"
                          onClick={() => copyText('input', stringifyPretty(selectedStep.input))}
                          className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-secondary)] hover:text-[var(--brand-secondary)]"
                        >
                          {copiedField === 'input' ? (
                            <>
                              <Check className="h-3 w-3 text-[var(--status-ok)]" />
                              已复制
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              复制
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="font-mono-tabular max-h-64 overflow-auto rounded border border-[var(--border-hairline)] bg-[var(--bg-recessed)] p-3 text-[11px] whitespace-pre-wrap text-[var(--ink-primary)]">
                        {stringifyPretty(selectedStep.input)}
                      </pre>
                    </section>
                  )}

                  {selectedStep.output !== undefined && (
                    <section className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[var(--ink-secondary)]">输出结果</span>
                        <button
                          type="button"
                          onClick={() => copyText('output', stringifyPretty(selectedStep.output))}
                          className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-secondary)] hover:text-[var(--brand-secondary)]"
                        >
                          {copiedField === 'output' ? (
                            <>
                              <Check className="h-3 w-3 text-[var(--status-ok)]" />
                              已复制
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              复制
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="font-mono-tabular max-h-80 overflow-auto rounded border border-[var(--border-hairline)] bg-[var(--bg-recessed)] p-3 text-[11px] whitespace-pre-wrap text-[var(--ink-primary)]">
                        {stringifyPretty(selectedStep.output)}
                      </pre>
                    </section>
                  )}

                  {selectedStep.textBody !== undefined && (
                    <section className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[var(--ink-secondary)]">完整内容</span>
                        <button
                          type="button"
                          onClick={() => copyText('body', selectedStep.textBody ?? '')}
                          className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-secondary)] hover:text-[var(--brand-secondary)]"
                        >
                          {copiedField === 'body' ? (
                            <>
                              <Check className="h-3 w-3 text-[var(--status-ok)]" />
                              已复制
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              复制
                            </>
                          )}
                        </button>
                      </div>
                      <div className="max-h-96 overflow-auto rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3 text-xs leading-relaxed whitespace-pre-wrap text-[var(--ink-primary)]">
                        {selectedStep.textBody}
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
