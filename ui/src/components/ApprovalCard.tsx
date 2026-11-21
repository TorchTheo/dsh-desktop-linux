import { ShieldAlert } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import type { ApprovalRequestEvent } from '../types/domain'

interface Props {
  request: ApprovalRequestEvent
}

export function ApprovalCard({ request }: Props) {
  const respondApproval = useAppStore((s) => s.respondApproval)

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-amber-200">工具执行审批请求</span>
            <code className="rounded bg-amber-900/50 px-1.5 py-0.5 text-xs text-amber-100">
              {request.toolName}
            </code>
          </div>
          {request.reason && (
            <p className="mt-1.5 whitespace-pre-wrap text-xs text-[#e6edf3]/90">{request.reason}</p>
          )}
          {request.callId && (
            <p className="mt-1 text-[11px] text-[#8b949e]">Call ID: {request.callId}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void respondApproval(request.requestId, 'allowed-once')}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500"
            >
              允许一次
            </button>
            <button
              type="button"
              onClick={() => void respondApproval(request.requestId, 'rejected')}
              className="rounded-md bg-rose-600/80 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-500"
            >
              拒绝
            </button>
            <button
              type="button"
              onClick={() => void respondApproval(request.requestId, 'cancelled')}
              className="rounded-md border border-[#30363d] bg-[#161b22] px-3 py-1.5 text-xs font-medium text-[#8b949e] transition hover:text-[#e6edf3]"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
