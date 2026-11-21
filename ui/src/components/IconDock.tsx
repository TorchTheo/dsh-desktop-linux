import {
  Activity,
  History,
  MessageSquare,
  PanelLeft,
  Puzzle,
  RefreshCw,
  Settings,
} from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

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

  const statusColor =
    workerStatus.state === 'ready'
      ? 'bg-[#246A4D]'
      : workerStatus.state === 'starting'
        ? 'bg-[#C4881C] animate-pulse'
        : workerStatus.state === 'error'
          ? 'bg-[#D13B27]'
          : 'bg-[#8A8880]'

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
      className="flex h-full w-12 shrink-0 flex-col items-center justify-between border-r border-[#D8D5CB] bg-[#ECEAE2] py-3"
    >
      <div className="flex flex-col items-center gap-2">
        <div
          className="mb-2 flex h-7 w-7 items-center justify-center rounded border border-[#D8D5CB] bg-[#FAF9F5]"
          title="DSH 桌面端"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="5" cy="5.5" r="2.6" fill="#D13B27" />
            <rect x="9" y="3" width="4.5" height="4.5" fill="#1E4D9B" />
            <polygon points="8,9.2 13,13.5 3,13.5" fill="#141413" />
          </svg>
        </div>

        <button
          type="button"
          onClick={() => setActiveView('studio')}
          title="对话视图（Ctrl+1）"
          className={`relative flex h-9 w-9 items-center justify-center rounded-md transition ${
            activeView === 'studio'
              ? 'bg-[#FAF9F5] text-[#141413] ring-1 ring-[#D8D5CB]'
              : 'text-[#575652] hover:bg-[#E5E2D8] hover:text-[#141413]'
          }`}
        >
          {activeView === 'studio' && (
            <span className="absolute -left-1.5 h-3.5 w-1 bg-[#D13B27]" />
          )}
          <MessageSquare className="h-4 w-4 stroke-[1.75]" />
        </button>

        <button
          type="button"
          onClick={() => setActiveView('trajectory')}
          title="Agent 轨迹视图（Ctrl+2）"
          className={`relative flex h-9 w-9 items-center justify-center rounded-md transition ${
            activeView === 'trajectory'
              ? 'bg-[#FAF9F5] text-[#141413] ring-1 ring-[#D8D5CB]'
              : 'text-[#575652] hover:bg-[#E5E2D8] hover:text-[#141413]'
          }`}
        >
          {activeView === 'trajectory' && (
            <span className="absolute -left-1.5 h-3.5 w-1 bg-[#D13B27]" />
          )}
          <Activity className="h-4 w-4 stroke-[1.75]" />
        </button>

        <button
          type="button"
          onClick={() => setActiveView('plugins')}
          title="插件与扩展（Ctrl+3）"
          className={`relative flex h-9 w-9 items-center justify-center rounded-md transition ${
            activeView === 'plugins'
              ? 'bg-[#FAF9F5] text-[#141413] ring-1 ring-[#D8D5CB]'
              : 'text-[#575652] hover:bg-[#E5E2D8] hover:text-[#141413]'
          }`}
        >
          {activeView === 'plugins' && (
            <span className="absolute -left-1.5 h-3.5 w-1 bg-[#D13B27]" />
          )}
          <Puzzle className="h-4 w-4 stroke-[1.75]" />
        </button>

        <div className="my-1 h-px w-5 bg-[#D8D5CB]" />

        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title={sidebarOpen ? '收起工作区侧栏（Ctrl+B）' : '展开工作区侧栏（Ctrl+B）'}
          className={`flex h-9 w-9 items-center justify-center rounded-md transition ${
            sidebarOpen
              ? 'bg-[#E5E2D8] text-[#141413]'
              : 'text-[#575652] hover:bg-[#E5E2D8] hover:text-[#141413]'
          }`}
        >
          <PanelLeft className="h-4 w-4 stroke-[1.75]" />
        </button>

        <button
          type="button"
          onClick={() => void refreshSessions()}
          title="刷新本地历史会话"
          className="flex h-9 w-9 items-center justify-center rounded-md text-[#575652] transition hover:bg-[#E5E2D8] hover:text-[#141413]"
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
          className="flex h-8 w-8 items-center justify-center rounded-md text-[#575652] transition hover:bg-[#E5E2D8] hover:text-[#141413]"
        >
          <RefreshCw className="h-3.5 w-3.5 stroke-[1.75]" />
        </button>

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="设置"
          className="flex h-8 w-8 items-center justify-center rounded-md text-[#575652] transition hover:bg-[#E5E2D8] hover:text-[#141413]"
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
