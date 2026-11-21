import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { ArrowUp, FolderOpen, ImagePlus, Square, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import type { ImageAttachment } from '../types/domain'
import { ModelSelector } from './ModelSelector'
import { PermissionSelector } from './PermissionSelector'

interface SlashCommandItem {
  cmd: string
  desc: string
}

const SLASH_COMMANDS: SlashCommandItem[] = [
  { cmd: '/compact', desc: '压缩当前会话上下文，释放上下文窗口' },
  { cmd: '/goal', desc: '开启目标驱动模式，持续推进直至完成' },
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
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const sendQuery = useAppStore((s) => s.sendQuery)
  const abortSession = useAppStore((s) => s.abortSession)
  const workerStatus = useAppStore((s) => s.workerStatus)
  const bridgeCapabilities = useAppStore((s) => s.bridgeCapabilities)
  const abortingSessionId = useAppStore((s) => s.abortingSessionId)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const config = useAppStore((s) => s.config)
  const telemetryBySession = useAppStore((s) => s.telemetryBySession)
  const composerDraft = useAppStore((s) => s.composerDraft)
  const consumeComposerDraft = useAppStore((s) => s.consumeComposerDraft)
  const pickAndSetWorkingDirectory = useAppStore((s) => s.pickAndSetWorkingDirectory)

  const activeSession = sessions.find((s) => s.sessionId === activeSessionId)
  const cwd = activeSession?.cwd ?? config?.defaultCwd ?? ''
  const disabled = workerStatus.state !== 'ready'
  const isRunning = activeSession?.status === 'running'
  const canAbort = Boolean(isRunning && bridgeCapabilities.abort && activeSessionId)
  const isAborting = Boolean(activeSessionId && abortingSessionId === activeSessionId)

  const slashQuery = text.startsWith('/') && !text.includes(' ') && !text.includes('\n') ? text : null
  const matchingCommands = useMemo(() => {
    if (slashQuery === null) return []
    const lower = slashQuery.toLowerCase()
    return SLASH_COMMANDS.filter((item) => item.cmd.toLowerCase().startsWith(lower))
  }, [slashQuery])

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

  const telemetry = activeSessionId ? telemetryBySession[activeSessionId] : undefined
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

    if (e.key === 'Enter' && !e.shiftKey) {
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
              <span>可用指令</span>
              <span>↑↓ 选择 · Tab 补全 · Esc 关闭</span>
            </div>
            <ul className="divide-y divide-[#ECEAE2] py-0.5">
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
                      <span className="font-mono-tabular font-semibold text-[#1E4D9B]">
                        {item.cmd}
                      </span>
                      <span className="truncate text-[#575652]">{item.desc}</span>
                    </button>
                  </li>
                )
              })}
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
              disabled ? '等待后端服务就绪...' : '输入指令、技术问题，或输入 / 查看可用指令...'
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

              <button
                type="button"
                onClick={handleSend}
                disabled={disabled || (!text.trim() && images.length === 0)}
                className="inline-flex h-7 w-7 items-center justify-center rounded bg-[#D13B27] text-[#FAF9F5] transition hover:bg-[#b5301f] disabled:cursor-not-allowed disabled:bg-[#ECEAE2] disabled:text-[#8A8880]"
                title="发送（Enter）"
              >
                <ArrowUp className="h-4 w-4 stroke-[2.2]" />
              </button>
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
              {contextUsed !== null && contextMax ? (
                <span>
                  上下文{" "}
                  <strong className="text-[#575652]">
                    {formatCompactTokens(contextUsed)} / {formatCompactTokens(contextMax)}
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
