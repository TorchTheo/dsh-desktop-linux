import { useEffect } from 'react'
import { AlertTriangle, PanelRight, X } from 'lucide-react'
import { ChatStream } from './components/ChatStream'
import { Composer } from './components/Composer'
import { InspectorPanel } from './components/InspectorPanel'
import { SettingsModal } from './components/SettingsModal'
import { Sidebar } from './components/Sidebar'
import { useAppStore } from './store/useAppStore'

export function App() {
  const bootstrap = useAppStore((s) => s.bootstrap)
  const errorBanner = useAppStore((s) => s.errorBanner)
  const clearError = useAppStore((s) => s.clearError)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const inspectorOpen = useAppStore((s) => s.inspectorOpen)
  const setInspectorOpen = useAppStore((s) => s.setInspectorOpen)

  const activeSession = sessions.find((s) => s.sessionId === activeSessionId)

  useEffect(() => {
    let cleanup: (() => void) | undefined
    void bootstrap().then((fn) => {
      cleanup = fn
    })
    return () => {
      cleanup?.()
    }
  }, [bootstrap])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0d1117] text-[#e6edf3]">
      <Sidebar />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[#21262d] px-6">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium text-[#e6edf3]">
              {activeSession ? activeSession.title : '新对话'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {activeSession && (
              <span className="hidden truncate text-[11px] text-[#6e7681] sm:inline">
                {activeSession.sessionId.slice(0, 8)}
              </span>
            )}
            <button
              type="button"
              onClick={() => setInspectorOpen(!inspectorOpen)}
              title={inspectorOpen ? '隐藏 Inspector 面板' : '显示 Inspector 面板'}
              className={`rounded-md p-1.5 transition ${
                inspectorOpen
                  ? 'bg-[#1c2430] text-blue-400'
                  : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#e6edf3]'
              }`}
            >
              <PanelRight className="h-4 w-4" />
            </button>
          </div>
        </header>

        {errorBanner && (
          <div className="flex items-center justify-between border-b border-rose-500/30 bg-rose-950/40 px-5 py-2 text-xs text-rose-200">
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
              {errorBanner}
            </span>
            <button
              type="button"
              onClick={clearError}
              className="rounded p-0.5 text-rose-300 hover:bg-rose-900/50"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <ChatStream />
        <Composer />
      </main>

      <InspectorPanel />
      <SettingsModal />
    </div>
  )
}

export default App
