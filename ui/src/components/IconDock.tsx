import {
  Activity,
  History,
  MessageSquare,
  Moon,
  PanelLeft,
  Puzzle,
  RefreshCw,
  Settings,
  Sun,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useThemeStore } from '../store/useTheme'

export function IconDock() {
  const activeView = useAppStore((s) => s.activeView)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const workerStatus = useAppStore((s) => s.workerStatus)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)
  const refreshSessions = useAppStore((s) => s.refreshSessions)
  const restartWorker = useAppStore((s) => s.restartWorker)
  const startWorker = useAppStore((s) => s.startWorker)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)

  const statusColor =
    workerStatus.state === 'ready'
      ? 'bg-[var(--status-ok)]'
      : workerStatus.state === 'starting'
        ? 'bg-[var(--status-warn)] animate-pulse'
        : workerStatus.state === 'error'
          ? 'bg-[var(--brand-primary)]'
          : 'bg-[var(--ink-muted)]'

  const statusTitle =
    workerStatus.state === 'ready'
      ? `后端就绪（v${workerStatus.serverVersion}）`
      : workerStatus.state === 'starting'
        ? '正在启动后端...'
        : workerStatus.state === 'error'
          ? `后端异常：${workerStatus.message}`
          : '后端未连接'

  return (
    <nav
      aria-label="主导航"
      className="flex h-full w-12 shrink-0 flex-col items-center justify-between border-r border-[var(--border-hairline)] bg-[var(--bg-recessed)] py-3"
    >
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? '切换至 DeepSeek 浅色蓝白主题' : '切换至 DeepSeek 深色主题'}
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--ink-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--ink-primary)]"
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 stroke-[1.75] text-[var(--status-warn)]" />
          ) : (
            <Moon className="h-4 w-4 stroke-[1.75] text-[var(--brand-primary)]" />
          )}
        </button>
        <div
          className="mb-2 flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg"
          title="DSH 桌面端"
        >
          <img
            src="/app-icon.png"
            alt="DSH 桌面端"
            className="h-8 w-8 object-contain"
            draggable={false}
          />
        </div>

        <button
          type="button"
          onClick={() => setActiveView('studio')}
          title="对话视图（Ctrl+1）"
          className={`relative flex h-9 w-9 items-center justify-center rounded-md transition ${
            activeView === 'studio'
              ? 'bg-[var(--bg-surface)] text-[var(--ink-primary)] ring-1 ring-[var(--border-hairline)]'
              : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--ink-primary)]'
          }`}
        >
          {activeView === 'studio' && (
            <span className="absolute -left-1.5 h-3.5 w-1 bg-[var(--brand-primary)]" />
          )}
          <MessageSquare className="h-4 w-4 stroke-[1.75]" />
        </button>

        <button
          type="button"
          onClick={() => setActiveView('trajectory')}
          title="Agent 轨迹视图（Ctrl+2）"
          className={`relative flex h-9 w-9 items-center justify-center rounded-md transition ${
            activeView === 'trajectory'
              ? 'bg-[var(--bg-surface)] text-[var(--ink-primary)] ring-1 ring-[var(--border-hairline)]'
              : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--ink-primary)]'
          }`}
        >
          {activeView === 'trajectory' && (
            <span className="absolute -left-1.5 h-3.5 w-1 bg-[var(--brand-primary)]" />
          )}
          <Activity className="h-4 w-4 stroke-[1.75]" />
        </button>

        <button
          type="button"
          onClick={() => setActiveView('plugins')}
          title="插件与扩展（Ctrl+3）"
          className={`relative flex h-9 w-9 items-center justify-center rounded-md transition ${
            activeView === 'plugins'
              ? 'bg-[var(--bg-surface)] text-[var(--ink-primary)] ring-1 ring-[var(--border-hairline)]'
              : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--ink-primary)]'
          }`}
        >
          {activeView === 'plugins' && (
            <span className="absolute -left-1.5 h-3.5 w-1 bg-[var(--brand-primary)]" />
          )}
          <Puzzle className="h-4 w-4 stroke-[1.75]" />
        </button>

        <div className="my-1 h-px w-5 bg-[var(--border-hairline)]" />

        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title={sidebarOpen ? '收起工作区侧栏（Ctrl+B）' : '展开工作区侧栏（Ctrl+B）'}
          className={`flex h-9 w-9 items-center justify-center rounded-md transition ${
            sidebarOpen
              ? 'bg-[var(--bg-hover)] text-[var(--ink-primary)]'
              : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--ink-primary)]'
          }`}
        >
          <PanelLeft className="h-4 w-4 stroke-[1.75]" />
        </button>

        <button
          type="button"
          onClick={() => void refreshSessions()}
          title="刷新本地历史会话"
          className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--ink-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--ink-primary)]"
        >
          <History className="h-4 w-4 stroke-[1.75]" />
        </button>
      </div>

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() =>
            void (workerStatus.state === 'ready' ? restartWorker() : startWorker())
          }
          title={workerStatus.state === 'ready' ? '重启后端服务' : '启动后端服务'}
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--ink-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--ink-primary)]"
        >
          <RefreshCw className="h-3.5 w-3.5 stroke-[1.75]" />
        </button>

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="设置"
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--ink-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--ink-primary)]"
        >
          <Settings className="h-4 w-4 stroke-[1.75]" />
        </button>

        <div className="mt-1 flex h-6 w-6 items-center justify-center" title={statusTitle}>
          <span className={`h-2.5 w-2.5 rounded-full ${statusColor}`} />
        </div>
      </div>
    </nav>
  )
}
