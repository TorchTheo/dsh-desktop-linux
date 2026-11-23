import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  Copy,
  ChevronRight,
  FolderGit2,
  Loader2,
  Pencil,
  RotateCcw,
  TerminalSquare,
  User,
  Wrench,
} from 'lucide-react'
import { openExternalUrl } from '../api/tauri'
import { DshSlot } from '../plugins/dshPluginHost'
import { useAppStore } from '../store/useAppStore'
import type { UiContentBlock, UiMessage } from '../types/domain'
import { ApprovalCard } from './ApprovalCard'
import { Composer } from './Composer'
import { DeliverableCard } from './DeliverableCard'
import { QuestionCard } from './QuestionCard'

const markdownComponents = {
  a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      {...props}
      href={href}
      className="text-[var(--brand-secondary)] underline decoration-[var(--brand-secondary)]/35 underline-offset-2 hover:text-[var(--brand-primary)] hover:decoration-[var(--brand-primary)]"
      onClick={(e) => {
        if (href && /^(https?:|mailto:)/i.test(href)) {
          e.preventDefault()
          void openExternalUrl(href)
        }
      }}
    >
      {children}
    </a>
  ),
}

function formatJson(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function extractCopyText(blocks: UiContentBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === "text") return b.text
      if (b.type === "thinking") return b.thinking
      if (b.type === "toolUse") return `[${b.name}] ${formatJson(b.input)}`
      if (b.type === "toolResult") return formatJson(b.content)
      return ""
    })
    .filter(Boolean)
    .join("\n\n")
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  if (!text.trim()) return null
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1400)
      }}
      title="复制内容"
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--ink-muted)] transition hover:bg-[var(--bg-recessed)] hover:text-[var(--ink-primary)]"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-[var(--status-ok)]" />
          <span className="text-[var(--status-ok)]">已复制</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          <span>复制</span>
        </>
      )}
    </button>
  )
}

export function formatClock(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function classifyToolActivity(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('read') || lower.includes('view')) return '读取'
  if (lower.includes('search') || lower.includes('grep') || lower.includes('find')) return '搜索'
  if (lower.includes('edit') || lower.includes('replace') || lower.includes('write')) return '编辑'
  if (lower.includes('bash') || lower.includes('shell') || lower.includes('cmd') || lower.includes('terminal')) return '命令'
  if (lower.includes('web') || lower.includes('fetch')) return '网络'
  if (lower.includes('subagent') || lower.includes('agent')) return '子代理'
  return '工具'
}

function ThinkingBlock({
  text,
  defaultOpen = false,
  streaming = false,
}: {
  text: string
  defaultOpen?: boolean
  streaming?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="my-1.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--ink-secondary)] hover:bg-[var(--bg-recessed)]/50 hover:text-[var(--ink-primary)]"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span
          className={`h-2 w-2 rounded-full border border-[var(--brand-secondary)] ${
            streaming ? 'bg-[var(--brand-secondary)] animate-pulse' : 'bg-transparent'
          }`}
        />
        <span className="text-[11px] font-medium">
          {streaming ? '正在思考...' : '思考过程'}
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--bg-recessed)] bg-[var(--bg-canvas)]/60 px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap text-[var(--ink-secondary)]">
          {text}
        </div>
      )}
    </div>
  )
}

function ToolUseBlock({ name, id, input }: { name: string; id: string; input: unknown }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="my-1.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-[var(--ink-primary)] hover:bg-[var(--bg-recessed)]/50"
      >
        <span className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-[var(--ink-secondary)]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-secondary)]" />
          )}
          <span className="h-2 w-2 bg-[var(--ink-primary)]" />
          <span className="font-mono-tabular text-[11px] font-semibold">工具 · {name}</span>
        </span>
        <span className="font-mono-tabular text-[10px] text-[var(--ink-muted)]">{id.slice(0, 10)}</span>
      </button>
      {open && (
        <pre className="font-mono-tabular max-h-72 overflow-auto border-t border-[var(--border-hairline)] bg-[var(--bg-recessed)] p-3 text-[11px] text-[var(--ink-primary)]">
          {formatJson(input)}
        </pre>
      )}
    </div>
  )
}

function ToolResultBlock({
  toolUseId,
  content,
  isError,
}: {
  toolUseId: string
  content: unknown
  isError: boolean
}) {
  const [open, setOpen] = useState(isError)
  return (
    <div
      className={`my-1.5 rounded border bg-[var(--bg-surface)] ${
        isError ? 'border-[var(--brand-primary)]/60' : 'border-[var(--border-hairline)]'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-[var(--ink-primary)] hover:bg-[var(--bg-recessed)]/50"
      >
        <span className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-[var(--ink-secondary)]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-secondary)]" />
          )}
          <span
            className={`h-2 w-2 rounded-full ${isError ? 'bg-[var(--brand-primary)]' : 'bg-[var(--status-ok)]'}`}
          />
          <span className="text-[11px] font-medium">
            {isError ? '输出 · 执行失败' : '输出 · 执行完成'}
          </span>
        </span>
        <span className="font-mono-tabular text-[10px] text-[var(--ink-muted)]">
          {toolUseId.slice(0, 10)}
        </span>
      </button>
      {open && (
        <pre className="font-mono-tabular max-h-80 overflow-auto border-t border-[var(--border-hairline)] bg-[var(--bg-recessed)] p-3 text-[11px] whitespace-pre-wrap text-[var(--ink-primary)]">
          {formatJson(content)}
        </pre>
      )}
    </div>
  )
}

export function renderBlock(block: UiContentBlock, index: number) {
  switch (block.type) {
    case 'text':
      return (
        <div key={index} className="markdown-body text-[15.5px]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {block.text}
          </ReactMarkdown>
        </div>
      )
    case 'thinking':
      return <ThinkingBlock key={index} text={block.thinking} />
    case 'toolUse':
      return (
        <div key={index}>
          <ToolUseBlock name={block.name} id={block.id} input={block.input} />
          <DshSlot name="tool.call.toolview" slotKey={block.name} extraProps={{ block }} />
        </div>
      )
    case 'toolResult':
      return (
        <ToolResultBlock
          key={index}
          toolUseId={block.toolUseId}
          content={block.content}
          isError={block.isError}
        />
      )
    case 'image':
      return (
        <img
          key={index}
          src={block.dataUrl}
          alt="图片附件"
          className="my-2 max-h-64 rounded border border-[var(--border-hairline)] object-contain"
        />
      )
    case 'deliverable':
      return (
        <DeliverableCard
          key={index}
          path={block.path}
          description={block.description}
          mimeType={block.mimeType}
        />
      )
    case 'unknown':
      return (
        <pre
          key={index}
          className="font-mono-tabular my-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-recessed)] p-2 text-[11px] text-[var(--ink-secondary)]"
        >
          {formatJson(block.raw)}
        </pre>
      )
  }
}

export function ProcessGroupDisclosure({ blocks }: { blocks: UiContentBlock[] }) {
  const [open, setOpen] = useState(false)

  const summaryParts = useMemo(() => {
    const counts = new Map<string, number>()
    let hasError = false
    for (const block of blocks) {
      if (block.type === 'thinking') {
        counts.set('思考', (counts.get('思考') ?? 0) + 1)
      } else if (block.type === 'toolUse') {
        const cat = classifyToolActivity(block.name)
        counts.set(cat, (counts.get(cat) ?? 0) + 1)
      } else if (block.type === 'toolResult' && block.isError) {
        hasError = true
      }
    }
    const items = Array.from(counts.entries()).map(([k, v]) => `${k} ${v}`)
    return { items, hasError }
  }, [blocks])

  return (
    <div className="mb-2.5 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-recessed)]/55">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-[var(--ink-secondary)] hover:bg-[var(--bg-recessed)] hover:text-[var(--ink-primary)]"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <span
            className={`h-2 w-2 rounded-full ${
              summaryParts.hasError ? 'bg-[var(--brand-primary)]' : 'bg-[var(--status-ok)]'
            }`}
          />
          <span className="font-medium text-[var(--ink-primary)]">执行过程</span>
          <span className="text-[11px] text-[var(--ink-secondary)]">
            {summaryParts.items.length > 0 ? summaryParts.items.join(' · ') : `${blocks.length} 步`}
          </span>
        </span>
        <span className="text-[11px] text-[var(--ink-muted)]">{open ? '收起' : '展开详情'}</span>
      </button>
      {open && (
        <div className="border-t border-[var(--border-hairline)] bg-[var(--bg-canvas)]/70 px-3 py-2">
          {blocks.map((block, idx) =>
            block.type === 'text' ? (
              <div
                key={idx}
                className="my-1.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2"
              >
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-[var(--ink-muted)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--ink-muted)]" />
                  <span>过程说明</span>
                </div>
                <div className="markdown-body text-xs leading-relaxed text-[var(--ink-secondary)]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {block.text}
                  </ReactMarkdown>
                </div>
              </div>
            ) : (
              renderBlock(block, idx)
            ),
          )}
        </div>
      )}
    </div>
  )
}

export interface TurnGroup {
  id: string
  kind: 'user' | 'agent' | 'system'
  timestamp: number
  userText?: string
  userMessage?: UiMessage
  systemMessage?: UiMessage
  processBlocks: UiContentBlock[]
  finalBlocks: UiContentBlock[]
  notices?: string[]
}

export function groupMessagesIntoTurns(messages: UiMessage[]): TurnGroup[] {
  const groups: TurnGroup[] = []
  let currentAgent: TurnGroup | null = null

  const flushAgent = () => {
    if (currentAgent) {
      groups.push(currentAgent)
      currentAgent = null
    }
  }

  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i]
    if (msg.role === 'user') {
      flushAgent()
      const userText = msg.blocks
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim()
      groups.push({
        id: msg.id,
        kind: 'user',
        timestamp: msg.timestamp,
        userText: userText || '（图片消息）',
        userMessage: msg,
        processBlocks: [],
        finalBlocks: [],
      })
      continue
    }

    if (msg.isError || msg.role === 'system') {
      const nextMsg = messages[i + 1]
      const isAttemptRetry = msg.id.startsWith('attempt-err-')
      const followedByAgent = nextMsg !== undefined && nextMsg.role !== 'user'
      if (isAttemptRetry || currentAgent || followedByAgent) {
        if (!currentAgent) {
          currentAgent = {
            id: msg.id,
            kind: 'agent',
            timestamp: msg.timestamp,
            processBlocks: [],
            finalBlocks: [],
            notices: [],
          }
        }
        const noticeText = msg.blocks
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim()
        if (noticeText) {
          currentAgent.notices = [...(currentAgent.notices ?? []), noticeText]
        }
        continue
      }
      flushAgent()
      groups.push({
        id: msg.id,
        kind: 'system',
        timestamp: msg.timestamp,
        systemMessage: msg,
        processBlocks: [],
        finalBlocks: [],
      })
      continue
    }

    if (!currentAgent) {
      currentAgent = {
        id: msg.id,
        kind: 'agent',
        timestamp: msg.timestamp,
        processBlocks: [],
        finalBlocks: [],
      }
    }

    const hasToolUse = msg.blocks.some((b) => b.type === 'toolUse')
    for (const block of msg.blocks) {
      if (
        block.type === 'thinking' ||
        block.type === 'toolUse' ||
        block.type === 'toolResult' ||
        (hasToolUse && block.type === 'text')
      ) {
        currentAgent.processBlocks.push(block)
      } else {
        currentAgent.finalBlocks.push(block)
      }
    }
  }

  flushAgent()
  return groups
}

const QUICK_STARTS = [
  {
    icon: FolderGit2,
    title: '审查仓库架构',
    prompt: '请概览当前工作目录的项目结构、核心模块与技术栈。',
  },
  {
    icon: TerminalSquare,
    title: '运行与排查测试',
    prompt: '请检查当前项目的测试命令并运行一轮验证，汇报任何失败项。',
  },
  {
    icon: Wrench,
    title: '重构与性能优化',
    prompt: '请帮我找出当前项目中值得重构或优化的关键模块，并给出方案。',
  },
]


const StreamingBubble = memo(function StreamingBubble({
  sessionId,
  isRunning,
  scrollContainerRef,
}: {
  sessionId: string | null
  isRunning: boolean
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
}) {
  const streaming = useAppStore((s) => (sessionId ? s.streamingBySession[sessionId] : undefined))

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distFromBottom < 200) {
      el.scrollTop = el.scrollHeight
    }
  }, [streaming?.text.length, streaming?.thinking.length, isRunning, scrollContainerRef])

  if (streaming?.thinking || streaming?.text) {
    return (
      <div className="flex items-start justify-start gap-2.5">
        <div
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--brand-secondary)] bg-[var(--brand-secondary)] text-white"
          title="正在生成"
        >
          <Bot className="h-3.5 w-3.5 animate-pulse stroke-[1.9]" />
        </div>
        <article className="min-w-0 flex-1 max-w-[90%]">
          {streaming.thinking && (
            <ThinkingBlock text={streaming.thinking} defaultOpen streaming />
          )}
          {streaming.text && (
            <div className="markdown-body text-[15.5px]">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {streaming.text}
              </ReactMarkdown>
              <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-[var(--brand-primary)] align-middle" />
            </div>
          )}
        </article>
      </div>
    )
  }

  if (isRunning) {
    return (
      <div className="flex items-start justify-start gap-2.5">
        <div
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--brand-secondary)] bg-[var(--brand-secondary)] text-white"
          title="正在调用模型"
        >
          <Bot className="h-3.5 w-3.5 animate-pulse stroke-[1.9]" />
        </div>
        <div className="mt-1 inline-flex items-center gap-2 rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--ink-secondary)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--brand-primary)]" />
          <span>正在思考并调用模型...</span>
        </div>
      </div>
    )
  }

  return null
})

export function ChatStream() {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const messagesBySession = useAppStore((s) => s.messagesBySession)
  const loadingHistoryId = useAppStore((s) => s.loadingHistoryId)
  const sessions = useAppStore((s) => s.sessions)
  const approvals = useAppStore((s) => s.approvals)
  const questions = useAppStore((s) => s.questions)
  const workerStatus = useAppStore((s) => s.workerStatus)
  const providers = useAppStore((s) => s.providers)
  const sendQuery = useAppStore((s) => s.sendQuery)
  const rewindToMessage = useAppStore((s) => s.rewindToMessage)

  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const turnRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const activeSession = sessions.find((s) => s.sessionId === activeSessionId)
  const messages = activeSessionId ? (messagesBySession[activeSessionId] ?? []) : []
  const turnGroups = useMemo(() => groupMessagesIntoTurns(messages), [messages])
  const userTurns = useMemo(
    () => turnGroups.filter((g) => g.kind === 'user'),
    [turnGroups],
  )
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null)
  const [hoveredTurnId, setHoveredTurnId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    messageId: string
    text: string
  } | null>(null)

  const isSessionRunning = activeSession?.status === 'running'
  const hasActiveStreaming = useAppStore((s) => Boolean(activeSessionId && (s.streamingBySession[activeSessionId]?.text || s.streamingBySession[activeSessionId]?.thinking)))
  const isLoadingHistory = Boolean(activeSessionId && loadingHistoryId === activeSessionId)
  const sessionApprovals = approvals.filter(
    (a) => !activeSessionId || a.sessionId === activeSessionId,
  )
  const sessionQuestions = questions.filter(
    (q) => !activeSessionId || q.sessionId === activeSessionId,
  )
  const totalModels = providers.reduce((acc, p) => acc + p.models.length, 0)

  const workerStatusText =
    workerStatus.state === 'ready'
      ? '后端就绪'
      : workerStatus.state === 'starting'
        ? '正在启动'
        : workerStatus.state === 'error'
          ? '后端异常'
          : '未连接'

  const updateActiveTurn = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container || userTurns.length === 0) return
    const containerTop = container.getBoundingClientRect().top
    let current = userTurns[0].id
    for (const turn of userTurns) {
      const el = turnRefs.current[turn.id]
      if (!el) continue
      const offset = el.getBoundingClientRect().top - containerTop
      if (offset <= 120) {
        current = turn.id
      }
    }
    setActiveTurnId(current)
  }, [userTurns])

  useEffect(() => {
    if (userTurns.length > 0) {
      setActiveTurnId(userTurns[userTurns.length - 1].id)
    } else {
      setActiveTurnId(null)
    }
  }, [activeSessionId, userTurns.length])

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [
    activeSessionId,
    messages.length,
    sessionApprovals.length,
    sessionQuestions.length,
  ])

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [contextMenu])

  const jumpToTurn = (id: string) => {
    setActiveTurnId(id)
    turnRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (isLoadingHistory && messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-xs text-[var(--ink-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--brand-primary)]" />
        正在加载历史对话...
      </div>
    )
  }

  const isEmpty =
    messages.length === 0 &&
    !hasActiveStreaming &&
    !isSessionRunning &&
    sessionApprovals.length === 0 &&
    sessionQuestions.length === 0

  if (isEmpty) {
    return (
      <div className="bauhaus-dot-grid flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10">
        <div className="flex w-full max-w-[760px] flex-col items-center">
          <div className="mb-4 flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[var(--brand-primary)]" />
            <span className="h-3 w-3 bg-[var(--brand-secondary)]" />
            <span
              className="inline-block h-0 w-0 border-x-[6px] border-b-[11px] border-x-transparent border-b-[var(--status-warn)]"
              aria-hidden="true"
            />
          </div>

          <h2 className="font-editorial text-3xl font-semibold tracking-tight text-[var(--ink-primary)]">
            DSH 工作台
          </h2>

          <p className="mt-2 text-xs tracking-wide text-[var(--ink-secondary)]">
            本地直连模式 · {workerStatusText}
            {totalModels > 0 ? ` · 可用模型 ${totalModels} 个` : ''}
          </p>

          <div className="mt-7 w-full">
            <Composer centered />
          </div>

          <div className="mt-5 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
            {QUICK_STARTS.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.title}
                  type="button"
                  disabled={workerStatus.state !== 'ready'}
                  onClick={() => void sendQuery(item.prompt)}
                  className="group flex flex-col items-start rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3.5 text-left transition hover:border-[var(--ink-primary)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Icon className="h-4 w-4 text-[var(--ink-secondary)] transition group-hover:text-[var(--brand-primary)]" />
                  <div className="mt-2.5 text-xs font-semibold text-[var(--ink-primary)]">{item.title}</div>
                  <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--ink-muted)]">
                    {item.prompt}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div
          ref={scrollContainerRef}
          onScroll={updateActiveTurn}
          className="flex-1 overflow-y-auto px-6 py-7 pr-12"
        >
          <div className="mx-auto max-w-[820px] space-y-6">
            {turnGroups.map((group) => {
              if (group.kind === 'user' && group.userMessage) {
                return (
                  <div
                    key={group.id}
                    ref={(el) => {
                      turnRefs.current[group.id] = el
                    }}
                    className="flex scroll-mt-6 items-start justify-end gap-2.5"
                  >
                    <article
                      onContextMenu={(e) => {
                        e.preventDefault()
                        const rawText = extractCopyText(group.userMessage!.blocks)
                        setContextMenu({
                          x: Math.min(e.clientX, window.innerWidth - 236),
                          y: Math.min(e.clientY, window.innerHeight - 170),
                          messageId: group.userMessage!.id,
                          text: rawText,
                        })
                      }}
                      title="右键可重新编辑或回退工作区"
                      className="max-w-[78%] rounded-lg border border-[var(--border-hairline)] border-r-[3px] border-r-[var(--brand-primary)] bg-[var(--bg-surface)] px-4 py-3"
                    >
                      <div className="text-[15.5px] leading-relaxed text-[var(--ink-primary)]">
                        {group.userMessage.blocks.map((block, idx) => renderBlock(block, idx))}
                      </div>
                      <div className="mt-1.5 flex items-center justify-end gap-2 font-mono-tabular text-[10px] text-[var(--ink-muted)]">
                        <CopyButton text={extractCopyText(group.userMessage.blocks)} />
                        <span>{formatClock(group.timestamp)}</span>
                      </div>
                    </article>
                    <div
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--brand-primary)]/40 bg-[var(--bg-surface)] text-[var(--brand-primary)]"
                      title="用户消息"
                    >
                      <User className="h-3.5 w-3.5 stroke-[2]" />
                    </div>
                  </div>
                )
              }

              if (group.kind === 'system' && group.systemMessage) {
                return (
                  <div
                    key={group.id}
                    className="flex items-start gap-2.5 rounded border border-[var(--brand-primary)]/50 bg-[var(--brand-primary)]/6 px-4 py-3 text-xs text-[var(--status-danger-text)]"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-primary)]" />
                    <div className="min-w-0 flex-1">
                      {group.systemMessage.blocks.map((block, idx) => renderBlock(block, idx))}
                    </div>
                  </div>
                )
              }

              return (
                <div key={group.id} className="flex items-start justify-start gap-2.5">
                  <div
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-surface)]"
                    title="助手回复"
                  >
                    <Bot className="h-3.5 w-3.5 stroke-[1.9]" />
                  </div>
                  <article className="min-w-0 flex-1 max-w-[90%]">
                    {group.notices && group.notices.length > 0 && (
                      <div className="mb-2 space-y-1">
                        {group.notices.map((notice, nIdx) => (
                          <div
                            key={nIdx}
                            className="inline-flex items-center gap-1.5 rounded border border-[var(--status-warn)]/40 bg-[var(--status-warn)]/10 px-2.5 py-1 font-mono-tabular text-[11px] text-[var(--status-warn-text)]"
                          >
                            <AlertCircle className="h-3 w-3 shrink-0 text-[var(--status-warn)]" />
                            <span>已触发重试 · {notice}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {group.processBlocks.length > 0 && (
                      <ProcessGroupDisclosure blocks={group.processBlocks} />
                    )}

                    {group.finalBlocks.length > 0 && (
                      <div className="space-y-1.5">
                        {group.finalBlocks.map((block, idx) => renderBlock(block, idx))}
                      </div>
                    )}

                    <DshSlot
                      name="conversation.chat.turnTail"
                      injectArgs={[activeSessionId]}
                      extraProps={{ sessionId: activeSessionId, turn: group }}
                      className="mt-2 space-y-2"
                    />

                    <div className="mt-1.5 flex items-center gap-2 font-mono-tabular text-[10px] text-[var(--ink-muted)]">
                      <span>{formatClock(group.timestamp)}</span>
                      <CopyButton text={extractCopyText(group.finalBlocks.length > 0 ? group.finalBlocks : group.processBlocks)} />
                    </div>
                  </article>
                </div>
              )
            })}

            <StreamingBubble
              sessionId={activeSessionId}
              isRunning={isSessionRunning}
              scrollContainerRef={scrollContainerRef}
            />

            {sessionApprovals.map((req) => (
              <ApprovalCard key={req.requestId} request={req} />
            ))}

            {sessionQuestions.map((req) => (
              <QuestionCard key={req.requestId} request={req} />
            ))}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* 右侧悬浮对话跳转轨道（断开短竖线 + 悬停预览用户输入） */}
        {userTurns.length > 0 && (
          <nav
            aria-label="对话跳转轨道"
            className="pointer-events-auto absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1.5 py-2"
          >
            {userTurns.map((turn, idx) => {
              const isActive = turn.id === activeTurnId
              const isHovered = turn.id === hoveredTurnId
              return (
                <div
                  key={turn.id}
                  className="relative flex items-center"
                  onMouseEnter={() => setHoveredTurnId(turn.id)}
                  onMouseLeave={() => setHoveredTurnId((prev) => (prev === turn.id ? null : prev))}
                >
                  {isHovered && (
                    <div className="pointer-events-none absolute right-6 z-30 w-64 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-left shadow-sm">
                      <div className="mb-1 flex items-center justify-between font-mono-tabular text-[10px] text-[var(--ink-muted)]">
                        <span className="font-semibold text-[var(--brand-primary)]">
                          第 {String(idx + 1).padStart(2, '0')} 条
                        </span>
                        <span>{formatClock(turn.timestamp)}</span>
                      </div>
                      <p className="line-clamp-3 text-xs leading-relaxed text-[var(--ink-primary)]">
                        {turn.userText}
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => jumpToTurn(turn.id)}
                    aria-label={`跳转到第 ${idx + 1} 条用户输入`}
                    className="flex items-center justify-center px-1.5 py-0.5"
                  >
                    <span
                      className={`block rounded-full transition-all ${
                        isActive
                          ? 'h-5 w-[3.5px] bg-[var(--brand-primary)]'
                          : isHovered
                            ? 'h-4 w-[3px] bg-[var(--ink-primary)]'
                            : 'h-3.5 w-[2px] bg-[var(--border-strong)]'
                      }`}
                    />
                  </button>
                </div>
              )
            })}
          </nav>
        )}
      </div>
      {contextMenu && (
        <div
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          className="fixed z-50 w-56 overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] py-1 text-xs shadow-md"
        >
          <button
            type="button"
            onClick={() => {
              const target = contextMenu
              setContextMenu(null)
              void rewindToMessage(target.messageId, true, target.text)
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[var(--ink-primary)] hover:bg-[var(--bg-recessed)]"
          >
            <Pencil className="h-3.5 w-3.5 text-[var(--brand-secondary)]" />
            <span>重新编辑并回退（含工作区）</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const target = contextMenu
              setContextMenu(null)
              void rewindToMessage(target.messageId, true)
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[var(--ink-primary)] hover:bg-[var(--bg-recessed)]"
          >
            <RotateCcw className="h-3.5 w-3.5 text-[var(--brand-primary)]" />
            <span>回退到此消息（含工作区）</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const target = contextMenu
              setContextMenu(null)
              void rewindToMessage(target.messageId, false)
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[var(--ink-secondary)] hover:bg-[var(--bg-recessed)] hover:text-[var(--ink-primary)]"
          >
            <RotateCcw className="h-3.5 w-3.5 text-[var(--ink-muted)]" />
            <span>仅回退对话（保留文件）</span>
          </button>
          <div className="my-1 h-px bg-[var(--bg-recessed)]" />
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(contextMenu.text)
              setContextMenu(null)
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[var(--ink-secondary)] hover:bg-[var(--bg-recessed)] hover:text-[var(--ink-primary)]"
          >
            <Copy className="h-3.5 w-3.5 text-[var(--ink-secondary)]" />
            <span>复制消息内容</span>
          </button>
        </div>
      )}
      <Composer />
    </>
  )
}
