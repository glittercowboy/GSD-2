import { resolve, dirname, basename, normalize } from "node:path";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import homepage from "../public/index.html";
import { startPipeline } from "./server/pipeline";
import type { PipelineHandle } from "./server/pipeline";
import { handleFsRequest } from "./server/fs-api";
import { handleDialogRequest } from "./server/dialog-api";
import { handleGitRequest } from "./server/git-api";
import { handleRecentProjectsRequest, addRecentProject } from "./server/recent-projects";
import { handleWorkspaceRequest } from "./server/workspace-api";
import { handleSettingsRequest } from "./server/settings-api";
import { handleAssetsRequest } from "./server/assets-api";
import { handleSessionStatusRequest } from "./server/session-status-api";
import { handleProxyRequest } from "./server/proxy-api";
import { handleUatResultsRequest } from "./server/uat-results-api";
import { handleGsdFileRequest } from "./server/gsd-file-api";
import { isTrusted, writeTrustFlag } from "./server/trust-api";
import { handleClassifyIntentRequest } from "./server/classify-intent-api";
import { handleAuthRequest } from "./server/auth-api";
import { freePort } from "./server/kill-port";
import { validateSlug, createSessionWorktree, removeSessionWorktree } from "./server/worktree-api";

const repoRoot = resolve(import.meta.dir, "../../..");
const publicDir = resolve(import.meta.dir, "../public");

const HTTP_PORT = parseInt(process.env.MC_PORT ?? "4200", 10);

/**
 * T-AUTH-01 B50/B53: Per-launch secret token generated using crypto.randomUUID().
 * This token must be presented as Authorization: Bearer <token> on all /api/* requests.
 * The token is exposed ONCE via /api/auth/startup-token for the Tauri frontend to retrieve.
 * After first retrieval, it is not exposed again.
 */
export const LAUNCH_TOKEN = crypto.randomUUID();

/** Whether the startup token has been retrieved. After retrieval, the endpoint is locked. */
let startupTokenRetrieved = false;

// T-NET-02 B44: Basic rate limiter — 100 requests per second per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100; // max requests per window
const RATE_WINDOW_MS = 1000; // 1 second window

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true; // within limit
  }
  entry.count++;
  if (entry.count > RATE_LIMIT) {
    return false; // over limit
  }
  return true;
}

// T-DOS-01 B49: Window pool cap — prevent resource exhaustion from unbounded window creation
const MAX_WINDOWS = 10;

// Free the HTTP port — WS ports are freed per-window as pipelines are created
await freePort(HTTP_PORT);

/** Per-window pipelines: windowId → PipelineHandle */
const windowPipelines = new Map<string, PipelineHandle>();
/** Per-window WS ports: windowId → port number */
const windowWsPorts = new Map<string, number>();
let nextWsPort = 4001;

/** Get the pipeline for a request (via X-Window-Id header). Falls back to first window. */
function getPipelineForReq(req: Request): PipelineHandle | null {
  const windowId = req.headers.get("X-Window-Id");
  if (windowId && windowPipelines.has(windowId)) {
    return windowPipelines.get(windowId)!;
  }
  // Fallback: first registered pipeline
  const first = windowPipelines.values().next().value;
  return first ?? null;
}

/** Register a window: get existing pipeline or create a new one. */
async function registerWindow(windowId: string): Promise<number> {
  if (windowWsPorts.has(windowId)) {
    return windowWsPorts.get(windowId)!;
  }
  // T-DOS-01 B49: Cap window pool to prevent resource exhaustion
  if (windowWsPorts.size >= MAX_WINDOWS) {
    throw new Error(`Window pool exhausted (max ${MAX_WINDOWS} windows)`);
  }
  const wsPort = nextWsPort++;
  windowWsPorts.set(windowId, wsPort);
  // Use the returned port (may differ if original port was persistently busy)
  const actualWsPort = await freePort(wsPort);
  windowWsPorts.set(windowId, actualWsPort);
  const pipeline = await startPipeline({
    planningDir: resolve(repoRoot, ".gsd"),
    wsPort: actualWsPort,
    launchToken: LAUNCH_TOKEN,
  });
  windowPipelines.set(windowId, pipeline);
  console.log(`[server] Window ${windowId} registered — pipeline on WS :${actualWsPort}`);
  return actualWsPort;
}


// T-NET-01 B37: Allowed Host headers for DNS rebinding prevention
const ALLOWED_HOSTS = new Set([
  `127.0.0.1:${HTTP_PORT}`,
  `localhost:${HTTP_PORT}`,
]);

// T-NET-02 B41: Maximum allowed request body size (10 MB)
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10_000_000 bytes

const server = Bun.serve({
  port: HTTP_PORT,
  hostname: "127.0.0.1",
  routes: {
    "/": homepage,
  },
  development: process.env.MC_NO_HMR ? false : { hmr: true, console: true },
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    // T-NET-01 B37: Host header validation — prevents DNS rebinding attacks.
    // The Host header is validated before any route dispatch.
    const host = req.headers.get("host");
    if (!host || !ALLOWED_HOSTS.has(host)) {
      return new Response(JSON.stringify({ error: "Invalid Host header" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // T-NET-02 B41: Body size limit — reject requests with Content-Length > 10 MB.
    // This prevents resource exhaustion from oversized request bodies.
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return new Response(JSON.stringify({ error: "Request body too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      });
    }

    // T-NET-02 B44: Rate limiting — 100 requests per second per IP.
    // Applied to all requests to prevent resource exhaustion.
    // NOTE: X-Real-IP header is intentionally NOT used — any local process could inject it
    // to bypass per-IP rate limiting. Since this server binds exclusively to 127.0.0.1,
    // all requests originate from localhost. Use the constant address directly.
    const clientIp = "127.0.0.1";
    if (!checkRateLimit(clientIp)) {
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "1" },
      });
    }

    // T-AUTH-01: Single-use startup token endpoint
    // Called by the Tauri frontend immediately after WebView loads.
    // Locked after first successful retrieval to prevent replay.
    if (pathname === "/api/auth/startup-token" && req.method === "GET") {
      const origin = req.headers.get("origin") ?? "";
      if (!origin.startsWith("tauri://") && !origin.startsWith("file://") && origin !== "") {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
      }
      if (startupTokenRetrieved) {
        return new Response(JSON.stringify({ error: "Token already retrieved" }), { status: 403, headers: { "Content-Type": "application/json" } });
      }
      startupTokenRetrieved = true;
      return new Response(JSON.stringify({ token: LAUNCH_TOKEN }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // T-AUTH-01 B56: CORS preflight MUST be handled before route handlers
    if (req.method === "OPTIONS") {
      const origin = req.headers.get("origin") ?? "";
      const allowedOrigins = new Set(["tauri://localhost", "file://"]);
      const originAllowed = [...allowedOrigins].some(o => origin.startsWith(o)) || origin === "";
      return new Response(null, {
        status: originAllowed ? 204 : 403,
        headers: {
          "Access-Control-Allow-Origin": originAllowed ? origin : "",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Window-Id",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // T-AUTH-01 B50: Token validation for all API routes
    // T-AUTH-01 B55: Origin validation for all API routes
    // /api/auth/session is an unauthenticated pre-auth slot endpoint (B43 session cap)
    if (pathname.startsWith("/api/") && pathname !== "/api/auth/startup-token" && pathname !== "/api/auth/session") {
      const authHeader = req.headers.get("authorization") ?? "";
      const providedToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

      // B55: Validate Origin — must be tauri://, file://, or absent (same-origin IPC)
      const origin = req.headers.get("origin") ?? "";
      const originOk = origin === "" || origin.startsWith("tauri://") || origin.startsWith("file://");

      // B50: Validate token
      const tokenOk = providedToken === LAUNCH_TOKEN;

      if (!originOk) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (!tokenOk) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Route /api/auth/* to auth handler
    if (pathname.startsWith("/api/auth/")) {
      const response = await handleAuthRequest(req, url);
      if (response) return addCorsHeaders(response);
    }

    // POST /api/window/register — register a new window and get its WS port
    if (pathname === "/api/window/register" && req.method === "POST") {
      try {
        const body = await req.json() as { windowId?: string };
        // B54: If no windowId provided, generate one using crypto.randomUUID()
        const windowId = body.windowId ?? crypto.randomUUID();
        const wsPort = await registerWindow(windowId);
        return addCorsHeaders(Response.json({ wsPort, windowId }));
      } catch (err: any) {
        // B49: Return 400 when window pool is exhausted
        if (err.message && err.message.includes("pool exhausted")) {
          return addCorsHeaders(Response.json({ error: "Window pool exhausted" }, { status: 400 }));
        }
        return addCorsHeaders(Response.json({ error: "Registration failed" }, { status: 500 }));
      }
    }

    // Route /api/fs/* to file system handler
    // allowedRoot is the current project root so read/write are scoped to the open project.
    // list and detect-project ignore allowedRoot (no root restriction on browsing).
    if (pathname.startsWith("/api/fs/")) {
      const projectRoot = resolve(getPipelineForReq(req)?.getPlanningDir() ?? resolve(repoRoot, ".gsd"), "..");
      const response = await handleFsRequest(req, url, projectRoot);
      if (response) return addCorsHeaders(response);
    }

    // Route /api/dialog/* to native dialog handler
    if (pathname.startsWith("/api/dialog/")) {
      const response = await handleDialogRequest(req, url);
      if (response) return addCorsHeaders(response);
    }

    // Route /api/git/* to git log handler
    if (pathname.startsWith("/api/git/")) {
      const p72 = getPipelineForReq(req); const projectRoot = dirname(p72?.getPlanningDir() ?? resolve(repoRoot, ".gsd"));
      const response = await handleGitRequest(req, url, projectRoot);
      if (response) return addCorsHeaders(response);
    }

    // Route /api/projects/* to recent projects handler
    if (pathname.startsWith("/api/projects/")) {
      const response = await handleRecentProjectsRequest(req, url);
      if (response) return addCorsHeaders(response);
    }

    // Route /api/workspace/* to workspace handler
    if (pathname.startsWith("/api/workspace/")) {
      const response = await handleWorkspaceRequest(req, url);
      if (response) return addCorsHeaders(response);
    }

    // Route /api/settings to settings handler
    if (pathname.startsWith("/api/settings")) {
      const response = await handleSettingsRequest(req, url, getPipelineForReq(req)?.getPlanningDir() ?? resolve(repoRoot, ".gsd"));
      if (response) return addCorsHeaders(response);
    }

    // Route /api/session/* to session status handler
    if (pathname.startsWith("/api/session/")) {
      const response = await handleSessionStatusRequest(req, url, getPipelineForReq(req)?.getPlanningDir() ?? resolve(repoRoot, ".gsd"));
      if (response) return addCorsHeaders(response);
    }

    // Route /api/assets/* to assets handler
    if (pathname.startsWith("/api/assets/")) {
      // Assets live in <projectRoot>/assets/, not inside .gsd/
      const response = await handleAssetsRequest(req, url, resolve(getPipelineForReq(req)?.getPlanningDir() ?? resolve(repoRoot, ".gsd"), ".."));
      if (response) return addCorsHeaders(response);
    }

    // Route /api/uat-results to UAT results handler
    if (pathname === "/api/uat-results") {
      const response = await handleUatResultsRequest(req, url, getPipelineForReq(req)?.getPlanningDir() ?? resolve(repoRoot, ".gsd"));
      if (response) return addCorsHeaders(response);
    }

    // Route /api/gsd-file to inline read handler
    if (pathname === "/api/gsd-file") {
      const response = await handleGsdFileRequest(req, url, getPipelineForReq(req)?.getPlanningDir() ?? resolve(repoRoot, ".gsd"), repoRoot);
      if (response) return addCorsHeaders(response);
    }

    // POST /api/preview/port — set proxy port directly (used by tests and manual trigger)
    if (pathname === "/api/preview/port" && req.method === "POST") {
      const body = await req.json() as { port?: number };
      if (typeof body.port === "number") {
        getPipelineForReq(req)?.setPreviewPort(body.port);
        return addCorsHeaders(Response.json({ ok: true, port: body.port }));
      }
      return addCorsHeaders(Response.json({ error: "port required" }, { status: 400 }));
    }

    // Route /api/preview/* to dev server proxy
    if (pathname.startsWith("/api/preview")) {
      const response = await handleProxyRequest(req, url, getPipelineForReq(req)?.getPreviewPort() ?? 0);
      return addCorsHeaders(response);
    }

    // POST /api/project/switch — switch to a different project directory
    if (pathname === "/api/project/switch" && req.method === "POST") {
      try {
        const body = await req.json() as { path?: string };
        if (!body.path) {
          return addCorsHeaders(
            Response.json({ error: "path field required" }, { status: 400 })
          );
        }

        const projectPath = resolve(body.path);

        // GAP-1: Confine project switching to home directory (defense-in-depth)
        const normalizedPath = normalize(projectPath);
        if (!normalizedPath.startsWith(normalize(homedir()))) {
          return addCorsHeaders(
            Response.json(
              { error: "Path must be within home directory" },
              { status: 400 }
            )
          );
        }

        // Validate directory exists
        try {
          await access(projectPath);
        } catch {
          return addCorsHeaders(
            Response.json(
              { error: "Directory does not exist" },
              { status: 400 }
            )
          );
        }

        // Always pass .gsd/ path — pipeline derives repoRoot as parent.
        // If .gsd/ doesn't exist yet, buildFullState returns empty/default state.
        const planningDir = resolve(projectPath, ".gsd");
        let hasPlanningDir = false;
        try {
          await access(planningDir);
          hasPlanningDir = true;
        } catch {
          // No .gsd/ yet — new project
        }

        await getPipelineForReq(req)?.switchProject(planningDir);

        // Record in recent projects
        await addRecentProject({
          path: projectPath.replace(/\\/g, "/"),
          name: basename(projectPath),
          lastOpened: Date.now(),
          isGsdProject: hasPlanningDir,
        });

        return addCorsHeaders(
          Response.json({ switched: true, path: projectPath.replace(/\\/g, "/") })
        );
      } catch (err: any) {
        const status = err.message?.includes("Cannot switch") || err.message?.includes("already in progress") ? 409 : 500;
        return addCorsHeaders(
          Response.json({ error: err.message || "Switch failed" }, { status })
        );
      }
    }

    // GET /api/trust-status — check if current project has been trusted (PERM-02)
    if (pathname === "/api/trust-status") {
      const gsdDir = getPipelineForReq(req)?.getPlanningDir() ?? resolve(repoRoot, ".gsd");
      const trusted = await isTrusted(gsdDir);
      return addCorsHeaders(
        Response.json({ trusted, gsdDir })
      );
    }

    // POST /api/classify-intent — classify Builder mode message intent (BUILDER-04)
    if (pathname === "/api/classify-intent") {
      const response = await handleClassifyIntentRequest(req);
      return addCorsHeaders(response);
    }

    // POST /api/trust — write trust flag for a project (PERM-02)
    if (pathname === "/api/trust" && req.method === "POST") {
      const body = await req.json() as { dir?: string };
      const gsdDir = body.dir ?? getPipelineForReq(req)?.getPlanningDir() ?? resolve(repoRoot, ".gsd");
      // API-4: Validate dir is a .gsd directory (matches registerTrustRoutes validation)
      const normalizedGsdDir = gsdDir.replace(/\\/g, "/");
      if (!normalizedGsdDir.endsWith("/.gsd") && !normalizedGsdDir.includes("/.gsd/")) {
        return addCorsHeaders(Response.json({ error: "dir must be a .gsd directory path" }, { status: 400 }));
      }
      await writeTrustFlag(gsdDir);
      return addCorsHeaders(Response.json({ ok: true }));
    }

    // POST /api/screenshot — receive base64 screenshot from Claude browser tool (T-DOS-01 B48)
    // Applies a 5 MB cap on the base64 payload to prevent resource exhaustion.
    if (pathname === "/api/screenshot" && req.method === "POST") {
      const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // 5 MB
      let body: { data?: string } = {};
      try {
        body = await req.json() as { data?: string };
      } catch {
        return addCorsHeaders(Response.json({ error: "Invalid JSON" }, { status: 400 }));
      }
      const data = body.data ?? "";
      // base64 string length in bytes is approximately (3/4) * length
      // For a size cap we check the raw string length directly: 5 MB cap on base64 characters
      if (data.length > MAX_SCREENSHOT_BYTES) {
        return addCorsHeaders(Response.json({ error: "Screenshot payload too large (max 5 MB)" }, { status: 413 }));
      }
      // Forward to the active pipeline for browser state update processing
      const pipeline = getPipelineForReq(req);
      if (pipeline && data) {
        try {
          // Emit browser state update with the screenshot (pipeline handles WS broadcast)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (pipeline as any).emit?.("browser_state_update", { screenshot: data });
        } catch {
          // Non-fatal: pipeline may not have emit — just accept and ignore
        }
      }
      return addCorsHeaders(Response.json({ ok: true }));
    }

    // POST /api/worktree/create — create a session worktree (T-FILE B13)
    if (pathname === "/api/worktree/create" && req.method === "POST") {
      try {
        const body = await req.json() as { sessionSlug?: unknown; repoRoot?: unknown };
        try {
          validateSlug(body.sessionSlug);
        } catch {
          return addCorsHeaders(Response.json({ error: "Invalid session slug" }, { status: 400 }));
        }
        const slug = body.sessionSlug as string;
        const root = typeof body.repoRoot === "string" ? body.repoRoot : repoRoot;
        const result = await createSessionWorktree(root, slug);
        if ("error" in result) {
          return addCorsHeaders(Response.json({ error: result.error }, { status: 400 }));
        }
        return addCorsHeaders(Response.json(result));
      } catch (err: any) {
        return addCorsHeaders(Response.json({ error: "Internal server error" }, { status: 500 }));
      }
    }

    // DELETE /api/worktree/session — remove a session worktree (T-FILE B14)
    if (pathname === "/api/worktree/session" && req.method === "DELETE") {
      try {
        const body = await req.json() as { sessionSlug?: unknown; repoRoot?: unknown };
        try {
          validateSlug(body.sessionSlug);
        } catch {
          return addCorsHeaders(Response.json({ error: "Invalid session slug" }, { status: 400 }));
        }
        const slug = body.sessionSlug as string;
        const root = typeof body.repoRoot === "string" ? body.repoRoot : repoRoot;
        const worktreePath = `${root}/.worktrees/${slug}`;
        const result = await removeSessionWorktree(root, worktreePath);
        if (!result.ok) {
          return addCorsHeaders(Response.json({ error: result.error ?? "Failed to remove worktree" }, { status: 400 }));
        }
        return addCorsHeaders(Response.json({ ok: true }));
      } catch (err: any) {
        return addCorsHeaders(Response.json({ error: "Internal server error" }, { status: 500 }));
      }
    }

    // Serve static files from public/ directory (assets, fonts, etc.)
    if (req.method === "GET" && !pathname.startsWith("/api/")) {
      const filePath = resolve(publicDir, pathname.slice(1));
      // H6: Prevent path traversal — reject if resolved path escapes public/
      if (!filePath.startsWith(publicDir)) {
        return new Response("Forbidden", { status: 403 });
      }
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file);
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Mission Control running at ${server.url}`);

// Orphan prevention: kill all gsd processes when the Bun server shuts down
const cleanup = async () => {
  console.log("[server] Shutting down — killing all gsd processes...");
  for (const pipeline of windowPipelines.values()) {
    await pipeline.sessionManager.killAll();
  }
  server.stop(true);
  process.exit(0);
};

process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);

/** Add CORS headers to API responses (defensive — same-origin in practice). */
function addCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", `http://127.0.0.1:${HTTP_PORT}`);
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Window-Id");
  return new Response(response.body, { status: response.status, headers });
}
