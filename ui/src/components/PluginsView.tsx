import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Package,
  Plus,
  Puzzle,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { DshSlot, useDshSlots } from '../plugins/dshPluginHost'
import { SkillsManager } from './SkillsManager'
import { useAppStore } from '../store/useAppStore'
import type { PluginBundleInfo } from '../types/domain'

function availabilityBadge(bundle: PluginBundleInfo): { label: string; className: string } {
  if (bundle.error) {
    return {
      label: '加载异常',
      className: 'border-[#D13B27]/40 bg-[#D13B27]/10 text-[#9c2515]',
    }
  }
  if (!bundle.installed) {
    return {
      label: '未安装',
      className: 'border-[#C4881C]/40 bg-[#C4881C]/10 text-[#8a5d0c]',
    }
  }
  if (bundle.enabled) {
    return {
      label: '已启用',
      className: 'border-[#246A4D]/35 bg-[#246A4D]/10 text-[#1d543d]',
    }
  }
  return {
    label: '已停用',
    className: 'border-[#D8D5CB] bg-[#ECEAE2] text-[#575652]',
  }
}

export function PluginsView() {
  const config = useAppStore((s) => s.config)
  const hostInfo = useAppStore((s) => s.hostInfo)
  const bridgeCapabilities = useAppStore((s) => s.bridgeCapabilities)
  const plugins = useAppStore((s) => s.plugins)
  const pluginsLoading = useAppStore((s) => s.pluginsLoading)
  const pluginBusyKey = useAppStore((s) => s.pluginBusyKey)
  const pluginRestartRequired = useAppStore((s) => s.pluginRestartRequired)
  const fetchPlugins = useAppStore((s) => s.fetchPlugins)
  const setPluginBundleEnabled = useAppStore((s) => s.setPluginBundleEnabled)
  const setPluginEntryEnabled = useAppStore((s) => s.setPluginEntryEnabled)
  const installPluginBundle = useAppStore((s) => s.installPluginBundle)
  const removePluginBundle = useAppStore((s) => s.removePluginBundle)
  const restartWorker = useAppStore((s) => s.restartWorker)
  const updateConfig = useAppStore((s) => s.updateConfig)

  const configSlots = useDshSlots('plugins.bundle.config')
  const configSlotKeys = useMemo(
    () => new Set(configSlots.map((s) => s.key ?? s.id).filter(Boolean)),
    [configSlots],
  )

  const [activeTab, setActiveTab] = useState<'plugins' | 'skills'>('plugins')
  const [installSpec, setInstallSpec] = useState('')
  const [expandedBundles, setExpandedBundles] = useState<Record<string, boolean>>({})
  const [expandedConfigs, setExpandedConfigs] = useState<Record<string, boolean>>({})
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  useEffect(() => {
    if (bridgeCapabilities.pluginManager && plugins.length === 0 && !pluginsLoading) {
      void fetchPlugins()
    }
  }, [bridgeCapabilities.pluginManager, plugins.length, pluginsLoading, fetchPlugins])

  const stats = useMemo(() => {
    const total = plugins.length
    const enabled = plugins.filter((p) => p.enabled).length
    const thirdParty = plugins.filter((p) => !p.name.startsWith('@deepseek-ai/')).length
    return { total, enabled, thirdParty }
  }, [plugins])

  const handleInstall = async (e: React.FormEvent) => {
    e.preventDefault()
    const spec = installSpec.trim()
    if (!spec) return
    const ok = await installPluginBundle(spec)
    if (ok) {
      setInstallSpec('')
    }
  }

  const handleSwitchToWebProfile = async () => {
    if (!config) return
    await updateConfig({ ...config, profile: 'web' })
    await restartWorker()
  }

  const toggleExpand = (name: string) => {
    setExpandedBundles((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  const toggleConfig = (name: string) => {
    setExpandedConfigs((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[#F4F3EE]">
      {/* Bauhaus Sub-header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#D8D5CB] bg-[#FAF9F5] px-5 py-2.5">
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded border border-[#D8D5CB] bg-[#ECEAE2] p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('plugins')}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition ${
                activeTab === 'plugins'
                  ? 'bg-[#FAF9F5] text-[#141413] ring-1 ring-[#D8D5CB]'
                  : 'text-[#575652] hover:text-[#141413]'
              }`}
            >
              <Package className="h-3.5 w-3.5" />
              插件管理
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('skills')}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition ${
                activeTab === 'skills'
                  ? 'bg-[#FAF9F5] text-[#141413] ring-1 ring-[#D8D5CB]'
                  : 'text-[#575652] hover:text-[#141413]'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              技能管理
            </button>
          </div>

          <div className="font-mono-tabular hidden items-center gap-2 text-[11px] text-[#575652] md:flex">
            <span className="rounded border border-[#D8D5CB] bg-[#F4F3EE] px-2 py-0.5">
              配置集：{hostInfo?.profile ?? config?.profile ?? 'web'}
            </span>
            <span className="rounded border border-[#D8D5CB] bg-[#F4F3EE] px-2 py-0.5">
              已启用 {stats.enabled}/{stats.total}
            </span>
            {stats.thirdParty > 0 && (
              <span className="rounded border border-[#1E4D9B]/30 bg-[#1E4D9B]/8 px-2 py-0.5 text-[#1E4D9B]">
                扩展插件 {stats.thirdParty}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pluginsLoading || !bridgeCapabilities.pluginManager}
            onClick={() => void fetchPlugins()}
            className="inline-flex items-center gap-1.5 rounded border border-[#D8D5CB] bg-[#FAF9F5] px-2.5 py-1 text-xs font-medium text-[#141413] transition hover:border-[#141413] disabled:opacity-45"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${pluginsLoading ? 'animate-spin' : ''}`} />
            刷新列表
          </button>
        </div>
      </div>

      {pluginRestartRequired && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#C4881C]/40 bg-[#C4881C]/10 px-5 py-2 text-xs text-[#734d08]">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#C4881C]" />
            插件变更已写入 DSH 配置，重启后端后将完整生效。
          </span>
          <button
            type="button"
            onClick={() => void restartWorker()}
            className="rounded bg-[#141413] px-2.5 py-1 text-[11px] font-medium text-[#FAF9F5] hover:bg-[#2c2c2a]"
          >
            立即重启后端
          </button>
        </div>
      )}

      {activeTab === 'skills' ? (
        <SkillsManager />
      ) : (
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto max-w-4xl space-y-5">
          {/* Profile guidance if pluginManager is unavailable */}
          {!bridgeCapabilities.pluginManager && (
            <div className="rounded-lg border border-[#C4881C]/40 bg-[#FAF9F5] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[#141413]">
                    当前运行配置集未加载 DSH 插件管理服务
                  </div>
                  <p className="mt-1 text-xs text-[#575652]">
                    将运行配置集切换为 <code className="font-mono-tabular">web</code>{' '}
                    即可同时加载完整 DSH 后端与前端插件生态（插件界面将直接融入左侧栏与对话区）。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSwitchToWebProfile()}
                  className="rounded bg-[#D13B27] px-3 py-1.5 text-xs font-medium text-[#FAF9F5] hover:bg-[#b5301f]"
                >
                  切换至 web 配置集并重启
                </button>
              </div>
            </div>
          )}

          {/* Install plugin bar */}
          <form
            onSubmit={(e) => void handleInstall(e)}
            className="rounded-lg border border-[#D8D5CB] bg-[#FAF9F5] p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 bg-[#D13B27]" />
                <h3 className="text-xs font-semibold tracking-wide text-[#141413]">
                  安装新插件
                </h3>
              </div>
              <span className="font-mono-tabular text-[11px] text-[#8A8880]">
                支持 npm 包名、.tgz 压缩包链接或本地路径
              </span>
            </div>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={installSpec}
                onChange={(e) => setInstallSpec(e.target.value)}
                placeholder="例如：@scope/dsh-plugin、https://.../plugin.tgz 或 file:/path/to/plugin.tgz"
                disabled={!bridgeCapabilities.pluginManager || pluginBusyKey === 'install'}
                className="font-mono-tabular min-w-0 flex-1 rounded border border-[#D8D5CB] bg-[#F4F3EE] px-3 py-1.5 text-xs text-[#141413] placeholder-[#8A8880] focus:border-[#141413] focus:bg-[#FAF9F5] focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={
                  !bridgeCapabilities.pluginManager ||
                  !installSpec.trim() ||
                  pluginBusyKey === 'install'
                }
                className="inline-flex shrink-0 items-center gap-1.5 rounded bg-[#141413] px-3.5 py-1.5 text-xs font-medium text-[#FAF9F5] transition hover:bg-[#2a2a28] disabled:opacity-45"
              >
                <Plus className="h-3.5 w-3.5" />
                {pluginBusyKey === 'install' ? '安装中...' : '安装插件'}
              </button>
            </div>
          </form>

          {/* Plugin list */}
          <div className="space-y-2.5">
            {pluginsLoading && plugins.length === 0 ? (
              <div className="rounded-lg border border-[#D8D5CB] bg-[#FAF9F5] px-5 py-10 text-center text-xs text-[#8A8880]">
                正在读取 DSH 插件列表...
              </div>
            ) : plugins.length === 0 ? (
              <div className="rounded-lg border border-[#D8D5CB] bg-[#FAF9F5] px-5 py-10 text-center">
                <Puzzle className="mx-auto h-6 w-6 text-[#8A8880]" />
                <div className="mt-2 text-xs font-medium text-[#141413]">暂无可管理的插件</div>
                <div className="mt-1 text-[11px] text-[#8A8880]">
                  确认后端已就绪并运行在 web 配置集下
                </div>
              </div>
            ) : (
              plugins.map((bundle) => {
                const badge = availabilityBadge(bundle)
                const isBusy =
                  pluginBusyKey === `bundle:${bundle.name}` ||
                  pluginBusyKey === `remove:${bundle.name}`
                const expanded = Boolean(expandedBundles[bundle.name])
                const configOpen = Boolean(expandedConfigs[bundle.name])
                const hasConfigSlot = configSlotKeys.has(bundle.name)
                const isCore = bundle.name.startsWith('@deepseek-ai/')

                return (
                  <div
                    key={bundle.name}
                    className="rounded-lg border border-[#D8D5CB] bg-[#FAF9F5] transition hover:border-[#C2BEB2]"
                  >
                    <div className="flex items-start justify-between gap-4 px-4 py-3.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono-tabular text-xs font-semibold text-[#141413]">
                            {bundle.name}
                          </span>
                          {bundle.version && (
                            <span className="font-mono-tabular rounded border border-[#ECEAE2] bg-[#F4F3EE] px-1.5 py-0.5 text-[10px] text-[#575652]">
                              v{bundle.version}
                            </span>
                          )}
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                          {!isCore && (
                            <span className="rounded border border-[#1E4D9B]/30 bg-[#1E4D9B]/8 px-1.5 py-0.5 text-[10px] font-medium text-[#1E4D9B]">
                              第三方扩展
                            </span>
                          )}
                        </div>

                        {bundle.description && (
                          <p className="mt-1.5 text-xs leading-relaxed text-[#575652]">
                            {bundle.description}
                          </p>
                        )}

                        {bundle.source && (
                          <div className="font-mono-tabular mt-1 truncate text-[10px] text-[#8A8880]">
                            来源：{bundle.source}
                          </div>
                        )}

                        {bundle.error && (
                          <div className="mt-2 rounded border border-[#D13B27]/30 bg-[#D13B27]/8 px-2.5 py-1.5 text-[11px] text-[#8f2214]">
                            {bundle.error}
                          </div>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          {bundle.entries.length > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleExpand(bundle.name)}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#575652] hover:text-[#141413]"
                            >
                              {expanded ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                              包含 {bundle.entries.length} 个子模块入口
                            </button>
                          )}

                          {hasConfigSlot && (
                            <button
                              type="button"
                              onClick={() => toggleConfig(bundle.name)}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1E4D9B] hover:underline"
                            >
                              <SlidersHorizontal className="h-3 w-3" />
                              {configOpen ? '收起插件配置' : '展开插件配置'}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2.5">
                        {bundle.removable && (
                          <>
                            {confirmRemove === bundle.name ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => {
                                    setConfirmRemove(null)
                                    void removePluginBundle(bundle.name)
                                  }}
                                  className="rounded bg-[#D13B27] px-2 py-1 text-[11px] font-medium text-[#FAF9F5] hover:bg-[#b5301f]"
                                >
                                  确认卸载
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmRemove(null)}
                                  className="rounded border border-[#D8D5CB] bg-[#F4F3EE] px-2 py-1 text-[11px] text-[#575652] hover:text-[#141413]"
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => setConfirmRemove(bundle.name)}
                                title="卸载插件"
                                className="rounded p-1.5 text-[#8A8880] transition hover:bg-[#D13B27]/10 hover:text-[#D13B27] disabled:opacity-40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </>
                        )}

                        <button
                          type="button"
                          role="switch"
                          aria-checked={bundle.enabled}
                          disabled={isBusy}
                          onClick={() => void setPluginBundleEnabled(bundle.name, !bundle.enabled)}
                          title={bundle.enabled ? '停用插件' : '启用插件'}
                          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition disabled:opacity-45 ${
                            bundle.enabled
                              ? 'border-[#D13B27] bg-[#D13B27]'
                              : 'border-[#C2BEB2] bg-[#ECEAE2]'
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[#FAF9F5] transition ${
                              bundle.enabled ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {configOpen && hasConfigSlot && (
                      <div className="border-t border-[#ECEAE2] bg-[#F4F3EE]/50 px-4 py-3">
                        <DshSlot name="plugins.bundle.config" slotKey={bundle.name} />
                      </div>
                    )}

                    {expanded && bundle.entries.length > 0 && (
                      <div className="border-t border-[#ECEAE2] bg-[#F4F3EE]/60 px-4 py-2.5">
                        <div className="space-y-1.5">
                          {bundle.entries.map((entry) => {
                            const entryId = entry.entryId
                            const entryBusy =
                              entryId !== null && pluginBusyKey === `entry:${entryId}`
                            return (
                              <div
                                key={entry.rowId}
                                className="flex items-center justify-between gap-3 rounded border border-[#ECEAE2] bg-[#FAF9F5] px-3 py-1.5 text-[11px]"
                              >
                                <div className="min-w-0">
                                  <div className="font-mono-tabular truncate text-[#141413]">
                                    {entry.moduleName}
                                  </div>
                                  <div className="font-mono-tabular truncate text-[10px] text-[#8A8880]">
                                    {entry.rowId}
                                  </div>
                                </div>
                                {entryId && (
                                  <div className="flex shrink-0 items-center gap-1.5">
                                    <button
                                      type="button"
                                      disabled={entryBusy}
                                      onClick={() =>
                                        void setPluginEntryEnabled(
                                          entryId,
                                          entry.moduleName,
                                          true,
                                        )
                                      }
                                      className="rounded border border-[#D8D5CB] bg-[#F4F3EE] px-2 py-0.5 text-[10px] text-[#141413] hover:border-[#141413] disabled:opacity-45"
                                    >
                                      启用
                                    </button>
                                    <button
                                      type="button"
                                      disabled={entryBusy}
                                      onClick={() =>
                                        void setPluginEntryEnabled(
                                          entryId,
                                          entry.moduleName,
                                          false,
                                        )
                                      }
                                      className="rounded border border-[#D8D5CB] bg-[#F4F3EE] px-2 py-0.5 text-[10px] text-[#575652] hover:border-[#D13B27] hover:text-[#D13B27] disabled:opacity-45"
                                    >
                                      停用
                                    </button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
      )}
    </section>
  )
}
