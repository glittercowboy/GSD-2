---
estimated_steps: 5
estimated_files: 3
---

# T02: Build renderer session store, useGsd hook, and raw event stream UI

**Slice:** S02 — gsd-2 RPC Connection + Event Stream
**Milestone:** M001-1ya5a3

## Description

Create the renderer-side consumption layer that proves the full round-trip pipeline. This task builds a Zustand store to hold connection state and accumulated events, a React hook that subscribes to the preload bridge's IPC events and dispatches them to the store, and replaces the CenterPanel placeholder with a live raw event stream display and working composer.

The existing design system from S01 (Button, Text, Icon components, amber accent, JetBrains Mono, dark theme tokens) should be used throughout. The raw event display is intentionally lo-fi — it's proof the pipe works, not the final message rendering (that's S03). But it should still look intentional within the existing design language.

**Key constraints:**
- The preload bridge from T01 exposes: `window.studio.onEvent(cb)`, `window.studio.onConnectionChange(cb)`, `window.studio.onStderr(cb)`, `window.studio.sendCommand(cmd)`, `window.studio.spawn()`, `window.studio.getStatus()`
- `sendCommand` for prompts uses `{ type: 'prompt', message: '...' }` — the response is just an acknowledgment; actual work streams as events
- Event log should be capped at 500 entries for memory (oldest evicted first)
- The hook should auto-spawn gsd-2 on mount if status is disconnected
- Use existing UI components from `studio/src/renderer/src/components/ui/` (Button, Text)

## Steps

1. **Create `studio/src/renderer/src/stores/session-store.ts`** — Zustand store with:
   - State shape:
     ```
     connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
     events: Array<{ id: number; timestamp: number; data: Record<string, unknown> }>
     lastError: string | null
     isStreaming: boolean
     sessionState: { model?: { provider: string; id: string }; sessionName?: string } | null
     ```
   - Actions:
     - `addEvent(event)` — appends to events array, auto-generates incrementing ID and timestamp, caps at 500 entries (drop oldest)
     - `setConnectionStatus(status)` — updates connectionStatus
     - `setError(message)` — sets lastError and connectionStatus to 'error'
     - `clearEvents()` — empties the events array
     - `setStreaming(value)` — updates isStreaming
     - `updateSessionState(state)` — merges partial session state updates
   - Export the store hook as `useSessionStore`

2. **Create `studio/src/renderer/src/lib/rpc/use-gsd.ts`** — React hook for IPC subscription and command API:
   - On mount (`useEffect`):
     - Subscribe to `window.studio.onEvent(event => ...)` — dispatch events to store via `addEvent`. If event type is `state_update`, also call `updateSessionState`. If event type is `agent_start`, set streaming true. If event type is `agent_end`, set streaming false.
     - Subscribe to `window.studio.onConnectionChange(connected => ...)` — update connection status ('connected' or 'disconnected')
     - Subscribe to `window.studio.onStderr(msg => ...)` — log to store as error event
     - Auto-spawn: call `window.studio.getStatus()`, if not connected, set status to 'connecting' and call `window.studio.spawn()`
     - Return cleanup function that unsubscribes all listeners
   - Expose functions (stable refs via `useCallback` or defined outside the effect):
     - `sendPrompt(message: string)` — calls `window.studio.sendCommand({ type: 'prompt', message })`
     - `abort()` — calls `window.studio.sendCommand({ type: 'abort' })`
     - `spawn()` — sets status to 'connecting', calls `window.studio.spawn()`
   - Return: `{ sendPrompt, abort, spawn }` (store state accessed directly via `useSessionStore`)

3. **Replace `studio/src/renderer/src/components/layout/CenterPanel.tsx`** — Remove all placeholder content and build:
   - **Header bar:** "Conversation" heading (keep existing pattern) with a connection status badge on the right. Badge styling:
     - `disconnected` → gray dot + "Disconnected" text
     - `connecting` → amber pulsing dot + "Connecting…" text  
     - `connected` → green dot + "Connected" text
     - `error` → red dot + error message or "Error" text
   - **Event log area:** Scrollable container filling the center space. Each event rendered as a compact block:
     - Left: event type as a colored pill/badge (amber for `message_update`, blue-gray for `tool_*`, default gray for others)
     - Right: timestamp
     - Below: the event payload as formatted JSON in a `<pre>` block using JetBrains Mono, with `JSON.stringify(data, null, 2)` truncated to keep each block reasonable
     - Auto-scroll to bottom on new events (use a `useEffect` with a ref on the scroll container; scroll only if user is already at/near bottom to avoid fighting manual scrolling)
   - **Composer:** Keep the existing textarea + Send button pattern from S01 but wire it:
     - textarea value managed by local state
     - Send button calls `sendPrompt(value)` and clears the textarea
     - Enter key (without shift) also submits
     - Disable Send button + textarea when `connectionStatus !== 'connected'`
   - **Empty state:** When no events exist, show a subtle message like "Send a prompt to start a session" with the sparkle icon
   - Use `useGsd()` hook at the top of the component for the send/spawn API, and `useSessionStore()` selectors for reactive state

4. **Wire up the hook in the component tree:**
   - The `useGsd()` hook should be called in `CenterPanel.tsx` so the IPC subscription is active when the panel mounts
   - Alternatively, call it in `App.tsx` or `AppLayout.tsx` if the subscription should be app-global (since gsd-2 events are relevant even when the center panel isn't focused). Decide based on what's simplest — if CenterPanel always mounts (it does in the current layout), placing it there is fine.

5. **Verify the full pipeline:**
   - `npm run build -w studio` — TypeScript compilation succeeds
   - LSP diagnostics clean on all new/modified renderer files
   - Dev launch: `npm run dev -w studio` → observe connection status changes, send a prompt, see raw events streaming

## Must-Haves

- [ ] Zustand store holds connection status, capped event log (500), streaming flag, and session metadata
- [ ] `useGsd` hook subscribes to all three IPC channels and auto-spawns on mount
- [ ] CenterPanel shows live connection status badge with color-coded states
- [ ] Raw events render as styled JSON blocks with event type labels and timestamps
- [ ] Composer textarea + Send button wires to `sendPrompt` and clears on send
- [ ] Enter (without Shift) submits the prompt
- [ ] Send disabled when not connected
- [ ] Auto-scroll to bottom on new events (without fighting manual scroll-up)
- [ ] `npm run build -w studio` passes with zero errors

## Verification

- `npm run build -w studio` — zero TypeScript errors across the renderer
- LSP diagnostics clean on `session-store.ts`, `use-gsd.ts`, `CenterPanel.tsx`
- `npm run dev -w studio` runtime verification: connection status transitions visible, typing a prompt and clicking Send produces raw JSON events in the center panel, event log auto-scrolls

## Inputs

- `studio/src/preload/index.ts` (from T01) — the real IPC bridge with `onEvent`, `onConnectionChange`, `onStderr`, `sendCommand`, `spawn`, `getStatus`
- `studio/src/preload/index.d.ts` (from T01) — updated `StudioBridge` type on `window.studio`
- `studio/src/renderer/src/components/ui/Button.tsx` (from S01) — shared button primitive
- `studio/src/renderer/src/components/ui/Text.tsx` (from S01) — shared typography primitive
- `studio/src/renderer/src/styles/index.css` (from S01) — theme tokens and design system CSS
- `studio/src/renderer/src/components/layout/CenterPanel.tsx` (from S01) — placeholder to replace
- `studio/package.json` — zustand is already installed as a dependency

## Expected Output

- `studio/src/renderer/src/stores/session-store.ts` — Zustand store for connection state, events, and session metadata
- `studio/src/renderer/src/lib/rpc/use-gsd.ts` — React hook bridging IPC events to the Zustand store with command API
- `studio/src/renderer/src/components/layout/CenterPanel.tsx` — replaced with live event stream, connection status, and working composer

## Observability Impact

- **Zustand store** is the primary inspection surface: `useSessionStore.getState()` in React DevTools shows `connectionStatus`, full `events[]` array (capped at 500), `isStreaming`, `lastError`, and `sessionState`. This is the single source of truth for all renderer-side connection and event data.
- **Connection status badge** in the CenterPanel header provides instant visual feedback on the main→renderer pipeline health. Status transitions (disconnected → connecting → connected) are driven by `gsd:connection-change` IPC events from GsdService.
- **Raw event log** renders every event flowing through the RPC pipe, including stderr forwarded as `{ type: 'stderr', message }` entries. This gives full visibility into what the agent subprocess is producing before S03 adds structured rendering.
- **Failure visibility**: `lastError` surfaces in the connection badge when status is 'error'. Auto-spawn failures on mount are caught and routed to `setError`. Disconnection events from crash/kill propagate through `onConnectionChange` to the badge.
- **No new logging**: All console logging remains in the main process (`[gsd-service]` prefix). The renderer is intentionally log-free — state is observable through the Zustand store and the rendered UI.
