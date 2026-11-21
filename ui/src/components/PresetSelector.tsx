import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Sparkles, Star } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export function PresetSelector() {
  const presets = useAppStore((s) => s.agentPresets)
  const defaultPresetId = useAppStore((s) => s.defaultPresetId)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const sessionPresetById = useAppStore((s) => s.sessionPresetById)
  const workerStatus = useAppStore((s) => s.workerStatus)
  const setSessionPreset = useAppStore((s) => s.setSessionPreset)
  const setDefaultAgentPreset = useAppStore((s) => s.setDefaultAgentPreset)

  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (presets.length === 0) return null

  const activePresetId =
    (activeSessionId ? sessionPresetById[activeSessionId] : undefined) ??
    defaultPresetId ??
    presets[0]?.id ??
    ''

  const currentPreset = presets.find((p) => p.id === activePresetId) ?? presets[0]
  const disabled = workerStatus.state !== 'ready'

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title={`Agent 模式：${currentPreset?.name ?? activePresetId}`}
        className="inline-flex h-7 max-w-[140px] items-center gap-1 rounded border border-[#D8D5CB] bg-[#F4F3EE] px-2 font-mono-tabular text-[11px] text-[#575652] transition hover:border-[#141413] hover:text-[#141413] disabled:opacity-45"
      >
        <Sparkles className="h-3 w-3 shrink-0 text-[#1E4D9B]" />
        <span className="truncate">{currentPreset?.name ?? activePresetId}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-[#8A8880]" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-1.5 w-72 overflow-hidden rounded-lg border border-[#C2BEB2] bg-[#FAF9F5] shadow-sm">
          <div className="flex items-center justify-between border-b border-[#ECEAE2] bg-[#F4F3EE] px-3 py-1.5">
            <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-[#575652]">
              Agent 模式 / 预设
            </span>
            <span className="font-mono-tabular text-[10px] text-[#8A8880]">
              共 {presets.length} 项
            </span>
          </div>

          <ul className="max-h-72 overflow-y-auto py-1">
            {presets.map((preset) => {
              const isSelected = preset.id === activePresetId
              const isDefault = preset.id === defaultPresetId
              return (
                <li
                  key={preset.id}
                  className={`flex items-start justify-between gap-2 px-2.5 py-2 transition ${
                    isSelected ? 'bg-[#ECEAE2]/80' : 'hover:bg-[#F4F3EE]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      void setSessionPreset(preset.id)
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-[#141413]">
                        {preset.name}
                      </span>
                      {isDefault && (
                        <span className="shrink-0 rounded border border-[#1E4D9B]/30 bg-[#1E4D9B]/8 px-1 py-0.2 font-mono-tabular text-[9px] text-[#1E4D9B]">
                          默认
                        </span>
                      )}
                      {isSelected && <Check className="h-3 w-3 shrink-0 text-[#D13B27]" />}
                    </div>
                    <div className="font-mono-tabular text-[10px] text-[#8A8880]">
                      {preset.id}
                    </div>
                    {preset.description && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[#575652]">
                        {preset.description}
                      </p>
                    )}
                  </button>

                  {!isDefault && (
                    <button
                      type="button"
                      title="设为新建会话默认模式"
                      onClick={(e) => {
                        e.stopPropagation()
                        void setDefaultAgentPreset(preset.id)
                      }}
                      className="mt-0.5 shrink-0 rounded p-1 text-[#8A8880] transition hover:bg-[#E5E2D8] hover:text-[#141413]"
                    >
                      <Star className="h-3 w-3" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
