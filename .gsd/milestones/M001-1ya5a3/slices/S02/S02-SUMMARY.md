---
id: S02
parent: M001-1ya5a3
milestone: M001-1ya5a3
provides:
  - GsdService subprocess manager with LF-only JSONL framing, pending request tracking, crash recovery, and extension UI auto-responder
  - Self-contained RPC type declarations (zero @gsd/ imports) covering commands, responses, session state, extension UI protocol, and fire-and-forget classification
  - Full IPC bridge — six channels (gsd:event, gsd:send-command, gsd:spawn, gsd:status, gsd:connection-change, gsd:stderr)
  - Real preload bridge replacing S01 stubs — subscription methods return cleanup functions
  - Zustand session store with connection status, capped event log (500), streaming flag, and session metadata
  - useGsd React hook bridging three IPC channels to the store with StrictMode-safe auto-spawn
  - Live CenterPanel with connection badge, raw JSON event stream, and working composer
  - 19 unit tests for JSONL framing, event dispatch, timeout, fire-and-forget classification, and auto-response
requires:
  - slice: S01
    provides: Electron main/preload/contextBridge architecture, layout panels (CenterPanel slot), design system (Text, Button, amber accent, JetBrains Mono)
affects:
  - S03
  - S05
  - S06
  - S07
key_files:
  - studio/src/main/rpc-types.ts
  - studio/src/main/gsd-service.ts
  - studio/src/main/index.ts
  - studio/src/preload/index.ts
  - studio/src/preload/index.d.ts
  - studio/src/renderer/src/stores/session-store.ts
  - studio/src/renderer/src/lib/rpc/use-gsd.ts
  - studio/src/renderer/src/components/layout/CenterPanel.tsx
  - studio/test/gsd-service.test.mjs
key_decisions:
  - Self-contained rpc-types.ts with zero @gsd/ imports — studio fully decoupled from agent internals
  - LF-only manual JSONL buffer drain (indexOf '\n'), no readline — simpler, testable, matches protocol exactly
  - Extension UI auto-responder: interactive methods get default responses + console.warn, fire-and-forget forwarded as events — prevents agent blocking before S05
  - JSONL parser and dispatch logic replicated as pure functions in test file to avoid importing Electron-dependent GsdService
  - useGsd hook placed in CenterPanel (always mounted) with StrictMode double-mount guard via ref
  - Event type badge color derived from event.data.type or event.data.event field — supports both naming conventions
patterns_established:
  - LF-only JSONL buffer drain pattern (indexOf('\n'), not readline)
  - IPC channel naming: gsd:{action} for invoke, gsd:{event-name} for send
  - Preload bridge returns cleanup functions from subscription methods (onEvent, onConnectionChange, onStderr)
  - Extension UI auto-responder pattern for fire-and-forget vs interactive methods
  - Zustand selectors in components (useSessionStore(s => s.field)) for granular re-renders
  - Auto-scroll with isNearBottom ref (80px threshold) — avoids fighting manual scroll-up
  - Event log capped at 500 with oldest-first eviction
  - stderr forwarded as synthetic events { type: 'stderr', message } for unified display
observability_surfaces:
  - "[gsd-service]" prefixed console logs for spawn (with PID), exit (code+signal), crash detection, restart attempts, auto-response warnings, dispose
  - "[studio]" prefixed logs for preload load and connection state changes
  - window.studio.getStatus() returns live { connected: boolean } from main process
  - useSessionStore.getState() in React DevTools shows full connection/event/session state
  - Connection badge in CenterPanel header gives instant visual feedback on pipeline health
  - Raw event log renders every event including stderr — full pipe visibility
  - GsdService.lastError, lastExitCode, restartCount tracked for diagnostic access
drill_down_paths:
  - .gsd/milestones/M001-1ya5a3/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001-1ya5a3/slices/S02/tasks/T02-SUMMARY.md
duration: 27m
verification_result: passed
completed_at: 2026-03-18
---

# S02: gsd-2 RPC Connection + Event Stream

**Full bidirectional RPC pipe from gsd-2 subprocess through Electron IPC to React renderer, with JSONL framing, crash recovery, extension UI auto-response, and live raw event stream UI.**

## What Happened

Built the complete main→preload→renderer pipeline in two tasks across 9 files.

**T01 (main process)** created the GsdService subprocess manager that spawns `gsd --mode rpc --no-session`, reads JSONL via manual LF-only buffer draining (no readline), tracks pending requests by ID with 30s timeout, auto-responds to interactive extension UI requests (select→first option, confirm→true, input→empty, editor→prefill), classifies fire-and-forget methods (notify, setStatus, setWidget, setTitle, set_editor_text), and recovers from crashes with exponential backoff (1s/2s/3s, max 3 in 60s). Self-contained RPC types cover the full command/response/event protocol with zero agent package imports. The preload bridge was upgraded from S01 stubs to real ipcRenderer.invoke/on calls with cleanup-returning subscriptions. 19 unit tests cover all JSONL edge cases (multi-chunk, CR+LF, Unicode passthrough, invalid JSON), dispatch routing, timeout, fire-and-forget classification, and all four auto-response methods.

**T02 (renderer)** created the Zustand session store (4-state connection status, 500-event capped log, streaming flag, session metadata), the useGsd hook that bridges three IPC channels to the store with StrictMode-safe auto-spawn, and replaced the CenterPanel placeholder with a live UI: color-coded connection badge, scrollable raw JSON event stream with type-colored pills, auto-scroll with manual override, and a working composer wired to sendPrompt.

## Verification

| Check | Result | Detail |
|-------|--------|--------|
| `npm run test -w studio` | ✅ 21/21 pass | 19 new GsdService tests + 2 existing S01 tests |
| `npm run build -w studio` | ✅ 0 errors | main 11.8KB, preload 1.1KB, renderer 667KB |
| No @gsd/ imports in rpc-types.ts | ✅ confirmed | grep returns 0 matches |
| No readline usage | ✅ confirmed | only appears in a comment |
| contextIsolation: true | ✅ preserved | security model intact |

## New Requirements Surfaced

- none

## Deviations

None. All 9 files created/modified exactly as specified in the slice plan.

## Known Limitations

- **No real gsd-2 runtime test in CI** — unit tests cover framing/dispatch logic via replicated pure functions. Full end-to-end requires launching the Electron app with a real `gsd` binary, which is a manual dev check.
- **Extension UI auto-response is a stub** — interactive prompts get default answers. S05 replaces this with real wizard UI.
- **Raw event display only** — events render as JSON. S03 replaces this with structured markdown rendering and S04 with bespoke tool cards.
- **No abort wiring in UI** — the `abort` function exists in useGsd but no cancel button is rendered yet. Comes with the composer polish in later slices.

## Follow-ups

- S03 consumes session-store events and replaces raw JSON with structured markdown message rendering
- S05 must replace the auto-responder with real interactive prompt UI (select, confirm, input, editor)
- S06 consumes IPC channels for file watching in the main process

## Files Created/Modified

- `studio/src/main/rpc-types.ts` — new: self-contained RPC protocol types (commands, responses, session state, extension UI, fire-and-forget set)
- `studio/src/main/gsd-service.ts` — new: subprocess manager with JSONL framing, pending requests, crash recovery, auto-responder
- `studio/src/main/index.ts` — modified: GsdService singleton lifecycle, IPC handler registration, event forwarding, before-quit disposal
- `studio/src/preload/index.ts` — modified: real IPC bridge replacing S01 stubs, cleanup-returning subscriptions
- `studio/src/preload/index.d.ts` — modified: updated StudioBridge type with full API shape
- `studio/src/renderer/src/stores/session-store.ts` — new: Zustand store for connection status, capped event log, streaming flag, session metadata
- `studio/src/renderer/src/lib/rpc/use-gsd.ts` — new: React hook bridging three IPC channels to store with auto-spawn
- `studio/src/renderer/src/components/layout/CenterPanel.tsx` — replaced: live connection badge, raw event stream, working composer
- `studio/test/gsd-service.test.mjs` — new: 19 unit tests for JSONL framing, dispatch, timeout, fire-and-forget, auto-response

## Forward Intelligence

### What the next slice should know
- The session store (`useSessionStore`) is the single source of truth for all agent events. S03 should consume `events` from the store and transform `message_update` events into structured markdown blocks — don't create a parallel event source.
- The `useGsd` hook already detects `agent_start`/`agent_end` events and toggles `isStreaming`. S03 can use this flag to show/hide the streaming cursor.
- Event objects have the event type in either `data.type` or `data.event` — the code handles both because the RPC protocol uses both conventions in different contexts.

### What's fragile
- **FIRE_AND_FORGET_METHODS sync** — the test file has a test that reads `headless-events.ts` from the agent package and compares it against the studio's set. If the agent adds new fire-and-forget methods, this test will fail (by design — it catches drift).
- **StrictMode double-mount guard in useGsd** — the `mounted` ref prevents duplicate IPC subscriptions. If the hook is ever moved to a component that conditionally mounts/unmounts, the ref won't reset properly. Keep it in always-mounted CenterPanel.

### Authoritative diagnostics
- `window.studio.getStatus()` in the renderer devtools — returns live connection state from the main process, bypassing the Zustand store entirely. Trust this over store state if they diverge.
- `[gsd-service]` prefixed console logs in the main process — covers spawn, exit, crash, restart, and auto-response. These are the primary pipe health signal.

### What assumptions changed
- No assumptions changed. The plan's JSONL framing approach (manual buffer + indexOf) and IPC channel design worked exactly as specified.
