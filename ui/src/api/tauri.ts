import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type {
  AppConfig,
  AppStateSnapshot,
  ApprovalOutcome,
  ApprovalRequestEvent,
  ImageAttachment,
  SessionStatusEvent,
  SessionSummary,
  SubagentEvent,
  UiSessionEvent,
  UserQuestionCancelledEvent,
  UserQuestionRequestEvent,
  WorkerStatus,
} from '../types/domain'

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function getAppState(): Promise<AppStateSnapshot> {
  return invoke<AppStateSnapshot>('get_app_state')
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
): Promise<string | null> {
  return invoke<string | null>('send_query', {
    sessionId,
    text,
    images: images && images.length > 0 ? images : null,
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

export interface BackendEventHandlers {
  onWorkerStatus: (status: WorkerStatus) => void
  onSessionStatus: (event: SessionStatusEvent) => void
  onSessionEvent: (event: UiSessionEvent) => void
  onApprovalRequest: (event: ApprovalRequestEvent) => void
  onUserQuestion: (event: UserQuestionRequestEvent) => void
  onUserQuestionCancelled: (event: UserQuestionCancelledEvent) => void
  onSubagentUpdate: (event: SubagentEvent) => void
}

export async function subscribeBackendEvents(
  handlers: BackendEventHandlers,
): Promise<UnlistenFn> {
  const unlisteners = await Promise.all([
    listen<WorkerStatus>('dsh://worker-status', (e) => handlers.onWorkerStatus(e.payload)),
    listen<SessionStatusEvent>('dsh://session-status', (e) => handlers.onSessionStatus(e.payload)),
    listen<UiSessionEvent>('dsh://session-event', (e) => handlers.onSessionEvent(e.payload)),
    listen<ApprovalRequestEvent>('dsh://approval-request', (e) => handlers.onApprovalRequest(e.payload)),
    listen<UserQuestionRequestEvent>('dsh://user-question', (e) => handlers.onUserQuestion(e.payload)),
    listen<UserQuestionCancelledEvent>('dsh://user-question-cancelled', (e) =>
      handlers.onUserQuestionCancelled(e.payload),
    ),
    listen<SubagentEvent>('dsh://subagent-update', (e) => handlers.onSubagentUpdate(e.payload)),
  ])
  return () => {
    for (const unlisten of unlisteners) {
      unlisten()
    }
  }
}
