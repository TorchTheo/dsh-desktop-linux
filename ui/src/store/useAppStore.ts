import { create } from 'zustand'
import * as api from '../api/tauri'
import type {
  AgentPresetInfo,
  AppConfig,
  ApprovalOutcome,
  ApprovalRequestEvent,
  BridgeCapabilities,
  HostRuntimeInfo,
  PluginBundleInfo,
  ImageAttachment,
  PermissionMode,
  ProviderModels,
  SessionSummary,
  SessionTelemetry,
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

export type ActiveView = 'studio' | 'trajectory' | 'plugins' | 'plugin-panel'

export interface QueuedMessage {
  id: string
  text: string
  images: ImageAttachment[]
  createdAt: number
}

export interface StreamingDraft {
  thinking: string
  text: string
}

const DEFAULT_BRIDGE_CAPS: BridgeCapabilities = {
  streamDelta: false,
  abort: false,
  modelControl: false,
  hostInfo: false,
  pluginManager: false,
}

interface AppStore {
  initialized: boolean
  config: AppConfig | null
  workerStatus: WorkerStatus
  bridgeCapabilities: BridgeCapabilities
  hostInfo: HostRuntimeInfo | null
  plugins: PluginBundleInfo[]
  pluginsLoading: boolean
  pluginBusyKey: string | null
  pluginRestartRequired: boolean
  providers: ProviderModels[]
  agentPresets: AgentPresetInfo[]
  defaultPresetId: string | null
  sessionPresetById: Record<string, string>
  workspaces: WorkspaceSummary[]
  sessions: SessionSummary[]
  activeSessionId: string | null
  selectedWorkspaceId: string | null
  searchQuery: string
  showArchived: boolean
  activeView: ActiveView
  activePluginPanelKey: string | null
  sidebarOpen: boolean
  inspectorOpen: boolean
  loadingHistoryId: string | null
  abortingSessionId: string | null
  loadedHistoryIds: Record<string, boolean>
  sessionMetaById: Record<string, SessionMeta>
  telemetryBySession: Record<string, SessionTelemetry>
  composerDraft: string | null
  noticeBanner: string | null
  streamingBySession: Record<string, StreamingDraft>
  queuedMessagesBySession: Record<string, QueuedMessage[]>
  messagesBySession: Record<string, UiMessage[]>
  approvals: ApprovalRequestEvent[]
  questions: UserQuestionRequestEvent[]
  subagentsBySession: Record<string, SubagentEvent[]>
  errorBanner: string | null
  settingsOpen: boolean

  bootstrap: () => Promise<() => void>
  setSettingsOpen: (open: boolean) => void
  setActiveView: (view: ActiveView) => void
  openPluginPanel: (panelKey: string) => void
  setSidebarOpen: (open: boolean) => void
  setInspectorOpen: (open: boolean) => void
  setSelectedWorkspaceId: (id: string | null) => void
  setSearchQuery: (q: string) => void
  setShowArchived: (show: boolean) => void
  clearError: () => void
  clearNotice: () => void
  consumeComposerDraft: () => string | null
  rewindToMessage: (messageId: string, restoreWorkspace: boolean, prefillText?: string) => Promise<void>
  refreshSessions: () => Promise<void>
  fetchModels: () => Promise<void>
  fetchAgentPresets: () => Promise<void>
  setDefaultAgentPreset: (presetId: string) => Promise<void>
  setSessionPreset: (presetId: string) => Promise<void>
  forkSession: (sessionId: string) => Promise<SessionSummary | null>
  updateSessionMeta: (
    sessionId: string,
    meta: { title?: string; pinned?: boolean; archived?: boolean },
  ) => Promise<void>
  fetchPlugins: () => Promise<void>
  setPluginBundleEnabled: (packageName: string, enabled: boolean) => Promise<void>
  setPluginEntryEnabled: (entryId: string, moduleName: string | null, enabled: boolean) => Promise<void>
  installPluginBundle: (spec: string) => Promise<boolean>
  removePluginBundle: (packageName: string) => Promise<void>
  setSessionModel: (provider: string, model: string, reasoningEffort?: string | null) => Promise<void>
  setSessionPermission: (mode: PermissionMode) => Promise<void>
  abortSession: () => Promise<void>
  selectSession: (sessionId: string) => Promise<void>
  loadSessionHistory: (sessionId: string, force?: boolean) => Promise<void>
  createSession: (cwd?: string) => Promise<SessionSummary | null>
  sendQuery: (text: string, images?: ImageAttachment[], options?: { forceImmediate?: boolean }) => Promise<void>
  removeQueuedMessage: (sessionId: string, queuedId: string) => void
  editQueuedMessage: (sessionId: string, queuedId: string) => void
  flushQueuedMessage: (sessionId: string, queuedId: string) => Promise<void>
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
  hostInfo: null,
  plugins: [],
  pluginsLoading: false,
  pluginBusyKey: null,
  pluginRestartRequired: false,
  providers: [],
  agentPresets: [],
  defaultPresetId: null,
  sessionPresetById: {},
  workspaces: [],
  sessions: [],
  activeSessionId: null,
  selectedWorkspaceId: null,
  searchQuery: '',
  showArchived: false,
  activeView: 'studio',
  activePluginPanelKey: null,
  sidebarOpen: true,
  inspectorOpen: false,
  loadingHistoryId: null,
  abortingSessionId: null,
  loadedHistoryIds: {},
  sessionMetaById: {},
  telemetryBySession: {},
  composerDraft: null,
  noticeBanner: null,
  streamingBySession: {},
  queuedMessagesBySession: {},
  messagesBySession: {},
  approvals: [],
  questions: [],
  subagentsBySession: {},
  errorBanner: null,
  settingsOpen: false,

  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setActiveView: (view) => set({ activeView: view }),
  openPluginPanel: (panelKey) => set({ activeView: 'plugin-panel', activePluginPanelKey: panelKey }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setInspectorOpen: (open) => set({ inspectorOpen: open }),
  setSelectedWorkspaceId: (id) => set({ selectedWorkspaceId: id }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setShowArchived: (show) => set({ showArchived: show }),
  clearError: () => set({ errorBanner: null }),
  clearNotice: () => set({ noticeBanner: null }),
  consumeComposerDraft: () => {
    const draft = get().composerDraft
    if (draft !== null) set({ composerDraft: null })
    return draft
  },

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
        if (bridgeCapabilities.pluginManager) {
          void get().fetchPlugins()
        }
        if (bridgeCapabilities.agentPresets) {
          void get().fetchAgentPresets()
        }
      },

      onHostInfo: (hostInfo) => {
        set({ hostInfo })
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
        const wasAborting = get().abortingSessionId === sessionId
        let nextToSend: QueuedMessage | null = null

        set((state) => {
          const nextStreaming = { ...state.streamingBySession }
          let nextQueued = state.queuedMessagesBySession
          if (status === 'idle') {
            delete nextStreaming[sessionId]
            const queue = state.queuedMessagesBySession[sessionId] ?? []
            if (!wasAborting && queue.length > 0) {
              nextToSend = queue[0]
              nextQueued = {
                ...state.queuedMessagesBySession,
                [sessionId]: queue.slice(1),
              }
            }
          }
          return {
            sessions: state.sessions.map((s) =>
              s.sessionId === sessionId ? { ...s, status, updatedAt: Date.now() } : s,
            ),
            streamingBySession: nextStreaming,
            queuedMessagesBySession: nextQueued,
            abortingSessionId:
              status === 'idle' && wasAborting ? null : state.abortingSessionId,
          }
        })

        if (nextToSend) {
          const item: QueuedMessage = nextToSend
          setTimeout(() => {
            void get().sendQuery(item.text, item.images, { forceImmediate: true })
          }, 0)
        }
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
            if (event.reason === 'blocked' || event.reason === 'error') {
              const reasonText =
                event.reason === 'blocked'
                  ? '本轮请求被插件或规则拦截（blocked），未触发模型调用'
                  : '本轮执行异常中断（error）'
              const noticeMsg: UiMessage = {
                id: `turn-end-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                role: 'system',
                blocks: [{ type: 'text', text: reasonText }],
                timestamp: Date.now(),
                isError: true,
              }
              return {
                streamingBySession: nextStreaming,
                messagesBySession: {
                  ...state.messagesBySession,
                  [event.sessionId]: [...(state.messagesBySession[event.sessionId] ?? []), noticeMsg],
                },
              }
            }
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
          set((state) => {
            const nextStreaming = { ...state.streamingBySession }
            delete nextStreaming[event.sessionId]
            return {
              streamingBySession: nextStreaming,
              messagesBySession: {
                ...state.messagesBySession,
                [event.sessionId]: [...(state.messagesBySession[event.sessionId] ?? []), errMsg],
              },
            }
          })
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

      onSessionTelemetry: ({ sessionId, telemetry }) => {
        set((state) => ({
          telemetryBySession: {
            ...state.telemetryBySession,
            [sessionId]: telemetry,
          },
        }))
      },

      onOpenDirectory: (path) => {
        if (path) {
          void get().createSession(path)
        }
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
        hostInfo: snapshot.hostInfo ?? null,
        workspaces: snapshot.workspaces ?? [],
        sessions: snapshot.sessions,
        activeSessionId: initialId,
      })
      if (caps.modelControl) {
        void get().fetchModels()
      }
      if (caps.pluginManager) {
        void get().fetchPlugins()
      }
      if (caps.agentPresets) {
        void get().fetchAgentPresets()
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

  setSessionPermission: async (mode) => {
    let sessionId = get().activeSessionId
    if (!sessionId) {
      const created = await get().createSession()
      if (!created) return
      sessionId = created.sessionId
    }
    try {
      const res = await api.setSessionPermission(sessionId, mode)
      set((state) => {
        const prev = state.telemetryBySession[sessionId!] ?? {
          uncachedInputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 0,
          contextWindow: null,
          surfaceTokens: null,
          systemTokens: null,
          toolsTokens: null,
          messageTokens: null,
          sandboxMode: null,
          approvalPolicy: null,
          turnCount: 0,
          snapshotCount: 0,
        }
        return {
          telemetryBySession: {
            ...state.telemetryBySession,
            [sessionId!]: {
              ...prev,
              sandboxMode: res.sandboxMode,
              approvalPolicy: res.approvalPolicy,
            },
          },
          errorBanner: null,
        }
      })
    } catch (error) {
      set({ errorBanner: `切换权限模式失败：${String(error)}` })
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
          telemetryBySession: detail.telemetry
            ? { ...s.telemetryBySession, [sessionId]: detail.telemetry }
            : s.telemetryBySession,
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
    set((state) => ({
      activeSessionId: sessionId,
      activeView:
        state.activeView === 'plugin-panel' || state.activeView === 'plugins'
          ? 'studio'
          : state.activeView,
    }))
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
        activeView:
          state.activeView === 'plugin-panel' || state.activeView === 'plugins'
            ? 'studio'
            : state.activeView,
        loadedHistoryIds: { ...state.loadedHistoryIds, [session.sessionId]: true },
        errorBanner: null,
      }))
      return session
    } catch (error) {
      set({ errorBanner: `创建会话失败：${String(error)}` })
      return null
    }
  },

  sendQuery: async (text, images = [], options) => {
    const trimmed = text.trim()
    if (!trimmed && images.length === 0) return

    let sessionId = get().activeSessionId
    if (!sessionId) {
      const created = await get().createSession()
      if (!created) return
      sessionId = created.sessionId
    }

    const activeSession = get().sessions.find((s) => s.sessionId === sessionId)
    if (!options?.forceImmediate && activeSession?.status === 'running') {
      const queued: QueuedMessage = {
        id: `queued-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text: trimmed,
        images,
        createdAt: Date.now(),
      }
      set((state) => ({
        queuedMessagesBySession: {
          ...state.queuedMessagesBySession,
          [sessionId!]: [...(state.queuedMessagesBySession[sessionId!] ?? []), queued],
        },
        errorBanner: null,
      }))
      return
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
              status: 'running',
              title: s.title === 'New session' && trimmed ? trimmed.slice(0, 32) : s.title,
              updatedAt: Date.now(),
            }
          : s,
      ),
      errorBanner: null,
    }))

    try {
      await api.sendQuery(sessionId, trimmed, images, localMsg.id)
    } catch (error) {
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.sessionId === sessionId ? { ...s, status: 'idle' } : s,
        ),
        errorBanner: `发送消息失败：${String(error)}`,
      }))
    }
  },

  rewindToMessage: async (messageId, restoreWorkspace, prefillText) => {
    const sessionId = get().activeSessionId
    if (!sessionId) return
    try {
      const result = await api.rewindSession(sessionId, messageId, restoreWorkspace)
      const prevMessages = get().messagesBySession[sessionId] ?? []
      const cutIdx = prevMessages.findIndex((m) => m.id === messageId)
      const keptMessages = cutIdx >= 0 ? prevMessages.slice(0, cutIdx) : []
      const newId = result.session.sessionId
      set((state) => ({
        sessions: [result.session, ...state.sessions],
        activeSessionId: newId,
        loadedHistoryIds: { ...state.loadedHistoryIds, [newId]: true },
        messagesBySession: { ...state.messagesBySession, [newId]: keptMessages },
        composerDraft: prefillText !== undefined ? prefillText : state.composerDraft,
        noticeBanner: result.workspaceNote,
        errorBanner: null,
      }))
    } catch (error) {
      set({ errorBanner: `回退会话失败：${String(error)}` })
    }
  },

  removeQueuedMessage: (sessionId, queuedId) => {
    set((state) => ({
      queuedMessagesBySession: {
        ...state.queuedMessagesBySession,
        [sessionId]: (state.queuedMessagesBySession[sessionId] ?? []).filter(
          (item) => item.id !== queuedId,
        ),
      },
    }))
  },

  editQueuedMessage: (sessionId, queuedId) => {
    const queue = get().queuedMessagesBySession[sessionId] ?? []
    const target = queue.find((item) => item.id === queuedId)
    if (!target) return
    set((state) => ({
      queuedMessagesBySession: {
        ...state.queuedMessagesBySession,
        [sessionId]: (state.queuedMessagesBySession[sessionId] ?? []).filter(
          (item) => item.id !== queuedId,
        ),
      },
      composerDraft: target.text,
    }))
  },

  flushQueuedMessage: async (sessionId, queuedId) => {
    const queue = get().queuedMessagesBySession[sessionId] ?? []
    const target = queue.find((item) => item.id === queuedId)
    if (!target) return
    set((state) => ({
      queuedMessagesBySession: {
        ...state.queuedMessagesBySession,
        [sessionId]: (state.queuedMessagesBySession[sessionId] ?? []).filter(
          (item) => item.id !== queuedId,
        ),
      },
      activeSessionId: sessionId,
    }))
    await get().sendQuery(target.text, target.images, { forceImmediate: true })
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
      set({ workerStatus, errorBanner: null, pluginRestartRequired: false })
    } catch (error) {
      set({ errorBanner: `重启后端失败：${String(error)}` })
    }
  },

  fetchAgentPresets: async () => {
    try {
      const catalog = await api.listAgentPresets()
      set({
        agentPresets: catalog.presets ?? [],
        defaultPresetId: catalog.defaultPresetId ?? null,
      })
    } catch {
      // Ignore if preset service is unavailable
    }
  },

  setDefaultAgentPreset: async (presetId) => {
    try {
      const nextDefault = await api.setDefaultAgentPreset(presetId)
      const presetName = get().agentPresets.find((p) => p.id === nextDefault)?.name ?? nextDefault
      set({
        defaultPresetId: nextDefault,
        noticeBanner: `已将默认模式设为：${presetName}`,
        errorBanner: null,
      })
    } catch (error) {
      set({ errorBanner: `设置默认模式失败：${String(error)}` })
    }
  },

  setSessionPreset: async (presetId) => {
    const activeId = get().activeSessionId
    const presetName = get().agentPresets.find((p) => p.id === presetId)?.name ?? presetId
    if (!activeId) {
      await get().setDefaultAgentPreset(presetId)
      return
    }
    try {
      const res = await api.setSessionPreset(activeId, presetId)
      set((state) => ({
        sessionPresetById: {
          ...state.sessionPresetById,
          [res.sessionId]: res.presetId,
        },
        noticeBanner: `当前会话已切换至模式：${presetName}`,
        errorBanner: null,
      }))
    } catch (error) {
      // DSH only allows switching preset before first turn; fallback to setting default for new sessions
      const msg = String(error)
      try {
        const nextDefault = await api.setDefaultAgentPreset(presetId)
        set({
          defaultPresetId: nextDefault,
          noticeBanner: `当前会话已开始无法中途切换模式，已将「${presetName}」设为新建会话的默认模式`,
          errorBanner: null,
        })
      } catch {
        set({ errorBanner: `切换模式失败：${msg}` })
      }
    }
  },

  forkSession: async (sessionId) => {
    try {
      const child = await api.forkSession(sessionId)
      set((state) => ({
        sessions: [child, ...state.sessions.filter((s) => s.sessionId !== child.sessionId)],
        activeSessionId: child.sessionId,
        activeView: 'studio',
        noticeBanner: `已分叉新会话：${child.title === 'New session' ? '新建会话' : child.title}`,
        errorBanner: null,
      }))
      await get().refreshSessions()
      await get().loadSessionHistory(child.sessionId, true)
      return child
    } catch (error) {
      set({ errorBanner: `分叉会话失败：${String(error)}` })
      return null
    }
  },

  updateSessionMeta: async (sessionId, meta) => {
    try {
      const updated = await api.updateSessionMeta(sessionId, meta)
      set((state) => ({
        sessions: state.sessions.map((s) => (s.sessionId === sessionId ? updated : s)),
        errorBanner: null,
      }))
      if (meta.archived !== undefined) {
        set({ noticeBanner: meta.archived ? '会话已归档' : '会话已取消归档' })
      } else if (meta.pinned !== undefined) {
        set({ noticeBanner: meta.pinned ? '会话已置顶' : '已取消置顶' })
      } else if (meta.title !== undefined) {
        set({ noticeBanner: '会话名称已更新' })
      }
    } catch (error) {
      set({ errorBanner: `更新会话属性失败：${String(error)}` })
    }
  },

  fetchPlugins: async () => {
    set({ pluginsLoading: true })
    try {
      const plugins = await api.listPlugins()
      set({ plugins, pluginsLoading: false })
    } catch (err) {
      set({ pluginsLoading: false, errorBanner: `获取插件列表失败：${String(err)}` })
    }
  },

  setPluginBundleEnabled: async (packageName, enabled) => {
    set({ pluginBusyKey: `bundle:${packageName}`, errorBanner: null })
    try {
      const res = (await api.setPluginBundleEnabled(packageName, enabled)) as
        | { restartRequired?: boolean }
        | null
      await get().fetchPlugins()
      const restartRequired = Boolean(res?.restartRequired)
      set({
        pluginBusyKey: null,
        pluginRestartRequired: get().pluginRestartRequired || restartRequired,
        noticeBanner: `插件 ${packageName} 已${enabled ? '启用' : '停用'}${restartRequired ? '（需重启后端生效）' : ''}`,
      })
    } catch (err) {
      set({ pluginBusyKey: null, errorBanner: `切换插件状态失败：${String(err)}` })
    }
  },

  setPluginEntryEnabled: async (entryId, moduleName, enabled) => {
    set({ pluginBusyKey: `entry:${entryId}`, errorBanner: null })
    try {
      const res = (await api.setPluginEntryEnabled(entryId, moduleName, enabled)) as
        | { restartRequired?: boolean }
        | null
      await get().fetchPlugins()
      const restartRequired = Boolean(res?.restartRequired)
      set({
        pluginBusyKey: null,
        pluginRestartRequired: get().pluginRestartRequired || restartRequired,
        noticeBanner: `插件子模块已${enabled ? '启用' : '停用'}${restartRequired ? '（需重启后端生效）' : ''}`,
      })
    } catch (err) {
      set({ pluginBusyKey: null, errorBanner: `切换插件子模块失败：${String(err)}` })
    }
  },

  installPluginBundle: async (spec) => {
    const trimmed = spec.trim()
    if (!trimmed) return false
    set({ pluginBusyKey: 'install', errorBanner: null })
    try {
      const res = (await api.installPluginBundle(trimmed)) as
        | { restartRequired?: boolean }
        | null
      await get().fetchPlugins()
      const restartRequired = Boolean(res?.restartRequired)
      set({
        pluginBusyKey: null,
        pluginRestartRequired: get().pluginRestartRequired || restartRequired,
        noticeBanner: `已安装插件：${trimmed}${restartRequired ? '（建议重启后端以完整加载）' : ''}`,
      })
      return true
    } catch (err) {
      set({ pluginBusyKey: null, errorBanner: `安装插件失败：${String(err)}` })
      return false
    }
  },

  removePluginBundle: async (packageName) => {
    set({ pluginBusyKey: `remove:${packageName}`, errorBanner: null })
    try {
      const res = (await api.removePluginBundle(packageName)) as
        | { restartRequired?: boolean }
        | null
      await get().fetchPlugins()
      const restartRequired = Boolean(res?.restartRequired)
      set({
        pluginBusyKey: null,
        pluginRestartRequired: get().pluginRestartRequired || restartRequired,
        noticeBanner: `已卸载插件：${packageName}${restartRequired ? '（建议重启后端生效）' : ''}`,
      })
    } catch (err) {
      set({ pluginBusyKey: null, errorBanner: `卸载插件失败：${String(err)}` })
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
