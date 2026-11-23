import type { SubagentEvent, SubagentNode } from '../types/domain'

export type NormalizedSubagentStatus = 'running' | 'completed' | 'aborted' | 'error' | 'unknown'

export function normalizeSubagentStatus(
  status?: string | null,
  kind?: string | null,
): NormalizedSubagentStatus {
  if (kind === 'started') return 'running'
  const s = (status ?? '').toLowerCase()
  if (s === 'running' || s === 'started') return 'running'
  if (s === 'ok' || s === 'completed' || s === 'done' || s === 'success') return 'completed'
  if (s === 'aborted' || s === 'cancelled' || s === 'canceled' || s === 'interrupted') {
    return 'aborted'
  }
  if (s === 'error' || s === 'failed' || s === 'timeout') return 'error'
  return 'unknown'
}

export function formatSubagentStatusLabel(status?: string | null, kind?: string | null): string {
  switch (normalizeSubagentStatus(status, kind)) {
    case 'running':
      return '运行中'
    case 'completed':
      return '已完成'
    case 'aborted':
      return '已中止'
    case 'error':
      return '异常'
    default:
      return '未知'
  }
}

export function formatStopReason(stopReason?: string | null): string | null {
  if (!stopReason) return null
  const r = stopReason.toLowerCase()
  if (r === 'parent') return '由父会话主动中止'
  if (r === 'user') return '由用户主动中止'
  if (r === 'aborted') return '已中止'
  if (r === 'completed') return null
  return stopReason
}

export function subagentStatusDotClass(status?: string | null, kind?: string | null): string {
  switch (normalizeSubagentStatus(status, kind)) {
    case 'running':
      return 'bg-[var(--brand-primary)] animate-pulse'
    case 'completed':
      return 'bg-[var(--status-ok)]'
    case 'aborted':
      return 'bg-[var(--ink-muted)]'
    case 'error':
      return 'bg-[var(--status-danger)]'
    default:
      return 'bg-[var(--ink-muted)]'
  }
}

export function subagentStatusBadgeClass(status?: string | null, kind?: string | null): string {
  switch (normalizeSubagentStatus(status, kind)) {
    case 'running':
      return 'border-[var(--brand-primary)]/35 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]'
    case 'completed':
      return 'border-[var(--status-ok)]/35 bg-[var(--status-ok)]/10 text-[var(--status-ok-text)]'
    case 'aborted':
      return 'border-[var(--border-strong)] bg-[var(--bg-recessed)] text-[var(--ink-secondary)]'
    case 'error':
      return 'border-[var(--status-danger)]/35 bg-[var(--status-danger)]/10 text-[var(--status-danger-text)]'
    default:
      return 'border-[var(--border-hairline)] bg-[var(--bg-recessed)] text-[var(--ink-muted)]'
  }
}

function cloneNodes(nodes: SubagentNode[]): SubagentNode[] {
  return nodes.map((n) => ({
    ...n,
    children: cloneNodes(n.children ?? []),
  }))
}

function findNode(nodes: SubagentNode[], sessionId: string): SubagentNode | null {
  for (const n of nodes) {
    if (n.sessionId === sessionId) return n
    const found = findNode(n.children, sessionId)
    if (found) return found
  }
  return null
}

/**
 * Merge historical SubagentNode tree (from disk) with live SubagentEvent updates.
 */
export function mergeSubagentTree(
  treeNodes: SubagentNode[],
  liveEvents: SubagentEvent[],
  rootSessionId: string,
): SubagentNode[] {
  const roots = cloneNodes(treeNodes)
  for (const evt of liveEvents) {
    const nextStatus = normalizeSubagentStatus(evt.status, evt.kind)
    const existing = findNode(roots, evt.childSessionId)
    if (existing) {
      existing.status = nextStatus
      if (evt.stopReason !== null && evt.stopReason !== undefined) {
        existing.stopReason = evt.stopReason
      }
      continue
    }
    const newNode: SubagentNode = {
      sessionId: evt.childSessionId,
      parentSessionId: evt.parentSessionId,
      name: null,
      label: null,
      mode: null,
      provider: null,
      model: null,
      createdAt: Date.now(),
      status: nextStatus,
      stopReason: evt.stopReason ?? null,
      children: [],
    }
    if (evt.parentSessionId === rootSessionId) {
      roots.push(newNode)
    } else {
      const parent = findNode(roots, evt.parentSessionId)
      if (parent) {
        parent.children.push(newNode)
      } else {
        roots.push(newNode)
      }
    }
  }
  return roots
}

export function flattenSubagentTree(nodes: SubagentNode[]): SubagentNode[] {
  const result: SubagentNode[] = []
  const visit = (list: SubagentNode[]) => {
    for (const node of list) {
      result.push(node)
      if (node.children.length > 0) visit(node.children)
    }
  }
  visit(nodes)
  return result
}
