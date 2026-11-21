import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FolderGit2,
  Loader2,
  TerminalSquare,
  Wrench,
} from 'lucide-react'
import { openExternalUrl } from '../api/tauri'
import { useAppStore } from '../store/useAppStore'
import type { UiContentBlock, UiMessage } from '../types/domain'
import { ApprovalCard } from './ApprovalCard'
import { Composer } from './Composer'
import { QuestionCard } from './QuestionCard'

const markdownComponents = {
  a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      {...props}
      href={href}
      className="text-[#1E4D9B] underline decoration-[#1E4D9B]/35 underline-offset-2 hover:text-[#D13B27] hover:decoration-[#D13B27]"
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

function formatClock(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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
    <div className="my-2 rounded border border-[#D8D5CB] bg-[#FAF9F5]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#575652] hover:bg-[#ECEAE2]/50 hover:text-[#141413]"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span
          className={`h-2 w-2 rounded-full border border-[#1E4D9B] ${
            streaming ? 'bg-[#1E4D9B] animate-pulse' : 'bg-transparent'
          }`}
        />
        <span className="font-mono-tabular text-[11px] uppercase tracking-wider">
          {streaming ? 'Thinking...' : 'Thinking Trace'}
        </span>
      </button>
      {open && (
        <div className="border-t border-[#ECEAE2] bg-[#F4F3EE]/60 px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap text-[#575652]">
          {text}
        </div>
      )}
    </div>
  )
}

function ToolUseBlock({ name, id, input }: { name: string; id: string; input: unknown }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="my-2 rounded border border-[#D8D5CB] bg-[#FAF9F5]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-[#141413] hover:bg-[#ECEAE2]/50"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-[#575652]" /> : <ChevronRight className="h-3.5 w-3.5 text-[#575652]" />}
          <span className="h-2 w-2 bg-[#141413]" />
          <span className="font-mono-tabular text-[11px] font-semibold">TOOL · {name}</span>
        </span>
        <span className="font-mono-tabular text-[10px] text-[#8A8880]">{id.slice(0, 12)}</span>
      </button>
      {open && (
        <pre className="font-mono-tabular max-h-72 overflow-auto border-t border-[#D8D5CB] bg-[#ECEAE2] p-3 text-[11px] text-[#141413]">
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
      className={`my-2 rounded border bg-[#FAF9F5] ${
        isError ? 'border-[#D13B27]/60' : 'border-[#D8D5CB]'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-[#141413] hover:bg-[#ECEAE2]/50"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-[#575652]" /> : <ChevronRight className="h-3.5 w-3.5 text-[#575652]" />}
          <span
            className={`h-2 w-2 rounded-full ${isError ? 'bg-[#D13B27]' : 'bg-[#246A4D]'}`}
          />
          <span className="font-mono-tabular text-[11px] font-medium">
            {isError ? 'RESULT · ERROR' : 'RESULT · OK'}
          </span>
        </span>
        <span className="font-mono-tabular text-[10px] text-[#8A8880]">{toolUseId.slice(0, 12)}</span>
      </button>
      {open && (
        <pre className="font-mono-tabular max-h-80 overflow-auto border-t border-[#D8D5CB] bg-[#ECEAE2] p-3 text-[11px] whitespace-pre-wrap text-[#141413]">
          {formatJson(content)}
        </pre>
      )}
    </div>
  )
}

function renderBlock(block: UiContentBlock, index: number) {
  switch (block.type) {
    case 'text':
      return (
        <div key={index} className="markdown-body text-[14.5px]">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {block.text}
          </ReactMarkdown>
        </div>
      )
    case 'thinking':
      return <ThinkingBlock key={index} text={block.thinking} />
    case 'toolUse':
      return <ToolUseBlock key={index} name={block.name} id={block.id} input={block.input} />
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
          alt="attachment"
          className="my-2 max-h-64 rounded border border-[#D8D5CB] object-contain"
        />
      )
    case 'unknown':
      return (
        <pre
          key={index}
          className="font-mono-tabular my-1 rounded border border-[#D8D5CB] bg-[#ECEAE2] p-2 text-[11px] text-[#575652]"
        >
          {formatJson(block.raw)}
        </pre>
      )
  }
}

function MessageRow({ message }: { message: UiMessage }) {
  if (message.role === 'user') {
    return (
      <article className="border-l-[2.5px] border-[#D13B27] pl-4 py-0.5">
        <div className="mb-1 flex items-center gap-2 font-mono-tabular text-[10px] uppercase tracking-[0.12em] text-[#8A8880]">
          <span className="font-semibold text-[#D13B27]">Prompt</span>
          <span>·</span>
          <span>{formatClock(message.timestamp)}</span>
        </div>
        <div className="text-[15px] font-medium leading-relaxed text-[#141413]">
          {message.blocks.map((block, idx) => renderBlock(block, idx))}
        </div>
      </article>
    )
  }

  if (message.isError || message.role === 'system') {
    return (
      <div className="flex items-start gap-2.5 rounded border border-[#D13B27]/50 bg-[#D13B27]/6 px-4 py-3 text-xs text-[#8f2214]">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#D13B27]" />
        <div className="min-w-0 flex-1">
          {message.blocks.map((block, idx) => renderBlock(block, idx))}
        </div>
      </div>
    )
  }

  return (
    <article className="space-y-1.5 pl-4">
      {message.blocks.map((block, idx) => renderBlock(block, idx))}
    </article>
  )
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

export function ChatStream() {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const messagesBySession = useAppStore((s) => s.messagesBySession)
  const streamingBySession = useAppStore((s) => s.streamingBySession)
  const loadingHistoryId = useAppStore((s) => s.loadingHistoryId)
  const sessions = useAppStore((s) => s.sessions)
  const approvals = useAppStore((s) => s.approvals)
  const questions = useAppStore((s) => s.questions)
  const subagentsBySession = useAppStore((s) => s.subagentsBySession)
  const workerStatus = useAppStore((s) => s.workerStatus)
  const providers = useAppStore((s) => s.providers)
  const sendQuery = useAppStore((s) => s.sendQuery)

  const bottomRef = useRef<HTMLDivElement | null>(null)
  const activeSession = sessions.find((s) => s.sessionId === activeSessionId)
  const messages = activeSessionId ? (messagesBySession[activeSessionId] ?? []) : []
  const streaming = activeSessionId ? streamingBySession[activeSessionId] : undefined
  const isLoadingHistory = Boolean(activeSessionId && loadingHistoryId === activeSessionId)
  const sessionApprovals = approvals.filter(
    (a) => !activeSessionId || a.sessionId === activeSessionId,
  )
  const sessionQuestions = questions.filter(
    (q) => !activeSessionId || q.sessionId === activeSessionId,
  )
  const subagents = activeSessionId ? (subagentsBySession[activeSessionId] ?? []) : []
  const totalModels = providers.reduce((acc, p) => acc + p.models.length, 0)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [
    messages.length,
    streaming?.text.length,
    streaming?.thinking.length,
    sessionApprovals.length,
    sessionQuestions.length,
  ])

  if (isLoadingHistory && messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 font-mono-tabular text-xs text-[#575652]">
        <Loader2 className="h-4 w-4 animate-spin text-[#D13B27]" />
        LOADING SESSION TRANSCRIPT...
      </div>
    )
  }

  const isEmpty =
    messages.length === 0 &&
    !streaming?.text &&
    !streaming?.thinking &&
    sessionApprovals.length === 0 &&
    sessionQuestions.length === 0

  if (isEmpty) {
    return (
      <div className="bauhaus-dot-grid flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10">
        <div className="flex w-full max-w-[760px] flex-col items-center">
          <div className="mb-4 flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#D13B27]" />
            <span className="h-3 w-3 bg-[#1E4D9B]" />
            <span
              className="inline-block h-0 w-0 border-x-[6px] border-b-[11px] border-x-transparent border-b-[#C4881C]"
              aria-hidden="true"
            />
          </div>

          <h2 className="font-editorial text-3xl font-semibold tracking-tight text-[#141413]">
            DSH Studio
          </h2>

          <p className="font-mono-tabular mt-2 text-[11px] uppercase tracking-[0.14em] text-[#575652]">
            dsh --profile sdk · {workerStatus.state.toUpperCase()}
            {totalModels > 0 ? ` · ${totalModels} MODELS` : ''}
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
                  className="group flex flex-col items-start rounded-lg border border-[#D8D5CB] bg-[#FAF9F5] p-3.5 text-left transition hover:border-[#141413] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Icon className="h-4 w-4 text-[#575652] transition group-hover:text-[#D13B27]" />
                  <div className="mt-2.5 text-xs font-semibold text-[#141413]">{item.title}</div>
                  <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[#8A8880]">
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
      <div className="flex-1 overflow-y-auto px-6 py-7">
        <div className="mx-auto max-w-[780px] space-y-7">
          {messages.map((msg) => (
            <MessageRow key={msg.id} message={msg} />
          ))}

          {(streaming?.thinking || streaming?.text) && (
            <div className="space-y-2 pl-4">
              {streaming.thinking && (
                <ThinkingBlock text={streaming.thinking} defaultOpen streaming />
              )}
              {streaming.text && (
                <div className="markdown-body text-[14.5px]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {streaming.text}
                  </ReactMarkdown>
                  <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-[#D13B27] align-middle" />
                </div>
              )}
            </div>
          )}

          {subagents.length > 0 && (
            <div className="flex flex-wrap gap-2 pl-4">
              {subagents.map((sa) => (
                <div
                  key={sa.childSessionId}
                  className="font-mono-tabular inline-flex items-center gap-1.5 rounded border border-[#D8D5CB] bg-[#FAF9F5] px-2.5 py-1 text-[11px] text-[#575652]"
                >
                  <span
                    className={`h-1.5 w-1.5 rotate-45 ${
                      sa.kind === 'started' ? 'bg-[#1E4D9B] animate-pulse' : 'bg-[#246A4D]'
                    }`}
                  />
                  SUBAGENT {sa.childSessionId.slice(0, 8)} · {(sa.status ?? sa.kind).toUpperCase()}
                </div>
              ))}
            </div>
          )}

          {sessionApprovals.map((req) => (
            <ApprovalCard key={req.requestId} request={req} />
          ))}

          {sessionQuestions.map((req) => (
            <QuestionCard key={req.requestId} request={req} />
          ))}

          {activeSession?.status === 'running' && !streaming?.text && !streaming?.thinking && (
            <div className="flex items-center gap-2 pl-4 font-mono-tabular text-[11px] uppercase tracking-wider text-[#575652]">
              <span className="h-2 w-2 animate-pulse bg-[#D13B27]" />
              Executing...
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>
      <Composer />
    </>
  )
}
