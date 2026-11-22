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
      className: 'border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/10 text-[var(--status-danger-text)]',
    }
  }
  if (!bundle.installed) {
    return {
      label: '未安装',
      className: 'border-[var(--status-warn)]/40 bg-[var(--status-warn)]/10 text-[var(--status-warn-text)]',
    }
  }
  if (bundle.enabled) {
    return {
      label: '已启用',
      className: 'border-[var(--status-ok)]/35 bg-[var(--status-ok)]/10 text-[var(--status-ok-text)]',
    }
  }
  return {
    label: '已停用',
    className: 'border-[var(--border-hairline)] bg-[var(--bg-recessed)] text-[var(--ink-secondary)]',
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
    <section className="flex min-h-0 flex-1 flex-col bg-[var(--bg-canvas)]">
      {/* Bauhaus Sub-header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)] px-5 py-2.5">
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded border border-[var(--border-hairline)] bg-[var(--bg-recessed)] p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('plugins')}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition ${
                activeTab === 'plugins'
                  ? 'bg-[var(--bg-surface)] text-[var(--ink-primary)] ring-1 ring-[var(--border-hairline)]'
                  : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
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
                  ? 'bg-[var(--bg-surface)] text-[var(--ink-primary)] ring-1 ring-[var(--border-hairline)]'
                  : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              技能管理
            </button>
          </div>

          <div className="font-mono-tabular hidden items-center gap-2 text-[11px] text-[var(--ink-secondary)] md:flex">
            <span className="rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2 py-0.5">
              配置集：{hostInfo?.profile ?? config?.profile ?? 'web'}
            </span>
            <span className="rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2 py-0.5">
              已启用 {stats.enabled}/{stats.total}
            </span>
            {stats.thirdParty > 0 && (
              <span className="rounded border border-[var(--brand-secondary)]/30 bg-[var(--brand-secondary)]/8 px-2 py-0.5 text-[var(--brand-secondary)]">
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
            className="inline-flex items-center gap-1.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs font-medium text-[var(--ink-primary)] transition hover:border-[var(--ink-primary)] disabled:opacity-45"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${pluginsLoading ? 'animate-spin' : ''}`} />
            刷新列表
          </button>
        </div>
      </div>

      {pluginRestartRequired && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--status-warn)]/40 bg-[var(--status-warn)]/10 px-5 py-2 text-xs text-[var(--status-warn-text)]">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[var(--status-warn)]" />
            插件变更已写入 DSH 配置，重启后端后将完整生效。
          </span>
          <button
            type="button"
            onClick={() => void restartWorker()}
            className="rounded bg-[var(--ink-primary)] px-2.5 py-1 text-[11px] font-medium text-[var(--bg-surface)] hover:bg-[var(--ink-hover)]"
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
            <div className="rounded-lg border border-[var(--status-warn)]/40 bg-[var(--bg-surface)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[var(--ink-primary)]">
                    当前运行配置集未加载 DSH 插件管理服务
                  </div>
                  <p className="mt-1 text-xs text-[var(--ink-secondary)]">
                    将运行配置集切换为 <code className="font-mono-tabular">web</code>{' '}
                    即可同时加载完整 DSH 后端与前端插件生态（插件界面将直接融入左侧栏与对话区）。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSwitchToWebProfile()}
                  className="rounded bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--brand-hover)]"
                >
                  切换至 web 配置集并重启
                </button>
              </div>
            </div>
          )}

          {/* Install plugin bar */}
          <form
            onSubmit={(e) => void handleInstall(e)}
            className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 bg-[var(--brand-primary)]" />
                <h3 className="text-xs font-semibold tracking-wide text-[var(--ink-primary)]">
                  安装新插件
                </h3>
              </div>
              <span className="font-mono-tabular text-[11px] text-[var(--ink-muted)]">
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
                className="font-mono-tabular min-w-0 flex-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:border-[var(--ink-primary)] focus:bg-[var(--bg-surface)] focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={
                  !bridgeCapabilities.pluginManager ||
                  !installSpec.trim() ||
                  pluginBusyKey === 'install'
                }
                className="inline-flex shrink-0 items-center gap-1.5 rounded bg-[var(--ink-primary)] px-3.5 py-1.5 text-xs font-medium text-[var(--bg-surface)] transition hover:bg-[var(--ink-hover)] disabled:opacity-45"
              >
                <Plus className="h-3.5 w-3.5" />
                {pluginBusyKey === 'install' ? '安装中...' : '安装插件'}
              </button>
            </div>
          </form>

          {/* Plugin list */}
          <div className="space-y-2.5">
            {pluginsLoading && plugins.length === 0 ? (
              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-5 py-10 text-center text-xs text-[var(--ink-muted)]">
                正在读取 DSH 插件列表...
              </div>
            ) : plugins.length === 0 ? (
              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-5 py-10 text-center">
                <Puzzle className="mx-auto h-6 w-6 text-[var(--ink-muted)]" />
                <div className="mt-2 text-xs font-medium text-[var(--ink-primary)]">暂无可管理的插件</div>
                <div className="mt-1 text-[11px] text-[var(--ink-muted)]">
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
                    className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] transition hover:border-[var(--border-strong)]"
                  >
                    <div className="flex items-start justify-between gap-4 px-4 py-3.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono-tabular text-xs font-semibold text-[var(--ink-primary)]">
                            {bundle.name}
                          </span>
                          {bundle.version && (
                            <span className="font-mono-tabular rounded border border-[var(--bg-recessed)] bg-[var(--bg-canvas)] px-1.5 py-0.5 text-[10px] text-[var(--ink-secondary)]">
                              v{bundle.version}
                            </span>
                          )}
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                          {!isCore && (
                            <span className="rounded border border-[var(--brand-secondary)]/30 bg-[var(--brand-secondary)]/8 px-1.5 py-0.5 text-[10px] font-medium text-[var(--brand-secondary)]">
                              第三方扩展
                            </span>
                          )}
                        </div>

                        {bundle.description && (
                          <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-secondary)]">
                            {bundle.description}
                          </p>
                        )}

                        {bundle.source && (
                          <div className="font-mono-tabular mt-1 truncate text-[10px] text-[var(--ink-muted)]">
                            来源：{bundle.source}
                          </div>
                        )}

                        {bundle.error && (
                          <div className="mt-2 rounded border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/8 px-2.5 py-1.5 text-[11px] text-[var(--status-danger-text)]">
                            {bundle.error}
                          </div>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          {bundle.entries.length > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleExpand(bundle.name)}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
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
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--brand-secondary)] hover:underline"
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
                                  className="rounded bg-[var(--brand-primary)] px-2 py-1 text-[11px] font-medium text-white hover:bg-[var(--brand-hover)]"
                                >
                                  确认卸载
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmRemove(null)}
                                  className="rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2 py-1 text-[11px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
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
                                className="rounded p-1.5 text-[var(--ink-muted)] transition hover:bg-[var(--brand-primary)]/10 hover:text-[var(--brand-primary)] disabled:opacity-40"
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
                              ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]'
                              : 'border-[var(--border-strong)] bg-[var(--bg-recessed)]'
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--bg-surface)] transition ${
                              bundle.enabled ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {configOpen && hasConfigSlot && (
                      <div className="border-t border-[var(--bg-recessed)] bg-[var(--bg-canvas)]/50 px-4 py-3">
                        <DshSlot name="plugins.bundle.config" slotKey={bundle.name} />
                      </div>
                    )}

                    {expanded && bundle.entries.length > 0 && (
                      <div className="border-t border-[var(--bg-recessed)] bg-[var(--bg-canvas)]/60 px-4 py-2.5">
                        <div className="space-y-1.5">
                          {bundle.entries.map((entry) => {
                            const entryId = entry.entryId
                            const entryBusy =
                              entryId !== null && pluginBusyKey === `entry:${entryId}`
                            return (
                              <div
                                key={entry.rowId}
                                className="flex items-center justify-between gap-3 rounded border border-[var(--bg-recessed)] bg-[var(--bg-surface)] px-3 py-1.5 text-[11px]"
                              >
                                <div className="min-w-0">
                                  <div className="font-mono-tabular truncate text-[var(--ink-primary)]">
                                    {entry.moduleName}
                                  </div>
                                  <div className="font-mono-tabular truncate text-[10px] text-[var(--ink-muted)]">
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
                                      className="rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2 py-0.5 text-[10px] text-[var(--ink-primary)] hover:border-[var(--ink-primary)] disabled:opacity-45"
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
                                      className="rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2 py-0.5 text-[10px] text-[var(--ink-secondary)] hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-45"
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
