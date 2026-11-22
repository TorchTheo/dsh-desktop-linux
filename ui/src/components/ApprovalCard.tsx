import { useAppStore } from '../store/useAppStore'
import type { ApprovalRequestEvent } from '../types/domain'

interface Props {
  request: ApprovalRequestEvent
}

export function ApprovalCard({ request }: Props) {
  const respondApproval = useAppStore((s) => s.respondApproval)

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] border-l-[3px] border-l-[var(--status-warn)] bg-[var(--bg-surface)]">
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 bg-[var(--status-warn)]" />
            <span className="font-mono-tabular text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--status-warn-text)]">
              需要执行审批
            </span>
          </div>
          <code className="font-mono-tabular rounded border border-[var(--border-hairline)] bg-[var(--bg-recessed)] px-2 py-0.5 text-[11px] font-medium text-[var(--ink-primary)]">
            {request.toolName}
          </code>
        </div>

        {request.reason && (
          <pre className="font-mono-tabular mt-3 max-h-40 overflow-auto rounded border border-[var(--border-hairline)] bg-[var(--bg-recessed)] px-3 py-2 text-xs whitespace-pre-wrap text-[var(--ink-primary)]">
            {request.reason}
          </pre>
        )}

        {request.callId && (
          <div className="font-mono-tabular mt-2 text-[10px] text-[var(--ink-muted)]">
            调用编号 · {request.callId}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void respondApproval(request.requestId, 'allowed-once')}
            className="rounded bg-[var(--status-ok)] px-3.5 py-1.5 text-xs font-medium text-[var(--bg-surface)] transition hover:bg-[#1c543d]"
          >
            允许一次
          </button>
          <button
            type="button"
            onClick={() => void respondApproval(request.requestId, 'rejected')}
            className="rounded border border-[var(--brand-primary)] bg-transparent px-3.5 py-1.5 text-xs font-medium text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary)] hover:text-white"
          >
            拒绝
          </button>
          <button
            type="button"
            onClick={() => void respondApproval(request.requestId, 'cancelled')}
            className="rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs font-medium text-[var(--ink-secondary)] transition hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)]"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
