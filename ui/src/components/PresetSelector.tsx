import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Sparkles, Star } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import type { AgentPresetInfo } from '../types/domain'

const BUILTIN_PRESET_LABELS: Record<string, { name: string; description: string }> = {
  standard: {
    name: '标准模式',
    description: '完整通用工具集（文件、终端、搜索、网页、子代理、计划与任务编排），适合日常开发与问答。',
  },
  ptc: {
    name: '程序化编排',
    description: '在标准工具集基础上启用程序化工具调用（PTC），支持单轮代码编排批量执行多步工具。',
  },
  minimal: {
    name: '极简模式',
    description: '仅保留文件读写、持久终端与基础上下文压缩，提示词最短、最省 Token、响应最快。',
  },
  cordis: {
    name: '插件开发',
    description: '挂载 Cordis 运行时内省工具与 DSH 文档技能，用于实时查看、调试与开发 DSH 插件。',
  },
}

export function formatPresetDisplay(preset: AgentPresetInfo): {
  name: string
  description: string | null
} {
  const fallback = BUILTIN_PRESET_LABELS[preset.id]
  const name =
    preset.name && preset.name !== preset.id
      ? preset.name
      : (fallback?.name ?? preset.name ?? preset.id)
  const description = preset.description || fallback?.description || null
  return { name, description }
}

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
  const currentDisplay = currentPreset ? formatPresetDisplay(currentPreset) : null
  const disabled = workerStatus.state !== 'ready'

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title={`Agent 模式：${currentDisplay?.name ?? activePresetId}`}
        className="inline-flex h-7 max-w-[140px] items-center gap-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2 font-mono-tabular text-[11px] text-[var(--ink-secondary)] transition hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)] disabled:opacity-45"
      >
        <Sparkles className="h-3 w-3 shrink-0 text-[var(--brand-secondary)]" />
        <span className="truncate">{currentDisplay?.name ?? activePresetId}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-[var(--ink-muted)]" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-1.5 w-76 overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-sm">
          <div className="flex items-center justify-between border-b border-[var(--bg-recessed)] bg-[var(--bg-canvas)] px-3 py-1.5">
            <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-secondary)]">
              Agent 模式 / 预设
            </span>
            <span className="font-mono-tabular text-[10px] text-[var(--ink-muted)]">
              共 {presets.length} 项
            </span>
          </div>

          <ul className="max-h-72 overflow-y-auto py-1">
            {presets.map((preset) => {
              const isSelected = preset.id === activePresetId
              const isDefault = preset.id === defaultPresetId
              const display = formatPresetDisplay(preset)
              return (
                <li
                  key={preset.id}
                  className={`flex items-start justify-between gap-2 px-2.5 py-2 transition ${
                    isSelected ? 'bg-[var(--bg-recessed)]/80' : 'hover:bg-[var(--bg-canvas)]'
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
                      <span className="truncate text-xs font-medium text-[var(--ink-primary)]">
                        {display.name}
                      </span>
                      {isDefault && (
                        <span className="shrink-0 rounded border border-[var(--brand-secondary)]/30 bg-[var(--brand-secondary)]/8 px-1 py-0.2 font-mono-tabular text-[9px] text-[var(--brand-secondary)]">
                          默认
                        </span>
                      )}
                      {isSelected && <Check className="h-3 w-3 shrink-0 text-[var(--brand-primary)]" />}
                    </div>
                    <div className="font-mono-tabular text-[10px] text-[var(--ink-muted)]">
                      {preset.id}
                    </div>
                    {display.description && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[var(--ink-secondary)]">
                        {display.description}
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
                      className="mt-0.5 shrink-0 rounded p-1 text-[var(--ink-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--ink-primary)]"
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
