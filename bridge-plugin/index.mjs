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

export function apply(ctx, config) {
  const rootFiber = ctx.root.fiber
  const transport = new JsonRpcLineTransport(config.input ?? process.stdin, config.output ?? process.stdout)
  const server = new HarnessSdkJsonRpcServer(ctx, transport, {
    maxTokensAsSuccess: config.maxTokensAsSuccess,
  })
  ctx.provide('sdkSessionActivation', { ready: true })

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
        return { streamDelta: true, abort: true, modelControl: true }
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
