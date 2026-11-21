import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// Resolve from the running DSH entry point, including global npm bin symlinks.
const requireFromDsh = createRequire(realpathSync(process.argv[1]))
const [sdk, protocol] = await Promise.all([
  '@deepseek-ai/dsh-sdk-jsonrpc-server',
  '@deepseek-ai/dsh-sdk-protocol',
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

function pluginManagerOf(ctx) {
  const manager = ctx.get('pluginManager')
  if (manager === undefined) throw new Error('plugin manager is unavailable in this profile')
  return manager
}

export function apply(ctx, config) {
  const rootFiber = ctx.root.fiber
  const transport = new JsonRpcLineTransport(config.input ?? process.stdin, config.output ?? process.stdout)
  const server = new HarnessSdkJsonRpcServer(ctx, transport, {
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
        }
      case 'desktop/host/info': {
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
          source: bundle.source ?? null,
          error: bundle.error ?? null,
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
