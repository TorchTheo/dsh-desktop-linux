import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type {
  AgentPresetCatalog,
  AppConfig,
  AppStateSnapshot,
  ApprovalOutcome,
  ApprovalRequestEvent,
  BackgroundJobInfo,
  BridgeCapabilities,
  ClientPluginModule,
  ProxiedHttpResponse,
  HostRuntimeInfo,
  PluginBundleInfo,
  ImageAttachment,
  PermissionMode,
  ProviderModels,
  SessionPermission,
  SessionPresetResult,
  RewindResult,
  SessionJobsEvent,
  SessionTelemetryEvent,
  SessionModelSelection,
  SessionStatusEvent,
  SessionSummary,
  StreamDeltaEvent,
  SubagentEvent,
  UiSessionDetail,
  UiSessionEvent,
  UserQuestionCancelledEvent,
  UserQuestionRequestEvent,
  WorkerStatus,
  WorkspaceSummary,
} from '../types/domain'

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function getAppState(): Promise<AppStateSnapshot> {
  return invoke<AppStateSnapshot>('get_app_state')
}

export async function getHostInfo(): Promise<HostRuntimeInfo | null> {
  return invoke<HostRuntimeInfo | null>('get_host_info')
}

export async function listClientPlugins(): Promise<ClientPluginModule[]> {
  return invoke<ClientPluginModule[]>('list_client_plugins')
}

export async function proxyHostHttp(
  method: string,
  path: string,
  headers?: Record<string, string>,
  bodyBase64?: string | null,
): Promise<ProxiedHttpResponse> {
  return invoke<ProxiedHttpResponse>('proxy_host_http', {
    method,
    path,
    headers: headers ?? null,
    bodyBase64: bodyBase64 ?? null,
  })
}

export async function listPlugins(): Promise<PluginBundleInfo[]> {
  return invoke<PluginBundleInfo[]>('list_plugins')
}

export async function setPluginBundleEnabled(
  packageName: string,
  enabled: boolean,
): Promise<unknown> {
  return invoke<unknown>('set_plugin_bundle_enabled', { packageName, enabled })
}

export async function setPluginEntryEnabled(
  entryId: string,
  moduleName: string | null,
  enabled: boolean,
): Promise<unknown> {
  return invoke<unknown>('set_plugin_entry_enabled', { entryId, moduleName, enabled })
}

export async function installPluginBundle(spec: string): Promise<unknown> {
  return invoke<unknown>('install_plugin_bundle', { spec })
}

export async function removePluginBundle(packageName: string): Promise<unknown> {
  return invoke<unknown>('remove_plugin_bundle', { packageName })
}

export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  return invoke<WorkspaceSummary[]>('list_workspaces')
}

export async function refreshSessions(): Promise<AppStateSnapshot> {
  return invoke<AppStateSnapshot>('refresh_sessions')
}

export async function loadSessionHistory(sessionId: string): Promise<UiSessionDetail> {
  return invoke<UiSessionDetail>('load_session_history', { sessionId })
}

export async function resumeSession(sessionId: string): Promise<SessionSummary> {
  return invoke<SessionSummary>('resume_session', { sessionId })
}

export async function abortSession(sessionId: string): Promise<boolean> {
  return invoke<boolean>('abort_session', { sessionId })
}

export async function listAgentPresets(): Promise<AgentPresetCatalog> {
  return invoke<AgentPresetCatalog>('list_agent_presets')
}

export async function setDefaultAgentPreset(presetId: string): Promise<string> {
  return invoke<string>('set_default_agent_preset', { presetId })
}

export async function setSessionPreset(
  sessionId: string,
  presetId: string,
): Promise<SessionPresetResult> {
  return invoke<SessionPresetResult>('set_session_preset', { sessionId, presetId })
}

export async function forkSession(sessionId: string): Promise<SessionSummary> {
  return invoke<SessionSummary>('fork_session', { sessionId })
}

export async function updateSessionMeta(
  sessionId: string,
  meta: { title?: string | null; pinned?: boolean | null; archived?: boolean | null },
): Promise<SessionSummary> {
  return invoke<SessionSummary>('update_session_meta', {
    sessionId,
    title: meta.title ?? null,
    pinned: meta.pinned ?? null,
    archived: meta.archived ?? null,
  })
}

export async function listModels(): Promise<ProviderModels[]> {
  return invoke<ProviderModels[]>('list_models')
}

export async function setSessionModel(
  sessionId: string,
  provider: string,
  model: string,
  reasoningEffort?: string | null,
): Promise<SessionModelSelection> {
  return invoke<SessionModelSelection>('set_session_model', {
    sessionId,
    provider,
    model,
    reasoningEffort: reasoningEffort ?? null,
  })
}

export async function startWorker(): Promise<WorkerStatus> {
  return invoke<WorkerStatus>('start_worker')
}

export async function restartWorker(): Promise<WorkerStatus> {
  return invoke<WorkerStatus>('restart_worker')
}

export async function createSession(cwd?: string): Promise<SessionSummary> {
  return invoke<SessionSummary>('create_session', { cwd: cwd ?? null })
}

export async function sendQuery(
  sessionId: string,
  text: string,
  images?: ImageAttachment[],
  clientMessageId?: string,
): Promise<string | null> {
  return invoke<string | null>('send_query', {
    sessionId,
    text,
    images: images && images.length > 0 ? images : null,
    clientMessageId: clientMessageId ?? null,
  })
}

export async function interruptAndSend(
  sessionId: string,
  text: string,
  images?: ImageAttachment[],
  clientMessageId?: string,
): Promise<string | null> {
  return invoke<string | null>('interrupt_and_send', {
    sessionId,
    text,
    images: images && images.length > 0 ? images : null,
    clientMessageId: clientMessageId ?? null,
  })
}

export async function listSessionJobs(sessionId: string): Promise<BackgroundJobInfo[]> {
  return invoke<BackgroundJobInfo[]>('list_session_jobs', { sessionId })
}

export async function killSessionJob(sessionId: string, jobId: string): Promise<boolean> {
  return invoke<boolean>('kill_session_job', { sessionId, jobId })
}

export async function setSessionPermission(
  sessionId: string,
  mode: PermissionMode,
): Promise<SessionPermission> {
  return invoke<SessionPermission>('set_session_permission', { sessionId, mode })
}

export async function rewindSession(
  sessionId: string,
  targetMessageId: string,
  restoreWorkspace: boolean,
): Promise<RewindResult> {
  return invoke<RewindResult>('rewind_session', {
    sessionId,
    targetMessageId,
    restoreWorkspace,
  })
}

export async function respondApproval(
  requestId: string,
  outcome: ApprovalOutcome,
): Promise<void> {
  return invoke<void>('respond_approval', { requestId, outcome })
}

export async function respondUserQuestion(
  requestId: string,
  answer: unknown,
): Promise<void> {
  return invoke<void>('respond_user_question', { requestId, answer })
}

export async function setWorkingDirectory(
  sessionId: string,
  path: string,
): Promise<string> {
  return invoke<string>('set_working_directory', { sessionId, path })
}

export async function updateConfig(config: AppConfig): Promise<AppConfig> {
  return invoke<AppConfig>('update_config', { config })
}

export async function pickDirectory(): Promise<string | null> {
  return invoke<string | null>('pick_directory')
}

export async function readLocalFileDataUrl(path: string): Promise<string> {
  return invoke<string>('read_local_file_data_url', { path })
}

export async function openLocalFile(path: string): Promise<void> {
  return invoke<void>('open_local_file', { path })
}

export async function openExternalUrl(url: string): Promise<void> {
  if (!isTauriRuntime()) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  return invoke<void>('open_external_url', { url })
}

export interface BackendEventHandlers {
  onWorkerStatus: (status: WorkerStatus) => void
  onBridgeCapabilities: (caps: BridgeCapabilities) => void
  onHostInfo: (info: HostRuntimeInfo | null) => void
  onStreamDelta: (event: StreamDeltaEvent) => void
  onSessionStatus: (event: SessionStatusEvent) => void
  onSessionEvent: (event: UiSessionEvent) => void
  onApprovalRequest: (event: ApprovalRequestEvent) => void
  onUserQuestion: (event: UserQuestionRequestEvent) => void
  onUserQuestionCancelled: (event: UserQuestionCancelledEvent) => void
  onSubagentUpdate: (event: SubagentEvent) => void
  onOpenDirectory: (path: string) => void
  onSessionTelemetry: (event: SessionTelemetryEvent) => void
  onSessionJobs: (event: SessionJobsEvent) => void
}

export async function subscribeBackendEvents(
  handlers: BackendEventHandlers,
): Promise<UnlistenFn> {
  const unlisteners = await Promise.all([
    listen<WorkerStatus>('dsh://worker-status', (e) => handlers.onWorkerStatus(e.payload)),
    listen<BridgeCapabilities>('dsh://bridge-capabilities', (e) =>
      handlers.onBridgeCapabilities(e.payload),
    ),
    listen<HostRuntimeInfo | null>('dsh://host-info', (e) => handlers.onHostInfo(e.payload)),
    listen<StreamDeltaEvent>('dsh://stream-delta', (e) => handlers.onStreamDelta(e.payload)),
    listen<SessionStatusEvent>('dsh://session-status', (e) => handlers.onSessionStatus(e.payload)),
    listen<UiSessionEvent>('dsh://session-event', (e) => handlers.onSessionEvent(e.payload)),
    listen<ApprovalRequestEvent>('dsh://approval-request', (e) => handlers.onApprovalRequest(e.payload)),
    listen<UserQuestionRequestEvent>('dsh://user-question', (e) => handlers.onUserQuestion(e.payload)),
    listen<UserQuestionCancelledEvent>('dsh://user-question-cancelled', (e) =>
      handlers.onUserQuestionCancelled(e.payload),
    ),
    listen<SubagentEvent>('dsh://subagent-update', (e) => handlers.onSubagentUpdate(e.payload)),
    listen<string>('dsh://open-directory', (e) => handlers.onOpenDirectory(e.payload)),
    listen<SessionTelemetryEvent>('dsh://session-telemetry', (e) => handlers.onSessionTelemetry(e.payload)),
    listen<SessionJobsEvent>('dsh://session-jobs', (e) => handlers.onSessionJobs(e.payload)),
  ])
  return () => {
    for (const unlisten of unlisteners) {
      unlisten()
    }
  }
}
