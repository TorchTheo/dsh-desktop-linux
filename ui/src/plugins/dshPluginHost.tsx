import React, { Component, useEffect, useSyncExternalStore } from 'react'
import ReactDOM from 'react-dom'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import * as api from '../api/tauri'
import { useAppStore } from '../store/useAppStore'

export interface SlotRegistration {
  uid: string
  name: string
  id?: string
  key?: string
  order: number
  label?: string
  inject?: (...args: unknown[]) => Record<string, unknown>
  Component: React.ComponentType<Record<string, unknown>>
}

type Listener = () => void

class SlotRegistry {
  private entries = new Map<string, SlotRegistration>()
  private listeners = new Set<Listener>()
  private version = 0
  private seq = 0

  register(
    descriptor: {
      name: string
      id?: string
      key?: string
      order?: number
      label?: string
      inject?: (...args: unknown[]) => Record<string, unknown>
    },
    Comp: React.ComponentType<Record<string, unknown>>,
  ): () => void {
    const uid = `slot-${++this.seq}-${descriptor.name}-${descriptor.id ?? descriptor.key ?? 'anon'}`
    const reg: SlotRegistration = {
      uid,
      name: descriptor.name,
      id: descriptor.id,
      key: descriptor.key,
      order: typeof descriptor.order === 'number' ? descriptor.order : 100,
      label: descriptor.label,
      inject: descriptor.inject,
      Component: Comp,
    }
    this.entries.set(uid, reg)
    this.emit()
    return () => {
      if (this.entries.delete(uid)) {
        this.emit()
      }
    }
  }

  clear() {
    if (this.entries.size > 0) {
      this.entries.clear()
      this.emit()
    }
  }

  getByName(name: string, key?: string): SlotRegistration[] {
    const list: SlotRegistration[] = []
    for (const reg of this.entries.values()) {
      if (reg.name !== name) continue
      if (key !== undefined && reg.key !== key && reg.id !== key) continue
      list.push(reg)
    }
    list.sort((a, b) => a.order - b.order)
    return list
  }

  getVersion() {
    return this.version
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit() {
    this.version += 1
    for (const listener of this.listeners) {
      listener()
    }
  }
}

export const slotRegistry = new SlotRegistry()

export function useDshSlots(name: string, key?: string): SlotRegistration[] {
  const version = useSyncExternalStore(
    (cb) => slotRegistry.subscribe(cb),
    () => slotRegistry.getVersion(),
    () => 0,
  )
  return React.useMemo(() => slotRegistry.getByName(name, key), [name, key, version])
}

interface ErrorBoundaryProps {
  label: string
  children: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  message: string
}

class PluginSlotErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    }
  }

  componentDidCatch(error: unknown) {
    console.warn(`[DSH Plugin Slot Error] ${this.props.label}:`, error)
  }

  render() {
    if (this.state.hasError) {
      return null
    }
    return this.props.children
  }
}

export function DshSlot({
  name,
  slotKey,
  injectArgs = [],
  extraProps,
  className,
}: {
  name: string
  slotKey?: string
  injectArgs?: unknown[]
  extraProps?: Record<string, unknown>
  className?: string
}) {
  const entries = useDshSlots(name, slotKey)
  if (entries.length === 0) return null

  const nodes = entries.map((entry) => {
    let injected: Record<string, unknown> = {}
    if (typeof entry.inject === 'function') {
      try {
        injected = entry.inject(...injectArgs) ?? {}
      } catch (err) {
        console.warn(`[DSH Plugin Slot inject error] ${name}/${entry.id ?? entry.key}:`, err)
      }
    }
    const mergedProps = { ...injected, ...(extraProps ?? {}) }
    const Comp = entry.Component
    return (
      <PluginSlotErrorBoundary key={entry.uid} label={`${name}:${entry.id ?? entry.key ?? entry.uid}`}>
        <Comp {...mergedProps} />
      </PluginSlotErrorBoundary>
    )
  })

  if (className) {
    return <div className={className}>{nodes}</div>
  }
  return <>{nodes}</>
}

// ---------------------------------------------------------------------------
// Base64 & Loopback Host Fetch Proxy
// ---------------------------------------------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  if (!b64) return new Uint8Array(0)
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

const APP_ASSET_PREFIXES = [
  '/src/',
  '/@vite/',
  '/@fs/',
  '/@id/',
  '/@react-refresh',
  '/node_modules/',
  '/assets/',
  '/favicon',
  '/index.html',
]

function extractProxyPath(input: RequestInfo | URL): string | null {
  let rawUrl = ''
  if (typeof input === 'string') {
    rawUrl = input
  } else if (input instanceof URL) {
    rawUrl = input.href
  } else if (typeof Request !== 'undefined' && input instanceof Request) {
    rawUrl = input.url
  } else {
    return null
  }

  let pathnameAndSearch: string | null = null
  if (rawUrl.startsWith('/') && !rawUrl.startsWith('//')) {
    pathnameAndSearch = rawUrl
  } else {
    try {
      const parsed = new URL(rawUrl, window.location.origin)
      if (parsed.origin === window.location.origin) {
        pathnameAndSearch = `${parsed.pathname}${parsed.search}`
      }
    } catch {
      return null
    }
  }

  if (!pathnameAndSearch) return null
  if (pathnameAndSearch === '/') return null
  for (const prefix of APP_ASSET_PREFIXES) {
    if (pathnameAndSearch.startsWith(prefix)) return null
  }
  return pathnameAndSearch
}

async function encodeBodyToBase64(
  body: BodyInit | null | undefined,
): Promise<{ bodyBase64: string | null; contentType?: string }> {
  if (body == null) return { bodyBase64: null }
  if (typeof body === 'string') {
    return { bodyBase64: bytesToBase64(new TextEncoder().encode(body)) }
  }
  if (body instanceof URLSearchParams) {
    return {
      bodyBase64: bytesToBase64(new TextEncoder().encode(body.toString())),
      contentType: 'application/x-www-form-urlencoded;charset=UTF-8',
    }
  }
  if (body instanceof Uint8Array) {
    return { bodyBase64: bytesToBase64(body) }
  }
  if (body instanceof ArrayBuffer) {
    return { bodyBase64: bytesToBase64(new Uint8Array(body)) }
  }
  if (ArrayBuffer.isView(body)) {
    return {
      bodyBase64: bytesToBase64(new Uint8Array(body.buffer, body.byteOffset, body.byteLength)),
    }
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    const buf = new Uint8Array(await body.arrayBuffer())
    return { bodyBase64: bytesToBase64(buf), contentType: body.type || undefined }
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const tempRes = new Response(body)
    const contentType = tempRes.headers.get('content-type') ?? undefined
    const buf = new Uint8Array(await tempRes.arrayBuffer())
    return { bodyBase64: bytesToBase64(buf), contentType }
  }
  return { bodyBase64: bytesToBase64(new TextEncoder().encode(String(body))) }
}

let fetchProxyInstalled = false
let hostProxyEnabled = false

function ensureFetchProxyInstalled() {
  if (fetchProxyInstalled || typeof window === 'undefined' || !api.isTauriRuntime()) return
  fetchProxyInstalled = true
  const nativeFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!hostProxyEnabled) {
      return nativeFetch(input, init)
    }
    const proxyPath = extractProxyPath(input)
    if (!proxyPath) {
      return nativeFetch(input, init)
    }

    const reqObj = typeof Request !== 'undefined' && input instanceof Request ? input : null
    const method = (init?.method ?? reqObj?.method ?? 'GET').toUpperCase()
    const mergedHeaders = new Headers(reqObj?.headers)
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => {
        mergedHeaders.set(key, value)
      })
    }

    let encoded: { bodyBase64: string | null; contentType?: string } = { bodyBase64: null }
    if (init?.body !== undefined) {
      encoded = await encodeBodyToBase64(init.body)
    } else if (reqObj && method !== 'GET' && method !== 'HEAD') {
      const buf = new Uint8Array(await reqObj.clone().arrayBuffer())
      encoded = { bodyBase64: buf.length > 0 ? bytesToBase64(buf) : null }
    }

    if (encoded.contentType && !mergedHeaders.has('content-type')) {
      mergedHeaders.set('content-type', encoded.contentType)
    }

    const headersRecord: Record<string, string> = {}
    mergedHeaders.forEach((value, key) => {
      headersRecord[key] = value
    })

    const proxied = await api.proxyHostHttp(method, proxyPath, headersRecord, encoded.bodyBase64)
    const respHeaders = new Headers()
    for (const [k, v] of Object.entries(proxied.headers ?? {})) {
      // Skip hop-by-hop / encoding headers already decoded by Node fetch
      const lower = k.toLowerCase()
      if (lower === 'content-encoding' || lower === 'transfer-encoding' || lower === 'content-length') {
        continue
      }
      try {
        respHeaders.set(k, v)
      } catch {
        // Ignore restricted headers
      }
    }

    const nullBodyStatus = proxied.status === 204 || proxied.status === 205 || proxied.status === 304
    const bodyBytes = nullBodyStatus ? null : base64ToBytes(proxied.bodyBase64)
    return new Response(bodyBytes as BodyInit | null, {
      status: proxied.status,
      headers: respHeaders,
    })
  }
}

// ---------------------------------------------------------------------------
// Minimal Cordis Client Module Loader & Context Shim
// ---------------------------------------------------------------------------

type ModuleFactory = (
  requireFn: (specifier: string) => unknown,
  moduleObj: { exports: Record<string, unknown> },
  exportsObj: Record<string, unknown>,
) => unknown

interface LoaderState {
  factories: Map<string, ModuleFactory>
  cache: Map<string, unknown>
  recentlyLoaded: string[]
}

const loaderState: LoaderState = {
  factories: new Map(),
  cache: new Map(),
  recentlyLoaded: [],
}

const SEED_MODULES: Record<string, unknown> = {
  react: React,
  'react-dom': ReactDOM,
  'react/jsx-runtime': ReactJsxRuntime,
  'react/jsx-dev-runtime': ReactJsxRuntime,
}

function materializeModule(id: string): unknown {
  if (id in SEED_MODULES) return SEED_MODULES[id]
  if (loaderState.cache.has(id)) return loaderState.cache.get(id)

  const factory = loaderState.factories.get(id)
  if (!factory) {
    throw new Error(`[DSH Plugin Host] Cannot resolve module "${id}"`)
  }
  const moduleObj: { exports: Record<string, unknown> } = { exports: {} }
  loaderState.cache.set(id, moduleObj.exports)
  const result = factory(materializeModule, moduleObj, moduleObj.exports)
  const finalExports = result !== undefined ? result : moduleObj.exports
  loaderState.cache.set(id, finalExports)
  return finalExports
}

function ensureModuleLoaderInstalled() {
  const win = window as unknown as Record<string, unknown>
  win.__ModuleLoader__ = {
    mode: 'ready',
    load(entry: { id: string; factory: ModuleFactory }) {
      if (entry && typeof entry.id === 'string' && typeof entry.factory === 'function') {
        loaderState.factories.set(entry.id, entry.factory)
        loaderState.recentlyLoaded.push(entry.id)
      }
    },
  }
}

function createLocaleService() {
  const dicts = new Map<string, Record<string, Record<string, string>>>()

  function resolveKey(
    dict: Record<string, unknown> | undefined,
    key: string,
  ): string | undefined {
    if (!dict) return undefined
    if (typeof dict[key] === 'string') return dict[key] as string
    const parts = key.split('.')
    let cur: unknown = dict
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[p]
      } else {
        return undefined
      }
    }
    return typeof cur === 'string' ? cur : undefined
  }

  return {
    language: 'zh',
    register(ns: string, bundles: Record<string, Record<string, string>>) {
      const existing = dicts.get(ns) ?? {}
      dicts.set(ns, { ...existing, ...bundles })
      return () => {
        dicts.delete(ns)
      }
    },
    bind(ns: string) {
      return (key: string, vars?: Record<string, unknown>): string => {
        const bundle = dicts.get(ns)
        let text =
          resolveKey(bundle?.zh, key) ??
          resolveKey(bundle?.['zh-CN'], key) ??
          resolveKey(bundle?.en, key) ??
          key
        if (vars && typeof text === 'string') {
          for (const [k, v] of Object.entries(vars)) {
            text = text.replace(new RegExp(`\\{\\{?${k}\\}?\\}`, 'g'), String(v ?? ''))
          }
        }
        return text
      }
    },
  }
}

function createDesktopCordisContext() {
  const disposers: Array<() => void> = []
  const locale = createLocaleService()

  const slots = {
    inject(_slotName: string, factory: () => (() => void) | void) {
      try {
        const cleanup = factory()
        if (typeof cleanup === 'function') {
          disposers.push(cleanup)
          return cleanup
        }
      } catch (err) {
        console.warn('[DSH Plugin Host] slots.inject error:', _slotName, err)
      }
      return () => {}
    },
    register(
      descriptor: {
        name: string
        id?: string
        key?: string
        order?: number
        label?: string
        inject?: (...args: unknown[]) => Record<string, unknown>
      },
      Comp: React.ComponentType<Record<string, unknown>>,
    ) {
      const off = slotRegistry.register(descriptor, Comp)
      disposers.push(off)
      return off
    },
  }

  const sessions = {
    get activeSessionId() {
      return useAppStore.getState().activeSessionId
    },
    get current() {
      const st = useAppStore.getState()
      return st.sessions.find((s) => s.sessionId === st.activeSessionId) ?? null
    },
    get list() {
      return useAppStore.getState().sessions
    },
    open: async (sessionId: string) => {
      await useAppStore.getState().selectSession(sessionId)
    },
    select: async (sessionId: string) => {
      await useAppStore.getState().selectSession(sessionId)
    },
    refresh: async () => {
      await useAppStore.getState().refreshSessions()
    },
    subscribe: (listener: () => void) => useAppStore.subscribe(listener),
  }

  const uiWorkspace = {
    get activeSessionId() {
      return useAppStore.getState().activeSessionId
    },
    get workspaces() {
      return useAppStore.getState().workspaces
    },
    subscribe: (listener: () => void) => useAppStore.subscribe(listener),
  }

  const conversation = {
    events: {
      register: () => () => {},
    },
    subscribe: (listener: () => void) => useAppStore.subscribe(listener),
  }

  const remote = new Proxy(
    {
      agentPresets: {
        list: async () => [],
      },
    } as Record<string, unknown>,
    {
      get(target, prop: string) {
        if (prop in target) return target[prop]
        return {}
      },
    },
  )

  const services: Record<string, unknown> = {
    slots,
    locale,
    sessions,
    uiWorkspace,
    conversation,
    uiConversation: conversation,
    connection: { status: 'connected' },
    remote,
    configForms: new Map(),
  }

  const ctx: Record<string, unknown> = {
    ...services,
    get(name: string) {
      return services[name]
    },
    effect(fn: () => (() => void) | void, _label?: string) {
      try {
        const cleanup = fn()
        if (typeof cleanup === 'function') {
          disposers.push(cleanup)
          return cleanup
        }
      } catch (err) {
        console.warn('[DSH Plugin Host] ctx.effect error:', _label, err)
      }
      return () => {}
    },
    inject(deps: string[], callback: (owner: Record<string, unknown>) => unknown) {
      const list = Array.isArray(deps) ? deps : []
      const ok = list.every((dep) => {
        if (dep.includes('.')) {
          const [root] = dep.split('.')
          return root in services
        }
        return dep in services
      })
      if (!ok) return () => {}
      try {
        const result = callback(ctx)
        if (result && typeof (result as Promise<unknown>).catch === 'function') {
          ;(result as Promise<unknown>).catch((err) => {
            console.warn('[DSH Plugin Host] async ctx.inject error:', deps, err)
          })
        }
      } catch (err) {
        console.warn('[DSH Plugin Host] ctx.inject error:', deps, err)
      }
      return () => {}
    },
    dispose() {
      while (disposers.length > 0) {
        const fn = disposers.pop()
        try {
          fn?.()
        } catch {
          // Ignore cleanup errors
        }
      }
    },
  }

  return ctx
}

export function DshPluginHostProvider() {
  const hostInfo = useAppStore((s) => s.hostInfo)
  const bridgeCapabilities = useAppStore((s) => s.bridgeCapabilities)
  const workerStatus = useAppStore((s) => s.workerStatus)

  const ready =
    workerStatus.state === 'ready' &&
    Boolean(hostInfo?.hasWebServer) &&
    Boolean(bridgeCapabilities.clientPlugins) &&
    Boolean(bridgeCapabilities.hostHttpProxy)

  const hostOrigin = hostInfo?.webOrigin ?? ''

  useEffect(() => {
    ensureFetchProxyInstalled()
    ensureModuleLoaderInstalled()
  }, [])

  useEffect(() => {
    hostProxyEnabled = ready
    if (!ready) {
      slotRegistry.clear()
      return
    }

    let cancelled = false
    const ctx = createDesktopCordisContext()

    const boot = async () => {
      try {
        const modules = await api.listClientPlugins()
        if (cancelled || modules.length === 0) return

        // Reset module cache for fresh worker boot
        loaderState.factories.clear()
        loaderState.cache.clear()
        const loadedBundles = new Set<string>()
        const appliedIds = new Set<string>()

        for (const mod of modules) {
          if (cancelled) return
          if (!loadedBundles.has(mod.bundlePath)) {
            loadedBundles.add(mod.bundlePath)
            const resp = await api.proxyHostHttp('GET', mod.bundlePath)
            if (cancelled) return
            if (resp.status < 200 || resp.status >= 300) {
              console.warn(`[DSH Plugin Host] Failed to load ${mod.bundlePath}: HTTP ${resp.status}`)
              continue
            }
            const code = new TextDecoder().decode(base64ToBytes(resp.bodyBase64))
            loaderState.recentlyLoaded = []
            try {
              const runner = new Function(code)
              runner()
            } catch (err) {
              console.warn(`[DSH Plugin Host] Script execution error in ${mod.packageName}:`, err)
              continue
            }

            const idsToApply =
              loaderState.recentlyLoaded.length > 0 ? [...loaderState.recentlyLoaded] : [mod.id]
            for (const registeredId of idsToApply) {
              if (appliedIds.has(registeredId)) continue
              appliedIds.add(registeredId)
              try {
                const exported = materializeModule(registeredId) as
                  | { apply?: (c: Record<string, unknown>) => void; default?: { apply?: (c: Record<string, unknown>) => void } }
                  | null
                const applyFn =
                  typeof exported?.apply === 'function'
                    ? exported.apply
                    : typeof exported?.default?.apply === 'function'
                      ? exported.default.apply
                      : null
                if (applyFn) {
                  applyFn(ctx)
                }
              } catch (err) {
                console.warn(`[DSH Plugin Host] apply() failed for ${registeredId}:`, err)
              }
            }
          }
        }
      } catch (err) {
        console.warn('[DSH Plugin Host] Failed to bootstrap client plugins:', err)
      }
    }

    void boot()

    return () => {
      cancelled = true
      ;(ctx.dispose as () => void)()
      slotRegistry.clear()
    }
  }, [ready, hostOrigin])

  return null
}
