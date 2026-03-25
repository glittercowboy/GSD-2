/**
 * Per-window identity for multi-window isolation.
 * Each Tauri window gets a unique windowId from sessionStorage.
 * The server creates a separate pipeline (with its own WS port) per window.
 */

const ID_KEY = "mc-window-id";
const WS_PORT_KEY = "mc-ws-port";
const API_BASE = "http://127.0.0.1:4200";

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export let windowId: string = "";
export let wsPort: number = 4001;

/**
 * GAP-3: Per-launch token for WebSocket first-message auth handshake.
 * Set during initWindowIdentity() after retrieving from /api/auth/startup-token.
 * Exported so useReconnectingWebSocket and other WS hooks can send it as first message.
 */
export let launchToken: string = "";

/**
 * GAP-3: Set the launch token for WS first-message handshake.
 * Can be called by the auth system if it retrieves the token separately.
 */
export function setLaunchToken(token: string): void {
  launchToken = token;
}

/**
 * Initialize window identity:
 * 1. Get or generate windowId from sessionStorage
 * 2. Register with server to get a dedicated wsPort
 * 3. Patch global fetch to add X-Window-Id header for all /api/ calls
 */
export async function initWindowIdentity(): Promise<void> {
  let id = sessionStorage.getItem(ID_KEY);
  if (!id) {
    id = generateId();
    sessionStorage.setItem(ID_KEY, id);
  }
  windowId = id;

  try {
    const res = await fetch(`${API_BASE}/api/window/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ windowId: id }),
    });
    if (res.ok) {
      const data = await res.json() as { wsPort: number };
      wsPort = data.wsPort;
      sessionStorage.setItem(WS_PORT_KEY, String(wsPort));
    }
  } catch {
    const cached = sessionStorage.getItem(WS_PORT_KEY);
    wsPort = cached ? parseInt(cached, 10) : 4001;
  }

  // GAP-3: Retrieve per-launch token for WebSocket first-message handshake.
  // /api/auth/startup-token is single-use (B53) — fetched once at init.
  // On subsequent windows the token is already set (module-level singleton).
  if (!launchToken) {
    try {
      const tokenRes = await fetch(`${API_BASE}/api/auth/startup-token`);
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json() as { token?: string };
        if (tokenData.token) {
          launchToken = tokenData.token;
        }
      }
    } catch {
      // Token fetch failed — WS will connect without auth (dev/test fallback)
    }
  }

  // Patch global fetch to inject X-Window-Id header for all API calls
  // B75: Handle all three header forms without dropping Authorization or other headers:
  //   1. Plain object: { "Authorization": "Bearer xyz" }
  //   2. Headers instance: new Headers({ "Authorization": "Bearer xyz" })
  //   3. Array form: [["Authorization", "Bearer xyz"]]
  const origFetch = globalThis.fetch.bind(globalThis);
  (globalThis as any).fetch = function (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : (input as Request).url;
    if (url.includes("/api/")) {
      // Normalize existing headers to a plain object to avoid dropping them
      let existingHeaders: Record<string, string> = {};
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          // Headers instance: use Object.fromEntries to extract all header pairs
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          existingHeaders = Object.fromEntries((init.headers as any).entries());
        } else if (Array.isArray(init.headers)) {
          // Array form: [["key", "value"], ...]
          for (const [key, value] of init.headers as [string, string][]) {
            existingHeaders[key] = value;
          }
        } else {
          // Plain object
          existingHeaders = { ...(init.headers as Record<string, string>) };
        }
      }
      init = {
        ...init,
        headers: { "X-Window-Id": windowId, ...existingHeaders },
      };
    }
    return origFetch(input as RequestInfo | URL, init);
  };
}

/** WebSocket base URL for this window's pipeline */
export function getWsUrl(): string {
  return `ws://127.0.0.1:${wsPort}`;
}
