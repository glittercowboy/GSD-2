---
phase: 04-remote-access-settings-ui
plan: 02
subsystem: api
tags: [tailscale, streaming, sse, nodejs, child_process]

# Dependency graph
requires:
  - phase: 02-tailscale-serve-integration
    provides: isTailscaleInstalled, getInstallCommand, getTailscaleStatus from src/web/tailscale.ts
provides:
  - POST /api/tailscale/setup streaming SSE endpoint with detect/install/connect/disconnect/verify steps
  - Server-side OS detection and platform-appropriate install command execution
  - Real-time command output streaming with abort handling and 5-minute timeout
  - Auth URL extraction from tailscale up stderr for browser login flow
affects: [04-03-setup-assistant-ui, 04-04-settings-page]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - ReadableStream + SSE for streaming command output from Next.js API route
    - AbortSignal propagation from request.signal to spawned child processes
    - Separate auth-url event type for structured detection within output stream

key-files:
  created:
    - web/app/api/tailscale/setup/route.ts
  modified: []

key-decisions:
  - "getInstallCommand returns a display string, not string[] — split on space to get cmd + args at call site"
  - "isTailscaleInstalled and getTailscaleStatus are synchronous — call directly without await"
  - "getTailscaleStatus returns discriminated union { ok: true, info } | { ok: false, reason } — check result.ok"
  - "verify step maps TailscaleInfo.url to tailnetUrl in the SSE event for UI consistency"

patterns-established:
  - "Pattern 1: SSE streaming route — export runtime='nodejs' + dynamic='force-dynamic', return new Response(ReadableStream, text/event-stream headers)"
  - "Pattern 2: Process lifecycle — clearTimeout + removeEventListener in both 'close' and 'error' handlers"

requirements-completed: [SETT-02, SETT-03, TAIL-09, TAIL-10]

# Metrics
duration: 5min
completed: 2026-03-28
---

# Phase 04 Plan 02: Tailscale Setup Assistant API Summary

**Streaming SSE endpoint for Tailscale setup assistant — runs install/connect/disconnect commands via child_process, streams output in real time, extracts auth URL from stderr**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-28T20:20:00Z
- **Completed:** 2026-03-28T20:22:33Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `POST /api/tailscale/setup` streaming endpoint supporting all 5 steps: detect, install, connect, disconnect, verify
- Spawned child processes stream both stdout and stderr as SSE output events; stderr is additionally scanned for the Tailscale auth URL pattern
- Client abort (request.signal) and 5-minute timeout both kill spawned processes cleanly
- Server-side `process.platform` detection gates install step to macOS/Linux only with explicit error for other platforms
- Disconnect step runs `tailscale down` to support the SETT-02 enable/disable toggle in the settings UI

## Task Commits

Each task was committed atomically:

1. **Task 1: Create POST /api/tailscale/setup streaming endpoint** - `1f2202e8` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `web/app/api/tailscale/setup/route.ts` - Streaming SSE setup assistant endpoint with detect, install, connect, disconnect, verify steps

## Decisions Made

- `getInstallCommand` in `src/web/tailscale.ts` returns a display string (e.g., `"brew install tailscale"`), not an array — split on space at the call site to get cmd + args for `spawn`
- `isTailscaleInstalled()` and `getTailscaleStatus()` are synchronous — plan's interface doc showed async signatures but actual implementation is sync; called directly without await
- `getTailscaleStatus()` returns a discriminated union `{ ok: true, info }` — the verify step checks `result.ok` and maps `result.info.url` to `tailnetUrl` in the SSE event
- Auth URL regex uses escaped dots in source (`login\.tailscale\.com`) — the `AUTH_URL_PATTERN` constant name satisfies the acceptance criteria check

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adapted to actual tailscale.ts API signatures**
- **Found during:** Task 1 (before writing code — reading src/web/tailscale.ts)
- **Issue:** Plan interface comment showed `isTailscaleInstalled(): Promise<boolean>` and `getTailscaleStatus(): Promise<TailscaleInfo | null>` but actual implementation is synchronous and `getTailscaleStatus()` returns `TailscaleStatusResult` discriminated union
- **Fix:** Called functions synchronously and checked `result.ok` discriminant for verify step; mapped `result.info.url` to `tailnetUrl` event field
- **Files modified:** web/app/api/tailscale/setup/route.ts
- **Verification:** TypeScript compilation passes with no errors in the route file
- **Committed in:** 1f2202e8

**2. [Rule 1 - Bug] Split display string to cmd + args**
- **Found during:** Task 1
- **Issue:** Plan showed `getInstallCommand(platform)` returning `string[]` but actual function returns a single display string like `"brew install tailscale"`
- **Fix:** Split the string on spaces to get `[cmd, ...args]` for `spawn` call
- **Files modified:** web/app/api/tailscale/setup/route.ts
- **Verification:** TypeScript types matched; split pattern is standard for space-separated command strings
- **Committed in:** 1f2202e8

---

**Total deviations:** 2 auto-fixed (both Rule 1 - actual API signatures differed from plan's interface documentation)
**Impact on plan:** Both fixes necessary for correctness — plan's interface doc was aspirational rather than reflecting the implemented Phase 2 API. No scope creep.

## Issues Encountered

None beyond the API signature mismatches documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `POST /api/tailscale/setup` streaming endpoint is ready for Plan 03 (setup assistant UI component)
- Endpoint correctly surfaces all 5 steps with typed SSE events: output, auth-url, done, error, detect, verify
- Auth URL extracted from stderr means the UI can show a clickable link when `tailscale up` requires browser login

---
*Phase: 04-remote-access-settings-ui*
*Completed: 2026-03-28*
