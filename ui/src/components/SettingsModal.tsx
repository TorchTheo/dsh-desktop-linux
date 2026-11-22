import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useThemeStore, type ThemeMode } from '../store/useTheme'
import type { AppConfig, DmabufMode } from '../types/domain'

type SettingsTab = 'model' | 'runtime' | 'desktop'

function ToggleSwitch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  description: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--bg-recessed)] py-3 last:border-b-0">
      <div>
        <div className="text-xs font-medium text-[var(--ink-primary)]">{label}</div>
        <div className="mt-0.5 text-[11px] text-[var(--ink-muted)]">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition ${
          checked
            ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]'
            : 'border-[var(--border-strong)] bg-[var(--bg-recessed)]'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--bg-surface)] transition ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

export function SettingsModal() {
  const open = useAppStore((s) => s.settingsOpen)
  const setOpen = useAppStore((s) => s.setSettingsOpen)
  const config = useAppStore((s) => s.config)
  const hostInfo = useAppStore((s) => s.hostInfo)
  const updateConfig = useAppStore((s) => s.updateConfig)
  const restartWorker = useAppStore((s) => s.restartWorker)
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  const [tab, setTab] = useState<SettingsTab>('model')
  const [draft, setDraft] = useState<AppConfig | null>(config)
  const [patchesText, setPatchesText] = useState('')

  useEffect(() => {
    if (open && config) {
      setDraft(config)
      setPatchesText(config.patches.join('\n'))
    }
  }, [open, config])

  if (!open || !draft) return null

  const buildConfig = (): AppConfig => ({
    ...draft,
    profile: draft.profile?.trim() ? draft.profile.trim() : 'web',
    reasoningEffort: draft.reasoningEffort?.trim() ? draft.reasoningEffort.trim() : null,
    patches: patchesText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  })

  const handleSave = async (restart: boolean) => {
    await updateConfig(buildConfig())
    if (restart) {
      await restartWorker()
    }
  }

  const navItems: { id: SettingsTab; label: string }[] = [
    { id: 'model', label: '模型与路由' },
    { id: 'runtime', label: '桥接与运行时' },
    { id: 'desktop', label: 'Linux 桌面' },
  ]

  const dmabufModes: { id: DmabufMode; label: string }[] = [
    { id: 'auto', label: '自动' },
    { id: 'always', label: '总是禁用' },
    { id: 'never', label: '不禁用' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink-primary)]/35 p-4 backdrop-blur-[2px]">
      <div className="flex h-[520px] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)]">
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 bg-[var(--brand-primary)]" />
            <h2 className="font-mono-tabular text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-primary)]">
              系统设置
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-1 text-[var(--ink-secondary)] hover:bg-[var(--bg-recessed)] hover:text-[var(--ink-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Left Category Nav */}
          <nav className="w-44 shrink-0 border-r border-[var(--border-hairline)] bg-[var(--bg-canvas)]/70 p-2.5">
            <ul className="space-y-1">
              {navItems.map((item) => {
                const active = tab === item.id
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setTab(item.id)}
                      className={`relative flex w-full items-center rounded px-3 py-2 text-left text-xs font-medium transition ${
                        active
                          ? 'bg-[var(--bg-surface)] text-[var(--ink-primary)] ring-1 ring-[var(--border-hairline)]'
                          : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-recessed)] hover:text-[var(--ink-primary)]'
                      }`}
                    >
                      {active && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] bg-[var(--brand-primary)]" />
                      )}
                      {item.label}
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* Right Form Pane */}
          <div className="flex-1 overflow-y-auto p-5 text-xs">
            {tab === 'model' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-secondary)]">
                      模型服务商
                    </span>
                    <input
                      type="text"
                      value={draft.provider}
                      onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
                      className="font-mono-tabular w-full rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:bg-[var(--bg-surface)] focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-secondary)]">
                      默认模型
                    </span>
                    <input
                      type="text"
                      value={draft.model}
                      onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                      className="font-mono-tabular w-full rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:bg-[var(--bg-surface)] focus:outline-none"
                    />
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-secondary)]">
                    默认推理强度（可选）
                  </span>
                  <input
                    type="text"
                    value={draft.reasoningEffort ?? ''}
                    onChange={(e) => setDraft({ ...draft, reasoningEffort: e.target.value || null })}
                    placeholder="低（low）/ 中（medium）/ 高（high）"
                    className="font-mono-tabular w-full rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:border-[var(--ink-primary)] focus:bg-[var(--bg-surface)] focus:outline-none"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-secondary)]">
                    默认工作目录
                  </span>
                  <input
                    type="text"
                    value={draft.defaultCwd}
                    onChange={(e) => setDraft({ ...draft, defaultCwd: e.target.value })}
                    className="font-mono-tabular w-full rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:bg-[var(--bg-surface)] focus:outline-none"
                  />
                </label>
              </div>
            )}

            {tab === 'runtime' && (
              <div className="space-y-4">
                <ToggleSwitch
                  checked={draft.enableBridge}
                  onChange={(enableBridge) => setDraft({ ...draft, enableBridge })}
                  label="启用 Cordis 扩展桥接插件"
                  description="开启逐 Token 流式输出、实时停止生成、动态模型目录、会话内模型热切与插件管理"
                />

                <div className="space-y-2 border-b border-[var(--bg-recessed)] pb-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-secondary)]">
                      DSH 运行配置集（Profile）
                    </span>
                    {hostInfo?.hasWebServer && (
                      <span className="font-mono-tabular rounded border border-[var(--status-ok)]/30 bg-[var(--status-ok)]/10 px-1.5 py-0.5 text-[10px] text-[var(--status-ok-text)]">
                        Web Host 已就绪
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded border border-[var(--border-hairline)] bg-[var(--bg-recessed)] p-0.5">
                      {[
                        { id: 'web', label: 'web（完整插件生态）' },
                        { id: 'sdk', label: 'sdk（轻量纯协议）' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setDraft({ ...draft, profile: item.id })}
                          className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${
                            draft.profile === item.id
                              ? 'bg-[var(--bg-surface)] text-[var(--ink-primary)] ring-1 ring-[var(--border-hairline)]'
                              : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={draft.profile}
                      onChange={(e) => setDraft({ ...draft, profile: e.target.value })}
                      placeholder="自定义配置集名称"
                      className="font-mono-tabular min-w-[120px] flex-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1 text-xs text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:border-[var(--ink-primary)] focus:bg-[var(--bg-surface)] focus:outline-none"
                    />
                  </div>
                  <p className="text-[11px] text-[var(--ink-muted)]">
                    推荐使用 web 配置集，以同时加载 ~/.dsh/profiles/web 中已安装的后端与前端插件。
                  </p>
                </div>

                <label className="block space-y-1">
                  <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-secondary)]">
                    dsh 可执行文件路径（留空自动探测）
                  </span>
                  <input
                    type="text"
                    value={draft.dshBin}
                    onChange={(e) => setDraft({ ...draft, dshBin: e.target.value })}
                    placeholder="/home/ctrlsea/.local/bin/dsh"
                    className="font-mono-tabular w-full rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:border-[var(--ink-primary)] focus:bg-[var(--bg-surface)] focus:outline-none"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-secondary)]">
                    Cordis Patch 文件（每行一个 --patch 路径）
                  </span>
                  <textarea
                    rows={4}
                    value={patchesText}
                    onChange={(e) => setPatchesText(e.target.value)}
                    className="font-mono-tabular w-full rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[11px] text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:bg-[var(--bg-surface)] focus:outline-none"
                  />
                </label>
              </div>
            )}

            {tab === 'desktop' && (
              <div className="space-y-2">
                <div className="border-b border-[var(--bg-recessed)] pb-3.5">
                  <div className="text-xs font-medium text-[var(--ink-primary)]">
                    外观主题（DeepSeek 蓝白 / 深色）
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
                    随时切换浅色蓝白或深色主题（也可点击左下角太阳/月亮图标快速切换）
                  </div>
                  <div className="mt-2.5 inline-flex rounded border border-[var(--border-hairline)] bg-[var(--bg-recessed)] p-0.5">
                    {(
                      [
                        { id: 'light', label: 'DeepSeek 蓝白（浅色）' },
                        { id: 'dark', label: 'DeepSeek 深海（暗色）' },
                      ] as { id: ThemeMode; label: string }[]
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setTheme(m.id)}
                        className={`rounded px-3 py-1 text-xs font-medium transition ${
                          theme === m.id
                            ? 'bg-[var(--bg-surface)] text-[var(--ink-primary)] ring-1 ring-[var(--border-hairline)]'
                            : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <ToggleSwitch
                  checked={draft.closeToTray}
                  onChange={(closeToTray) => setDraft({ ...draft, closeToTray })}
                  label="关闭窗口时最小化到系统托盘"
                  description="关闭按钮隐藏窗口而不退出，确保后台 Agent 与定时任务持续运行"
                />

                <ToggleSwitch
                  checked={draft.desktopNotifications}
                  onChange={(desktopNotifications) => setDraft({ ...draft, desktopNotifications })}
                  label="后台桌面通知"
                  description="窗口失焦或隐藏时，针对工具审批、用户问答或任务完成发送系统通知"
                />

                <div className="pt-3">
                  <div className="text-xs font-medium text-[var(--ink-primary)]">
                    WebKitGTK DMA-BUF 禁用策略
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
                    解决 Wayland + NVIDIA 环境下 WebKitGTK 渲染黑屏/闪烁（重启应用生效）
                  </div>
                  <div className="mt-2.5 inline-flex rounded border border-[var(--border-hairline)] bg-[var(--bg-recessed)] p-0.5">
                    {dmabufModes.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setDraft({ ...draft, disableDmabuf: mode.id })}
                        className={`font-mono-tabular rounded px-3 py-1 text-[11px] font-medium transition ${
                          draft.disableDmabuf === mode.id
                            ? 'bg-[var(--ink-primary)] text-[var(--bg-surface)]'
                            : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-5 py-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-1.5 text-xs text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSave(false)}
            className="rounded border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-3.5 py-1.5 text-xs font-medium text-[var(--ink-primary)] hover:bg-[var(--bg-recessed)]"
          >
            仅保存
          </button>
          <button
            type="button"
            onClick={() => void handleSave(true)}
            className="rounded bg-[var(--brand-primary)] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[var(--brand-hover)]"
          >
            保存并重启后端
          </button>
        </div>
      </div>
    </div>
  )
}
