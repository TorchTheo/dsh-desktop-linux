import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { ArrowUp, FolderOpen, ImagePlus, Square, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import type { ImageAttachment } from '../types/domain'
import { ModelSelector } from './ModelSelector'

const SLASH_HINTS = [
  { cmd: '/compact', desc: '压缩当前会话上下文' },
  { cmd: '/goal', desc: '启动目标驱动模式' },
]

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
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const sendQuery = useAppStore((s) => s.sendQuery)
  const abortSession = useAppStore((s) => s.abortSession)
  const workerStatus = useAppStore((s) => s.workerStatus)
  const bridgeCapabilities = useAppStore((s) => s.bridgeCapabilities)
  const abortingSessionId = useAppStore((s) => s.abortingSessionId)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const config = useAppStore((s) => s.config)
  const pickAndSetWorkingDirectory = useAppStore((s) => s.pickAndSetWorkingDirectory)

  const activeSession = sessions.find((s) => s.sessionId === activeSessionId)
  const cwd = activeSession?.cwd ?? config?.defaultCwd ?? ''
  const disabled = workerStatus.state !== 'ready'
  const isRunning = activeSession?.status === 'running'
  const canAbort = Boolean(isRunning && bridgeCapabilities.abort && activeSessionId)
  const isAborting = Boolean(activeSessionId && abortingSessionId === activeSessionId)
  const showSlashHints = text.startsWith('/') && !text.includes(' ')

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
      <div className={centered ? 'w-full' : 'mx-auto max-w-[780px]'}>
        {showSlashHints && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SLASH_HINTS.filter((h) => h.cmd.startsWith(text)).map((hint) => (
              <button
                key={hint.cmd}
                type="button"
                onClick={() => setText(`${hint.cmd} `)}
                className="rounded border border-[#D8D5CB] bg-[#FAF9F5] px-2.5 py-1 text-xs text-[#141413] transition hover:border-[#1E4D9B]"
              >
                <span className="font-mono-tabular font-medium text-[#1E4D9B]">{hint.cmd}</span>
                <span className="ml-1.5 text-[#575652]">{hint.desc}</span>
              </button>
            ))}
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
                    alt={img.name ?? 'upload'}
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
            rows={centered ? 3 : 2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={(e) => void handlePaste(e)}
            disabled={disabled}
            placeholder={
              disabled ? '等待 dsh sdk 后端就绪...' : '输入指令、技术问题或 /compact 等命令...'
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
                title="附加图片（也支持直接粘贴截图）"
                className="rounded border border-[#D8D5CB] bg-[#ECEAE2] p-1 text-[#575652] transition hover:border-[#141413] hover:text-[#141413] disabled:opacity-40"
              >
                <ImagePlus className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => void pickAndSetWorkingDirectory()}
                className="font-mono-tabular inline-flex max-w-[220px] items-center gap-1 rounded border border-[#D8D5CB] bg-[#ECEAE2] px-2 py-0.5 text-[11px] text-[#575652] transition hover:border-[#141413] hover:text-[#141413]"
                title={cwd || '选择工作目录'}
              >
                <FolderOpen className="h-3 w-3 shrink-0 text-[#1E4D9B]" />
                <span className="truncate">{cwd || '选择工作目录'}</span>
              </button>

              <ModelSelector />
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
                title="发送 (Enter)"
              >
                <ArrowUp className="h-4 w-4 stroke-[2.2]" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
