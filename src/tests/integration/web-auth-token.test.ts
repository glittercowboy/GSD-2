/**
 * GSD2 Web auth token behavior tests.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

type AuthModule = typeof import('../../../web/lib/auth.ts')
type ProxyAuthModule = typeof import('../../../web/lib/proxy-auth.ts')

type FakeWindow = {
  location: {
    hash: string
    pathname: string
    search: string
  }
  history: {
    replaceState: (state: unknown, title: string, url?: string) => void
  }
  addEventListener: (event: string, listener: (event: { key: string; newValue: string | null }) => void) => void
}

type BrowserState = {
  replaceCalls: string[]
  storage: Map<string, string>
  storageListeners: Array<(event: { key: string; newValue: string | null }) => void>
  restore: () => void
}

const originalWindow = (globalThis as { window?: unknown }).window
const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage
const originalFetch = globalThis.fetch

async function importAuth(caseName: string): Promise<AuthModule> {
  return import(`../../../web/lib/auth.ts?case=${caseName}-${Date.now()}-${Math.random()}`)
}

async function importProxyAuth(caseName: string): Promise<ProxyAuthModule> {
  return import(`../../../web/lib/proxy-auth.ts?case=${caseName}-${Date.now()}-${Math.random()}`)
}

function installBrowserState(options: {
  hash?: string
  search?: string
  storedToken?: string
  throwOnGet?: boolean
  throwOnSet?: boolean
} = {}): BrowserState {
  const storage = new Map<string, string>()
  if (options.storedToken) storage.set('gsd-auth-token', options.storedToken)

  const replaceCalls: string[] = []
  const storageListeners: Array<(event: { key: string; newValue: string | null }) => void> = []
  const fakeWindow: FakeWindow = {
    location: {
      hash: options.hash ?? '',
      pathname: '/dashboard',
      search: options.search ?? '',
    },
    history: {
      replaceState: (_state, _title, url) => {
        replaceCalls.push(url ?? '')
      },
    },
    addEventListener: (event, listener) => {
      if (event === 'storage') storageListeners.push(listener)
    },
  }

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: fakeWindow,
  })
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key: string): string | null {
        if (options.throwOnGet) throw new Error('storage unavailable')
        return storage.get(key) ?? null
      },
      setItem(key: string, value: string): void {
        if (options.throwOnSet) throw new Error('storage unavailable')
        storage.set(key, value)
      },
      removeItem(key: string): void {
        storage.delete(key)
      },
    },
  })

  return {
    replaceCalls,
    storage,
    storageListeners,
    restore() {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      })
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: originalLocalStorage,
      })
      globalThis.fetch = originalFetch
    },
  }
}

test('getAuthToken extracts, persists, caches, and clears fragment token', async () => {
  const browser = installBrowserState({ hash: '#token=abc123DEF456', search: '?view=dashboard' })
  try {
    const auth = await importAuth('fragment-token')

    assert.equal(auth.getAuthToken(), 'abc123DEF456')
    assert.equal(browser.storage.get('gsd-auth-token'), 'abc123DEF456')
    assert.deepEqual(browser.replaceCalls, ['/dashboard?view=dashboard'])

    ;(globalThis as unknown as { window: FakeWindow }).window.location.hash = ''
    browser.storage.clear()
    assert.equal(auth.getAuthToken(), 'abc123DEF456')
  } finally {
    browser.restore()
  }
})

test('getAuthToken falls back to localStorage and ignores storage failures', async () => {
  const storedBrowser = installBrowserState({ storedToken: 'f00d' })
  try {
    const auth = await importAuth('stored-token')

    assert.equal(auth.getAuthToken(), 'f00d')
  } finally {
    storedBrowser.restore()
  }

  const throwingBrowser = installBrowserState({ hash: '#token=badc0ffee', throwOnSet: true })
  try {
    const auth = await importAuth('storage-set-throws')

    assert.equal(auth.getAuthToken(), 'badc0ffee')
    assert.deepEqual(throwingBrowser.replaceCalls, ['/dashboard'])
  } finally {
    throwingBrowser.restore()
  }

  const unavailableBrowser = installBrowserState({ throwOnGet: true })
  try {
    const auth = await importAuth('storage-get-throws')

    assert.equal(auth.getAuthToken(), null)
  } finally {
    unavailableBrowser.restore()
  }
})

test('storage events update auth headers and URL token parameters', async () => {
  const browser = installBrowserState()
  try {
    const auth = await importAuth('storage-events')

    assert.equal(auth.getAuthToken(), null)
    assert.equal(browser.storageListeners.length, 1)

    browser.storageListeners[0]({ key: 'gsd-auth-token', newValue: 'cafe42' })

    assert.deepEqual(auth.authHeaders({ Accept: 'application/json' }), {
      Accept: 'application/json',
      Authorization: 'Bearer cafe42',
    })
    assert.equal(auth.appendAuthParam('/api/events'), '/api/events?_token=cafe42')
    assert.equal(auth.appendAuthParam('/api/events?stream=1'), '/api/events?stream=1&_token=cafe42')
  } finally {
    browser.restore()
  }
})

test('authFetch short-circuits missing tokens and preserves explicit Authorization headers', async () => {
  const missingTokenBrowser = installBrowserState()
  try {
    const auth = await importAuth('missing-auth-fetch-token')
    const response = await auth.authFetch('/api/status')

    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: 'No auth token available' })
  } finally {
    missingTokenBrowser.restore()
  }

  const browser = installBrowserState({ hash: '#token=abc123' })
  const calls: Array<{ input: RequestInfo | URL; authorization: string | null }> = []
  try {
    const auth = await importAuth('auth-fetch-token')
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      calls.push({ input, authorization: headers.get('Authorization') })
      return new Response('ok', { status: 200 })
    }) as typeof fetch

    const response = await auth.authFetch('/api/status', {
      headers: { Authorization: 'Bearer caller-token' },
    })

    assert.equal(response.status, 200)
    assert.deepEqual(calls, [{ input: '/api/status', authorization: 'Bearer caller-token' }])
  } finally {
    browser.restore()
  }
})

test('proxy auth validates configured bearer and query-token authentication', async () => {
  const previousEnv = {
    token: process.env.GSD_WEB_AUTH_TOKEN,
    host: process.env.GSD_WEB_HOST,
    port: process.env.GSD_WEB_PORT,
    origins: process.env.GSD_WEB_ALLOWED_ORIGINS,
  }

  try {
    const { evaluateWebProxyAuth } = await importProxyAuth('auth-proxy')

    delete process.env.GSD_WEB_AUTH_TOKEN
    assert.deepEqual(evaluateWebProxyAuth(makeRequest('/api/status')), { kind: 'next' })

    process.env.GSD_WEB_AUTH_TOKEN = 'expected'
    process.env.GSD_WEB_HOST = '127.0.0.1'
    process.env.GSD_WEB_PORT = '3888'
    assert.deepEqual(evaluateWebProxyAuth(makeRequest('/not-api/status')), { kind: 'next' })
    assert.equal(evaluateWebProxyAuth(makeRequest('/api/status')).status, 401)
    assert.deepEqual(evaluateWebProxyAuth(makeRequest('/api/status', { authorization: 'Bearer expected' })), {
      kind: 'next',
    })
    assert.deepEqual(evaluateWebProxyAuth(makeRequest('/api/status?_token=expected')), { kind: 'next' })
    assert.equal(evaluateWebProxyAuth(makeRequest('/api/status?_token=wrong')).status, 401)

    assert.equal(
      evaluateWebProxyAuth(makeRequest('/api/status', {
        authorization: 'Bearer expected',
        origin: 'http://evil.test',
      })).status,
      403,
    )

    process.env.GSD_WEB_ALLOWED_ORIGINS = 'http://proxy.test'
    assert.deepEqual(evaluateWebProxyAuth(makeRequest('/api/status', {
      authorization: 'Bearer expected',
      origin: 'http://proxy.test',
    })), { kind: 'next' })
  } finally {
    restoreEnv('GSD_WEB_AUTH_TOKEN', previousEnv.token)
    restoreEnv('GSD_WEB_HOST', previousEnv.host)
    restoreEnv('GSD_WEB_PORT', previousEnv.port)
    restoreEnv('GSD_WEB_ALLOWED_ORIGINS', previousEnv.origins)
  }
})

function makeRequest(path: string, headers: Record<string, string> = {}) {
  const url = new URL(`http://127.0.0.1:3888${path}`)
  return {
    pathname: url.pathname,
    searchParams: url.searchParams,
    headers: new Headers(headers),
  }
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
    return
  }
  process.env[key] = value
}
