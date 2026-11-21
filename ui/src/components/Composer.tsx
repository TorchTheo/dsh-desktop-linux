import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { FolderOpen, ImagePlus, Send, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import type { ImageAttachment } from '../types/domain'

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

export function Composer() {
  const [text, setText] = useState('')
  const [images, setImages] = useState<ImageAttachment[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const sendQuery = useAppStore((s) => s.sendQuery)
  const workerStatus = useAppStore((s) => s.workerStatus)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const config = useAppStore((s) => s.config)
  const pickAndSetWorkingDirectory = useAppStore((s) => s.pickAndSetWorkingDirectory)

  const activeSession = sessions.find((s) => s.sessionId === activeSessionId)
  const cwd = activeSession?.cwd ?? config?.defaultCwd ?? ''
  const disabled = workerStatus.state !== 'ready'
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
    <div className="border-t border-[#21262d] bg-[#0b0f14] px-6 py-3">
      <div className="mx-auto max-w-3xl">
        <div className="mb-2 flex items-center justify-between text-[11px] text-[#8b949e]">
          <button
            type="button"
            onClick={() => void pickAndSetWorkingDirectory()}
            className="inline-flex max-w-[75%] items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-[#161b22] hover:text-[#e6edf3]"
            title="点击切换工作目录"
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-blue-400" />
            <span className="truncate">{cwd || '选择工作目录'}</span>
          </button>
          <span>Enter 发送 · Shift+Enter 换行</span>
        </div>

        {showSlashHints && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SLASH_HINTS.filter((h) => h.cmd.startsWith(text)).map((hint) => (
              <button
                key={hint.cmd}
                type="button"
                onClick={() => setText(`${hint.cmd} `)}
                className="rounded-md border border-[#30363d] bg-[#161b22] px-2.5 py-1 text-xs text-[#c9d1d9] hover:border-blue-500"
              >
                <span className="font-mono text-blue-400">{hint.cmd}</span>
                <span className="ml-1.5 text-[#8b949e]">{hint.desc}</span>
              </button>
            ))}
          </div>
        )}

        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((img, idx) => (
              <div
                key={idx}
                className="relative overflow-hidden rounded-lg border border-[#30363d] bg-[#161b22]"
              >
                <img
                  src={`data:${img.mimeType};base64,${img.data}`}
                  alt={img.name ?? 'upload'}
                  className="h-14 w-14 object-cover"
                />
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                  className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 text-white hover:bg-rose-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 rounded-xl border border-[#30363d] bg-[#161b22] p-2 focus-within:border-[#58a6ff]">
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
            className="rounded-lg p-2 text-[#8b949e] transition hover:bg-[#21262d] hover:text-[#e6edf3] disabled:opacity-40"
          >
            <ImagePlus className="h-4 w-4" />
          </button>

          <textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={(e) => void handlePaste(e)}
            disabled={disabled}
            placeholder={
              disabled ? '等待 dsh sdk 后端就绪...' : '输入指令、问题或 /compact 等命令...'
            }
            className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-sm text-[#e6edf3] placeholder-[#6e7681] focus:outline-none disabled:opacity-50"
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={disabled || (!text.trim() && images.length === 0)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-[#21262d] disabled:text-[#6e7681]"
            title="发送"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
