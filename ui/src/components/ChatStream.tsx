import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AlertCircle, Brain, ChevronDown, ChevronRight, Cpu, Terminal, Wrench } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import type { UiContentBlock, UiMessage } from '../types/domain'
import { ApprovalCard } from './ApprovalCard'
import { QuestionCard } from './QuestionCard'

function formatJson(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="my-1.5 rounded-lg border border-[#30363d]/80 bg-[#12171f]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-[#8b949e] hover:text-[#c9d1d9]"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Brain className="h-3.5 w-3.5 text-purple-400" />
        <span>思考过程</span>
      </button>
      {open && (
        <div className="border-t border-[#21262d] px-3 py-2 text-xs whitespace-pre-wrap text-[#8b949e]">
          {text}
        </div>
      )}
    </div>
  )
}

function ToolUseBlock({ name, id, input }: { name: string; id: string; input: unknown }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="my-1.5 rounded-lg border border-[#30363d] bg-[#161b22]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-[#c9d1d9] hover:bg-[#1c2128]"
      >
        <span className="flex items-center gap-1.5 font-medium">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Wrench className="h-3.5 w-3.5 text-sky-400" />
          <code>{name}</code>
        </span>
        <span className="text-[11px] text-[#6e7681]">{id.slice(0, 12)}</span>
      </button>
      {open && (
        <pre className="max-h-72 overflow-auto border-t border-[#21262d] p-3 text-[11px] text-[#8b949e]">
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
      className={`my-1.5 rounded-lg border ${
        isError
          ? 'border-rose-500/40 bg-rose-950/20'
          : 'border-emerald-500/30 bg-[#121917]'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-[#c9d1d9]"
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Terminal className={`h-3.5 w-3.5 ${isError ? 'text-rose-400' : 'text-emerald-400'}`} />
          <span>{isError ? '工具执行失败' : '工具输出'}</span>
        </span>
        <span className="text-[11px] text-[#6e7681]">{toolUseId.slice(0, 12)}</span>
      </button>
      {open && (
        <pre className="max-h-80 overflow-auto border-t border-[#21262d] p-3 text-[11px] whitespace-pre-wrap text-[#c9d1d9]">
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
        <div key={index} className="markdown-body text-sm leading-relaxed text-[#e6edf3]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.text}</ReactMarkdown>
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
          className="my-2 max-h-64 rounded-lg border border-[#30363d] object-contain"
        />
      )
    case 'unknown':
      return (
        <pre key={index} className="my-1 rounded bg-[#161b22] p-2 text-[11px] text-[#8b949e]">
          {formatJson(block.raw)}
        </pre>
      )
  }
}

function MessageRow({ message }: { message: UiMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-[#1f6feb]/25 px-4 py-2.5 ring-1 ring-[#388bfd]/35">
          {message.blocks.map((block, idx) => renderBlock(block, idx))}
        </div>
      </div>
    )
  }

  if (message.isError || message.role === 'system') {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-950/25 px-4 py-3 text-xs text-rose-200">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
        <div className="min-w-0 flex-1">
          {message.blocks.map((block, idx) => renderBlock(block, idx))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {message.blocks.map((block, idx) => renderBlock(block, idx))}
    </div>
  )
}

export function ChatStream() {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const messagesBySession = useAppStore((s) => s.messagesBySession)
  const sessions = useAppStore((s) => s.sessions)
  const approvals = useAppStore((s) => s.approvals)
  const questions = useAppStore((s) => s.questions)
  const subagentsBySession = useAppStore((s) => s.subagentsBySession)
  const config = useAppStore((s) => s.config)

  const bottomRef = useRef<HTMLDivElement | null>(null)
  const activeSession = sessions.find((s) => s.sessionId === activeSessionId)
  const messages = activeSessionId ? (messagesBySession[activeSessionId] ?? []) : []
  const sessionApprovals = approvals.filter(
    (a) => !activeSessionId || a.sessionId === activeSessionId,
  )
  const sessionQuestions = questions.filter(
    (q) => !activeSessionId || q.sessionId === activeSessionId,
  )
  const subagents = activeSessionId ? (subagentsBySession[activeSessionId] ?? []) : []

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, sessionApprovals.length, sessionQuestions.length])

  if (messages.length === 0 && sessionApprovals.length === 0 && sessionQuestions.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="max-w-md rounded-2xl border border-[#21262d] bg-[#161b22]/70 px-8 py-7">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
            <Cpu className="h-5 w-5" />
          </div>
          <h2 className="text-base font-semibold text-[#e6edf3]">DSH Linux 原生桌面端</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-[#8b949e]">
            直连本地 <code className="text-[#c9d1d9]">dsh --profile sdk</code> stdio JSON-RPC
            运行时，无浏览器套壳。
          </p>
          {config && (
            <div className="mt-4 rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-left text-[11px] text-[#8b949e]">
              <div>
                路由：<span className="text-[#e6edf3]">{config.provider} / {config.model}</span>
              </div>
              <div className="mt-0.5 truncate" title={activeSession?.cwd ?? config.defaultCwd}>
                目录：<span className="text-[#e6edf3]">{activeSession?.cwd ?? config.defaultCwd}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-3xl space-y-5">
        {messages.map((msg) => (
          <MessageRow key={msg.id} message={msg} />
        ))}

        {subagents.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {subagents.map((sa) => (
              <div
                key={sa.childSessionId}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#30363d] bg-[#161b22] px-3 py-1 text-[11px] text-[#8b949e]"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    sa.kind === 'started' ? 'bg-blue-400 animate-pulse' : 'bg-emerald-400'
                  }`}
                />
                Subagent {sa.childSessionId.slice(0, 8)} · {sa.status ?? sa.kind}
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

        {activeSession?.status === 'running' && (
          <div className="flex items-center gap-2 text-xs text-[#8b949e]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
            Agent 正在执行...
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
