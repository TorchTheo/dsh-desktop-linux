import { useEffect, useState } from 'react'
import { ExternalLink, FileText, Film, Image as ImageIcon, Loader2, Maximize2, X } from 'lucide-react'
import { openLocalFile, readLocalFileDataUrl } from '../api/tauri'

interface DeliverableCardProps {
  path: string
  description?: string | null
  mimeType?: string | null
}

function basename(p: string): string {
  const parts = p.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || p
}

export function DeliverableCard({ path, description, mimeType }: DeliverableCardProps) {
  const isImage = Boolean(mimeType?.startsWith('image/'))
  const isVideo = Boolean(mimeType?.startsWith('video/'))
  const isMedia = isImage || isVideo

  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(isMedia)
  const [error, setError] = useState<string | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  useEffect(() => {
    if (!isMedia) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void readLocalFileDataUrl(path)
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err))
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [path, isMedia])

  useEffect(() => {
    if (!lightboxOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxOpen])

  const fileName = basename(path)

  return (
    <>
      <div className="my-2.5 max-w-lg overflow-hidden rounded-lg border border-[#C2BEB2] bg-[#FAF9F5]">
        {isImage && (
          <div className="relative flex min-h-[160px] items-center justify-center bg-[#ECEAE2]/70">
            {loading ? (
              <div className="flex items-center gap-2 py-10 text-xs text-[#8A8880]">
                <Loader2 className="h-4 w-4 animate-spin text-[#D13B27]" />
                正在加载图片预览...
              </div>
            ) : dataUrl ? (
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                title="点击放大查看原图"
                className="group relative block w-full cursor-zoom-in overflow-hidden"
              >
                <img
                  src={dataUrl}
                  alt={description || fileName}
                  className="mx-auto max-h-[420px] w-full object-contain bg-[#F4F3EE]"
                />
                <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded bg-[#141413]/75 px-2 py-1 text-[10px] text-[#FAF9F5] opacity-0 transition group-hover:opacity-100">
                  <Maximize2 className="h-3 w-3" />
                  放大
                </span>
              </button>
            ) : (
              <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center text-xs text-[#8A8880]">
                <ImageIcon className="h-5 w-5" />
                <span>无法预览图片（文件可能已移动或超过 25 MiB）</span>
                {error && <span className="font-mono-tabular text-[10px] text-[#D13B27]">{error}</span>}
              </div>
            )}
          </div>
        )}

        {isVideo && (
          <div className="flex min-h-[140px] items-center justify-center bg-[#141413]">
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-xs text-[#D8D5CB]">
                <Loader2 className="h-4 w-4 animate-spin text-[#D13B27]" />
                正在加载视频预览...
              </div>
            ) : dataUrl ? (
              <video src={dataUrl} controls className="max-h-[380px] w-full" />
            ) : (
              <div className="flex items-center gap-2 px-4 py-6 text-xs text-[#D8D5CB]">
                <Film className="h-4 w-4" />
                <span>视频文件较大或不可用，请点击下方用系统播放器打开</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-start justify-between gap-3 border-t border-[#ECEAE2] px-3.5 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {isImage ? (
                <ImageIcon className="h-3.5 w-3.5 shrink-0 text-[#D13B27]" />
              ) : isVideo ? (
                <Film className="h-3.5 w-3.5 shrink-0 text-[#1E4D9B]" />
              ) : (
                <FileText className="h-3.5 w-3.5 shrink-0 text-[#575652]" />
              )}
              <span className="font-mono-tabular truncate text-xs font-semibold text-[#141413]">
                {fileName}
              </span>
            </div>
            {description && (
              <p className="mt-1 text-xs leading-relaxed text-[#575652]">{description}</p>
            )}
            <div className="font-mono-tabular mt-1 truncate text-[10px] text-[#8A8880]" title={path}>
              {path}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void openLocalFile(path)}
            className="inline-flex shrink-0 items-center gap-1 rounded border border-[#D8D5CB] bg-[#F4F3EE] px-2.5 py-1 text-[11px] font-medium text-[#141413] transition hover:border-[#141413] hover:bg-[#ECEAE2]"
          >
            <ExternalLink className="h-3 w-3" />
            打开
          </button>
        </div>
      </div>

      {lightboxOpen && dataUrl && (
        <div
          onMouseDown={() => setLightboxOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141413]/80 p-6 backdrop-blur-xs"
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className="relative flex max-h-[92vh] max-w-[92vw] flex-col overflow-hidden rounded-lg border border-[#C2BEB2] bg-[#FAF9F5] shadow-xl"
          >
            <div className="flex items-center justify-between gap-4 border-b border-[#D8D5CB] bg-[#F4F3EE] px-4 py-2">
              <span className="font-mono-tabular truncate text-xs font-medium text-[#141413]">
                {description || fileName}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void openLocalFile(path)}
                  className="inline-flex items-center gap-1 rounded border border-[#D8D5CB] bg-[#FAF9F5] px-2 py-1 text-[11px] text-[#141413] hover:border-[#141413]"
                >
                  <ExternalLink className="h-3 w-3" />
                  系统打开
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxOpen(false)}
                  className="rounded p-1 text-[#575652] hover:bg-[#ECEAE2] hover:text-[#141413]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <img
              src={dataUrl}
              alt={description || fileName}
              className="max-h-[82vh] max-w-[90vw] object-contain bg-[#F4F3EE]"
            />
          </div>
        </div>
      )}
    </>
  )
}
