import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { ArrowUp, ChevronDown, ChevronRight, Clock, FolderOpen, ImagePlus, ListPlus, Pencil, SendHorizontal, Square, Terminal, X, Zap } from 'lucide-react'
import { DshSlot } from '../plugins/dshPluginHost'
import { useAppStore } from '../store/useAppStore'
import type { ImageAttachment } from '../types/domain'
import { ModelSelector } from './ModelSelector'
import { PermissionSelector } from './PermissionSelector'
import { PresetSelector } from './PresetSelector'

interface SlashCommandItem {
  cmd: string
  desc: string
  kind: 'command' | 'skill'
  badge?: string
}

const BUILTIN_SLASH_COMMANDS: SlashCommandItem[] = [
  { cmd: '/compact', desc: '压缩当前会话上下文，释放上下文窗口', kind: 'command', badge: '指令' },
  { cmd: '/goal', desc: '开启目标驱动模式，持续推进直至完成', kind: 'command', badge: '指令' },
]

function formatCompactTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatSandboxMode(mode: string | null | undefined): string {
  if (!mode) return ''
  if (mode === 'danger-full-access') return '完全访问'
  if (mode === 'workspace-write') return '工作区可写'
  if (mode === 'read-only') return '只读'
  return mode
}

function basename(path: string): string {
  const parts = path.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || path
}

function fileToAttachment(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      resolve({
        data: comma >= 0 ? result.slice(comma + 1) : result,
        mimeType: file.type || 'image/png',
        name: file.name || null,
      })
    }
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

interface ComposerProps {
  centered?: boolean
}

export function Composer({ centered = false }: ComposerProps) {
  const [text, setText] = useState('')
  const [images, setImages] = useState<ImageAttachment[]>([])
  const [slashDismissed, setSlashDismissed] = useState(false)
  const [slashIndex, setSlashIndex] = useState(0)
  const [jobsExpanded, setJobsExpanded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const sendQuery = useAppStore((s) => s.sendQuery)
  const interruptAndSend = useAppStore((s) => s.interruptAndSend)
  const abortSession = useAppStore((s) => s.abortSession)
  const workerStatus = useAppStore((s) => s.workerStatus)
  const bridgeCapabilities = useAppStore((s) => s.bridgeCapabilities)
  const abortingSessionId = useAppStore((s) => s.abortingSessionId)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const config = useAppStore((s) => s.config)
  const telemetry = useAppStore((s) => (s.activeSessionId ? s.telemetryBySession[s.activeSessionId] : undefined))
  const composerDraft = useAppStore((s) => s.composerDraft)
  const consumeComposerDraft = useAppStore((s) => s.consumeComposerDraft)
  const pickAndSetWorkingDirectory = useAppStore((s) => s.pickAndSetWorkingDirectory)
  const queuedMessagesBySession = useAppStore((s) => s.queuedMessagesBySession)
  const removeQueuedMessage = useAppStore((s) => s.removeQueuedMessage)
  const editQueuedMessage = useAppStore((s) => s.editQueuedMessage)
  const flushQueuedMessage = useAppStore((s) => s.flushQueuedMessage)
  const jobsBySession = useAppStore((s) => s.jobsBySession)
  const killSessionJob = useAppStore((s) => s.killSessionJob)
  const skills = useAppStore((s) => s.skills)
  const fetchSkills = useAppStore((s) => s.fetchSkills)

  const activeSession = sessions.find((s) => s.sessionId === activeSessionId)
  const cwd = activeSession?.cwd ?? config?.defaultCwd ?? ''
  const disabled = workerStatus.state !== 'ready'
  const isRunning = activeSession?.status === 'running'
  const queuedMessages = activeSessionId ? (queuedMessagesBySession[activeSessionId] ?? []) : []
  const activeJobs = activeSessionId ? (jobsBySession[activeSessionId] ?? []) : []
  const canAbort = Boolean(isRunning && bridgeCapabilities.abort && activeSessionId)
  const isAborting = Boolean(activeSessionId && abortingSessionId === activeSessionId)

  useEffect(() => {
    if (workerStatus.state === 'ready' && skills.length === 0) {
      void fetchSkills(cwd || null)
    }
  }, [workerStatus.state, cwd, skills.length, fetchSkills])

  const allSlashItems = useMemo<SlashCommandItem[]>(() => {
    const skillItems: SlashCommandItem[] = skills.map((sk) => ({
      cmd: `/${sk.name}`,
      desc: sk.description || '调用此技能',
      kind: 'skill',
      badge:
        sk.source === 'user-dsh'
          ? '用户技能'
          : sk.source === 'project-dsh'
            ? '工作区技能'
            : sk.source === 'bundled'
              ? '内置技能'
              : sk.source || '技能',
    }))
    return [...BUILTIN_SLASH_COMMANDS, ...skillItems]
  }, [skills])

  const slashQuery = text.startsWith('/') && !text.includes(' ') && !text.includes('\n') ? text : null
  const matchingCommands = useMemo(() => {
    if (slashQuery === null) return []
    const lower = slashQuery.slice(1).toLowerCase()
    if (!lower) return allSlashItems
    return allSlashItems.filter(
      (item) =>
        item.cmd.toLowerCase().includes(lower) || item.desc.toLowerCase().includes(lower),
    )
  }, [slashQuery, allSlashItems])

  const slashOpen = !slashDismissed && slashQuery !== null && matchingCommands.length > 0

  useEffect(() => {
    setSlashIndex(0)
    setSlashDismissed(false)
  }, [slashQuery])

  useEffect(() => {
    if (composerDraft !== null) {
      const next = consumeComposerDraft()
      if (next !== null) {
        setText(next)
        textareaRef.current?.focus()
      }
    }
  }, [composerDraft, consumeComposerDraft])

  const totalInput = telemetry ? telemetry.uncachedInputTokens + telemetry.cacheReadTokens : 0
  const cacheRate = totalInput > 0 ? Math.round((telemetry!.cacheReadTokens / totalInput) * 1000) / 10 : null
  const contextUsed = telemetry?.surfaceTokens ?? null
  const contextMax = telemetry?.contextWindow ?? null
  const contextPct =
    contextUsed !== null && contextMax && contextMax > 0
      ? Math.min(100, Math.round((contextUsed / contextMax) * 1000) / 10)
      : null

  const applySlashCommand = (cmd: string) => {
    setText(`${cmd} `)
    setSlashDismissed(true)
    textareaRef.current?.focus()
  }

  const handleSend = () => {
    if (disabled) return
    if (!text.trim() && images.length === 0) return
    const nextText = text
    const nextImages = images
    setText('')
    setImages([])
    void sendQuery(nextText, nextImages)
  }

  const handleInterruptSend = () => {
    if (disabled) return
    if (!text.trim() && images.length === 0) return
    const nextText = text
    const nextImages = images
    setText('')
    setImages([])
    void interruptAndSend(nextText, nextImages)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIndex((i) => (i + 1) % matchingCommands.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIndex((i) => (i - 1 + matchingCommands.length) % matchingCommands.length)
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        const target = matchingCommands[slashIndex] ?? matchingCommands[0]
        if (target) applySlashCommand(target.cmd)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const target = matchingCommands[slashIndex] ?? matchingCommands[0]
        if (target && text.trim() !== target.cmd) {
          applySlashCommand(target.cmd)
        } else {
          handleSend()
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSlashDismissed(true)
        return
      }
    }

    if (e.key === 'Enter' && e.ctrlKey && !e.shiftKey && !e.nativeEvent.isComposing && isRunning && bridgeCapabilities.interruptAndSend) {
      e.preventDefault()
      handleInterruptSend()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items)
    const imageFiles = items
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null)
    if (imageFiles.length === 0) return
    e.preventDefault()
    const attached = await Promise.all(imageFiles.map(fileToAttachment))
    setImages((prev) => [...prev, ...attached])
  }

  const handleFileChange = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const attached = await Promise.all(Array.from(files).map(fileToAttachment))
    setImages((prev) => [...prev, ...attached])
  }

  return (
    <div className={centered ? 'w-full max-w-[760px]' : 'shrink-0 px-6 pb-4 pt-2'}>
      <div className={`relative ${centered ? 'w-full' : 'mx-auto max-w-[780px]'}`}>
        {slashOpen && (
          <div
            role="listbox"
            aria-label="斜杠指令补全"
            className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-lg border border-[#C2BEB2] bg-[#FAF9F5]"
          >
            <div className="flex items-center justify-between border-b border-[#ECEAE2] bg-[#F4F3EE] px-3 py-1.5 text-[11px] text-[#8A8880]">
              <span>指令与技能（共 {matchingCommands.length} 项）</span>
              <span>↑↓ 选择 · Tab/Enter 选中 · Esc 关闭</span>
            </div>
            <ul className="max-h-72 divide-y divide-[#ECEAE2] overflow-y-auto py-0.5">
              {matchingCommands.map((item, idx) => {
                const selected = idx === slashIndex
                return (
                  <li key={item.cmd}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setSlashIndex(idx)}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        applySlashCommand(item.cmd)
                      }}
                      className={`flex w-full items-center justify-between gap-4 px-3.5 py-2 text-left text-xs transition ${
                        selected
                          ? 'bg-[#ECEAE2] text-[#141413]'
                          : 'bg-[#FAF9F5] text-[#575652] hover:bg-[#F4F3EE]'
                      }`}
                    >
                      <div className="flex min-w-0 shrink-0 items-center gap-1.5">
                        <span
                          className={`font-mono-tabular font-semibold ${
                            item.kind === 'skill' ? 'text-[#246A4D]' : 'text-[#1E4D9B]'
                          }`}
                        >
                          {item.cmd}
                        </span>
                        {item.badge && (
                          <span className="rounded border border-[#D8D5CB] bg-[#F4F3EE] px-1 py-0.2 font-mono-tabular text-[9px] text-[#8A8880]">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <span className="min-w-0 flex-1 truncate text-right text-[#575652]">
                        {item.desc}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {activeJobs.length > 0 && activeSessionId && (
          <div className="mb-2 overflow-hidden rounded-lg border border-[#246A4D]/35 bg-[#FAF9F5]">
            <button
              type="button"
              onClick={() => setJobsExpanded((v) => !v)}
              className="flex w-full items-center justify-between bg-[#246A4D]/8 px-3 py-1.5 font-mono-tabular text-[11px] text-[#1d543d] transition hover:bg-[#246A4D]/12"
            >
              <span className="inline-flex items-center gap-1.5 font-medium">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#246A4D]" />
                <Terminal className="h-3 w-3" />
                后台进程 · {activeJobs.length} 个运行中
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] text-[#575652]">
                <span>停止/打断对话不会终止后台进程</span>
                {jobsExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </span>
            </button>
            {jobsExpanded && (
              <ul className="divide-y divide-[#ECEAE2] border-t border-[#ECEAE2]">
                {activeJobs.map((job) => (
                  <li
                    key={job.jobId}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-[#141413]"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-mono-tabular shrink-0 rounded border border-[#246A4D]/30 bg-[#246A4D]/8 px-1.5 py-0.5 text-[10px] text-[#1d543d]">
                        {job.kind}
                      </span>
                      <span className="font-mono-tabular truncate text-[11px]">
                        {job.label || job.jobId}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void killSessionJob(activeSessionId, job.jobId)}
                      title="手动终止此后台进程"
                      className="shrink-0 rounded border border-[#D8D5CB] bg-[#F4F3EE] px-2 py-0.5 text-[10px] text-[#575652] transition hover:border-[#D13B27] hover:bg-[#D13B27]/10 hover:text-[#D13B27]"
                    >
                      终止
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {queuedMessages.length > 0 && activeSessionId && (
          <div className="mb-2 overflow-hidden rounded-lg border border-[#1E4D9B]/35 bg-[#FAF9F5]">
            <div className="flex items-center justify-between border-b border-[#ECEAE2] bg-[#1E4D9B]/8 px-3 py-1.5 font-mono-tabular text-[11px] text-[#1E4D9B]">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Clock className="h-3 w-3" />
                待发送队列 · {queuedMessages.length} 条
              </span>
              <span className="text-[10px] text-[#575652]">
                {isRunning ? '当前回合结束后自动依次发送' : '已暂停自动发送，可点击立即发送或编辑'}
              </span>
            </div>
            <ul className="divide-y divide-[#ECEAE2]">
              {queuedMessages.map((item, idx) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-[#141413]"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="font-mono-tabular shrink-0 rounded border border-[#D8D5CB] bg-[#F4F3EE] px-1 text-[10px] text-[#575652]">
                      #{idx + 1}
                    </span>
                    <span className="truncate">
                      {item.text || '（图片消息）'}
                    </span>
                    {item.images.length > 0 && (
                      <span className="font-mono-tabular shrink-0 text-[10px] text-[#8A8880]">
                        [{item.images.length} 图]
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => editQueuedMessage(activeSessionId, item.id)}
                      title="撤回至输入框编辑"
                      className="rounded p-1 text-[#575652] transition hover:bg-[#ECEAE2] hover:text-[#141413]"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void flushQueuedMessage(activeSessionId, item.id)}
                      title="立即发送（插队）"
                      className="rounded p-1 text-[#1E4D9B] transition hover:bg-[#1E4D9B]/10"
                    >
                      <SendHorizontal className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeQueuedMessage(activeSessionId, item.id)}
                      title="从队列移除"
                      className="rounded p-1 text-[#8A8880] transition hover:bg-[#D13B27]/10 hover:text-[#D13B27]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-lg border border-[#C2BEB2] bg-[#FAF9F5] transition focus-within:border-[#141413]">
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-[#D8D5CB] px-3 pt-3 pb-2">
              {images.map((img, idx) => (
                <div
                  key={idx}
                  className="relative overflow-hidden rounded border border-[#D8D5CB] bg-[#ECEAE2]"
                >
                  <img
                    src={`data:${img.mimeType};base64,${img.data}`}
                    alt={img.name ?? '附件图片'}
                    className="h-14 w-14 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                    className="absolute right-0.5 top-0.5 rounded bg-[#141413]/80 p-0.5 text-[#FAF9F5] hover:bg-[#D13B27]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            rows={centered ? 3 : 2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={(e) => void handlePaste(e)}
            disabled={disabled}
            placeholder={
              disabled
                ? '等待后端服务就绪...'
                : isRunning
                  ? 'Agent 正在运行，输入内容将加入待发送队列（完成后自动发送）...'
                  : '输入指令、技术问题，或输入 / 查看可用指令...'
            }
            className="max-h-44 w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm leading-relaxed text-[#141413] placeholder-[#8A8880] focus:outline-none disabled:opacity-50"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#ECEAE2] px-3 py-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleFileChange(e.target.files)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                title="附加图片（支持直接粘贴截图）"
                className="inline-flex h-7 w-7 items-center justify-center rounded border border-[#D8D5CB] bg-[#ECEAE2] text-[#575652] transition hover:border-[#141413] hover:text-[#141413] disabled:opacity-40"
              >
                <ImagePlus className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => void pickAndSetWorkingDirectory()}
                className="inline-flex h-7 max-w-[180px] items-center gap-1.5 rounded border border-[#D8D5CB] bg-[#ECEAE2] px-2 text-xs text-[#141413] transition hover:border-[#141413]"
                title={cwd || '选择工作目录'}
              >
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#575652]" />
                <span className="truncate">{cwd ? basename(cwd) : '选择工作目录'}</span>
              </button>

              <ModelSelector />
              <PresetSelector />
              <PermissionSelector />
            </div>

            <div className="flex items-center gap-1.5">
              {canAbort && (
                <button
                  type="button"
                  onClick={() => void abortSession()}
                  disabled={isAborting}
                  className="inline-flex h-7 items-center gap-1 rounded bg-[#D13B27] px-2.5 text-xs font-medium text-[#FAF9F5] transition hover:bg-[#b5301f] disabled:opacity-50"
                  title="停止生成"
                >
                  <Square className="h-3 w-3 fill-current" />
                  停止
                </button>
              )}

              <DshSlot
                name="conversation.input.right"
                injectArgs={[activeSessionId]}
                className="inline-flex items-center gap-1"
              />

              <button
                type="button"
                onClick={handleSend}
                disabled={disabled || (!text.trim() && images.length === 0)}
                className={`inline-flex h-7 items-center justify-center rounded text-[#FAF9F5] transition disabled:cursor-not-allowed disabled:bg-[#ECEAE2] disabled:text-[#8A8880] ${
                  isRunning
                    ? 'gap-1 bg-[#1E4D9B] px-2.5 text-xs font-medium hover:bg-[#173d7c]'
                    : 'w-7 bg-[#D13B27] hover:bg-[#b5301f]'
                }`}
                title={isRunning ? '加入待发送队列（Enter）' : '发送（Enter）'}
              >
                {isRunning ? (
                  <>
                    <ListPlus className="h-3.5 w-3.5" />
                    入队
                  </>
                ) : (
                  <ArrowUp className="h-4 w-4 stroke-[2.2]" />
                )}
              </button>

              {isRunning && bridgeCapabilities.interruptAndSend && (
                <button
                  type="button"
                  onClick={handleInterruptSend}
                  disabled={disabled || (!text.trim() && images.length === 0)}
                  className="inline-flex h-7 items-center gap-1 rounded bg-[#D13B27] px-2.5 text-xs font-medium text-[#FAF9F5] transition hover:bg-[#b5301f] disabled:cursor-not-allowed disabled:bg-[#ECEAE2] disabled:text-[#8A8880]"
                  title="强行打断当前回复并立即发送（Ctrl+Enter，不终止后台进程）"
                >
                  <Zap className="h-3 w-3" />
                  打断发送
                </button>
              )}
            </div>
          </div>
        </div>

        {!centered && (
          <footer className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 font-mono-tabular text-[10.5px] text-[#8A8880]">
            <div className="flex flex-wrap items-center gap-3">
              <span title={telemetry ? `缓存读取 ${telemetry.cacheReadTokens} / 未缓存输入 ${telemetry.uncachedInputTokens}` : '暂无数据'}>
                缓存命中{" "}
                <strong className={cacheRate !== null && cacheRate >= 50 ? 'text-[#246A4D]' : 'text-[#575652]'}>
                  {cacheRate !== null ? `${cacheRate}%` : '--'}
                </strong>
              </span>
              <span>
                输入 <strong className="text-[#575652]">{telemetry ? formatCompactTokens(totalInput) : '--'}</strong>
              </span>
              <span>
                输出 <strong className="text-[#575652]">{telemetry ? formatCompactTokens(telemetry.outputTokens) : '--'}</strong>
              </span>
              {contextUsed !== null ? (
                <span>
                  上下文{" "}
                  <strong className="text-[#575652]">
                    {formatCompactTokens(contextUsed)}
                    {contextMax ? ` / ${formatCompactTokens(contextMax)}` : ''}
                    {contextPct !== null ? ` (${contextPct}%)` : ''}
                  </strong>
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2.5">
              {telemetry?.sandboxMode && <span>权限：{formatSandboxMode(telemetry.sandboxMode)}</span>}
              {telemetry && telemetry.snapshotCount > 0 && (
                <span>快照：{telemetry.snapshotCount}</span>
              )}
              <span>右键用户消息可回退 / 重编辑</span>
            </div>
          </footer>
        )}
      </div>
    </div>
  )
}
