---
id: T02
parent: S02
milestone: M001-1ya5a3
provides:
  - Zustand session store with connection status, capped event log (500), streaming flag, and session metadata
  - useGsd React hook bridging IPC events to the store with auto-spawn and stable command API
  - Live CenterPanel with connection status badge, raw event stream, and working composer
key_files:
  - studio/src/renderer/src/stores/session-store.ts
  - studio/src/renderer/src/lib/rpc/use-gsd.ts
  - studio/src/renderer/src/components/layout/CenterPanel.tsx
key_decisions:
  - useGsd hook placed in CenterPanel (always mounted in current layout) rather than App.tsx — simplest wiring, avoids prop drilling or global provider
  - StrictMode double-mount guarded with mounted ref to prevent duplicate IPC subscriptions and double auto-spawn
  - Event type badge color derived from event.data.type or event.data.event field — supports both naming conventions from the RPC protocol
patterns_established:
  - Zustand selectors in components (useSessionStore(s => s.field)) for granular re-renders
  - Auto-scroll pattern with isNearBottom ref (80px threshold) to avoid fighting manual scroll-up
  - Event log capped at 500 with oldest-first eviction via array slice
  - stderr forwarded as synthetic events { type: 'stderr', message } in the store for unified display
observability_surfaces:
  - useSessionStore.getState() in React DevTools shows full connection/event/session state
  - Connection badge in CenterPanel header gives instant visual feedback on pipeline health
  - Raw event log renders every event including stderr — full pipe visibility before S03 structured rendering
  - lastError surfaces in connection badge when status is 'error'
duration: 12m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T02: Build renderer session store, useGsd hook, and raw event stream UI

**Implement Zustand session store, IPC-bridged useGsd hook with auto-spawn, and live CenterPanel with connection badge, raw JSON event stream, and working composer.**

## What Happened

Created three files that complete the renderer-side consumption layer for the gsd-2 RPC pipeline:

1. **session-store.ts** — Zustand store with `connectionStatus` (4-state union), `events` array capped at 500 (oldest evicted), `lastError`, `isStreaming`, and `sessionState`. Actions: `addEvent` (auto-generates incrementing ID + timestamp), `setConnectionStatus`, `setError` (sets both error message and status), `clearEvents`, `setStreaming`, `updateSessionState` (shallow merge).

2. **use-gsd.ts** — React hook that on mount subscribes to all three IPC channels (`onEvent`, `onConnectionChange`, `onStderr`), dispatches events to the store with type-specific routing (`state_update` → `updateSessionState`, `agent_start`/`agent_end` → streaming flag, stderr → synthetic event), and auto-spawns gsd-2 if not already connected. Exposes `sendPrompt`, `abort`, and `spawn` as stable `useCallback` refs. StrictMode double-mount guarded with a ref.

3. **CenterPanel.tsx** — Replaced S01 placeholder entirely. Header shows "Conversation / Raw event stream" with a `ConnectionBadge` (gray=disconnected, amber pulsing=connecting, green=connected, red=error with message). Scrollable event log renders each event as a compact card with colored type pill (amber for `message_update`, blue for `tool_*`, red for `stderr`, gray for others), timestamp, and formatted JSON in a `<pre>` block (JetBrains Mono, 2KB truncation). Auto-scrolls to bottom on new events only when user is already near bottom (80px threshold). Empty state shows sparkle icon + "Send a prompt to start a session". Composer textarea + Send button wired to `sendPrompt`, Enter (no Shift) submits, disabled when not connected.

## Verification

- `npm run build -w studio` — zero TypeScript errors, all three targets built successfully (main 11.80KB, preload 1.13KB, renderer 667.34KB)
- `npm run test -w studio` — 21/21 tests pass (all existing T01 + S01 tests intact)
- LSP not available in worktree; TypeScript build serves as equivalent type verification

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm run test -w studio` | 0 | ✅ pass | 3.2s |
| 2 | `npm run build -w studio` | 0 | ✅ pass | 3.7s |

Slice-level checks status (T02 is final task in S02):
- ✅ `npm run test -w studio` — 21/21 pass including gsd-service tests
- ✅ `npm run build -w studio` — zero TypeScript errors across main, preload, renderer
- ⏳ `npx electron-vite dev` runtime check — requires actual gsd binary to demonstrate full pipeline (connection status transitions, event streaming); build proves compilation correctness
- ⏳ LSP diagnostics — LSP not available in worktree; build is equivalent

## Diagnostics

- `useSessionStore.getState()` in React DevTools returns `{ connectionStatus, events, lastError, isStreaming, sessionState }` — full renderer-side state inspection
- Connection badge in CenterPanel header shows real-time pipeline health with color-coded states
- Raw event log shows every event including stderr — complete pipe visibility before S03 adds structured rendering
- `lastError` appears in the connection badge text when status is 'error'
- All main-process logging continues via `[gsd-service]` prefix — renderer adds no console logging (state observable through store and UI)

## Deviations

None. All three files created as specified.

## Known Issues

None.

## Files Created/Modified

- `studio/src/renderer/src/stores/session-store.ts` — new: Zustand store for connection status, capped event log (500), streaming flag, session metadata, with six actions
- `studio/src/renderer/src/lib/rpc/use-gsd.ts` — new: React hook bridging three IPC channels to the store with auto-spawn and stable sendPrompt/abort/spawn API
- `studio/src/renderer/src/components/layout/CenterPanel.tsx` — replaced: S01 placeholder removed, now shows connection badge, raw JSON event stream with type-colored pills, and wired composer
