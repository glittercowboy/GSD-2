/**
 * GSD2 Web proxy auth decision logic.
 */

export type WebProxyAuthRequest = {
  pathname: string
  searchParams: URLSearchParams
  headers: {
    get(name: string): string | null
  }
}

export type WebProxyAuthDecision =
  | { kind: 'next' }
  | { kind: 'json'; status: 401 | 403; body: { error: string } }

export function evaluateWebProxyAuth(
  request: WebProxyAuthRequest,
  env: NodeJS.ProcessEnv = process.env,
): WebProxyAuthDecision {
  if (!request.pathname.startsWith('/api/')) return { kind: 'next' }

  const expectedToken = env.GSD_WEB_AUTH_TOKEN
  if (!expectedToken) return { kind: 'next' }

  const origin = request.headers.get('origin')
  if (origin) {
    const host = env.GSD_WEB_HOST || '127.0.0.1'
    const port = env.GSD_WEB_PORT || '3000'
    const allowed = new Set([`http://${host}:${port}`])
    const extra = env.GSD_WEB_ALLOWED_ORIGINS
    if (extra) {
      for (const entry of extra.split(',')) {
        const trimmed = entry.trim()
        if (trimmed) allowed.add(trimmed)
      }
    }

    if (!allowed.has(origin)) {
      return {
        kind: 'json',
        status: 403,
        body: { error: 'Forbidden: origin mismatch' },
      }
    }
  }

  let token: string | null = null
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7)
  }

  if (!token) {
    token = request.searchParams.get('_token')
  }

  if (!token || token !== expectedToken) {
    return {
      kind: 'json',
      status: 401,
      body: { error: 'Unauthorized' },
    }
  }

  return { kind: 'next' }
}
