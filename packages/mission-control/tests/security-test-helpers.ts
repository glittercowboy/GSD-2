/**
 * Shared security test helpers for all 6 Nyquist security test files.
 *
 * Provides:
 * - startTestServer(): spawns the real Bun server on a random port
 * - makeRequest(): HTTP client with Host header injection
 * - assertNoPathLeakInBody(): checks response bodies for absolute paths
 * - traversalPayloads(): common path-traversal attack strings
 * - makeMultipartBody(): FormData builder for file upload tests
 *
 * NOTE: This module only imports from node:* and bun:* APIs — no src/ imports.
 */

import { resolve } from "node:path";
import { expect } from "bun:test";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestServer {
  baseUrl: string;
  port: number;
  /** Per-launch auth token retrieved from /api/auth/startup-token on server start. */
  token: string;
  stop: () => Promise<void>;
}

// Mission-control package root (tests/ -> packages/mission-control/)
const MC_ROOT = resolve(import.meta.dir, "..");

// ---------------------------------------------------------------------------
// startTestServer
// ---------------------------------------------------------------------------

/**
 * Spawn the real Bun HTTP server on a random available port.
 * Uses bind-to-0 trick to find a free port, then releases it and starts
 * the server there.
 *
 * Returns { baseUrl, port, stop() }.
 */
export async function startTestServer(
  env?: Record<string, string>
): Promise<TestServer> {
  // Find a free port atomically using Bun.listen(0)
  const port = await findFreePort();

  const childEnv: Record<string, string> = {
    ...process.env,
    MC_PORT: String(port),
    MC_NO_HMR: "1",
    ...env,
  };

  // Use Bun.spawn with the resolved bun binary path.
  // Bun.which() avoids PATH resolution issues on Windows where "bun" may not be
  // in the subprocess's PATH (Bun.spawn resolves against the OS PATH, not shell PATH).
  // This matches the pattern in server.test.ts and correctly resolves workspace
  // packages via the root node_modules (workspace packages like @gsd/pi-coding-agent
  // expose TypeScript source via "bun" export condition).
  const bunBin = Bun.which("bun") ?? "bun";
  const child = Bun.spawn([bunBin, "run", "src/server.ts"], {
    cwd: MC_ROOT,
    env: childEnv,
    stdout: "pipe",
    stderr: "pipe",
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  // Poll until the server responds or 10 seconds elapse
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`${baseUrl}/`, {
        signal: AbortSignal.timeout(300),
      });
      if (res.status < 600) {
        ready = true;
        break;
      }
    } catch {
      // Server not ready yet
    }
    await Bun.sleep(100);
  }

  if (!ready || child.exitCode !== null) {
    const stderr = child.stderr
      ? await new Response(child.stderr).text().catch(() => "")
      : "";
    child.kill();
    throw new Error(
      `Test server failed to start on port ${port}. exitCode=${child.exitCode}. stderr: ${stderr.slice(0, 500)}`
    );
  }

  const stop = (): Promise<void> => {
    return new Promise((resolve) => {
      child.kill();
      // Give it a moment to shut down
      setTimeout(resolve, 500);
    });
  };

  // T-AUTH-01: Retrieve the per-launch token from the startup endpoint.
  // The server only serves this once; tests use it for all /api/* requests.
  const token = await getTestToken(baseUrl);

  return { baseUrl, port, token, stop };
}

/**
 * Retrieve the per-launch bearer token from the test server.
 * The /api/auth/startup-token endpoint is single-use — call once per server instance.
 * startTestServer() calls this automatically; use it directly only if you need the token
 * before startTestServer returns (e.g., from a custom server fixture).
 */
export async function getTestToken(baseUrl: string): Promise<string> {
  const urlObj = new URL(baseUrl);
  const host = `127.0.0.1:${urlObj.port}`;
  const res = await fetch(`${baseUrl}/api/auth/startup-token`, {
    headers: { Host: host },
  });
  if (!res.ok) {
    throw new Error(`Failed to retrieve launch token: ${res.status}`);
  }
  const body = await res.json() as { token?: string };
  if (!body.token) {
    throw new Error("Launch token response missing 'token' field");
  }
  return body.token;
}

/**
 * Find a free TCP port by binding to port 0 and reading the assigned port.
 */
async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    // Use Bun.listen to grab a free port atomically
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const server = (Bun as any).listen({
      hostname: "127.0.0.1",
      port: 0,
      socket: {
        data() {},
        open() {},
        close() {},
      },
    });
    const port: number = server.port;
    server.stop(true);
    if (!port) {
      reject(new Error("Could not obtain a free port"));
    } else {
      resolve(port);
    }
  });
}

// ---------------------------------------------------------------------------
// makeRequest
// ---------------------------------------------------------------------------

/**
 * Send an HTTP request to the test server.
 * Automatically injects a valid `Host` header so the server's
 * DNS-rebinding check (T-NET-01 B37) passes.
 *
 * Pass `token` to include Authorization: Bearer <token> on the request.
 * Required for all /api/* endpoints after T-AUTH-01 remediation (B50).
 */
export async function makeRequest(
  baseUrl: string,
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<Response> {
  const url = `${baseUrl}${path}`;

  // Extract port from baseUrl for Host header
  const urlObj = new URL(baseUrl);
  const host = `127.0.0.1:${urlObj.port}`;

  const { token, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers);
  if (!headers.has("Host")) {
    headers.set("Host", host);
  }
  if (!headers.has("Content-Type") && fetchOptions.body && typeof fetchOptions.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  // T-AUTH-01 B50: Inject bearer token if provided
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(url, {
    ...fetchOptions,
    headers,
    redirect: "manual",
  });
}

// ---------------------------------------------------------------------------
// assertNoPathLeakInBody
// ---------------------------------------------------------------------------

/**
 * Assert that a response body does not contain absolute filesystem paths.
 * Catches ENOENT/EPERM errors that include the actual file path.
 */
export function assertNoPathLeakInBody(body: string, label: string): void {
  expect(body, `${label}: must not contain /home/ path`).not.toMatch(/\/home\//);
  expect(body, `${label}: must not contain /Users/ path`).not.toMatch(/\/Users\//);
  expect(body, `${label}: must not contain /tmp/ path`).not.toMatch(/\/tmp\//);
  expect(body, `${label}: must not contain /etc/ path`).not.toMatch(/\/etc\//);
  expect(body, `${label}: must not contain C:\\Users\\ path`).not.toMatch(/C:\\Users\\/);
  expect(body, `${label}: must not contain C:/Users/ path`).not.toMatch(/C:\/Users\//);
}

// ---------------------------------------------------------------------------
// traversalPayloads
// ---------------------------------------------------------------------------

/**
 * Returns a standard set of path-traversal attack strings.
 */
export function traversalPayloads(): string[] {
  return [
    "../../etc/passwd",
    "../secret",
    "..\\..\\Windows\\System32\\drivers\\etc\\hosts",
    "task\x00id",
    "/etc/passwd",
    "....//....//etc/passwd",
  ];
}

// ---------------------------------------------------------------------------
// makeMultipartBody
// ---------------------------------------------------------------------------

/**
 * Create a FormData with a single file field.
 * The filename is taken from `filename` param — use traversal strings here to
 * test path sanitization on file upload handlers.
 */
export function makeMultipartBody(
  filename: string,
  content: string
): FormData {
  const formData = new FormData();
  const blob = new Blob([content], { type: "text/plain" });
  formData.append("file", blob, filename);
  return formData;
}
