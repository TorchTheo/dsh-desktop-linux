export type DmabufMode = 'auto' | 'always' | 'never'

export interface AppConfig {
  dshBin: string
  provider: string
  model: string
  reasoningEffort: string | null
  defaultCwd: string
  profile: string
  patches: string[]
  disableDmabuf: DmabufMode
  enableBridge: boolean
  closeToTray: boolean
  desktopNotifications: boolean
}

export interface BridgeCapabilities {
  streamDelta: boolean
  abort: boolean
  modelControl: boolean
  hostInfo: boolean
  pluginManager: boolean
  clientPlugins?: boolean
  hostHttpProxy?: boolean
  agentPresets?: boolean
  sessionActions?: boolean
}

export interface AgentPresetInfo {
  id: string
  name: string
  description: string | null
}

export interface AgentPresetCatalog {
  defaultPresetId: string | null
  presets: AgentPresetInfo[]
}

export interface SessionPresetResult {
  sessionId: string
  presetId: string
}

export interface ClientPluginModule {
  id: string
  packageName: string
  bundlePath: string
}

export interface ProxiedHttpResponse {
  status: number
  headers: Record<string, string>
  bodyBase64: string
}

export interface HostRuntimeInfo {
  webOrigin: string | null
  authenticatedUrl: string | null
  profile: string | null
  hasWebServer: boolean
  hasPluginManager: boolean
}

export interface PluginEntryInfo {
  rowId: string
  moduleName: string
  entryId: string | null
}

export interface PluginBundleInfo {
  name: string
  enabled: boolean
  installed: boolean
  removable: boolean
  availability: string
  description: string | null
  version: string | null
  source: string | null
  error: string | null
  entries: PluginEntryInfo[]
}

export interface StreamDeltaEvent {
  sessionId: string
  blockType: string
  delta: string
  reset: boolean
}

export interface ModelEntry {
  id: string
  name: string
  description?: string | null
}

export interface ProviderModels {
  id: string
  name: string
  models: ModelEntry[]
}

export interface SessionModelSelection {
  provider: string
  model: string
  reasoningEffort: string | null
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
  pinned: boolean
  archived: boolean
  persisted: boolean
}

export interface WorkspaceSummary {
  id: string
  title: string
  path: string
  sessionIds: string[]
}

export interface AppStateSnapshot {
  config: AppConfig
  workerStatus: WorkerStatus
  sessions: SessionSummary[]
  workspaces: WorkspaceSummary[]
  bridgeCapabilities: BridgeCapabilities
  hostInfo?: HostRuntimeInfo | null
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

export interface UiSessionDetail {
  session: SessionSummary
  messages: UiMessage[]
  provider: string | null
  model: string | null
  telemetry?: SessionTelemetry
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

export interface SessionTelemetry {
  uncachedInputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  outputTokens: number
  contextWindow: number | null
  surfaceTokens: number | null
  systemTokens: number | null
  toolsTokens: number | null
  messageTokens: number | null
  sandboxMode: string | null
  approvalPolicy: string | null
  turnCount: number
  snapshotCount: number
}

export interface SessionTelemetryEvent {
  sessionId: string
  telemetry: SessionTelemetry
}

export interface RewindResult {
  session: SessionSummary
  workspaceRestored: boolean
  workspaceNote: string
}

export type PermissionMode = 'read-only' | 'workspace-write' | 'danger-full-access'

export interface SessionPermission {
  sandboxMode: string
  approvalPolicy: string
}
