import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import * as api from '../api/tauri'
import { useAppStore } from '../store/useAppStore'
import type { SkillInfo } from '../types/domain'

function formatSourceLabel(source: string): { label: string; className: string } {
  if (source === 'user-dsh' || source === 'user-agents') {
    return {
      label: source === 'user-dsh' ? '用户技能' : '用户 Agents',
      className: 'border-[#246A4D]/35 bg-[#246A4D]/10 text-[#1d543d]',
    }
  }
  if (source === 'project-dsh' || source === 'project-agents') {
    return {
      label: '工作区技能',
      className: 'border-[#1E4D9B]/35 bg-[#1E4D9B]/10 text-[#1E4D9B]',
    }
  }
  if (source === 'bundled') {
    return {
      label: '系统内置',
      className: 'border-[#D8D5CB] bg-[#ECEAE2] text-[#575652]',
    }
  }
  return {
    label: source || '插件技能',
    className: 'border-[#C4881C]/35 bg-[#C4881C]/10 text-[#7a520a]',
  }
}

export function SkillsManager() {
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const config = useAppStore((s) => s.config)

  const activeSession = sessions.find((s) => s.sessionId === activeSessionId)
  const cwd = activeSession?.cwd ?? config?.defaultCwd ?? null

  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [filterMode, setFilterMode] = useState<'all' | 'editable' | 'builtin'>('all')
  const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // View / Edit / Create modal state
  const [editorModal, setEditorModal] = useState<{
    mode: 'create' | 'edit' | 'view'
    name: string
    description: string
    content: string
    scope: 'user' | 'workspace'
    path?: string
  } | null>(null)

  const loadSkills = useCallback(async () => {
    setLoading(true)
    try {
      const list = await api.listSkills(cwd)
      setSkills(list)
      useAppStore.setState({ skills: list })
    } catch (err) {
      useAppStore.setState({ errorBanner: `读取技能列表失败：${String(err)}` })
    } finally {
      setLoading(false)
    }
  }, [cwd])

  useEffect(() => {
    void loadSkills()
  }, [loadSkills])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return skills.filter((s) => {
      if (filterMode === 'editable' && !s.editable) return false
      if (filterMode === 'builtin' && s.editable) return false
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.source.toLowerCase().includes(q)
      )
    })
  }, [skills, query, filterMode])

  const openSkill = async (skill: SkillInfo) => {
    setBusy(true)
    try {
      const content = await api.readSkillContent(skill.path)
      setEditorModal({
        mode: skill.editable ? 'edit' : 'view',
        name: skill.name,
        description: skill.description,
        content,
        scope: skill.source === 'project-dsh' ? 'workspace' : 'user',
        path: skill.path,
      })
    } catch (err) {
      useAppStore.setState({ errorBanner: `读取技能内容失败：${String(err)}` })
    } finally {
      setBusy(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editorModal || editorModal.mode === 'view') return
    const name = editorModal.name.trim()
    if (!name) return
    setBusy(true)
    try {
      await api.saveUserSkill(
        name,
        editorModal.description.trim(),
        editorModal.content,
        editorModal.scope,
        cwd,
      )
      setEditorModal(null)
      useAppStore.setState({ noticeBanner: `已保存技能：${name}` })
      await loadSkills()
    } catch (err) {
      useAppStore.setState({ errorBanner: `保存技能失败：${String(err)}` })
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (skill: SkillInfo) => {
    setBusy(true)
    try {
      await api.deleteUserSkill(skill.path, cwd)
      setConfirmDeletePath(null)
      useAppStore.setState({ noticeBanner: `已删除技能：${skill.name}` })
      await loadSkills()
    } catch (err) {
      useAppStore.setState({ errorBanner: `删除技能失败：${String(err)}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
      <div className="mx-auto max-w-4xl space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-[#D8D5CB] bg-[#FAF9F5] p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8A8880]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索技能名称、描述或来源..."
              className="w-full rounded border border-[#D8D5CB] bg-[#F4F3EE] py-1.5 pl-8 pr-3 text-xs text-[#141413] placeholder-[#8A8880] focus:border-[#141413] focus:bg-[#FAF9F5] focus:outline-none"
            />
          </div>

          <div className="inline-flex rounded border border-[#D8D5CB] bg-[#ECEAE2] p-0.5 text-[11px]">
            {[
              { id: 'all' as const, label: `全部 (${skills.length})` },
              {
                id: 'editable' as const,
                label: `可编辑 (${skills.filter((s) => s.editable).length})`,
              },
              {
                id: 'builtin' as const,
                label: `内置/插件 (${skills.filter((s) => !s.editable).length})`,
              },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilterMode(item.id)}
                className={`rounded px-2.5 py-1 font-medium transition ${
                  filterMode === item.id
                    ? 'bg-[#FAF9F5] text-[#141413] ring-1 ring-[#D8D5CB]'
                    : 'text-[#575652] hover:text-[#141413]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadSkills()}
              className="inline-flex items-center gap-1 rounded border border-[#D8D5CB] bg-[#FAF9F5] px-2.5 py-1.5 text-xs text-[#141413] hover:border-[#141413] disabled:opacity-45"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </button>
            <button
              type="button"
              onClick={() =>
                setEditorModal({
                  mode: 'create',
                  name: '',
                  description: '',
                  content: '# 技能说明\n\n在这里编写供 Agent 遵循的步骤、规范或命令...',
                  scope: 'user',
                })
              }
              className="inline-flex items-center gap-1 rounded bg-[#D13B27] px-3 py-1.5 text-xs font-medium text-[#FAF9F5] hover:bg-[#b5301f]"
            >
              <Plus className="h-3.5 w-3.5" />
              新建技能
            </button>
          </div>
        </div>

        {/* Skills list */}
        <div className="space-y-2">
          {loading && skills.length === 0 ? (
            <div className="rounded-lg border border-[#D8D5CB] bg-[#FAF9F5] px-5 py-10 text-center text-xs text-[#8A8880]">
              正在扫描可用技能...
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-[#D8D5CB] bg-[#FAF9F5] px-5 py-10 text-center">
              <BookOpen className="mx-auto h-6 w-6 text-[#8A8880]" />
              <div className="mt-2 text-xs font-medium text-[#141413]">未找到匹配的技能</div>
              <div className="mt-1 text-[11px] text-[#8A8880]">
                点击右上角「新建技能」即可创建自定义 ~/.dsh/skills 技能
              </div>
            </div>
          ) : (
            filtered.map((skill) => {
              const badge = formatSourceLabel(skill.source)
              return (
                <div
                  key={`${skill.source}:${skill.path}`}
                  className="flex items-start justify-between gap-4 rounded-lg border border-[#D8D5CB] bg-[#FAF9F5] px-4 py-3 transition hover:border-[#C2BEB2]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono-tabular text-xs font-semibold text-[#141413]">
                        {skill.name}
                      </span>
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    {skill.description && (
                      <p className="mt-1 text-xs leading-relaxed text-[#575652]">
                        {skill.description}
                      </p>
                    )}
                    <div
                      className="font-mono-tabular mt-1 truncate text-[10px] text-[#8A8880]"
                      title={skill.path}
                    >
                      {skill.path}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void openSkill(skill)}
                      className="inline-flex items-center gap-1 rounded border border-[#D8D5CB] bg-[#F4F3EE] px-2.5 py-1 text-[11px] font-medium text-[#141413] hover:border-[#141413]"
                    >
                      {skill.editable ? (
                        <>
                          <Pencil className="h-3 w-3" />
                          编辑
                        </>
                      ) : (
                        <>
                          <Eye className="h-3 w-3" />
                          查看
                        </>
                      )}
                    </button>

                    {skill.editable && (
                      <>
                        {confirmDeletePath === skill.path ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleDelete(skill)}
                              className="rounded bg-[#D13B27] px-2 py-1 text-[11px] font-medium text-[#FAF9F5] hover:bg-[#b5301f]"
                            >
                              确认删除
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeletePath(null)}
                              className="rounded border border-[#D8D5CB] bg-[#F4F3EE] px-2 py-1 text-[11px] text-[#575652]"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirmDeletePath(skill.path)}
                            title="删除此技能"
                            className="rounded p-1.5 text-[#8A8880] transition hover:bg-[#D13B27]/10 hover:text-[#D13B27]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* View / Edit / Create Modal */}
      {editorModal && (
        <div
          onMouseDown={() => setEditorModal(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141413]/35 p-4 backdrop-blur-[2px]"
        >
          <form
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => void handleSave(e)}
            className="flex h-[560px] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-[#C2BEB2] bg-[#FAF9F5] shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-[#D8D5CB] bg-[#F4F3EE] px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 bg-[#D13B27]" />
                <h3 className="text-xs font-semibold text-[#141413]">
                  {editorModal.mode === 'create'
                    ? '新建技能'
                    : editorModal.mode === 'edit'
                      ? `编辑技能 · ${editorModal.name}`
                      : `查看技能 · ${editorModal.name}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditorModal(null)}
                className="rounded p-1 text-[#575652] hover:bg-[#ECEAE2]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-[#575652]">
                    技能名称（目录名）
                  </span>
                  <input
                    type="text"
                    disabled={editorModal.mode !== 'create'}
                    value={editorModal.name}
                    onChange={(e) => setEditorModal({ ...editorModal, name: e.target.value })}
                    placeholder="例如：my-deploy-skill"
                    className="font-mono-tabular w-full rounded border border-[#D8D5CB] bg-[#F4F3EE] px-2.5 py-1.5 text-xs text-[#141413] disabled:opacity-65 focus:border-[#141413] focus:bg-[#FAF9F5] focus:outline-none"
                  />
                </label>

                <div className="space-y-1">
                  <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-[#575652]">
                    保存范围
                  </span>
                  <div className="inline-flex w-full rounded border border-[#D8D5CB] bg-[#ECEAE2] p-0.5">
                    {[
                      { id: 'user' as const, label: '全局 (~/.dsh/skills)' },
                      { id: 'workspace' as const, label: '当前工作区 (.dsh/skills)' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={editorModal.mode !== 'create'}
                        onClick={() => setEditorModal({ ...editorModal, scope: opt.id })}
                        className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition disabled:opacity-65 ${
                          editorModal.scope === opt.id
                            ? 'bg-[#FAF9F5] text-[#141413] ring-1 ring-[#D8D5CB]'
                            : 'text-[#575652]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <label className="space-y-1">
                <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-[#575652]">
                  简短描述（供 Agent 判断何时调用）
                </span>
                <input
                  type="text"
                  disabled={editorModal.mode === 'view'}
                  value={editorModal.description}
                  onChange={(e) => setEditorModal({ ...editorModal, description: e.target.value })}
                  placeholder="一句话描述该技能的用途与触发场景"
                  className="w-full rounded border border-[#D8D5CB] bg-[#F4F3EE] px-2.5 py-1.5 text-xs text-[#141413] disabled:opacity-65 focus:border-[#141413] focus:bg-[#FAF9F5] focus:outline-none"
                />
              </label>

              <label className="flex min-h-0 flex-1 flex-col space-y-1">
                <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider text-[#575652]">
                  SKILL.md 正文内容
                </span>
                <textarea
                  readOnly={editorModal.mode === 'view'}
                  value={editorModal.content}
                  onChange={(e) => setEditorModal({ ...editorModal, content: e.target.value })}
                  className="font-mono-tabular min-h-[220px] flex-1 resize-none rounded border border-[#D8D5CB] bg-[#F4F3EE] p-3 text-xs leading-relaxed text-[#141413] focus:border-[#141413] focus:bg-[#FAF9F5] focus:outline-none"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#D8D5CB] bg-[#F4F3EE] px-5 py-3">
              <button
                type="button"
                onClick={() => setEditorModal(null)}
                className="rounded border border-[#D8D5CB] bg-[#FAF9F5] px-3 py-1.5 text-xs text-[#575652] hover:bg-[#ECEAE2]"
              >
                {editorModal.mode === 'view' ? '关闭' : '取消'}
              </button>
              {editorModal.mode !== 'view' && (
                <button
                  type="submit"
                  disabled={busy || !editorModal.name.trim()}
                  className="rounded bg-[#141413] px-3.5 py-1.5 text-xs font-medium text-[#FAF9F5] hover:bg-[#2a2a28] disabled:opacity-45"
                >
                  {busy ? '保存中...' : '保存技能'}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
