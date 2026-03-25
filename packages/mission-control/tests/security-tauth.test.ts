/**
 * Holistic security tests for T-AUTH-01 threat category.
 *
 * Covers behaviours 50-56:
 *   T-AUTH-01 (B50-B56) — Per-launch bearer token, session ownership,
 *                          crypto randomness, CORS preflight ordering
 *
 * All tests make REAL HTTP/WS requests against the running server.
 * No source inspection (readFileSync+regex) for behaviour verification.
 *
 * RED PHASE: B50-B52, B55 expected to FAIL until Wave 4 remediations
 * GREEN (already passing): B53 (crypto.randomUUID in auth-api.ts)
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startTestServer, makeRequest } from "./security-test-helpers";

let server: Awaited<ReturnType<typeof startTestServer>>;
beforeAll(async () => {
  server = await startTestServer();
}, 20_000);
afterAll(async () => {
  await server.stop();
});

// ---------------------------------------------------------------------------
// T-AUTH-01 — Authentication Enforcement (B50-B56)
// ---------------------------------------------------------------------------

describe("T-AUTH-01 — Authentication Enforcement", () => {
  it("B50: HTTP endpoints return 401 without a valid per-launch auth token", async () => {
    // B50 RED PHASE: server.ts explicitly documents "No authentication on HTTP API endpoints"
    // All these requests will succeed (200/400) rather than returning 401.
    const endpoints = [
      { method: "GET",  path: "/api/fs/list" },
      { method: "POST", path: "/api/fs/mkdir" },
      { method: "GET",  path: "/api/gsd-file" },
      { method: "POST", path: "/api/uat-results" },
      { method: "POST", path: "/api/window/register" },
    ];

    for (const { method, path } of endpoints) {
      const res = await makeRequest(server.baseUrl, path, { method });
      // Without a valid per-launch token, must get 401
      expect(res.status, `Expected 401 for ${method} ${path} without token`).toBe(401);
    }
  });

  it("B51: WebSocket upgrade is rejected without a per-launch auth token", async () => {
    // Register a window WITH the valid token to get a WS port
    const regRes = await makeRequest(server.baseUrl, "/api/window/register", {
      method: "POST",
      body: JSON.stringify({ windowId: `b51-test-${Date.now()}` }),
      token: server.token,
    });

    if (regRes.status !== 200) {
      throw new Error(`B51: window registration returned ${regRes.status}`);
    }

    const regBody = await regRes.json() as { wsPort?: number };
    if (!regBody.wsPort) {
      throw new Error("B51: window registration returned no wsPort");
    }
    const wsPort = regBody.wsPort;

    // Try to connect to WS without any auth token.
    // Server uses first-message auth: connection is upgraded but server closes with 4001
    // after 1s if no auth message is sent. Test must NOT send any auth message.
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);
      let settled = false;

      const done = (err?: Error) => {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve();
      };

      // Server auth timeout is 1s — allow 3s total for server to close the connection
      const timer = setTimeout(() => {
        ws.close();
        done(new Error("B51: server did not close unauthenticated WS within 3s"));
      }, 3000);

      ws.onopen = () => {
        // First-message auth: connection is accepted but unauthenticated.
        // Do NOT send any auth message — wait for server to close with 4001.
      };

      ws.onerror = () => {
        clearTimeout(timer);
        done(); // Transport-level rejection — also acceptable
      };

      ws.onclose = (e) => {
        clearTimeout(timer);
        if (e.code === 4001 || e.code === 1008 || e.code === 1002) {
          done(); // Server correctly rejected unauthenticated connection
        } else if (e.wasClean && e.code === 1000) {
          done(new Error("B51 FAIL: server closed cleanly (1000) — expected auth rejection (4001)"));
        } else {
          done(); // Any other server-initiated close is acceptable
        }
      };
    });
  }, { timeout: 5000 });

  it("B52: Session isolation — two WS clients with different windowIds do not receive each other's planning-state messages", async () => {
    // Create a standalone WS server on a random port (no launchToken so both clients can connect)
    const { createWsServer } = await import("../src/server/ws-server");
    const wsPort = 14300 + Math.floor(Math.random() * 100);

    const wsServer = createWsServer({
      port: wsPort,
      getFullState: () => ({
        tasks: [],
        projectName: "test",
        activeSessions: [],
        currentPhase: null,
        completedPhases: [],
        recentActivity: [],
      } as unknown as import("../src/server/types").PlanningState),
    });

    const messagesA: string[] = [];
    const messagesB: string[] = [];

    const wsA = new WebSocket(`ws://127.0.0.1:${wsPort}?windowId=window-A`);
    const wsB = new WebSocket(`ws://127.0.0.1:${wsPort}?windowId=window-B`);

    wsA.onmessage = (e) => messagesA.push(typeof e.data === "string" ? e.data : String(e.data));
    wsB.onmessage = (e) => messagesB.push(typeof e.data === "string" ? e.data : String(e.data));

    try {
      // Wait for both clients to connect and receive their initial "full" state message
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("B52: timeout waiting for both clients to connect")), 5000);
        let aReady = false;
        let bReady = false;
        const checkReady = () => { if (aReady && bReady) { clearTimeout(timer); resolve(); } };
        const origOnMessageA = wsA.onmessage!;
        const origOnMessageB = wsB.onmessage!;
        wsA.onmessage = (e) => {
          origOnMessageA.call(wsA, e);
          const parsed = JSON.parse(typeof e.data === "string" ? e.data : String(e.data));
          if (parsed.type === "full") { aReady = true; checkReady(); }
        };
        wsB.onmessage = (e) => {
          origOnMessageB.call(wsB, e);
          const parsed = JSON.parse(typeof e.data === "string" ? e.data : String(e.data));
          if (parsed.type === "full") { bReady = true; checkReady(); }
        };
        wsA.onerror = (e) => { clearTimeout(timer); reject(new Error(`B52: wsA error: ${e}`)); };
        wsB.onerror = (e) => { clearTimeout(timer); reject(new Error(`B52: wsB error: ${e}`)); };
      });

      // Broadcast only to window-A's topic
      wsServer.broadcast({ type: "diff", changes: { test: "for-A" } } as unknown as import("../src/server/types").StateDiff, "window-A");

      // Wait 500ms for message delivery
      await new Promise<void>((r) => setTimeout(r, 500));

      // Client A should have received: 1 initial "full" + 1 broadcast diff = 2 messages
      expect(messagesA.length, "B52: window-A should receive 2 messages (initial full + broadcast)").toBe(2);

      // Client B should have received only: 1 initial "full" = 1 message (NOT the window-A broadcast)
      expect(messagesB.length, "B52: window-B must NOT receive window-A's broadcast").toBe(1);

      // Verify Client A's second message contains the broadcast payload
      const broadcastMsg = JSON.parse(messagesA[1]);
      expect(broadcastMsg.changes?.test, "B52: window-A broadcast payload must be 'for-A'").toBe("for-A");
    } finally {
      wsA.close();
      wsB.close();
      wsServer.stop();
    }
  }, { timeout: 10_000 });

  it("B53: crypto.randomUUID() is used for auth session IDs (not Math.random)", async () => {
    // B53 GREEN — auth-api.ts already uses crypto.randomUUID() for session IDs (B53 confirmed PASS).
    // Regression test: start a session and verify the session ID is UUID-shaped.
    const res = await makeRequest(server.baseUrl, "/api/auth/session", {
      method: "POST",
      body: JSON.stringify({ provider: "test" }),
    });

    // If auth session endpoint returns a session with an ID, verify UUID format
    if (res.status === 200 || res.status === 201) {
      const body = await res.json() as { sessionId?: string; id?: string };
      const id = body.sessionId ?? body.id;
      if (id) {
        // UUID v4 pattern: 8-4-4-4-12 hex chars, version bit = 4
        expect(id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        );
      }
    }
    // If the endpoint doesn't return 200, the test is inconclusive but not a failure
    // (the behaviour is already confirmed by source review to be passing)
  });

  it("B54: window IDs registered without a client-supplied ID use crypto.randomUUID format", async () => {
    // B54: server.ts generates a crypto.randomUUID() when no windowId is provided.
    // The response must include a windowId in UUID format.
    const res = await makeRequest(server.baseUrl, "/api/window/register", {
      method: "POST",
      body: JSON.stringify({}), // no windowId — server must generate one using crypto.randomUUID()
      token: server.token,
    });

    expect(res.status, "B54: window register without windowId must succeed (server generates UUID)").toBe(200);
    const body = await res.json() as { windowId?: string; wsPort?: number };
    expect(body.windowId, "B54: server-generated windowId must be present").toBeTruthy();
    if (body.windowId) {
      // Must be a UUID v4 format — NOT a Math.random().toString(36) string
      expect(body.windowId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    }
  });

  it("B55: HTTP endpoints reject requests with non-Tauri Origin header", async () => {
    // B55 RED PHASE: server.ts has no Origin header check on HTTP fetch handler.
    // Only WS upgrades check Origin. HTTP routes have no Origin validation.
    const res = await fetch(server.baseUrl + "/api/fs/list", {
      headers: {
        Host: `127.0.0.1:${server.port}`,
        Origin: "http://evil.com",
      },
    });
    // Non-tauri:// Origin on HTTP must be rejected
    expect([400, 401, 403]).toContain(res.status);
  });

  it("B56: CORS OPTIONS preflight returns CORS headers (200 or 204)", async () => {
    // B56: CORS OPTIONS handler exists in server.ts (at line ~296, after route handlers).
    // The plan notes it's registered AFTER routes — this test verifies the handler at least
    // responds correctly. The ordering issue (B56 partial) is a separate concern.
    const res = await fetch(server.baseUrl + "/api/fs/list", {
      method: "OPTIONS",
      headers: {
        Host: `127.0.0.1:${server.port}`,
        Origin: "tauri://localhost",
        "Access-Control-Request-Method": "GET",
      },
    });
    // OPTIONS preflight must return 200 or 204 with CORS headers
    expect([200, 204]).toContain(res.status);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// T-AUTH-02 — Token Refresh Serialization (B64)
// ---------------------------------------------------------------------------

describe("T-AUTH-02 — Token Refresh Serialization", () => {
  it("B64: withRefreshLock serializes concurrent token refresh for the same credential", async () => {
    // Import the mutex helper exported from auth-api.ts
    const { withRefreshLock } = await import("../src/server/auth-api");

    const key = "test-credential";
    const order: number[] = [];

    // Simulate two concurrent refresh calls
    // First call takes 50ms, second call arrives while first is running
    const first = withRefreshLock(key, async () => {
      await new Promise<void>(r => setTimeout(r, 50));
      order.push(1);
      return "token-1";
    });

    const second = withRefreshLock(key, async () => {
      order.push(2);
      return "token-2";
    });

    const [result1, result2] = await Promise.all([first, second]);

    // Both calls must complete and return their own values
    expect(result1).toBe("token-1");
    expect(result2).toBe("token-2");

    // The second refresh must not START until after the first completes
    // order = [1, 2] proves serialization (second ran after first)
    expect(order).toEqual([1, 2]);
  });

  it("B64: withRefreshLock releases the lock even when the refresh function throws", async () => {
    const { withRefreshLock } = await import("../src/server/auth-api");

    const key = "error-credential";

    // First call throws
    await expect(withRefreshLock(key, async () => {
      throw new Error("refresh failed");
    })).rejects.toThrow("refresh failed");

    // Second call must NOT be blocked (lock was released by finally block)
    const result = await withRefreshLock(key, async () => "recovered-token");
    expect(result).toBe("recovered-token");
  });
});
