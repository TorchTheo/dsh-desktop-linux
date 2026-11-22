import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Cpu, SlidersHorizontal } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

const EFFORTS = [
  { value: '', label: '默认推理' },
  { value: 'low', label: '低推理' },
  { value: 'medium', label: '中推理' },
  { value: 'high', label: '高推理' },
]

export function ModelSelector() {
  const providers = useAppStore((s) => s.providers)
  const bridgeCapabilities = useAppStore((s) => s.bridgeCapabilities)
  const workerStatus = useAppStore((s) => s.workerStatus)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const sessionMetaById = useAppStore((s) => s.sessionMetaById)
  const pendingNewSessionModel = useAppStore((s) => s.pendingNewSessionModel)
  const config = useAppStore((s) => s.config)
  const setSessionModel = useAppStore((s) => s.setSessionModel)

  const [openMenu, setOpenMenu] = useState<'model' | 'effort' | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!openMenu) return
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [openMenu])

  if (!bridgeCapabilities.modelControl || workerStatus.state !== 'ready') {
    return null
  }

  const meta = activeSessionId ? sessionMetaById[activeSessionId] : (pendingNewSessionModel ?? undefined)
  const currentProvider = meta?.provider ?? config?.provider ?? ''
  const currentModel = meta?.model ?? config?.model ?? ''
  const currentEffort = meta?.reasoningEffort ?? config?.reasoningEffort ?? ''

  const matchedModelName =
    providers
      .find((p) => p.id === currentProvider)
      ?.models.find((m) => m.id === currentModel)?.name || currentModel || '选择模型'

  const currentEffortLabel =
    EFFORTS.find((e) => e.value === currentEffort)?.label ?? '默认推理'

  return (
    <div ref={containerRef} className="relative flex items-center gap-1.5">
      {/* 模型自定义下拉菜单 */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenMenu((m) => (m === 'model' ? null : 'model'))}
          title={`${currentProvider} / ${currentModel}`}
          className={`inline-flex h-7 max-w-[200px] items-center gap-1.5 rounded border px-2 text-xs text-[var(--ink-primary)] transition ${
            openMenu === 'model'
              ? 'border-[var(--ink-primary)] bg-[var(--bg-surface)]'
              : 'border-[var(--border-hairline)] bg-[var(--bg-recessed)] hover:border-[var(--ink-primary)]'
          }`}
        >
          <Cpu className="h-3.5 w-3.5 shrink-0 text-[var(--ink-secondary)]" />
          <span className="truncate">{matchedModelName}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-[var(--ink-muted)]" />
        </button>

        {openMenu === 'model' && (
          <div className="absolute bottom-full left-0 z-40 mb-1.5 max-h-72 w-64 overflow-y-auto rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] py-1">
            {providers.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[var(--ink-muted)]">暂无可用模型</div>
            ) : (
              providers.map((p) => (
                <div key={p.id} className="py-1 first:pt-0.5">
                  <div className="px-3 py-1 text-[10px] font-semibold tracking-wider text-[var(--ink-muted)]">
                    {p.name || p.id}
                  </div>
                  <ul>
                    {p.models.map((m) => {
                      const active = p.id === currentProvider && m.id === currentModel
                      return (
                        <li key={`${p.id}::${m.id}`}>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenu(null)
                              void setSessionModel(p.id, m.id, currentEffort || null)
                            }}
                            className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition ${
                              active
                                ? 'bg-[var(--bg-recessed)] font-medium text-[var(--ink-primary)]'
                                : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-canvas)] hover:text-[var(--ink-primary)]'
                            }`}
                          >
                            <span className="truncate">{m.name || m.id}</span>
                            {active && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--brand-primary)]" />}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 推理强度自定义下拉菜单 */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenMenu((m) => (m === 'effort' ? null : 'effort'))}
          title="切换推理强度"
          className={`inline-flex h-7 items-center gap-1.5 rounded border px-2 text-xs text-[var(--ink-primary)] transition ${
            openMenu === 'effort'
              ? 'border-[var(--ink-primary)] bg-[var(--bg-surface)]'
              : 'border-[var(--border-hairline)] bg-[var(--bg-recessed)] hover:border-[var(--ink-primary)]'
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-[var(--ink-secondary)]" />
          <span>{currentEffortLabel}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-[var(--ink-muted)]" />
        </button>

        {openMenu === 'effort' && (
          <div className="absolute bottom-full left-0 z-40 mb-1.5 w-32 overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] py-1">
            {EFFORTS.map((item) => {
              const active = item.value === currentEffort
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setOpenMenu(null)
                    if (currentProvider && currentModel) {
                      void setSessionModel(currentProvider, currentModel, item.value || null)
                    }
                  }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition ${
                    active
                      ? 'bg-[var(--bg-recessed)] font-medium text-[var(--ink-primary)]'
                      : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-canvas)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  <span>{item.label}</span>
                  {active && <Check className="h-3.5 w-3.5 text-[var(--brand-primary)]" />}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
