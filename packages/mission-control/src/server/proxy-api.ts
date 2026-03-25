/**
 * proxy-api.ts
 *
 * Bun fetch-forwarding proxy for the live preview feature.
 * Forwards /api/preview/* requests to the project's detected dev server.
 *
 * Key behaviors:
 * - Strips X-Frame-Options headers (Pitfall 2) only for the local dev server preview proxy
 *   so the iframe can load. CSP is preserved (B39) — only X-Frame-Options is removed.
 * - Validates destination host/port against allowlists (T-NET-01)
 * - Strips X-Forwarded-* headers from forwarded requests (T-NET-01 B40)
 * - Returns a styled HTML offline page (status 200) when port is null or fetch fails
 * - Does NOT proxy WebSocket/HMR connections (known limitation — accepted per RESEARCH.md)
 */

/** Allowed AI provider destinations for the external proxy path */
const ALLOWED_PROXY_HOSTS = new Set([
  "api.anthropic.com",
  "api.openai.com",
  "openrouter.ai",
  "api.openrouter.ai",
  "generativelanguage.googleapis.com",
]);

/** Allowed destination ports for external (AI provider) proxy */
const ALLOWED_PROXY_PORTS = new Set([443]);

/**
 * Internal-use ports >= 1024 that must never be proxied to, even on localhost.
 * Ports < 1024 are already blocked by the privileged port range check below.
 * These are known service ports that would represent SSRF vectors.
 */
const BLOCKED_LOCAL_PORTS = new Set([
  5432,  // PostgreSQL
  5433,  // PostgreSQL alt
  3306,  // MySQL
  6379,  // Redis
  27017, // MongoDB
  4001,  // Internal WS server port
]);

const OFFLINE_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body {
      background: #0a0f1e;
      color: #64748b;
      font-family: monospace;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .message { text-align: center; }
    .port { color: #475569; font-size: 0.875em; margin-top: 0.5em; }
  </style>
</head>
<body>
  <div class="message">
    <p>Dev server offline — start your dev server to preview</p>
    <p class="port">No port configured</p>
  </div>
</body>
</html>`;

/**
 * Handle a proxy request for /api/preview/* routes.
 *
 * @param req - The incoming HTTP request
 * @param url - Parsed URL of the request
 * @param port - The detected dev server port, or null if unknown
 * @returns A Response forwarding the dev server content, or an offline HTML page
 */
export async function handleProxyRequest(
  req: Request,
  url: URL,
  port: number | null
): Promise<Response> {
  // T-NET-01 B33-B36: Check for external proxy path (when ?target= is provided).
  // This covers the AI provider proxy use-case where the destination is specified explicitly.
  const targetParam = url.searchParams.get("target");
  if (targetParam) {
    let targetUrl: URL;
    try {
      targetUrl = new URL(targetParam);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid proxy target URL" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const targetHost = targetUrl.hostname;
    const targetPort = targetUrl.port
      ? parseInt(targetUrl.port, 10)
      : targetUrl.protocol === "https:" ? 443 : 80;

    // B33: Reject non-allowlisted destination hosts
    if (!ALLOWED_PROXY_HOSTS.has(targetHost)) {
      return new Response(JSON.stringify({ error: "Proxy destination not allowed" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // B34/B35: Reject non-allowlisted destination ports
    if (!ALLOWED_PROXY_PORTS.has(targetPort)) {
      return new Response(JSON.stringify({ error: "Proxy destination port not allowed" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // T-NET-01 B34-B36: Block internal service ports for local dev-server proxy.
  // The port parameter represents the local dev server port.
  if (port !== null && BLOCKED_LOCAL_PORTS.has(port)) {
    return new Response(JSON.stringify({ error: "Proxy destination port not allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!port) {
    return new Response(OFFLINE_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // C4: Validate port is in safe range (1024-65535) to prevent SSRF to privileged services
  if (port < 1024 || port > 65535) {
    return new Response(OFFLINE_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Strip /api/preview prefix to get the target path
  const targetPath = url.pathname.replace(/^\/api\/preview/, "") || "/";
  const targetUrl = `http://localhost:${port}${targetPath}${url.search}`;

  try {
    // C4: Strip auth headers to prevent credential leakage to proxied service
    // T-NET-01 B40: Strip X-Forwarded-* headers to prevent IP spoofing / host injection
    const forwardHeaders = new Headers(req.headers);
    forwardHeaders.delete("authorization");
    forwardHeaders.delete("cookie");
    forwardHeaders.delete("x-forwarded-for");
    forwardHeaders.delete("x-forwarded-host");
    forwardHeaders.delete("x-forwarded-proto");
    forwardHeaders.delete("x-forwarded-port");
    forwardHeaders.delete("x-real-ip");
    forwardHeaders.delete("forwarded");

    const proxied = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
    });

    // Build response headers for the iframe preview.
    // Pitfall 2: X-Frame-Options from the upstream dev server would block iframe embedding.
    // We strip only X-Frame-Options (which explicitly prevents iframe embedding).
    // T-NET-01 B39: CSP is intentionally NOT stripped — the upstream CSP must be preserved.
    // Only X-Frame-Options is removed so the local dev server preview can load in the iframe.
    const IFRAME_STRIP_HEADERS = new Set(["x-frame-options"]);
    const headers = new Headers();
    proxied.headers.forEach((value, key) => {
      if (!IFRAME_STRIP_HEADERS.has(key.toLowerCase())) {
        headers.set(key, value);
      }
    });

    // Inject <base href="/api/preview/"> into HTML responses so absolute-path
    // resources (e.g. <script src="/assets/index.js">) resolve through the proxy
    // instead of hitting the Mission Control server root directly (black iframe fix).
    const contentType = headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      let html = await proxied.text();
      html = html.replace(/(<head[^>]*>)/i, '$1<base href="/api/preview/">');
      if (!html.includes('<base href="/api/preview/">')) {
        html = html.replace(/(<html[^>]*>)/i, '$1<base href="/api/preview/">');
      }
      return new Response(html, { status: proxied.status, headers });
    }

    return new Response(proxied.body, {
      status: proxied.status,
      headers,
    });
  } catch {
    // Dev server unreachable — return offline HTML page instead of empty 503
    return new Response(OFFLINE_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}
