import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import type { AppConfig, DmabufMode } from '../types/domain'

export function SettingsModal() {
  const open = useAppStore((s) => s.settingsOpen)
  const setOpen = useAppStore((s) => s.setSettingsOpen)
  const config = useAppStore((s) => s.config)
  const updateConfig = useAppStore((s) => s.updateConfig)
  const restartWorker = useAppStore((s) => s.restartWorker)

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl border border-[#30363d] bg-[#161b22] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#21262d] px-5 py-3.5">
          <h2 className="text-sm font-semibold text-[#e6edf3]">DSH Desktop 设置</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-1 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3.5 px-5 py-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[#8b949e]">Provider</span>
              <input
                type="text"
                value={draft.provider}
                onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
                className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2.5 py-1.5 text-[#e6edf3] focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[#8b949e]">Model</span>
              <input
                type="text"
                value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2.5 py-1.5 text-[#e6edf3] focus:border-blue-500 focus:outline-none"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[#8b949e]">Reasoning Effort（可选）</span>
              <input
                type="text"
                value={draft.reasoningEffort ?? ''}
                onChange={(e) => setDraft({ ...draft, reasoningEffort: e.target.value || null })}
                placeholder="如 low / medium / high"
                className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2.5 py-1.5 text-[#e6edf3] placeholder-[#6e7681] focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[#8b949e]">WebKitGTK DMA-BUF 禁用策略</span>
              <select
                value={draft.disableDmabuf}
                onChange={(e) => setDraft({ ...draft, disableDmabuf: e.target.value as DmabufMode })}
                className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2.5 py-1.5 text-[#e6edf3] focus:border-blue-500 focus:outline-none"
              >
                <option value="auto">auto（Wayland + NVIDIA 自动禁用）</option>
                <option value="always">always（总是禁用）</option>
                <option value="never">never（不禁用）</option>
              </select>
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-[#8b949e]">默认工作目录</span>
            <input
              type="text"
              value={draft.defaultCwd}
              onChange={(e) => setDraft({ ...draft, defaultCwd: e.target.value })}
              className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2.5 py-1.5 text-[#e6edf3] focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[#8b949e]">dsh 可执行文件路径（留空自动探测）</span>
            <input
              type="text"
              value={draft.dshBin}
              onChange={(e) => setDraft({ ...draft, dshBin: e.target.value })}
              placeholder="/home/ctrlsea/.local/bin/dsh"
              className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2.5 py-1.5 text-[#e6edf3] placeholder-[#6e7681] focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[#8b949e]">Cordis Patch 文件（每行一个 --patch 路径）</span>
            <textarea
              rows={3}
              value={patchesText}
              onChange={(e) => setPatchesText(e.target.value)}
              className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2.5 py-1.5 font-mono text-[11px] text-[#e6edf3] focus:border-blue-500 focus:outline-none"
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#21262d] px-5 py-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-[#30363d] px-3 py-1.5 text-xs text-[#8b949e] hover:text-[#e6edf3]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSave(false)}
            className="rounded-md border border-[#30363d] bg-[#21262d] px-3 py-1.5 text-xs font-medium text-[#e6edf3] hover:bg-[#30363d]"
          >
            仅保存
          </button>
          <button
            type="button"
            onClick={() => void handleSave(true)}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
          >
            保存并重启后端
          </button>
        </div>
      </div>
    </div>
  )
}
