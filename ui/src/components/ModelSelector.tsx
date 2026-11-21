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
        className="font-mono-tabular max-w-[200px] rounded border border-[#D8D5CB] bg-[#ECEAE2] px-2 py-0.5 text-[11px] text-[#141413] focus:border-[#1E4D9B] focus:outline-none"
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

      <select
        aria-label="推理强度"
        value={currentEffort}
        onChange={(e) => {
          if (currentProvider && currentModel) {
            void setSessionModel(currentProvider, currentModel, e.target.value || null)
          }
        }}
        className="font-mono-tabular rounded border border-[#D8D5CB] bg-[#ECEAE2] px-1.5 py-0.5 text-[11px] text-[#575652] focus:border-[#1E4D9B] focus:text-[#141413] focus:outline-none"
      >
        {EFFORTS.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  )
}
