import { useAppStore } from '../store/useAppStore'
import type { ApprovalRequestEvent } from '../types/domain'

interface Props {
  request: ApprovalRequestEvent
}

export function ApprovalCard({ request }: Props) {
  const respondApproval = useAppStore((s) => s.respondApproval)

  return (
    <div className="overflow-hidden rounded-lg border border-[#D8D5CB] border-l-[3px] border-l-[#C4881C] bg-[#FAF9F5]">
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 bg-[#C4881C]" />
            <span className="font-mono-tabular text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8E6210]">
              Approval Required
            </span>
          </div>
          <code className="font-mono-tabular rounded border border-[#D8D5CB] bg-[#ECEAE2] px-2 py-0.5 text-[11px] font-medium text-[#141413]">
            {request.toolName}
          </code>
        </div>

        {request.reason && (
          <pre className="font-mono-tabular mt-3 max-h-40 overflow-auto rounded border border-[#D8D5CB] bg-[#ECEAE2] px-3 py-2 text-xs whitespace-pre-wrap text-[#141413]">
            {request.reason}
          </pre>
        )}

        {request.callId && (
          <div className="font-mono-tabular mt-2 text-[10px] text-[#8A8880]">
            CALL_ID · {request.callId}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void respondApproval(request.requestId, 'allowed-once')}
            className="rounded bg-[#246A4D] px-3.5 py-1.5 text-xs font-medium text-[#FAF9F5] transition hover:bg-[#1c543d]"
          >
            允许一次
          </button>
          <button
            type="button"
            onClick={() => void respondApproval(request.requestId, 'rejected')}
            className="rounded border border-[#D13B27] bg-transparent px-3.5 py-1.5 text-xs font-medium text-[#D13B27] transition hover:bg-[#D13B27] hover:text-[#FAF9F5]"
          >
            拒绝
          </button>
          <button
            type="button"
            onClick={() => void respondApproval(request.requestId, 'cancelled')}
            className="rounded border border-[#D8D5CB] bg-[#F4F3EE] px-3 py-1.5 text-xs font-medium text-[#575652] transition hover:border-[#141413] hover:text-[#141413]"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
