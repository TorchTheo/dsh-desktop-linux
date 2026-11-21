import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
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
    <div className="flex items-start justify-between gap-4 border-b border-[#ECEAE2] py-3 last:border-b-0">
      <div>
        <div className="text-xs font-medium text-[#141413]">{label}</div>
        <div className="mt-0.5 text-[11px] text-[#8A8880]">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition ${
          checked
            ? 'border-[#D13B27] bg-[#D13B27]'
            : 'border-[#C2BEB2] bg-[#ECEAE2]'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[#FAF9F5] transition ${
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
  const updateConfig = useAppStore((s) => s.updateConfig)
  const restartWorker = useAppStore((s) => s.restartWorker)

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
    { id: 'auto', label: 'Auto' },
    { id: 'always', label: 'Always' },
    { id: 'never', label: 'Never' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141413]/35 p-4 backdrop-blur-[2px]">
      <div className="flex h-[520px] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-[#C2BEB2] bg-[#FAF9F5]">
        <div className="flex items-center justify-between border-b border-[#D8D5CB] bg-[#F4F3EE] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 bg-[#D13B27]" />
            <h2 className="font-mono-tabular text-xs font-semibold uppercase tracking-[0.12em] text-[#141413]">
              DSH Studio · Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-1 text-[#575652] hover:bg-[#ECEAE2] hover:text-[#141413]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Left Category Nav */}
          <nav className="w-44 shrink-0 border-r border-[#D8D5CB] bg-[#F4F3EE]/70 p-2.5">
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
                          ? 'bg-[#FAF9F5] text-[#141413] ring-1 ring-[#D8D5CB]'
                          : 'text-[#575652] hover:bg-[#ECEAE2] hover:text-[#141413]'
                      }`}
                    >
                      {active && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] bg-[#D13B27]" />
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
                    <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-[#575652]">
                      Provider
                    </span>
                    <input
                      type="text"
                      value={draft.provider}
                      onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
                      className="font-mono-tabular w-full rounded border border-[#D8D5CB] bg-[#F4F3EE] px-2.5 py-1.5 text-xs text-[#141413] focus:border-[#141413] focus:bg-[#FAF9F5] focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-[#575652]">
                      Model
                    </span>
                    <input
                      type="text"
                      value={draft.model}
                      onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                      className="font-mono-tabular w-full rounded border border-[#D8D5CB] bg-[#F4F3EE] px-2.5 py-1.5 text-xs text-[#141413] focus:border-[#141413] focus:bg-[#FAF9F5] focus:outline-none"
                    />
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-[#575652]">
                    Reasoning Effort（可选）
                  </span>
                  <input
                    type="text"
                    value={draft.reasoningEffort ?? ''}
                    onChange={(e) => setDraft({ ...draft, reasoningEffort: e.target.value || null })}
                    placeholder="low / medium / high"
                    className="font-mono-tabular w-full rounded border border-[#D8D5CB] bg-[#F4F3EE] px-2.5 py-1.5 text-xs text-[#141413] placeholder-[#8A8880] focus:border-[#141413] focus:bg-[#FAF9F5] focus:outline-none"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-[#575652]">
                    默认工作目录
                  </span>
                  <input
                    type="text"
                    value={draft.defaultCwd}
                    onChange={(e) => setDraft({ ...draft, defaultCwd: e.target.value })}
                    className="font-mono-tabular w-full rounded border border-[#D8D5CB] bg-[#F4F3EE] px-2.5 py-1.5 text-xs text-[#141413] focus:border-[#141413] focus:bg-[#FAF9F5] focus:outline-none"
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
                  description="开启逐 Token 流式输出、实时停止生成、动态模型目录与会话内模型热切"
                />

                <label className="block space-y-1">
                  <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-[#575652]">
                    dsh 可执行文件路径（留空自动探测）
                  </span>
                  <input
                    type="text"
                    value={draft.dshBin}
                    onChange={(e) => setDraft({ ...draft, dshBin: e.target.value })}
                    placeholder="/home/ctrlsea/.local/bin/dsh"
                    className="font-mono-tabular w-full rounded border border-[#D8D5CB] bg-[#F4F3EE] px-2.5 py-1.5 text-xs text-[#141413] placeholder-[#8A8880] focus:border-[#141413] focus:bg-[#FAF9F5] focus:outline-none"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-[#575652]">
                    Cordis Patch 文件（每行一个 --patch 路径）
                  </span>
                  <textarea
                    rows={4}
                    value={patchesText}
                    onChange={(e) => setPatchesText(e.target.value)}
                    className="font-mono-tabular w-full rounded border border-[#D8D5CB] bg-[#F4F3EE] px-2.5 py-1.5 text-[11px] text-[#141413] focus:border-[#141413] focus:bg-[#FAF9F5] focus:outline-none"
                  />
                </label>
              </div>
            )}

            {tab === 'desktop' && (
              <div className="space-y-2">
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
                  <div className="text-xs font-medium text-[#141413]">
                    WebKitGTK DMA-BUF 禁用策略
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#8A8880]">
                    解决 Wayland + NVIDIA 环境下 WebKitGTK 渲染黑屏/闪烁（重启应用生效）
                  </div>
                  <div className="mt-2.5 inline-flex rounded border border-[#D8D5CB] bg-[#ECEAE2] p-0.5">
                    {dmabufModes.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setDraft({ ...draft, disableDmabuf: mode.id })}
                        className={`font-mono-tabular rounded px-3 py-1 text-[11px] font-medium transition ${
                          draft.disableDmabuf === mode.id
                            ? 'bg-[#141413] text-[#FAF9F5]'
                            : 'text-[#575652] hover:text-[#141413]'
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

        <div className="flex items-center justify-end gap-2 border-t border-[#D8D5CB] bg-[#F4F3EE] px-5 py-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded border border-[#D8D5CB] bg-[#FAF9F5] px-3.5 py-1.5 text-xs text-[#575652] hover:border-[#141413] hover:text-[#141413]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSave(false)}
            className="rounded border border-[#141413] bg-[#FAF9F5] px-3.5 py-1.5 text-xs font-medium text-[#141413] hover:bg-[#ECEAE2]"
          >
            仅保存
          </button>
          <button
            type="button"
            onClick={() => void handleSave(true)}
            className="rounded bg-[#D13B27] px-3.5 py-1.5 text-xs font-medium text-[#FAF9F5] hover:bg-[#b5301f]"
          >
            保存并重启后端
          </button>
        </div>
      </div>
    </div>
  )
}
