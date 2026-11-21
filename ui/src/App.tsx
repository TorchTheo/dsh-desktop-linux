import { useEffect } from 'react'
import { AlertTriangle, PanelRight, X } from 'lucide-react'
import { ChatStream } from './components/ChatStream'
import { IconDock } from './components/IconDock'
import { InspectorPanel } from './components/InspectorPanel'
import { SettingsModal } from './components/SettingsModal'
import { Sidebar } from './components/Sidebar'
import { PluginsView } from './components/PluginsView'
import { TrajectoryView } from './components/TrajectoryView'
import { useAppStore } from './store/useAppStore'

export function App() {
  const bootstrap = useAppStore((s) => s.bootstrap)
  const errorBanner = useAppStore((s) => s.errorBanner)
  const clearError = useAppStore((s) => s.clearError)
  const noticeBanner = useAppStore((s) => s.noticeBanner)
  const clearNotice = useAppStore((s) => s.clearNotice)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const activeView = useAppStore((s) => s.activeView)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const inspectorOpen = useAppStore((s) => s.inspectorOpen)
  const setInspectorOpen = useAppStore((s) => s.setInspectorOpen)

  const activeSession = sessions.find((s) => s.sessionId === activeSessionId)

  useEffect(() => {
    const STORAGE_KEY = 'dsh-desktop.zoom'
    const clamp = (z: number) => Math.min(1.5, Math.max(0.75, Math.round(z * 10) / 10))
    let zoom = clamp(Number(localStorage.getItem(STORAGE_KEY) || '1') || 1)
    const applyZoom = (next: number) => {
      zoom = clamp(next)
      document.documentElement.style.fontSize = `${zoom * 16}px`
      localStorage.setItem(STORAGE_KEY, String(zoom))
    }
    applyZoom(zoom)
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        applyZoom(zoom + 0.1)
      } else if (e.key === '-') {
        e.preventDefault()
        applyZoom(zoom - 0.1)
      } else if (e.key === '0') {
        e.preventDefault()
        applyZoom(1)
      } else if (e.key.toLowerCase() === 'b') {
        e.preventDefault()
        const st = useAppStore.getState()
        st.setSidebarOpen(!st.sidebarOpen)
      } else if (e.key === '1') {
        e.preventDefault()
        useAppStore.getState().setActiveView('studio')
      } else if (e.key === '2') {
        e.preventDefault()
        useAppStore.getState().setActiveView('trajectory')
      } else if (e.key === '3') {
        e.preventDefault()
        useAppStore.getState().setActiveView('plugins')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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
    <div className="flex h-screen w-screen overflow-hidden bg-[#F4F3EE] text-[#141413]">
      <IconDock />
      <Sidebar />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[#D8D5CB] bg-[#F4F3EE] px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <h2 className="truncate text-sm font-semibold tracking-tight text-[#141413]">
              {activeSession ? (activeSession.title === 'New session' ? '新建会话' : activeSession.title) : '新建会话'}
            </h2>
            {activeSession && (
              <span className="font-mono-tabular hidden text-[10px] text-[#8A8880] sm:inline">
                {activeSession.sessionId.slice(0, 8)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {/* Bauhaus Segmented View Switcher */}
            <div className="inline-flex rounded border border-[#D8D5CB] bg-[#ECEAE2] p-0.5">
              <button
                type="button"
                onClick={() => setActiveView('studio')}
                className={`font-mono-tabular rounded px-2.5 py-0.5 text-[11px] font-medium transition ${
                  activeView === 'studio'
                    ? 'bg-[#FAF9F5] text-[#141413] ring-1 ring-[#D8D5CB]'
                    : 'text-[#575652] hover:text-[#141413]'
                }`}
              >
                对话
              </button>
              <button
                type="button"
                onClick={() => setActiveView('trajectory')}
                className={`font-mono-tabular rounded px-2.5 py-0.5 text-[11px] font-medium transition ${
                  activeView === 'trajectory'
                    ? 'bg-[#FAF9F5] text-[#141413] ring-1 ring-[#D8D5CB]'
                    : 'text-[#575652] hover:text-[#141413]'
                }`}
              >
                轨迹
              </button>
            </div>

            <button
              type="button"
              onClick={() => setInspectorOpen(!inspectorOpen)}
              title={inspectorOpen ? '隐藏详情面板' : '展开详情面板'}
              className={`rounded border p-1.5 transition ${
                inspectorOpen
                  ? 'border-[#141413] bg-[#141413] text-[#FAF9F5]'
                  : 'border-[#D8D5CB] bg-[#FAF9F5] text-[#575652] hover:border-[#141413] hover:text-[#141413]'
              }`}
            >
              <PanelRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {errorBanner && (
          <div className="flex items-center justify-between border-b border-[#D13B27]/40 bg-[#D13B27]/8 px-5 py-2 text-xs text-[#8f2214]">
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[#D13B27]" />
              {errorBanner}
            </span>
            <button
              type="button"
              onClick={clearError}
              className="rounded p-0.5 text-[#D13B27] hover:bg-[#D13B27]/15"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {noticeBanner && (
          <div className="flex items-center justify-between border-b border-[#246A4D]/35 bg-[#246A4D]/10 px-5 py-2 text-xs text-[#194c37]">
            <span>{noticeBanner}</span>
            <button
              type="button"
              onClick={clearNotice}
              className="rounded p-0.5 text-[#246A4D] hover:bg-[#246A4D]/15"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {activeView === 'studio' ? <ChatStream /> : activeView === 'trajectory' ? <TrajectoryView /> : <PluginsView />}
      </main>

      <InspectorPanel />
      <SettingsModal />
    </div>
  )
}

export default App
