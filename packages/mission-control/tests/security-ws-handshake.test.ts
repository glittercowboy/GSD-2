/**
 * GAP-3: WebSocket first-message auth handshake regression tests.
 *
 * Verifies that the WS server correctly implements first-message authentication:
 * - Valid auth message -> connection authenticated, full state sent
 * - Invalid token -> connection closed with 4001
 * - No auth within 5 seconds -> connection closed with 4001 (timeout)
 * - No state sent before authentication
 * - No launchToken configured -> auto-authenticated (backward compat for tests)
 * - Post-auth messages (chat) work normally
 */
import { describe, it, expect, afterEach } from "bun:test";
import { createWsServer } from "../src/server/ws-server";
import type { GSD2State } from "../src/server/types";

const TEST_TOKEN = "test-token-gap3-12345";

// Minimal GSD2State factory — matches ws-server.test.ts pattern
function makeGSD2State(overrides?: Partial<GSD2State>): GSD2State {
  return {
    projectState: {
      gsd_state_version: "1.0",
      milestone: "v2.0",
      milestone_name: "Native Desktop",
      status: "in_progress",
      active_milestone: "M001",
      active_slice: "S01",
      active_task: "T01",
      auto_mode: false,
      cost: 0,
      tokens: 0,
      last_updated: "2026-03-25T00:00:00Z",
    },
    roadmap: null,
    activePlan: null,
    activeTask: null,
    decisions: null,
    preferences: null,
    project: null,
    milestoneContext: null,
    needsMigration: false,
    slices: [],
    allMilestones: [],
    uatFile: null,
    gitBranchCommits: 0,
    lastCommitMessage: "",
    ...overrides,
  };
}

let servers: ReturnType<typeof createWsServer>[] = [];

// Helper: create a WS server with optional token
function makeServer(port: number, token?: string, extraOpts?: Partial<Parameters<typeof createWsServer>[0]>) {
  const srv = createWsServer({
    port,
    getFullState: () => makeGSD2State(),
    launchToken: token,
    ...extraOpts,
  });
  servers.push(srv);
  return srv;
}

afterEach(() => {
  servers.forEach((s) => s.stop());
  servers = [];
});

// Use random port offset to avoid conflicts between parallel test runs
const BASE_PORT = 19100 + Math.floor(Math.random() * 800);

describe("GAP-3: WS first-message auth handshake", () => {
  it("connection with valid auth message receives full state", async () => {
    const port = BASE_PORT + 1;
    makeServer(port, TEST_TOKEN);

    const ws = new WebSocket(`ws://127.0.0.1:${port}?windowId=test`);
    const messages: unknown[] = [];

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        // Send auth as first message
        ws.send(JSON.stringify({ type: "auth", token: TEST_TOKEN }));
      };
      ws.onmessage = (e: MessageEvent) => {
        const msg = JSON.parse(e.data as string);
        messages.push(msg);
        if ((msg as { type: string }).type === "full") resolve();
      };
      ws.onerror = () => reject(new Error("WebSocket error"));
      setTimeout(() => reject(new Error("timeout waiting for full state")), 5000);
    });

    expect(messages.some((m) => (m as { type: string }).type === "full")).toBe(true);
    ws.close();
  });

  it("connection with invalid token is closed with 4001", async () => {
    const port = BASE_PORT + 2;
    makeServer(port, TEST_TOKEN);

    const ws = new WebSocket(`ws://127.0.0.1:${port}?windowId=test`);
    let closeCode = 0;

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "auth", token: "wrong-token-xyz" }));
      };
      ws.onclose = (e: CloseEvent) => {
        closeCode = e.code;
        resolve();
      };
      setTimeout(resolve, 5000);
    });

    expect(closeCode).toBe(4001);
  });

  it("connection without auth message times out with 4001 after ~1 second", async () => {
    const port = BASE_PORT + 3;
    makeServer(port, TEST_TOKEN);

    const ws = new WebSocket(`ws://127.0.0.1:${port}?windowId=test`);
    let closeCode = 0;
    const startTime = Date.now();

    await new Promise<void>((resolve) => {
      // Do NOT send any message — wait for the server's 1-second auth timeout
      ws.onclose = (e: CloseEvent) => {
        closeCode = e.code;
        resolve();
      };
      setTimeout(resolve, 4000); // Safety timeout
    });

    const elapsed = Date.now() - startTime;
    expect(closeCode).toBe(4001);
    // Server auth timeout is 1s — allow 500ms-3500ms window for system variance
    expect(elapsed).toBeGreaterThan(500);
    expect(elapsed).toBeLessThan(3500);
  }, 5000);

  it("no state is sent before authentication", async () => {
    const port = BASE_PORT + 4;
    makeServer(port, TEST_TOKEN);

    const ws = new WebSocket(`ws://127.0.0.1:${port}?windowId=test`);
    const allMessages: unknown[] = [];
    let authSentAt = 0;

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        // Wait 500ms — any pre-auth messages would arrive in this window
        setTimeout(() => {
          authSentAt = Date.now();
          ws.send(JSON.stringify({ type: "auth", token: TEST_TOKEN }));
        }, 500);
      };
      ws.onmessage = (e: MessageEvent) => {
        const msg = JSON.parse(e.data as string);
        allMessages.push({ ...msg, receivedAt: Date.now() });
        if ((msg as { type: string }).type === "full") resolve();
      };
      setTimeout(resolve, 4000);
    });

    // The full-state message should only arrive AFTER auth was sent (authSentAt > 0)
    const fullMsgs = allMessages.filter((m) => (m as { type: string }).type === "full");
    expect(fullMsgs.length).toBe(1);

    // Verify the full message arrived after auth was sent
    const fullMsg = fullMsgs[0] as { receivedAt: number };
    expect(fullMsg.receivedAt).toBeGreaterThan(authSentAt - 100); // Allow 100ms margin

    ws.close();
  });

  it("no launchToken configured auto-authenticates (backward compat for tests)", async () => {
    const port = BASE_PORT + 5;
    makeServer(port); // No token

    const ws = new WebSocket(`ws://127.0.0.1:${port}?windowId=test`);
    const messages: unknown[] = [];

    await new Promise<void>((resolve) => {
      // Do NOT send any auth message — state should arrive immediately without it
      ws.onmessage = (e: MessageEvent) => {
        const msg = JSON.parse(e.data as string);
        messages.push(msg);
        if ((msg as { type: string }).type === "full") resolve();
      };
      setTimeout(resolve, 3000);
    });

    // Without launchToken, state should arrive immediately on connect (no auth needed)
    expect(messages.some((m) => (m as { type: string }).type === "full")).toBe(true);
    ws.close();
  });

  it("authenticated connection can send chat messages normally", async () => {
    const port = BASE_PORT + 6;
    let receivedChat = false;

    const srv = createWsServer({
      port,
      getFullState: () => makeGSD2State(),
      launchToken: TEST_TOKEN,
      onChatMessage: (_prompt, _ws) => {
        receivedChat = true;
      },
    });
    servers.push(srv);

    const ws = new WebSocket(`ws://127.0.0.1:${port}?windowId=test`);

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        // Send auth first
        ws.send(JSON.stringify({ type: "auth", token: TEST_TOKEN }));
      };
      ws.onmessage = (e: MessageEvent) => {
        const msg = JSON.parse(e.data as string);
        if ((msg as { type: string }).type === "full") {
          // Now send a chat message after authentication
          ws.send(JSON.stringify({ type: "chat", prompt: "hello from test" }));
          setTimeout(resolve, 300);
        }
      };
      setTimeout(resolve, 4000);
    });

    expect(receivedChat).toBe(true);
    ws.close();
  });
});
