import { create } from 'zustand'
import * as api from '../api/tauri'
import type {
  AppConfig,
  ApprovalOutcome,
  ApprovalRequestEvent,
  BridgeCapabilities,
  ImageAttachment,
  ProviderModels,
  SessionSummary,
  SubagentEvent,
  UiContentBlock,
  UiMessage,
  UiSessionEvent,
  UserQuestionRequestEvent,
  WorkerStatus,
  WorkspaceSummary,
} from '../types/domain'

export interface SessionMeta {
  provider: string | null
  model: string | null
  reasoningEffort?: string | null
}

export interface StreamingDraft {
  thinking: string
  text: string
}

const DEFAULT_BRIDGE_CAPS: BridgeCapabilities = {
  streamDelta: false,
  abort: false,
  modelControl: false,
}

interface AppStore {
  initialized: boolean
  config: AppConfig | null
  workerStatus: WorkerStatus
  bridgeCapabilities: BridgeCapabilities
  providers: ProviderModels[]
  workspaces: WorkspaceSummary[]
  sessions: SessionSummary[]
  activeSessionId: string | null
  selectedWorkspaceId: string | null
  searchQuery: string
  showArchived: boolean
  inspectorOpen: boolean
  loadingHistoryId: string | null
  abortingSessionId: string | null
  loadedHistoryIds: Record<string, boolean>
  sessionMetaById: Record<string, SessionMeta>
  streamingBySession: Record<string, StreamingDraft>
  messagesBySession: Record<string, UiMessage[]>
  approvals: ApprovalRequestEvent[]
  questions: UserQuestionRequestEvent[]
  subagentsBySession: Record<string, SubagentEvent[]>
  errorBanner: string | null
  settingsOpen: boolean

  bootstrap: () => Promise<() => void>
  setSettingsOpen: (open: boolean) => void
  setInspectorOpen: (open: boolean) => void
  setSelectedWorkspaceId: (id: string | null) => void
  setSearchQuery: (q: string) => void
  setShowArchived: (show: boolean) => void
  clearError: () => void
  refreshSessions: () => Promise<void>
  fetchModels: () => Promise<void>
  setSessionModel: (provider: string, model: string, reasoningEffort?: string | null) => Promise<void>
  abortSession: () => Promise<void>
  selectSession: (sessionId: string) => Promise<void>
  loadSessionHistory: (sessionId: string, force?: boolean) => Promise<void>
  createSession: (cwd?: string) => Promise<SessionSummary | null>
  sendQuery: (text: string, images?: ImageAttachment[]) => Promise<void>
  respondApproval: (requestId: string, outcome: ApprovalOutcome) => Promise<void>
  respondUserQuestion: (requestId: string, answer: unknown) => Promise<void>
  pickAndSetWorkingDirectory: () => Promise<void>
  startWorker: () => Promise<void>
  restartWorker: () => Promise<void>
  updateConfig: (config: AppConfig) => Promise<void>
}

export const useAppStore = create<AppStore>((set, get) => ({
  initialized: false,
  config: null,
  workerStatus: { state: 'idle' },
  bridgeCapabilities: DEFAULT_BRIDGE_CAPS,
  providers: [],
  workspaces: [],
  sessions: [],
  activeSessionId: null,
  selectedWorkspaceId: null,
  searchQuery: '',
  showArchived: false,
  inspectorOpen: true,
  loadingHistoryId: null,
  abortingSessionId: null,
  loadedHistoryIds: {},
  sessionMetaById: {},
  streamingBySession: {},
  messagesBySession: {},
  approvals: [],
  questions: [],
  subagentsBySession: {},
  errorBanner: null,
  settingsOpen: false,

  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setInspectorOpen: (open) => set({ inspectorOpen: open }),
  setSelectedWorkspaceId: (id) => set({ selectedWorkspaceId: id }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setShowArchived: (show) => set({ showArchived: show }),
  clearError: () => set({ errorBanner: null }),

  bootstrap: async () => {
    if (!api.isTauriRuntime()) {
      set({
        initialized: true,
        workerStatus: { state: 'error', message: '未检测到 Tauri 运行时（当前为浏览器预览模式）' },
      })
      return () => {}
    }

    const unlisten = await api.subscribeBackendEvents({
      onWorkerStatus: (workerStatus) => {
        set((state) => ({
          workerStatus,
          sessions:
            workerStatus.state === 'stopped' || workerStatus.state === 'error'
              ? state.sessions.map((s) => ({ ...s, status: 'idle' }))
              : state.sessions,
          streamingBySession:
            workerStatus.state === 'stopped' || workerStatus.state === 'error'
              ? {}
              : state.streamingBySession,
        }))
      },

      onBridgeCapabilities: (bridgeCapabilities) => {
        set({ bridgeCapabilities })
        if (bridgeCapabilities.modelControl) {
          void get().fetchModels()
        }
      },

      onStreamDelta: ({ sessionId, blockType, delta, reset }) => {
        set((state) => {
          const prev = reset
            ? { thinking: '', text: '' }
            : (state.streamingBySession[sessionId] ?? { thinking: '', text: '' })
          const next: StreamingDraft =
            blockType === 'thinking'
              ? { ...prev, thinking: prev.thinking + delta }
              : { ...prev, text: prev.text + delta }
          return {
            streamingBySession: {
              ...state.streamingBySession,
              [sessionId]: next,
            },
          }
        })
      },

      onSessionStatus: ({ sessionId, status }) => {
        set((state) => {
          const nextStreaming = { ...state.streamingBySession }
          if (status === 'idle') {
            delete nextStreaming[sessionId]
          }
          return {
            sessions: state.sessions.map((s) =>
              s.sessionId === sessionId ? { ...s, status, updatedAt: Date.now() } : s,
            ),
            streamingBySession: nextStreaming,
            abortingSessionId:
              status === 'idle' && state.abortingSessionId === sessionId
                ? null
                : state.abortingSessionId,
          }
        })
      },

      onSessionEvent: (event: UiSessionEvent) => {
        if (event.kind === 'message') {
          set((state) => {
            const list = state.messagesBySession[event.sessionId] ?? []
            const exists = list.some((m) => m.id === event.message.id)
            const nextList = exists
              ? list.map((m) => (m.id === event.message.id ? event.message : m))
              : [...list, event.message]
            const nextStreaming = { ...state.streamingBySession }
            if (event.message.role === 'assistant') {
              delete nextStreaming[event.sessionId]
            }
            return {
              messagesBySession: {
                ...state.messagesBySession,
                [event.sessionId]: nextList,
              },
              streamingBySession: nextStreaming,
            }
          })
        } else if (event.kind === 'titleUpdated') {
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.sessionId === event.sessionId ? { ...s, title: event.title } : s,
            ),
          }))
        } else if (event.kind === 'turnEnded') {
          set((state) => {
            const nextStreaming = { ...state.streamingBySession }
            delete nextStreaming[event.sessionId]
            return { streamingBySession: nextStreaming }
          })
        } else if (event.kind === 'attemptFailed') {
          const errMsg: UiMessage = {
            id: `attempt-err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            role: 'system',
            blocks: [{ type: 'text', text: event.message }],
            timestamp: Date.now(),
            isError: true,
          }
          set((state) => ({
            messagesBySession: {
              ...state.messagesBySession,
              [event.sessionId]: [...(state.messagesBySession[event.sessionId] ?? []), errMsg],
            },
          }))
        }
      },

      onApprovalRequest: (req) => {
        set((state) => ({
          approvals: state.approvals.some((a) => a.requestId === req.requestId)
            ? state.approvals
            : [...state.approvals, req],
        }))
      },

      onUserQuestion: (req) => {
        set((state) => ({
          questions: state.questions.some((q) => q.requestId === req.requestId)
            ? state.questions
            : [...state.questions, req],
        }))
      },

      onUserQuestionCancelled: ({ requestId }) => {
        set((state) => ({
          questions: state.questions.filter((q) => q.requestId !== requestId),
        }))
      },

      onSubagentUpdate: (evt) => {
        set((state) => {
          const prev = state.subagentsBySession[evt.parentSessionId] ?? []
          const idx = prev.findIndex((item) => item.childSessionId === evt.childSessionId)
          const next = idx >= 0 ? prev.map((item, i) => (i === idx ? evt : item)) : [...prev, evt]
          return {
            subagentsBySession: {
              ...state.subagentsBySession,
              [evt.parentSessionId]: next,
            },
          }
        })
      },
    })

    try {
      const snapshot = await api.getAppState()
      const initialId = snapshot.sessions[0]?.sessionId ?? null
      const caps = snapshot.bridgeCapabilities ?? DEFAULT_BRIDGE_CAPS
      set({
        initialized: true,
        config: snapshot.config,
        workerStatus: snapshot.workerStatus,
        bridgeCapabilities: caps,
        workspaces: snapshot.workspaces ?? [],
        sessions: snapshot.sessions,
        activeSessionId: initialId,
      })
      if (caps.modelControl) {
        void get().fetchModels()
      }
      if (initialId) {
        void get().loadSessionHistory(initialId)
      }
    } catch (error) {
      set({
        initialized: true,
        errorBanner: `初始化状态失败：${String(error)}`,
      })
    }

    return unlisten
  },

  fetchModels: async () => {
    try {
      const providers = await api.listModels()
      set({ providers })
    } catch {
      // Bridge unavailable or not ready yet; ignore silently.
    }
  },

  setSessionModel: async (provider, model, reasoningEffort = null) => {
    let sessionId = get().activeSessionId
    if (!sessionId) {
      const created = await get().createSession()
      if (!created) return
      sessionId = created.sessionId
    }
    try {
      const selected = await api.setSessionModel(sessionId, provider, model, reasoningEffort)
      set((state) => ({
        sessionMetaById: {
          ...state.sessionMetaById,
          [sessionId!]: {
            provider: selected.provider,
            model: selected.model,
            reasoningEffort: selected.reasoningEffort,
          },
        },
        errorBanner: null,
      }))
    } catch (error) {
      set({ errorBanner: `切换模型失败：${String(error)}` })
    }
  },

  abortSession: async () => {
    const sessionId = get().activeSessionId
    if (!sessionId) return
    set({ abortingSessionId: sessionId })
    try {
      await api.abortSession(sessionId)
    } catch (error) {
      set({ abortingSessionId: null, errorBanner: `中断生成失败：${String(error)}` })
    }
  },

  refreshSessions: async () => {
    try {
      const snapshot = await api.refreshSessions()
      set({
        workspaces: snapshot.workspaces ?? [],
        sessions: snapshot.sessions,
        workerStatus: snapshot.workerStatus,
        bridgeCapabilities: snapshot.bridgeCapabilities ?? get().bridgeCapabilities,
        errorBanner: null,
      })
    } catch (error) {
      set({ errorBanner: `刷新历史会话失败：${String(error)}` })
    }
  },

  loadSessionHistory: async (sessionId, force = false) => {
    const state = get()
    if (!force && state.loadedHistoryIds[sessionId]) return
    const target = state.sessions.find((s) => s.sessionId === sessionId)
    if (target && !target.persisted && !force) {
      set((s) => ({ loadedHistoryIds: { ...s.loadedHistoryIds, [sessionId]: true } }))
      return
    }
    set({ loadingHistoryId: sessionId })
    try {
      const detail = await api.loadSessionHistory(sessionId)
      set((s) => {
        const existing = s.messagesBySession[sessionId] ?? []
        const merged = detail.messages.length > 0 || existing.length === 0 ? detail.messages : existing
        return {
          loadingHistoryId: s.loadingHistoryId === sessionId ? null : s.loadingHistoryId,
          loadedHistoryIds: { ...s.loadedHistoryIds, [sessionId]: true },
          messagesBySession: { ...s.messagesBySession, [sessionId]: merged },
          sessionMetaById: {
            ...s.sessionMetaById,
            [sessionId]: {
              ...s.sessionMetaById[sessionId],
              provider: detail.provider,
              model: detail.model,
            },
          },
          sessions: s.sessions.map((item) =>
            item.sessionId === sessionId
              ? {
                  ...item,
                  title: detail.session.title || item.title,
                  cwd: detail.session.cwd || item.cwd,
                }
              : item,
          ),
        }
      })
    } catch (error) {
      set((s) => ({
        loadingHistoryId: s.loadingHistoryId === sessionId ? null : s.loadingHistoryId,
        errorBanner: `读取历史记录失败：${String(error)}`,
      }))
    }
  },

  selectSession: async (sessionId) => {
    set({ activeSessionId: sessionId })
    await get().loadSessionHistory(sessionId)
  },

  createSession: async (cwd) => {
    try {
      const selectedWs = get().workspaces.find((w) => w.id === get().selectedWorkspaceId)
      const targetCwd = cwd ?? selectedWs?.path
      const session = await api.createSession(targetCwd)
      set((state) => ({
        sessions: [session, ...state.sessions],
        activeSessionId: session.sessionId,
        loadedHistoryIds: { ...state.loadedHistoryIds, [session.sessionId]: true },
        errorBanner: null,
      }))
      return session
    } catch (error) {
      set({ errorBanner: `创建会话失败：${String(error)}` })
      return null
    }
  },

  sendQuery: async (text, images = []) => {
    const trimmed = text.trim()
    if (!trimmed && images.length === 0) return

    let sessionId = get().activeSessionId
    if (!sessionId) {
      const created = await get().createSession()
      if (!created) return
      sessionId = created.sessionId
    }

    const blocks: UiContentBlock[] = []
    if (trimmed) {
      blocks.push({ type: 'text', text: trimmed })
    }
    for (const img of images) {
      blocks.push({
        type: 'image',
        mimeType: img.mimeType,
        dataUrl: `data:${img.mimeType};base64,${img.data}`,
      })
    }

    const localMsg: UiMessage = {
      id: `local-user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'user',
      blocks,
      timestamp: Date.now(),
      isError: false,
    }

    set((state) => ({
      messagesBySession: {
        ...state.messagesBySession,
        [sessionId!]: [...(state.messagesBySession[sessionId!] ?? []), localMsg],
      },
      sessions: state.sessions.map((s) =>
        s.sessionId === sessionId
          ? {
              ...s,
              title: s.title === 'New session' && trimmed ? trimmed.slice(0, 32) : s.title,
              updatedAt: Date.now(),
            }
          : s,
      ),
      errorBanner: null,
    }))

    try {
      await api.sendQuery(sessionId, trimmed, images)
    } catch (error) {
      set({ errorBanner: `发送消息失败：${String(error)}` })
    }
  },

  respondApproval: async (requestId, outcome) => {
    try {
      await api.respondApproval(requestId, outcome)
      set((state) => ({
        approvals: state.approvals.filter((a) => a.requestId !== requestId),
      }))
    } catch (error) {
      set({ errorBanner: `提交审批结果失败：${String(error)}` })
    }
  },

  respondUserQuestion: async (requestId, answer) => {
    try {
      await api.respondUserQuestion(requestId, answer)
      set((state) => ({
        questions: state.questions.filter((q) => q.requestId !== requestId),
      }))
    } catch (error) {
      set({ errorBanner: `提交问答回复失败：${String(error)}` })
    }
  },

  pickAndSetWorkingDirectory: async () => {
    try {
      const selected = await api.pickDirectory()
      if (!selected) return
      const sessionId = get().activeSessionId
      if (!sessionId) {
        await get().createSession(selected)
        return
      }
      const resolved = await api.setWorkingDirectory(sessionId, selected)
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.sessionId === sessionId ? { ...s, cwd: resolved } : s,
        ),
        errorBanner: null,
      }))
    } catch (error) {
      set({ errorBanner: `切换工作目录失败：${String(error)}` })
    }
  },

  startWorker: async () => {
    try {
      const workerStatus = await api.startWorker()
      set({ workerStatus, errorBanner: null })
    } catch (error) {
      set({ errorBanner: `启动后端失败：${String(error)}` })
    }
  },

  restartWorker: async () => {
    try {
      const workerStatus = await api.restartWorker()
      set({ workerStatus, errorBanner: null })
    } catch (error) {
      set({ errorBanner: `重启后端失败：${String(error)}` })
    }
  },

  updateConfig: async (config) => {
    try {
      const saved = await api.updateConfig(config)
      set({ config: saved, settingsOpen: false, errorBanner: null })
    } catch (error) {
      set({ errorBanner: `保存配置失败：${String(error)}` })
    }
  },
}))
