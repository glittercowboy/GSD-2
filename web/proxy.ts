import { NextResponse, type NextRequest } from "next/server"
import { evaluateWebProxyAuth } from "./lib/proxy-auth"

/**
 * Next.js proxy - validates bearer token and origin on all API routes.
 *
 * The GSD_WEB_AUTH_TOKEN env var is set at server launch. Every /api/* request
 * must carry a matching `Authorization: Bearer <token>` header. EventSource
 * (SSE) connections may use the `_token` query parameter instead since the
 * EventSource API cannot set custom headers.
 *
 * Additionally, if an `Origin` header is present, it must match the expected
 * localhost origin to prevent cross-site request forgery.
 */
export function proxy(request: NextRequest): NextResponse | undefined {
  const decision = evaluateWebProxyAuth({
    pathname: request.nextUrl.pathname,
    searchParams: request.nextUrl.searchParams,
    headers: request.headers,
  })

  if (decision.kind === "json") {
    return NextResponse.json(decision.body, { status: decision.status })
  }

  return NextResponse.next()
}

export const config = {
  matcher: "/api/:path*",
}
