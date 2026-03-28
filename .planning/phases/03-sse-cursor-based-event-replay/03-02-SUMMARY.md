---
phase: 03-sse-cursor-based-event-replay
plan: 02
subsystem: api
tags: [sse, replay, cursor, live-buffer, snapshot, ping, event-stream]

# Dependency graph
requires:
  - phase: 03-sse-cursor-based-event-replay
    plan: 01
    provides: EventLog class with readSince/oldestSeq/currentSeq, bridge-service getEventLog() accessor
provides:
  - SSE endpoint with cursor-based replay, replay ceiling protocol, capped live buffering, stale cursor handling
  - encodeSseEvent() helper for named SSE event types (replay, live, snapshot)
  - Ping heartbeat every 30s for zombie connection detection
affects:
  - 03-03 (frontend cursor tracking reads named SSE events via addEventListener)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Replay ceiling seq (captured before file read) prevents duplicate delivery across replay/live handoff
    - Live event buffer with 10k cap during replay; overflow falls back to snapshot signal
    - Named SSE event types (event: replay/live/snapshot) alongside backward-compat unnamed events
    - Ping heartbeat via SSE comment lines (": ping") to detect zombie connections

key-files:
  modified:
    - web/app/api/session/events/route.ts

key-decisions:
  - "Replay ceiling captures eventLog.currentSeq before readSince() starts — prevents duplicate delivery of events that arrive during file read"
  - "No-cursor path uses unnamed encodeSseData (onmessage-compatible) for backward compat; cursor path uses named encodeSseEvent"
  - "liveBuffer overflow aborts replay and sends snapshot event — prevents unbounded memory growth per connection"
  - "isReplaying flag set false in finally block — guarantees live mode even on read errors"

# Metrics
duration: 2min
completed: 2026-03-28
---

# Phase 03 Plan 02: SSE Cursor-Based Replay Endpoint Summary

**SSE endpoint extended with replay ceiling protocol, capped live buffering, stale cursor detection, and ping heartbeat for cursor-based event replay on reconnect**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-28T20:03:28Z
- **Completed:** 2026-03-28T20:05:49Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Extended `web/app/api/session/events/route.ts` with full cursor-based replay protocol
- Strict `?since=N` validation: rejects NaN, negative, decimal — only non-negative integers accepted via `String(parsed) === sinceParam`
- Replay ceiling (`replayCeilingSeq = eventLog.currentSeq`) captured before `readSince()` starts, preventing duplicate delivery of events arriving during file read
- Live event buffer (`liveBuffer`) captures events emitted during replay; flushed after ceiling; capped at 10,000 entries per connection
- Buffer overflow triggers `snapshot` event with `reason: "buffer_overflow"` — client knows to do full page refresh
- Stale cursor detection: if `sinceSeq < oldest`, sends `snapshot` event with `reason: "cursor_expired"`
- `live` sentinel event (`{ type: "stream_live" }`) emitted after replay completes — client dismisses "Catching up..." banner
- Ping heartbeat (SSE comment `": ping"`) every 30 seconds with proper cleanup on close/cancel
- `closeWith()` and `cancel()` both clean up ping interval and unsubscribe
- Backward compatibility: no-cursor requests (`?since` absent) use unnamed `encodeSseData` for existing `onmessage` clients

## Task Commits

1. **Task 1: SSE replay ceiling protocol** - `ae50a72d` (feat)

## Files Created/Modified

- `web/app/api/session/events/route.ts` - Extended with encodeSseEvent, since validation, replay ceiling, live buffer cap, stale cursor handling, ping heartbeat

## Decisions Made

- Replay ceiling captures `eventLog.currentSeq` before `readSince()` starts — prevents duplicate delivery of events that arrive during file read (the interval between subscribe() and readSince() start)
- No-cursor path re-wires subscribe to use unnamed `encodeSseData` for backward compat with `onmessage` clients; cursor path uses named `encodeSseEvent`
- `liveBuffer` overflow sends `snapshot` event instead of partial replay — prevents unbounded memory growth per connection
- `isReplaying = false` in `finally` block guarantees transition to live mode even when replay errors out

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in unrelated packages (packages/pi-coding-agent, packages/pi-ai) and src/web/onboarding-service.ts were present before this plan. No new errors introduced by this change.

## User Setup Required

None - server-side only change.

## Next Phase Readiness

- SSE endpoint now sends named events (`event: replay`, `event: live`, `event: snapshot`) ready for Plan 03 frontend cursor tracking
- `live` sentinel (`{ type: "stream_live" }`) allows client to dismiss reconnect banner
- `snapshot` events (`cursor_expired`, `buffer_overflow`, `replay_error`) allow client to trigger full refresh
- Backward compat maintained — existing clients unaffected until Plan 03 updates the frontend

---
*Phase: 03-sse-cursor-based-event-replay*
*Completed: 2026-03-28*
