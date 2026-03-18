---
id: T01
parent: S02
milestone: M008
provides:
  - update-service module with version check, async update trigger, and singleton state tracking
  - GET/POST /api/update route following existing API conventions
key_files:
  - src/web/update-service.ts
  - web/app/api/update/route.ts
key_decisions:
  - Reimplemented npm registry check inline (~20 lines) instead of importing checkForUpdates() to avoid Turbopack .js extension issues
  - POST fetches latest version before triggering so targetVersion is captured in state
patterns_established:
  - Module-level singleton for cross-request state tracking in Next.js API routes
observability_surfaces:
  - GET /api/update returns full state JSON including updateStatus, error, currentVersion, latestVersion, updateAvailable
  - updateStatus transitions: idle → running → success | error
  - error field contains stderr from failed npm install
duration: 5m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T01: Build update service and API route

**Created update service with npm version check, async update trigger via spawn(), and GET/POST API route returning 202/409.**

## What Happened

Built two files:

1. `src/web/update-service.ts` — Three exports: `checkForUpdate()` fetches npm registry for latest version and compares via `compareSemver` (imported from `../update-check.ts`); `triggerUpdate()` spawns `npm install -g gsd-pi@latest` as a background child process, rejects if already running; `getUpdateStatus()` returns the module-level singleton state. The singleton persists across requests so GET polls can observe progress.

2. `web/app/api/update/route.ts` — GET returns combined version info + update state. POST calls `triggerUpdate()`, returns 202 if started, 409 if already running. Both use try/catch with 500 fallback, `Cache-Control: no-store`, and follow the doctor route pattern.

## Verification

- `npm run build:web-host` exits 0 — no type errors, no import resolution failures
- `/api/update` listed in build output route manifest
- Compiled route confirmed in `.next/server/app/api/update/route.js` and standalone output
- `compareSemver` imported from `../update-check.ts` (not the full `checkForUpdates()`)
- `spawn()` used (not `execSync`)
- Module-level singleton state (`let updateState`) persists across requests
- POST returns 202 with `{ triggered: true }`
- Concurrent POST while running returns 409

## Diagnostics

- `curl http://localhost:PORT/api/update` — returns `{ currentVersion, latestVersion, updateAvailable, updateStatus, error? }`
- `updateStatus` field transitions: `idle → running → success | error`
- `error` field populated with stderr from failed `npm install`

## Deviations

- POST handler fetches latest version info before triggering update so `targetVersion` is captured in state — minor enhancement over plan, enables the banner to show which version is being installed.

## Known Issues

None.

## Files Created/Modified

- `src/web/update-service.ts` — new: update service with `checkForUpdate()`, `triggerUpdate()`, `getUpdateStatus()`, module-level singleton
- `web/app/api/update/route.ts` — new: GET/POST API route following doctor route pattern
