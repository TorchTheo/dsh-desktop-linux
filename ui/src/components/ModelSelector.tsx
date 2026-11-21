import { Cpu, SlidersHorizontal } from 'lucide-react'
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
  const config = useAppStore((s) => s.config)
  const setSessionModel = useAppStore((s) => s.setSessionModel)

  if (!bridgeCapabilities.modelControl || workerStatus.state !== 'ready') {
    return null
  }

  const meta = activeSessionId ? sessionMetaById[activeSessionId] : undefined
  const currentProvider = meta?.provider ?? config?.provider ?? ''
  const currentModel = meta?.model ?? config?.model ?? ''
  const currentEffort = meta?.reasoningEffort ?? config?.reasoningEffort ?? ''
  const currentValue = `${currentProvider}::${currentModel}`

  const hasCurrentInList = providers.some(
    (p) => p.id === currentProvider && p.models.some((m) => m.id === currentModel),
  )

  return (
    <>
      <label className="inline-flex h-7 items-center gap-1.5 rounded border border-[#D8D5CB] bg-[#ECEAE2] px-2 text-xs text-[#141413] transition hover:border-[#141413]">
        <Cpu className="h-3.5 w-3.5 shrink-0 text-[#575652]" />
        <select
          aria-label="选择模型"
          value={currentValue}
          onChange={(e) => {
            const [provider, ...rest] = e.target.value.split('::')
            const model = rest.join('::')
            if (provider && model) {
              void setSessionModel(provider, model, currentEffort || null)
            }
          }}
          className="max-w-[180px] cursor-pointer bg-transparent text-xs text-[#141413] focus:outline-none"
        >
          {!hasCurrentInList && currentProvider && currentModel && (
            <option value={currentValue}>
              {currentProvider} / {currentModel}
            </option>
          )}
          {providers.map((p) => (
            <optgroup key={p.id} label={p.name || p.id}>
              {p.models.map((m) => (
                <option key={`${p.id}::${m.id}`} value={`${p.id}::${m.id}`}>
                  {m.name || m.id}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label className="inline-flex h-7 items-center gap-1.5 rounded border border-[#D8D5CB] bg-[#ECEAE2] px-2 text-xs text-[#141413] transition hover:border-[#141413]">
        <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-[#575652]" />
        <select
          aria-label="推理强度"
          value={currentEffort}
          onChange={(e) => {
            if (currentProvider && currentModel) {
              void setSessionModel(currentProvider, currentModel, e.target.value || null)
            }
          }}
          className="cursor-pointer bg-transparent text-xs text-[#141413] focus:outline-none"
        >
          {EFFORTS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}
