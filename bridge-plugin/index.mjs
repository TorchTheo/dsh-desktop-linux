import { setTimeout as delay } from 'node:timers/promises'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// Resolve from the running DSH entry point, including global npm bin symlinks.
const requireFromDsh = createRequire(realpathSync(process.argv[1]))
const [sdk, protocol, agentModule] = await Promise.all([
  '@deepseek-ai/dsh-sdk-jsonrpc-server',
  '@deepseek-ai/dsh-sdk-protocol',
  '@deepseek-ai/dsh-agent',
].map(specifier => import(pathToFileURL(requireFromDsh.resolve(specifier)).href)))

const { HarnessSdkJsonRpcServer } = sdk
const { JsonRpcLineTransport } = protocol

export const name = 'desktop-sdk-jsonrpc-server'
export const inject = [...sdk.inject, 'llm']
export const Config = sdk.Config

function requiredString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${field} requires a non-empty string`)
  }
  return value
}

function requiredBoolean(value, field) {
  if (typeof value !== 'boolean') throw new TypeError(`${field} requires a boolean`)
  return value
}

async function hostInfo(ctx) {
  await ctx.get('loader')?.await()
  const webServer = ctx.get('webServer')
  const webOrigin = webServer?.getOrigin() ?? null
  const appUrl = ctx.get('webApp')?.getAdvertisedUrl() ?? webOrigin
  return {
    webOrigin,
    authenticatedUrl: appUrl === null ? null : ctx.get('connection')?.authenticatedUrl(appUrl) ?? null,
    profile: ctx.get('profileContext')?.name ?? null,
    hasWebServer: webServer !== undefined,
    hasPluginManager: ctx.get('pluginManager') !== undefined,
  }
}

async function checkpointSession(ctx, session) {
  const cache = ctx.get('sessionProjectionCache')
  if (cache) await cache.write(session)
  else await requireService(ctx, 'sessions').flush(session)
}

function sameOriginUrl(path, origin, base = origin) {
  const url = new URL(path, base)
  if (url.origin !== origin || url.username || url.password) {
    throw new Error('Host HTTP proxy requires a URL on the local web origin')
  }
  return url
}

async function fetchHost(url, origin, method, headers, body) {
  for (let redirects = 0; ; redirects++) {
    const response = await fetch(url, { method, headers, body, redirect: 'manual' })
    const location = response.headers.get('location')
    if (location === null || ![301, 302, 303, 307, 308].includes(response.status)) return response

    await response.body?.cancel()
    if (redirects === 20) throw new Error('Host HTTP proxy exceeded the redirect limit')
    url = sameOriginUrl(location, origin, url)
    if (([301, 302].includes(response.status) && method === 'POST') ||
        (response.status === 303 && method !== 'GET' && method !== 'HEAD')) {
      method = 'GET'
      body = undefined
      for (const name of ['content-encoding', 'content-language', 'content-location', 'content-type']) {
        headers.delete(name)
      }
    }
  }
}

function requireService(ctx, name) {
  const service = ctx.get(name)
  if (service === undefined) throw new Error(`${name} is unavailable in this profile`)
  return service
}

function pluginManagerOf(ctx) {
  const manager = ctx.get('pluginManager')
  if (manager === undefined) throw new Error('plugin manager is unavailable in this profile')
  return manager
}

function normalizeBundleError(value) {
  if (value == null) return null
  if (typeof value === 'string') return value
  if (typeof value.message === 'string') {
    return typeof value.code === 'string' ? `${value.code}: ${value.message}` : value.message
  }
  if (typeof value.code === 'string') return value.code
  return JSON.stringify(value)
}

function normalizeBundleSource(value) {
  if (value == null) return null
  if (typeof value === 'string') return value
  for (const key of ['spec', 'url', 'path', 'type']) {
    if (typeof value[key] === 'string') return value[key]
  }
  return JSON.stringify(value)
}

class DesktopSdkServer extends HarnessSdkJsonRpcServer {
  constructor(ctx, transport, options) {
    // Register the SDK handlers ahead of Web remotes while keeping the SDK's
    // ownership checks, reply validation, and listener disposers.
    const sdkContext = ctx.extend({
      on(event, listener, options) {
        if (event === 'user-questions/request' || event === 'approval/request') {
          return ctx.on(event, listener, { ...options, prepend: true })
        }
        return ctx.on(event, listener, options)
      },
    })
    super(sdkContext, transport, options)
  }

  // The SDK's stock create/resume path has no preset composition callback.
  async createSession(sessionId, resume) {
    const live = resume ? this.ctx.agents.get(sessionId) : undefined
    const presets = this.ctx.get('agentPresets')
    if (!live && !presets) return super.createSession(sessionId, resume)

    const agentOptions = {
      provider: this.provider,
      model: this.model,
      reasoningEffort: this.reasoningEffort,
      maxTokens: this.maxTokens,
    }
    const selectModel = agent => {
      const previous = agent.model.current()
      const reasoningEffort = agentOptions.reasoningEffort ??
        (previous?.provider === agentOptions.provider && previous.model === agentOptions.model
          ? previous.reasoningEffort : undefined)
      agent.model.select({ ...agentOptions, reasoningEffort })
    }

    let handle
    if (live) {
      if (live.session.header.origin === 'subagent') {
        throw new Error(`subagent session "${sessionId}" cannot be resumed directly; resume its root session instead`)
      }
      selectModel(live)
      // The Web controller owns this Agent's lifecycle.
      handle = { agent: live, dispose: async () => {} }
    } else if (resume) {
      if ((await requireService(this.ctx, 'sessionPersistence').stat(sessionId))?.header.origin === 'subagent') {
        throw new Error(`subagent session "${sessionId}" cannot be resumed directly; resume its root session instead`)
      }
      handle = await this.ctx.agents.resume({
        resumeSessionId: sessionId,
        agentOptions,
        setup: async (agentCtx, agent) => {
          agentModule.installModelSelection(agentCtx)
          await presets.mount(agentCtx, presets.presetForSession(agent.session) ?? undefined)
          selectModel(agent)
        },
      })
    } else {
      const { id } = await presets.resolve()
      handle = await this.ctx.agents.create({
        sessionId,
        meta: { cwd: this.cwd, agentPreset: id },
        agentOptions,
        setup: async agentCtx => {
          agentModule.installModelSelection(agentCtx)
          await presets.mount(agentCtx, id)
        },
      })
    }
    const record = { handle, failure: undefined }
    this.sessions.set(sessionId, record)
    return record
  }
}

export function apply(ctx, config) {
  const rootFiber = ctx.root.fiber
  const transport = new JsonRpcLineTransport(config.input ?? process.stdin, config.output ?? process.stdout)
  const server = new DesktopSdkServer(ctx, transport, {
    maxTokensAsSuccess: config.maxTokensAsSuccess,
  })
  ctx.provide('sdkSessionActivation', { ready: true })

  ctx.on('webserver/index-inject', table => {
    table.push({
      kind: 'script',
      placement: 'head',
      text: `(() => {
  const requestedTheme = new URL(location.href).searchParams.get('desktopTheme')
  let active = requestedTheme === 'bauhaus'
  try {
    if (active) sessionStorage.setItem('dshDesktopTheme', 'bauhaus')
    else if (requestedTheme === null) active = sessionStorage.getItem('dshDesktopTheme') === 'bauhaus'
  } catch {
    // The explicit URL opt-in still works when storage is unavailable.
  }
  if (!active && requestedTheme === null) {
    try {
      active = window.self !== window.top
    } catch {
      // Leave the theme unchanged if the frame context cannot be read.
    }
  }
  if (active) document.documentElement.dataset.dshDesktopTheme = 'bauhaus'
})()`,
    }, {
      kind: 'style',
      text: `
html[data-dsh-desktop-theme='bauhaus'],
:root[data-dsh-desktop-theme='bauhaus'] {
  color-scheme: light;
  --dsw-alias-bg-base: #F4F3EE;
  --dsw-alias-bg-layer-1: #FAF9F5;
  --dsw-alias-bg-layer-2: #ECEAE2;
  --dsw-alias-label-primary: #141413;
  --dsw-alias-label-secondary: #575652;
  --dsw-alias-label-tertiary: #8A8880;
  --dsw-alias-border-l2: #C2BEB2;
  --dsw-alias-border-l3: #D8D5CB;
  --dsw-alias-state-business-primary: #D13B27;
  --dsw-alias-state-success-primary: #246A4D;
  --dsw-alias-state-warning-primary: #C4881C;
  --dsw-alias-state-info-primary: #1E4D9B;
  --dsw-alias-interactive-bg-hover: #ECEAE2;
  --dsw-radius-md: 6px;
}`,
    })
  })

  const streamedBlocks = new WeakMap()
  ctx.on('agent/assistant-stream', ({ agent, frame }) => {
    if (frame.type === 'start') {
      streamedBlocks.set(agent, new Set())
      return
    }
    if (frame.type === 'end') {
      streamedBlocks.delete(agent)
      return
    }

    const { chunk } = frame
    const blocks = streamedBlocks.get(agent)
    if (!blocks || (chunk.type !== 'text-delta' && chunk.type !== 'reasoning-delta') || !chunk.text) return

    const blockType = chunk.type === 'text-delta' ? 'text' : 'thinking'
    const reset = !blocks.has(blockType)
    blocks.add(blockType)
    transport.notify('desktop.stream.delta', {
      sessionId: agent.id,
      blockType,
      delta: chunk.text,
      ...(reset ? { reset: true } : {}),
    })
  })

  const exit = config.exit ?? (code => process.exit(code))
  let exitTask
  function disposeAndExit() {
    exitTask ??= (async () => {
      await Promise.allSettled([Promise.resolve().then(() => transport.flush())])
      await Promise.allSettled([Promise.resolve().then(() => rootFiber.dispose())])
      exit(0)
    })()
  }

  let session
  function sessionFor(url) {
    if (session?.url !== url) {
      session = {
        url,
        cookie: (async () => {
          const response = await fetch(url, { redirect: 'manual' })
          const cookies = response.headers.getSetCookie()
          await response.body?.cancel()
          if (cookies.length === 0) throw new Error('Local Host did not issue a session cookie')
          return cookies.map(cookie => cookie.split(';', 1)[0]).join('; ')
        })(),
      }
    }
    return session
  }

  async function proxyHostHttp(params) {
    const path = requiredString(params?.path, 'path')
    if (!path.startsWith('/') || path.startsWith('//')) {
      throw new TypeError('path requires a leading slash on the local web origin')
    }

    const { webOrigin, authenticatedUrl } = await hostInfo(ctx)
    if (!webOrigin || !authenticatedUrl) throw new Error('Local Host HTTP authentication is unavailable')
    const origin = new URL(webOrigin)
    if (!['http:', 'https:'].includes(origin.protocol) ||
        !/^(?:127(?:\.\d{1,3}){3}|\[::1\])$/.test(origin.hostname)) {
      throw new Error('Host HTTP proxy requires a loopback web origin')
    }
    const url = sameOriginUrl(path, origin.origin)
    const authUrl = sameOriginUrl(authenticatedUrl, origin.origin).href
    const method = params.method?.toUpperCase() ?? 'GET'
    const headers = new Headers(params.headers ?? {})
    for (const name of [
      ...headers.get('connection')?.split(',').map(value => value.trim()).filter(Boolean) ?? [],
      'host', 'content-length', 'connection', 'keep-alive', 'proxy-authenticate',
      'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade',
    ]) headers.delete(name)
    const body = params.bodyBase64 == null ? undefined : Buffer.from(params.bodyBase64, 'base64')

    async function send(currentSession) {
      let cookie
      try {
        cookie = await currentSession.cookie
      } catch (error) {
        if (session === currentSession) session = undefined
        throw error
      }
      const requestHeaders = new Headers(headers)
      requestHeaders.set('cookie', cookie)
      return fetchHost(url, origin.origin, method, requestHeaders, body)
    }

    const currentSession = sessionFor(authUrl)
    let response = await send(currentSession)
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel()
      if (session === currentSession) session = undefined
      response = await send(sessionFor(authUrl))
    }
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      bodyBase64: Buffer.from(await response.arrayBuffer()).toString('base64'),
    }
  }

  transport.onRequest(async (method, params) => {
    switch (method) {
      case 'desktop/capabilities':
        await ctx.get('loader')?.await()
        return {
          streamDelta: true,
          abort: true,
          modelControl: true,
          hostInfo: ctx.get('webServer') !== undefined,
          pluginManager: ctx.get('pluginManager') !== undefined,
          clientPlugins: true,
          hostHttpProxy: true,
          agentPresets: true,
          sessionActions: true,
          interruptAndSend: true,
          sessionJobs: true,
        }
      case 'desktop/host/info':
        return hostInfo(ctx)
      case 'desktop/client-plugins/list': {
        await ctx.get('loader')?.await()
        const entries = ctx.get('clientModules')?.graph().entries ?? []
        const plugins = new Map()
        for (const { id, url } of entries) {
          if (!id.startsWith('@deepseek-ai/') && !plugins.has(id)) {
            plugins.set(id, { id, packageName: id, bundlePath: `/${url}` })
          }
        }
        return [...plugins.values()]
      }
      case 'desktop/host/http':
        return proxyHostHttp(params)
      case 'desktop/plugins/list': {
        const bundles = await pluginManagerOf(ctx).listBundles()
        return bundles.map(bundle => ({
          name: bundle.name,
          enabled: bundle.enabled,
          installed: bundle.installed,
          removable: bundle.removable,
          availability: bundle.availability,
          description: bundle.description ?? null,
          version: bundle.version ?? null,
          source: normalizeBundleSource(bundle.source),
          error: normalizeBundleError(bundle.error),
          entries: bundle.rows.map(({ rowId, moduleName, entryId }) => ({
            rowId, moduleName, entryId: entryId ?? null,
          })),
        }))
      }
      case 'desktop/plugins/set-bundle-enabled':
        return pluginManagerOf(ctx).setBundleEnabled(
          requiredString(params?.packageName, 'packageName'),
          requiredBoolean(params?.enabled, 'enabled'),
        )
      case 'desktop/plugins/set-entry-enabled': {
        const entryId = requiredString(params?.entryId, 'entryId')
        const enabled = requiredBoolean(params?.enabled, 'enabled')
        const manager = pluginManagerOf(ctx)
        if (params.moduleName !== undefined) {
          const moduleName = requiredString(params.moduleName, 'moduleName')
          const entry = (await manager.listPlugins()).find(entry => entry.entryId === entryId)
          if (entry?.moduleName !== moduleName) throw new Error('moduleName does not match the plugin entry')
        }
        return manager.setPluginEnabled(entryId, enabled)
      }
      case 'desktop/plugins/install':
        return pluginManagerOf(ctx).installBundle(requiredString(params?.spec, 'spec'))
      case 'desktop/plugins/remove':
        return pluginManagerOf(ctx).removeBundle(requiredString(params?.packageName, 'packageName'))
      case 'desktop/presets/list': {
        await ctx.get('loader')?.await()
        const registry = ctx.get('agentPresets')
        return {
          defaultPresetId: registry?.defaultId ?? null,
          presets: (await registry?.list() ?? []).map(({ id, name, description }) => ({
            id, name: name ?? id, description: description ?? null,
          })),
        }
      }
      case 'desktop/presets/set-default': {
        await ctx.get('loader')?.await()
        const presetId = requiredString(params?.presetId, 'presetId')
        const preset = await requireService(ctx, 'agentPresets').resolve(presetId)
        if (preset.broken !== undefined) throw new Error(preset.broken)
        await requireService(ctx, 'settings').update('agent-preset-registry', { selectedDefault: presetId })
        return { defaultPresetId: presetId }
      }
      case 'desktop/session/set-preset': {
        const sessionId = requiredString(params?.sessionId, 'sessionId')
        const presetId = requiredString(params?.presetId, 'presetId')
        const agent = ctx.agents.get(sessionId)
        if (!agent) throw new Error(`no live agent for session ${sessionId}`)
        const selected = await requireService(ctx, 'agentPresets').select(agent, presetId)
        await checkpointSession(ctx, agent.session)
        return { sessionId, presetId: selected }
      }
      case 'desktop/session/fork': {
        const sourceId = requiredString(params?.sessionId, 'sessionId')
        const { sessionId } = await requireService(ctx, 'sessionController').fork({ sessionId: sourceId })
        const session = requireService(ctx, 'sessions').get(sessionId)
        await checkpointSession(ctx, session)
        return {
          sessionId,
          title: ctx.get('sessionTitle')?.get(session)?.title ?? 'Untitled session',
          cwd: ctx.workingDirectory.get(session),
        }
      }
      case 'desktop/session/update-meta': {
        const sessionId = requiredString(params?.sessionId, 'sessionId')
        const { title, pinned, archived } = params
        if (title !== undefined) requiredString(title, 'title')
        if (pinned !== undefined) requiredBoolean(pinned, 'pinned')
        if (archived !== undefined) requiredBoolean(archived, 'archived')
        const workspace = requireService(ctx, 'workspaceRegistry')
        if (pinned === true && (archived ?? workspace.archivedSessionIds.includes(sessionId))) {
          throw new Error('An archived session cannot be pinned')
        }
        const result = { sessionId }
        if (title !== undefined) {
          const renamed = await requireService(ctx, 'sessionController').rename({ sessionId, title })
          await checkpointSession(ctx, requireService(ctx, 'sessions').get(sessionId))
          result.title = renamed.title
        }
        if (archived === true) await workspace.archiveSession(sessionId)
        if (archived === false) await workspace.unarchiveSession(sessionId)
        if (pinned === true) await workspace.pinSession(sessionId)
        if (pinned === false) await workspace.unpinSession(sessionId)
        if (archived !== undefined) result.archived = workspace.archivedSessionIds.includes(sessionId)
        if (pinned !== undefined || archived === true) result.pinned = workspace.pinnedSessionIds.includes(sessionId)
        return result
      }
      case 'desktop/session/interrupt-and-send': {
        const sessionId = requiredString(params?.sessionId, 'sessionId')
        const { contentBlocks } = params
        if (!Array.isArray(contentBlocks)) throw new TypeError('contentBlocks requires an array')
        const agent = ctx.agents.get(sessionId)
        if (agent?.status === 'running') {
          agent.cancel({ kind: 'user' })
          const deadline = performance.now() + 3000
          while (agent.status === 'running' && performance.now() < deadline) {
            await delay(25)
          }
          if (agent.status === 'running') throw new Error('Timed out waiting for the current turn to stop')
        }
        const { messageId } = await server.handleRequest('session/query', { sessionId, contentBlocks })
        return { messageId }
      }
      case 'desktop/session/jobs/list': {
        const sessionId = requiredString(params?.sessionId, 'sessionId')
        return requireService(ctx, 'jobs').list(sessionId)
          .filter(job => job.owner === sessionId && !['completed', 'killed', 'failed'].includes(job.status))
          .map(({ id, kind, label, status, startedAt }) => ({
            jobId: id, kind, label, status, startedAt: startedAt ?? null,
          }))
      }
      case 'desktop/session/jobs/kill': {
        const sessionId = requiredString(params?.sessionId, 'sessionId')
        const jobId = requiredString(params?.jobId, 'jobId')
        const jobs = requireService(ctx, 'jobs')
        const running = jobs.list(sessionId).some(job =>
          job.id === jobId && job.owner === sessionId && job.status === 'running')
        return { killed: running && jobs.kill(jobId, sessionId) === 'requested' }
      }
      case 'desktop/session/abort': {
        const agent = ctx.agents.get(requiredString(params?.sessionId, 'sessionId'))
        if (agent?.status !== 'running') return { aborted: false }
        agent.cancel({ kind: 'user' })
        return { aborted: true }
      }
      case 'desktop/models/list': {
        // The catalog is also used to choose a route before initialize.
        await ctx.get('loader')?.await()
        const providers = await Promise.all(ctx.llm.listProviders().map(async ({ id, name }) => ({
          id,
          name,
          models: (await ctx.llm.listModels(id)).map(({ id, name, description }) => ({ id, name, description })),
        })))
        return { providers }
      }
      case 'desktop/session/set-permission': {
        const sessionId = requiredString(params?.sessionId, 'sessionId')
        const mode = params.mode
        if (mode !== 'read-only' && mode !== 'workspace-write' && mode !== 'danger-full-access') {
          throw new TypeError('mode must be read-only, workspace-write, or danger-full-access')
        }
        const agent = ctx.agents.get(sessionId)
        if (!agent) throw new Error(`no live agent for session ${sessionId}`)
        const session = agent.session
        if (!session) throw new Error(`no live session for agent ${sessionId}`)

        const approvalPolicy = mode === 'danger-full-access' ? 'never' : 'ask'
        session.append('sandbox/mode', { mode })
        session.append('approval/policy', { policy: approvalPolicy })
        return { sandboxMode: mode, approvalPolicy }
      }
      case 'desktop/session/set-model': {
        const sessionId = requiredString(params?.sessionId, 'sessionId')
        const provider = requiredString(params.provider, 'provider')
        const model = requiredString(params.model, 'model')
        const reasoningEffort = params.reasoningEffort == null
          ? undefined
          : requiredString(params.reasoningEffort, 'reasoningEffort')
        const agent = ctx.agents.get(sessionId)
        if (!agent) throw new Error(`no live agent for session ${sessionId}`)
        agent.model.select({ provider, model, reasoningEffort })
        return { provider, model, reasoningEffort: reasoningEffort ?? null }
      }
      default: {
        if (method === 'initialize') await ctx.get('loader')?.await()
        const result = await server.handleRequest(method, params)
        // Let the transport write the response before flushing and disposing.
        if (method === 'shutdown') setImmediate(disposeAndExit)
        return result
      }
    }
  })

  ctx.effect(() => {
    transport.start()
    return async () => {
      await server.shutdown()
      transport.close()
    }
  }, 'jsonrpc.serve')
}
