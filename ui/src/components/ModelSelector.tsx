import { Sparkles } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

const EFFORTS = [
  { value: '', label: '默认推理' },
  { value: 'low', label: 'low' },
  { value: 'medium', label: 'medium' },
  { value: 'high', label: 'high' },
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
    <div className="flex items-center gap-1.5">
      <div className="inline-flex items-center gap-1 rounded-md border border-[#30363d] bg-[#161b22] px-2 py-0.5 text-[11px] text-[#c9d1d9]">
        <Sparkles className="h-3 w-3 shrink-0 text-purple-400" />
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
          className="max-w-[200px] bg-transparent text-[11px] text-[#e6edf3] focus:outline-none"
        >
          {!hasCurrentInList && currentProvider && currentModel && (
            <option value={currentValue} className="bg-[#161b22]">
              {currentProvider} / {currentModel}
            </option>
          )}
          {providers.map((p) => (
            <optgroup key={p.id} label={p.name || p.id} className="bg-[#161b22] text-[#8b949e]">
              {p.models.map((m) => (
                <option
                  key={`${p.id}::${m.id}`}
                  value={`${p.id}::${m.id}`}
                  className="bg-[#161b22] text-[#e6edf3]"
                >
                  {m.name || m.id}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <select
        aria-label="推理强度"
        value={currentEffort}
        onChange={(e) => {
          if (currentProvider && currentModel) {
            void setSessionModel(currentProvider, currentModel, e.target.value || null)
          }
        }}
        className="rounded-md border border-[#30363d] bg-[#161b22] px-1.5 py-0.5 text-[11px] text-[#8b949e] focus:border-blue-500 focus:text-[#e6edf3] focus:outline-none"
      >
        {EFFORTS.map((item) => (
          <option key={item.value} value={item.value} className="bg-[#161b22] text-[#e6edf3]">
            {item.label}
          </option>
        ))}
      </select>
    </div>
  )
}
