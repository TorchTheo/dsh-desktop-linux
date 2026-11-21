import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Shield, ShieldAlert } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import type { PermissionMode } from '../types/domain'

const PERMISSION_OPTIONS: {
  mode: PermissionMode
  label: string
  desc: string
  danger?: boolean
}[] = [
  { mode: 'read-only', label: '只读模式', desc: '仅允许读取检索，修改与命令需审批' },
  { mode: 'workspace-write', label: '工作区可写', desc: '允许读写当前目录，高危操作需审批' },
  {
    mode: 'danger-full-access',
    label: '完全访问',
    desc: '高危：跳过审批直接执行命令与文件读写',
    danger: true,
  },
]

export function PermissionSelector() {
  const workerStatus = useAppStore((s) => s.workerStatus)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const telemetryBySession = useAppStore((s) => s.telemetryBySession)
  const setSessionPermission = useAppStore((s) => s.setSessionPermission)

  const [open, setOpen] = useState(false)
  const [confirmDanger, setConfirmDanger] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (workerStatus.state !== 'ready') return null

  const currentMode =
    (activeSessionId ? telemetryBySession[activeSessionId]?.sandboxMode : null) ??
    'workspace-write'
  const currentOption =
    PERMISSION_OPTIONS.find((opt) => opt.mode === currentMode) ?? PERMISSION_OPTIONS[1]
  const isDanger = currentOption.mode === 'danger-full-access'

  const handleSelect = (mode: PermissionMode) => {
    setOpen(false)
    if (mode === 'danger-full-access' && currentMode !== 'danger-full-access') {
      setConfirmDanger(true)
      return
    }
    void setSessionPermission(mode)
  }

  return (
    <>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="切换当前会话权限模式"
          className={`inline-flex h-7 items-center gap-1.5 rounded border px-2 text-xs transition ${
            isDanger
              ? 'border-[#D13B27]/70 bg-[#D13B27]/10 text-[#D13B27] hover:border-[#D13B27]'
              : open
                ? 'border-[#141413] bg-[#FAF9F5] text-[#141413]'
                : 'border-[#D8D5CB] bg-[#ECEAE2] text-[#141413] hover:border-[#141413]'
          }`}
        >
          {isDanger ? (
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-[#D13B27]" />
          ) : (
            <Shield className="h-3.5 w-3.5 shrink-0 text-[#575652]" />
          )}
          <span>{currentOption.label}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
        </button>

        {open && (
          <div className="absolute bottom-full left-0 z-40 mb-1.5 w-64 overflow-hidden rounded-lg border border-[#C2BEB2] bg-[#FAF9F5] py-1">
            {PERMISSION_OPTIONS.map((opt) => {
              const active = opt.mode === currentOption.mode
              return (
                <button
                  key={opt.mode}
                  type="button"
                  onClick={() => handleSelect(opt.mode)}
                  className={`flex w-full items-start justify-between gap-2 px-3 py-2 text-left transition ${
                    active ? 'bg-[#ECEAE2]' : 'hover:bg-[#F4F3EE]'
                  }`}
                >
                  <div className="min-w-0">
                    <div
                      className={`text-xs font-medium ${
                        opt.danger ? 'text-[#D13B27]' : 'text-[#141413]'
                      }`}
                    >
                      {opt.label}
                    </div>
                    <div className="mt-0.5 text-[10.5px] leading-snug text-[#8A8880]">
                      {opt.desc}
                    </div>
                  </div>
                  {active && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#D13B27]" />}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {confirmDanger && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#141413]/40 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md overflow-hidden rounded-lg border border-[#D13B27]/60 border-t-[3px] border-t-[#D13B27] bg-[#FAF9F5]">
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[#D13B27]/40 bg-[#D13B27]/10 text-[#D13B27]">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[#141413]">确认开启「完全访问」权限？</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#575652]">
                    该模式属于高危权限，开启后当前会话的助手将获得以下能力且不再逐次弹窗审批：
                  </p>
                  <ul className="mt-2.5 list-disc space-y-1 pl-4 text-xs text-[#575652]">
                    <li>可直接执行任意本地终端命令（包括删除、安装或网络请求）</li>
                    <li>可读取、修改或覆盖当前工作目录以外的系统与用户文件</li>
                    <li>建议仅在受控项目目录或已做好 Git 备份时开启</li>
                  </ul>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDanger(false)}
                  className="rounded border border-[#D8D5CB] bg-[#F4F3EE] px-3.5 py-1.5 text-xs font-medium text-[#575652] hover:border-[#141413] hover:text-[#141413]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDanger(false)
                    void setSessionPermission('danger-full-access')
                  }}
                  className="rounded bg-[#D13B27] px-3.5 py-1.5 text-xs font-medium text-[#FAF9F5] hover:bg-[#b5301f]"
                >
                  我了解风险，开启完全访问
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
