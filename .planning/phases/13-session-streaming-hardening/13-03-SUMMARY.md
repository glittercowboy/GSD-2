---
phase: 13-session-streaming-hardening
plan: "03"
subsystem: ui
tags: [react, websocket, reconnect, crash-recovery, hooks]

# Dependency graph
requires:
  - phase: 13-01
    provides: GSD2StreamEvent types and stream parsing infrastructure
  - phase: 13-02
    provides: interrupt(), process_crashed event emission, SessionManager.killAll()
provides:
  - isReconnect() pure helper exported from useReconnectingWebSocket
  - onReconnect callback option in ReconnectingWebSocketOptions
  - Refresh-on-reconnect: usePlanningState sends "refresh" to server on every reconnect
  - Crash recovery banner in ChatView (isCrashed prop + amber amber banner + Reconnect button)
affects:
  - 13-05 (process_crashed wiring to isCrashed prop)
  - 13-06 (full integration verification)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "onReconnect callback ref pattern — store ref to avoid stale closures in WebSocket callbacks"
    - "wsRef pattern — ref to full WebSocket result for stable send() access inside callbacks"
    - "TDD pure-helper strategy — extract reconnect logic to isReconnect() for testability without hook mounting"

key-files:
  created: []
  modified:
    - packages/mission-control/src/hooks/useReconnectingWebSocket.ts
    - packages/mission-control/src/hooks/usePlanningState.ts
    - packages/mission-control/src/components/views/ChatView.tsx
    - packages/mission-control/tests/reconnect.test.ts

key-decisions:
  - "isReconnect(attemptBeforeConnect) extracted as pure helper — tests pure logic without hook mounting overhead"
  - "onReconnectRef used in useReconnectingWebSocket to keep callback current without re-triggering useEffect"
  - "wsRef pattern in usePlanningState — ref to full ReconnectingWebSocketResult so onReconnect always calls latest send()"
  - "crash banner uses HTML entity &#9888; for warning sign — avoids emoji encoding issues"
  - "localCrashed state in ChatViewConnected — isCrashed prop from parent overrides local; local cleared on dismiss"

patterns-established:
  - "Callback ref pattern: store options.onXxx in a ref, read ref inside useCallback — prevents stale closure without dependency array churn"
  - "Pure helper extraction: any reconnect detection logic that needs testing goes in a pure function, not inside the hook body"

requirements-completed:
  - STREAM-04
  - STREAM-05

# Metrics
duration: 5min
completed: 2026-03-12
---

# Phase 13 Plan 03: Session Streaming Hardening — Reconnect + Crash Recovery Summary

**WebSocket reconnect sends 'refresh' to force full state re-derive from disk, and ChatView renders an amber crash recovery banner when the gsd process stops unexpectedly.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-12T20:27:17Z
- **Completed:** 2026-03-12T20:32:54Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `isReconnect(attemptBeforeConnect: number): boolean` exported from `useReconnectingWebSocket` — tested with 2 new unit tests (false on first connect, true on reconnect)
- `onReconnect?: () => void` added to `ReconnectingWebSocketOptions`; called in `ws.onopen` only when `attemptRef.current > 0`
- `usePlanningState` wires `onReconnect` to send `"refresh"` via a wsRef pattern, triggering full state re-derive from `.gsd/` files on every reconnect
- `ChatView` renders an amber crash recovery banner (`role="alert"`) with "Reconnect" button when `isCrashed=true`; `ChatViewConnected` manages local crash state with prop override
- All 26 tests pass (15 reconnect unit tests + 11 layout tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add onReconnect callback to useReconnectingWebSocket** - `59ad589` (feat) — TDD: RED (import fail) → GREEN (all 15 tests pass)
2. **Task 2: Wire refresh-on-reconnect in usePlanningState and add crash banner to ChatView** - `e7e7923` (feat)

## Files Created/Modified
- `packages/mission-control/src/hooks/useReconnectingWebSocket.ts` — Added `isReconnect()` pure helper, `onReconnect?` option, `onReconnectRef`, wired `onopen` handler
- `packages/mission-control/src/hooks/usePlanningState.ts` — Added `wsRef`, `handleReconnect` callback, `onReconnect` passed to `useReconnectingWebSocket`
- `packages/mission-control/src/components/views/ChatView.tsx` — Added `isCrashed`/`onDismissCrash` to `ChatViewProps`, crash banner JSX, `localCrashed` state in `ChatViewConnected`
- `packages/mission-control/tests/reconnect.test.ts` — Added `isReconnect` import, 2-test `describe("onReconnect callback")` block

## Decisions Made
- `isReconnect()` extracted as a pure helper (not inline in the hook) — allows unit testing without mounting the hook, consistent with existing `calculateBackoffDelay`/`shouldProcessMessage` pattern
- `onReconnectRef` in `useReconnectingWebSocket` mirrors the existing `onMessageRef` pattern — keeps callback current without adding it to the `useCallback` dependency array
- `wsRef` in `usePlanningState` stores the full `ReconnectingWebSocketResult` — avoids stale closure on `send()` inside the `onReconnect` callback
- HTML entity `&#9888;` for the warning icon — avoids emoji in source files per project conventions

## Deviations from Plan

None — plan executed exactly as written. The linter automatically added a `CostState` import and two optional props (`costState?`, `onDismissBudgetWarning?`) to `ChatView.tsx`; these are forward-compatible optional props that don't affect any existing tests.

## Issues Encountered
- `bun tsc --noEmit` not available (no TypeScript CLI installed). Used `bun build` on the three modified source files instead — all 46 modules bundled cleanly with zero errors.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- `isReconnect`, `onReconnect`, and the `"refresh"` message path are in place — plan 13-05 can now wire `process_crashed` events to set `isCrashed=true` on `ChatViewConnected`
- The crash banner UI and dismiss logic are complete and tested via layout tests

---
*Phase: 13-session-streaming-hardening*
*Completed: 2026-03-12*
