/**
 * WebSocket server for broadcasting PlanningState updates.
 * Uses Bun.serve() with WebSocket support and topic-based pub/sub.
 *
 * Clients receive full state on connect, diff-only updates on changes.
 * Supports "refresh" message to re-send full state.
 *
 * GAP-3: First-message auth handshake.
 * When launchToken is configured, connections start UNAUTHENTICATED.
 * The client must send { type: "auth", token: "<launch-token>" } as the first message.
 * Server subscribes to topics only after valid auth. Closes with 4001 after 5-second timeout.
 */
import type { PlanningState, StateDiff } from "./types";
import type { PermissionResponse } from "./chat-types";
import type { Server, ServerWebSocket } from "bun";

/** Session action types for multi-session CRUD over WebSocket. */
export type SessionAction =
  | { type: "session_create"; forkFromSessionId?: string }
  | { type: "session_close"; sessionId: string; closeAction?: "merge" | "keep" | "delete" }
  | { type: "session_rename"; sessionId: string; name: string }
  | { type: "session_list" }
  | { type: "session_interrupt"; sessionId: string }
  | { type: "session_force_complete"; sessionId: string };

export interface WsServerOptions {
  port: number;
  getFullState: () => PlanningState;
  /** Called when a client sends a chat message. sessionId is optional for backward compat. */
  onChatMessage?: (prompt: string, ws: ServerWebSocket, sessionId?: string) => void;
  /** Custom slash commands discovered at startup. Sent to clients on connect. */
  customCommands?: Array<{ command: string; description: string; args: string; source: string }>;
  /** Called when a client sends a permission response (approve/deny/always_allow). */
  onPermissionResponse?: (response: PermissionResponse, ws: ServerWebSocket) => void;
  /** Called when a client sends a session action (create/close/rename/list). */
  onSessionAction?: (action: SessionAction, ws: ServerWebSocket) => void;
  /** Called when a new client connects, after initial state is sent. */
  onClientConnect?: (ws: ServerWebSocket) => void;
  /**
   * T-AUTH-01 B51: Per-launch secret token for WebSocket first-message handshake.
   * GAP-3: Token is no longer validated on upgrade (URL query string).
   * Instead, client must send { type: "auth", token: "<value>" } as first message.
   * If omitted, token validation is skipped (for backward compatibility in tests).
   */
  launchToken?: string;
}

export interface WsServer {
  broadcast(diff: StateDiff, windowId?: string): void;
  /** Send a chat response to a specific client. */
  sendToClient(ws: ServerWebSocket, data: unknown): void;
  /** Broadcast chat event to all clients subscribed to "chat" topic. */
  publishChat(data: unknown): void;
  /** Broadcast session metadata updates to all clients. */
  publishSessionUpdate(data: unknown): void;
  stop(): void;
  getSequence(): number;
  /** The hostname the server is bound to. */
  readonly hostname: string;
}

const TOPIC_PREFIX = "planning-state:";
const CHAT_TOPIC = "chat";

/**
 * T-NET-01 B38: Allowed WebSocket upgrade origins.
 * Only Tauri app and file:// origins are permitted. Requests from web origins
 * (e.g. evil.com) are rejected with 403 to prevent cross-site WebSocket hijacking.
 * A missing/null Origin header (same-process IPC) is also allowed.
 */
const allowedOrigins = new Set(["tauri://localhost", "file://"]);

/**
 * Creates a WebSocket server on the specified port.
 *
 * - On client connect: sends full state with type "full"
 * - On "refresh" message: sends full state again
 * - On JSON { type: "chat" } message: calls onChatMessage callback
 * - broadcast(): publishes diff to all subscribed clients via topic
 * - publishChat(): publishes chat events to all subscribed clients via "chat" topic
 * - Monotonic sequence counter increments on every message sent
 */
export function createWsServer(options: WsServerOptions): WsServer {
  const { port, getFullState, onChatMessage, customCommands, onPermissionResponse, onSessionAction, onClientConnect, launchToken } = options;
  let sequence = 0;

  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch(req, server) {
      // T-NET-01 B38: Validate Origin header on WebSocket upgrade to prevent
      // cross-site WebSocket hijacking. Missing Origin (IPC/Tauri) is allowed.
      const origin = req.headers.get("origin");
      if (origin && !allowedOrigins.has(origin)) {
        return new Response(JSON.stringify({ error: "Origin not allowed" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }

      // T-AUTH-01 B52: Extract windowId for per-window topic scoping.
      // GAP-3: Token is no longer validated on upgrade — moved to first-message handshake.
      // windowId is not sensitive and remains in the URL for per-window topic routing.
      const url = new URL(req.url);
      const windowId = url.searchParams.get("windowId") || "default";

      // GAP-3: Start connection UNAUTHENTICATED — auth happens via first message
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const upgraded = (server as any).upgrade(req, { data: { windowId, authenticated: !launchToken } });
      if (upgraded) return undefined;
      return new Response("Mission Control WebSocket Server", { status: 200 });
    },
    websocket: {
      open(ws: ServerWebSocket) {
        const wsData = (ws as unknown as { data?: { windowId?: string; authenticated?: boolean } }).data;
        const wsWindowId = wsData?.windowId || "default";

        if (launchToken) {
          // GAP-3: Connection starts UNAUTHENTICATED — client must send auth message first.
          // Set 1-second timeout: close with 4001 if not authenticated in time.
          // 1s is generous for legitimate clients (they send auth immediately).
          const authTimeout = setTimeout(() => {
            const currentData = (ws as unknown as { data?: { authenticated?: boolean } }).data;
            if (!currentData?.authenticated) {
              ws.close(4001, "Authentication timeout");
            }
          }, 1000);
          (ws as unknown as { data: { authTimeout?: ReturnType<typeof setTimeout> } }).data.authTimeout = authTimeout;
        } else {
          // No launchToken configured (tests/dev) — auto-authenticate immediately
          (ws as unknown as { data: { authenticated: boolean } }).data.authenticated = true;
          ws.subscribe(TOPIC_PREFIX + wsWindowId);
          ws.subscribe(CHAT_TOPIC);
          sequence++;
          const state = getFullState();
          ws.send(
            JSON.stringify({
              type: "full",
              state,
              sequence,
              timestamp: Date.now(),
            })
          );
          // Send custom commands if available (for slash command autocomplete)
          if (customCommands && customCommands.length > 0) {
            ws.send(JSON.stringify({ type: "custom_commands", commands: customCommands }));
          }
          // Notify that client has connected and received initial state
          if (onClientConnect) {
            onClientConnect(ws);
          }
        }
      },
      message(ws: ServerWebSocket, message: string | Buffer) {
        const msg = typeof message === "string" ? message : message.toString();
        const wsData = (ws as unknown as { data?: { windowId?: string; authenticated?: boolean; authTimeout?: ReturnType<typeof setTimeout> } }).data;

        // GAP-3: First-message auth handshake — gate all messages until authenticated
        if (launchToken && !wsData?.authenticated) {
          try {
            const parsed = JSON.parse(msg);
            if (parsed.type === "auth" && parsed.token === launchToken) {
              // Valid auth — authenticate, clear timeout, subscribe, send full state
              if (wsData) {
                wsData.authenticated = true;
                if (wsData.authTimeout) {
                  clearTimeout(wsData.authTimeout);
                  wsData.authTimeout = undefined;
                }
              }
              const wsWindowId = wsData?.windowId || "default";
              ws.subscribe(TOPIC_PREFIX + wsWindowId);
              ws.subscribe(CHAT_TOPIC);
              sequence++;
              const state = getFullState();
              ws.send(
                JSON.stringify({
                  type: "full",
                  state,
                  sequence,
                  timestamp: Date.now(),
                })
              );
              if (customCommands && customCommands.length > 0) {
                ws.send(JSON.stringify({ type: "custom_commands", commands: customCommands }));
              }
              if (onClientConnect) {
                onClientConnect(ws);
              }
              return;
            }
          } catch {
            // Not valid JSON — fall through to close
          }
          // Invalid or missing auth — reject immediately
          ws.close(4001, "Unauthorized");
          return;
        }

        if (msg === "refresh") {
          sequence++;
          const state = getFullState();
          ws.send(
            JSON.stringify({
              type: "full",
              state,
              sequence,
              timestamp: Date.now(),
            })
          );
          return;
        }

        // Try parsing JSON messages (chat protocol + session actions)
        try {
          const parsed = JSON.parse(msg);
          if (parsed.type === "chat" && parsed.prompt && onChatMessage) {
            console.log(`[ws-server] Chat message received: "${parsed.prompt.slice(0, 80)}"`);
            onChatMessage(parsed.prompt, ws, parsed.sessionId);
          } else if (parsed.type === "permission_response" && onPermissionResponse) {
            console.log(`[ws-server] Permission response: ${parsed.action} for ${parsed.promptId}`);
            onPermissionResponse(parsed as PermissionResponse, ws);
          } else if (
            onSessionAction &&
            (parsed.type === "session_create" ||
              parsed.type === "session_close" ||
              parsed.type === "session_rename" ||
              parsed.type === "session_list" ||
              parsed.type === "session_interrupt" ||
              parsed.type === "session_force_complete")
          ) {
            console.log(`[ws-server] Session action: ${parsed.type}`);
            onSessionAction(parsed as SessionAction, ws);
          }
        } catch {
          // Not JSON -- ignore (could be other string messages)
        }
      },
      close(ws: ServerWebSocket) {
        const wsData = (ws as unknown as { data?: { windowId?: string; authTimeout?: ReturnType<typeof setTimeout> } }).data;
        const wsWindowId = wsData?.windowId || "default";
        // GAP-3: Clear auth timeout on disconnect to prevent close-after-close
        if (wsData?.authTimeout) {
          clearTimeout(wsData.authTimeout);
        }
        ws.unsubscribe(TOPIC_PREFIX + wsWindowId);
        ws.unsubscribe(CHAT_TOPIC);
      },
    },
  });

  return {
    broadcast(diff: StateDiff, windowId?: string): void {
      sequence++;
      diff.sequence = sequence;
      server.publish(TOPIC_PREFIX + (windowId || "default"), JSON.stringify(diff));
    },
    sendToClient(ws: ServerWebSocket, data: unknown): void {
      const payload = JSON.stringify(data);
      const result = ws.send(payload);
      if (result === -1) {
        console.warn(`[ws-server] sendToClient: message dropped (backpressure), type=${(data as { type?: string })?.type}`);
      }
    },
    publishChat(data: unknown): void {
      server.publish(CHAT_TOPIC, JSON.stringify(data));
    },
    publishSessionUpdate(data: unknown): void {
      server.publish(CHAT_TOPIC, JSON.stringify(data));
    },
    stop(): void {
      server.stop(true);
    },
    getSequence(): number {
      return sequence;
    },
    get hostname(): string {
      return server.hostname ?? "localhost";
    },
  };
}
