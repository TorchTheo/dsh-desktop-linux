import { useEffect, useMemo } from 'react'
import { AlertTriangle, PanelRight, X } from 'lucide-react'
import { ChatStream } from './components/ChatStream'
import { IconDock } from './components/IconDock'
import { InspectorPanel } from './components/InspectorPanel'
import { SettingsModal } from './components/SettingsModal'
import { Sidebar } from './components/Sidebar'
import { PluginsView } from './components/PluginsView'
import { SubagentsView } from './components/SubagentsView'
import { DshPluginHostProvider, DshSlot, useDshSlots } from './plugins/dshPluginHost'
import { TrajectoryView } from './components/TrajectoryView'
import { useAppStore } from './store/useAppStore'
import {
  flattenSubagentTree,
  mergeSubagentTree,
  normalizeSubagentStatus,
} from './utils/subagentStatus'

export function App() {
  const bootstrap = useAppStore((s) => s.bootstrap)
  const errorBanner = useAppStore((s) => s.errorBanner)
  const clearError = useAppStore((s) => s.clearError)
  const noticeBanner = useAppStore((s) => s.noticeBanner)
  const clearNotice = useAppStore((s) => s.clearNotice)
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const activeView = useAppStore((s) => s.activeView)
  const sessionTabById = useAppStore((s) => s.sessionTabById)
  const setSessionTab = useAppStore((s) => s.setSessionTab)
  const subagentTreeBySession = useAppStore((s) => s.subagentTreeBySession)
  const subagentsBySession = useAppStore((s) => s.subagentsBySession)
  const activePluginPanelKey = useAppStore((s) => s.activePluginPanelKey)
  const panelSlots = useDshSlots('sidebar.panellist')
  const activePluginPanelLabel =
    panelSlots.find((p) => (p.id ?? p.key ?? p.uid) === activePluginPanelKey)?.label ??
    activePluginPanelKey
  const inspectorOpen = useAppStore((s) => s.inspectorOpen)
  const setInspectorOpen = useAppStore((s) => s.setInspectorOpen)

  const activeSession = sessions.find((s) => s.sessionId === activeSessionId)
  const sessionTabKey = activeSessionId ?? '__draft__'
  const activeSessionTab = sessionTabById[sessionTabKey] ?? 'chat'

  const activeSubagentStats = useMemo(() => {
    if (!activeSessionId) return { count: 0, running: 0 }
    const merged = mergeSubagentTree(
      subagentTreeBySession[activeSessionId] ?? [],
      subagentsBySession[activeSessionId] ?? [],
      activeSessionId,
    )
    const flat = flattenSubagentTree(merged)
    const running = flat.filter((n) => normalizeSubagentStatus(n.status) === 'running').length
    return { count: flat.length, running }
  }, [activeSessionId, subagentTreeBySession, subagentsBySession])

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
        useAppStore.getState().setSessionTab('chat')
      } else if (e.key === '2') {
        e.preventDefault()
        useAppStore.getState().setSessionTab('trajectory')
      } else if (e.key === '3') {
        e.preventDefault()
        useAppStore.getState().setSessionTab('subagents')
      } else if (e.key === '4') {
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
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-canvas)] text-[var(--ink-primary)]">
      <IconDock />
      <Sidebar />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <h2 className="truncate text-sm font-semibold tracking-tight text-[var(--ink-primary)]">
              {activeView === 'plugin-panel'
                ? (activePluginPanelLabel ?? '插件面板')
                : activeView === 'plugins'
                  ? '插件与技能管理'
                  : activeSession
                    ? (activeSession.title === 'New session' ? '新建会话' : activeSession.title)
                    : '新建会话'}
            </h2>
            {activeView === 'studio' && activeSession && (
              <span className="font-mono-tabular hidden text-[10px] text-[var(--ink-muted)] sm:inline">
                {activeSession.sessionId.slice(0, 8)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {/* Session-Scoped Segmented View Switcher: 对话 | 轨迹 | 子代理 */}
            {activeView === 'studio' && (
              <div className="inline-flex rounded-md border border-[var(--border-hairline)] bg-[var(--bg-recessed)] p-0.5">
                <button
                  type="button"
                  onClick={() => setSessionTab('chat')}
                  className={`font-mono-tabular rounded px-2.5 py-0.5 text-[11px] font-medium transition ${
                    activeSessionTab === 'chat'
                      ? 'bg-[var(--bg-surface)] text-[var(--ink-primary)] ring-1 ring-[var(--border-hairline)]'
                      : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  对话
                </button>
                <button
                  type="button"
                  onClick={() => setSessionTab('trajectory')}
                  className={`font-mono-tabular rounded px-2.5 py-0.5 text-[11px] font-medium transition ${
                    activeSessionTab === 'trajectory'
                      ? 'bg-[var(--bg-surface)] text-[var(--ink-primary)] ring-1 ring-[var(--border-hairline)]'
                      : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  轨迹
                </button>
                <button
                  type="button"
                  onClick={() => setSessionTab('subagents')}
                  className={`font-mono-tabular inline-flex items-center gap-1.5 rounded px-2.5 py-0.5 text-[11px] font-medium transition ${
                    activeSessionTab === 'subagents'
                      ? 'bg-[var(--bg-surface)] text-[var(--ink-primary)] ring-1 ring-[var(--border-hairline)]'
                      : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  {activeSubagentStats.running > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-primary)] animate-pulse" />
                  )}
                  <span>子代理</span>
                  {activeSubagentStats.count > 0 && (
                    <span className="rounded bg-[var(--bg-recessed)] px-1 py-0 text-[10px] text-[var(--ink-secondary)]">
                      {activeSubagentStats.count}
                    </span>
                  )}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setInspectorOpen(!inspectorOpen)}
              title={inspectorOpen ? '隐藏详情面板' : '展开详情面板'}
              className={`rounded border p-1.5 transition ${
                inspectorOpen
                  ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-surface)]'
                  : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)]'
              }`}
            >
              <PanelRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {errorBanner && (
          <div className="flex items-center justify-between border-b border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/8 px-5 py-2 text-xs text-[var(--status-danger-text)]">
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--brand-primary)]" />
              {errorBanner}
            </span>
            <button
              type="button"
              onClick={clearError}
              className="rounded p-0.5 text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/15"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {noticeBanner && (
          <div className="flex items-center justify-between border-b border-[var(--status-ok)]/35 bg-[var(--status-ok)]/10 px-5 py-2 text-xs text-[var(--status-ok-text)]">
            <span>{noticeBanner}</span>
            <button
              type="button"
              onClick={clearNotice}
              className="rounded p-0.5 text-[var(--status-ok)] hover:bg-[var(--status-ok)]/15"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {activeView === 'studio' ? (
          activeSessionTab === 'chat' ? (
            <ChatStream />
          ) : activeSessionTab === 'trajectory' ? (
            <TrajectoryView />
          ) : (
            <SubagentsView />
          )
        ) : activeView === 'plugin-panel' && activePluginPanelKey ? (
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--bg-canvas)]">
            <DshSlot
              name="main"
              slotKey={activePluginPanelKey}
              className="flex h-full min-h-0 w-full flex-1 flex-col overflow-auto"
            />
          </section>
        ) : (
          <PluginsView />
        )}
      </main>

      <InspectorPanel />
      <SettingsModal />
      <DshPluginHostProvider />
      <DshSlot name="shell.overlay" />
    </div>
  )
}

export default App
