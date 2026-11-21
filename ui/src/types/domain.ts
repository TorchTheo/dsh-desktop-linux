export type DmabufMode = 'auto' | 'always' | 'never'

export interface AppConfig {
  dshBin: string
  provider: string
  model: string
  reasoningEffort: string | null
  defaultCwd: string
  patches: string[]
  disableDmabuf: DmabufMode
}

export type WorkerStatus =
  | { state: 'idle' }
  | { state: 'starting' }
  | { state: 'ready'; serverName: string; serverVersion: string }
  | { state: 'error'; message: string }
  | { state: 'stopped' }

export type SessionRunStatus = 'idle' | 'running'

export interface SessionSummary {
  sessionId: string
  title: string
  cwd: string
  status: SessionRunStatus
  createdAt: number
  updatedAt: number
}

export interface AppStateSnapshot {
  config: AppConfig
  workerStatus: WorkerStatus
  sessions: SessionSummary[]
}

export interface ImageAttachment {
  data: string
  mimeType: string
  name?: string | null
}

export type UiContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'toolUse'; id: string; name: string; input: unknown }
  | { type: 'toolResult'; toolUseId: string; content: unknown; isError: boolean }
  | { type: 'image'; mimeType: string; dataUrl: string }
  | { type: 'unknown'; raw: unknown }

export interface UiMessage {
  id: string
  role: string
  blocks: UiContentBlock[]
  timestamp: number
  isError: boolean
}

export type UiSessionEvent =
  | { kind: 'message'; sessionId: string; message: UiMessage }
  | { kind: 'titleUpdated'; sessionId: string; title: string }
  | { kind: 'attemptFailed'; sessionId: string; message: string }
  | { kind: 'turnStarted'; sessionId: string }
  | { kind: 'turnEnded'; sessionId: string; reason: string | null }

export interface SessionStatusEvent {
  sessionId: string
  status: SessionRunStatus
}

export type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled'

export interface ApprovalRequestEvent {
  requestId: string
  sessionId: string
  toolName: string
  callId: string | null
  reason: string | null
}

export interface UserQuestionOption {
  label: string
  description?: string
  value?: string
}

export interface UserQuestionItem {
  id?: string
  question?: string
  prompt?: string
  title?: string
  header?: string
  multiSelect?: boolean
  options?: UserQuestionOption[]
  allowFreeText?: boolean
}

export interface UserQuestionRequestEvent {
  requestId: string
  sessionId: string
  questions: unknown
}

export interface UserQuestionCancelledEvent {
  requestId: string
  sessionId: string
}

export interface SubagentEvent {
  kind: string
  parentSessionId: string
  childSessionId: string
  status: string | null
  stopReason: string | null
}
