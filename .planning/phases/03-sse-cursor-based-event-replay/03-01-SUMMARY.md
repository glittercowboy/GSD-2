---
phase: 03-sse-cursor-based-event-replay
plan: 01
subsystem: api
tags: [event-log, jsonl, sse, seq, rotation, readline, atomic-rename]

# Dependency graph
requires:
  - phase: 01-password-auth-and-cookie-sessions
    provides: web-mode infrastructure and bridge-service foundation
provides:
  - EventLog class with JSONL persistence, monotonic seq numbering, and cursor-based readSince
  - getEventLogDir() hashing projectCwd for safe filesystem paths
  - bridge-service emit() wrapping all BridgeEvents with _seq field
  - bridge-service getEventLog() accessor for SSE replay route (Plan 02)
affects:
  - 03-02 (SSE replay route reads from EventLog via getEventLog())
  - 03-03 (frontend cursor tracking reads _seq from events)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - JSONL append-only event log with monotonic seq for cursor-based SSE replay
    - Sync appendFileSync for ordering guarantee under concurrent emits
    - Inline rotation trigger (every 100 appends) plus hourly fallback setInterval
    - Atomic POSIX rename for log rotation (safe for active readline streams)
    - SHA-256 hash of projectCwd for filesystem-safe log directory names

key-files:
  created:
    - src/web/event-log.ts
    - src/web/__tests__/event-log.test.ts
  modified:
    - src/web/bridge-service.ts

key-decisions:
  - "Sync appendFileSync in EventLog.append() guarantees seq ordering under concurrent emits (~0.1ms on SSD, intentional tradeoff)"
  - "Inline rotation check every 100 appends provides burst protection beyond hourly fallback timer"
  - "Rotation accumulates lines from END until ~10MB, preserving whole-line boundaries — never splits mid-line"
  - "Atomic POSIX rename (write .tmp then rename) means active readline streams on old inode continue safely"
  - "BridgeService.seq is initialized from eventLog.currentSeq on init(), surviving server restarts"
  - "getEventLog() accessor exposes EventLog instance for Plan 02 SSE replay route"

patterns-established:
  - "EventLog pattern: JSONL + monotonic seq + atomic rotation for resilient event persistence"
  - "BridgeService emit() wraps every event with _seq before dispatching to subscribers"
  - "ensureStarted() initializes EventLog early (before process spawn) ensuring logging independent of browser connections"

requirements-completed: [SESS-01, SESS-02, SESS-05, SESS-07]

# Metrics
duration: 15min
completed: 2026-03-28
---

# Phase 03 Plan 01: EventLog Module and Bridge-Service Integration Summary

**JSONL event log with monotonic seq numbers persisted on every BridgeEvent emit, with atomic log rotation and cursor-based readSince for SSE replay**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-28T19:56:00Z
- **Completed:** 2026-03-28T20:11:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `src/web/event-log.ts` with full EventLog class: append (sync, with error handling), readSince (async iterator for cursor-based replay), oldestSeq, currentSeq, filePath, init (malformed-line resilient), rotateIfNeeded (50MB threshold, atomic rename, whole-line boundaries), dispose
- All 25 unit tests pass covering init seq restore, malformed-line resilience, rotation line integrity, inline rotation trigger, append error handling, and getEventLogDir hash consistency
- Modified `src/web/bridge-service.ts` to wrap every emitted BridgeEvent with `_seq` field, persist to JSONL via EventLog.append(), initialize log in ensureStarted() independent of browser connections, expose getEventLog() for Plan 02

## Task Commits

1. **Task 1 (RED): EventLog failing tests** - `14414241` (test)
2. **Task 1 (GREEN): EventLog implementation** - `b784360b` (feat)
3. **Task 2: bridge-service integration** - `2d436605` (feat)

## Files Created/Modified

- `src/web/event-log.ts` - EventLog class with JSONL persistence, seq numbering, rotation, and getEventLogDir helper
- `src/web/__tests__/event-log.test.ts` - 25 unit tests using node:test + node:assert/strict pattern
- `src/web/bridge-service.ts` - Added EventLog import, seq/eventLog/rotationInterval fields, initEventLog(), getEventLog(), emit() with _seq wrapping, hourly rotation interval, dispose cleanup

## Decisions Made

- Sync `appendFileSync` in `append()` guarantees monotonic seq ordering under concurrent emits (explicitly documented in code comment)
- Inline rotation trigger every 100 appends as burst protection — hourly `setInterval` is fallback sweep only
- Rotation reads file, accumulates lines from END until ~10MB threshold (whole-line boundaries preserved)
- Atomic POSIX rename (write to `.tmp`, then rename over original) keeps active readline streams on old inode safe
- `BridgeService.seq` initialized from `eventLog.currentSeq` after init(), so seq numbers survive server restarts
- `getEventLog()` public accessor added to expose EventLog instance for the Plan 02 SSE replay route

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tests passed on first run of the implementation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- EventLog module is complete with all required methods for Plan 02 (SSE cursor-based replay route)
- `getEventLog()` accessor on BridgeService is ready for Plan 02 consumption
- All BridgeEvents now carry `_seq` field for client cursor tracking (Plan 03)
- Log rotation is production-ready (50MB threshold, atomic rename, whole-line boundaries)

---
*Phase: 03-sse-cursor-based-event-replay*
*Completed: 2026-03-28*
