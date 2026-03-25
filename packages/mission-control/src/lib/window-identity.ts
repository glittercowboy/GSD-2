/**
 * Window identity and per-launch token management for the Tauri frontend.
 *
 * T-AUTH-01: The Bun server generates a per-launch LAUNCH_TOKEN at startup.
 * The frontend retrieves this token once via /api/auth/startup-token,
 * then includes it as Authorization: Bearer <token> on all subsequent API requests.
 *
 * B54: Window IDs use crypto.randomUUID() — not Math.random().toString(36).
 * B75: Fetch monkey-patch handles all three header forms correctly.
 */

// T-AUTH-01: Per-launch token retrieved from server at startup
let launchToken: string | null = null;

/**
 * Retrieve the per-launch auth token from the server.
 * Must be called once at app startup before any API requests are made.
 * Returns the cached token on subsequent calls.
 */
export async function retrieveLaunchToken(baseUrl = "http://127.0.0.1:4200"): Promise<string> {
  if (launchToken) return launchToken;

  const res = await fetch(`${baseUrl}/api/auth/startup-token`);
  if (!res.ok) throw new Error("Failed to retrieve launch token");
  const body = await res.json() as { token?: string };
  if (!body.token) throw new Error("Launch token response missing 'token' field");
  launchToken = body.token;
  return launchToken;
}

/**
 * Returns the cached per-launch token, or null if not yet retrieved.
 * Call retrieveLaunchToken() first during app bootstrap.
 */
export function getLaunchToken(): string | null {
  return launchToken;
}

/**
 * B54: Generate a window ID using crypto.randomUUID().
 * This ensures unpredictable IDs for session multiplexing.
 */
export function generateWindowId(): string {
  return crypto.randomUUID();
}

/**
 * B75: Install fetch monkey-patch that automatically adds Authorization header
 * to all outgoing /api/* requests using the per-launch token.
 *
 * Handles all three header forms:
 *   - Headers instance (instanceof Headers)
 *   - [string, string][] tuple array (Array.isArray)
 *   - Record<string, string> plain object
 */
export function installFetchMonkeyPatch(): void {
  if (typeof window === "undefined") return;

  const originalFetch = window.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const token = getLaunchToken();
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;

    if (token && url.includes("/api/")) {
      init = init ?? {};
      const existingHeaders = init.headers;
      let headersObj: Record<string, string> = {};

      if (existingHeaders instanceof Headers) {
        // B75: Handle Headers instance — iterate with forEach
        existingHeaders.forEach((v, k) => {
          headersObj[k] = v;
        });
      } else if (Array.isArray(existingHeaders)) {
        // B75: Handle [string, string][] tuple array
        for (const [k, v] of existingHeaders as [string, string][]) {
          headersObj[k] = v;
        }
      } else if (existingHeaders) {
        // Plain Record<string, string>
        headersObj = { ...(existingHeaders as Record<string, string>) };
      }

      headersObj["Authorization"] = `Bearer ${token}`;
      init = { ...init, headers: headersObj };
    }

    return originalFetch.call(this, input, init);
  };
}
