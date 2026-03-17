---
id: T02
parent: S07
milestone: M003
provides:
  - 4 child-process/direct-read services for history, inspect, hooks, and export data
  - 4 API routes exposing those services as GET endpoints
key_files:
  - src/web/history-service.ts
  - src/web/inspect-service.ts
  - src/web/hooks-service.ts
  - src/web/export-service.ts
  - web/app/api/history/route.ts
  - web/app/api/inspect/route.ts
  - web/app/api/hooks/route.ts
  - web/app/api/export-data/route.ts
key_decisions:
  - inspect-service uses direct file reads (no child process) since gsd-db.json is plain JSON with no .js extension imports
  - hooks-service sets cwd to projectCwd so preferences.ts resolvePostUnitHooks()/resolvePreDispatchHooks() find the right .gsd/preferences.md
  - export-service uses 4MB max buffer (larger than others) since export content can be substantial
patterns_established:
  - Same child-process pattern as forensics-service.ts for all services needing .js→.ts extension module access
  - Direct file read pattern for services that only need plain JSON (inspect)
observability_surfaces:
  - "GET /api/history — returns HistoryData JSON or {error} with 500"
  - "GET /api/inspect — returns InspectData JSON or {error} with 500"
  - "GET /api/hooks — returns HooksData JSON or {error} with 500"
  - "GET /api/export-data?format=markdown|json — returns ExportResult JSON or {error} with 500"
duration: 8m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T02: Build read-only child-process services and API routes for history, inspect, hooks, and export

**Built 4 data services and 4 matching API routes for history, inspect, hooks, and export command surfaces.**

## What Happened

Created 4 service files following the established forensics-service.ts child-process pattern:
- `history-service.ts` — spawns child process to import metrics.ts, calls loadLedgerFromDisk + all aggregate functions
- `inspect-service.ts` — direct file reads of gsd-db.json (no child process needed since it's plain JSON)
- `hooks-service.ts` — spawns child process to import post-unit-hooks.ts, calls getHookStatus() and formatHookStatus(); sets cwd=projectCwd so preferences resolution works
- `export-service.ts` — spawns child process to import export.ts, calls writeExportFile() then reads the generated file content back; accepts format parameter via env var

Created 4 matching API route files following the forensics route.ts pattern:
- All export `runtime = "nodejs"`, `dynamic = "force-dynamic"`, GET handler with try/catch returning 500 on error
- export-data route reads `format` from searchParams, uses `export-data` path to avoid Next.js reserved `export` keyword

## Verification

- `npm run build` — exit 0, all TypeScript compilation passes
- All 4 service files exist with correct exports: `ls src/web/{history,inspect,hooks,export}-service.ts`
- All 4 route files exist with GET exports: `ls web/app/api/{history,inspect,hooks,export-data}/route.ts`
- Each route exports exactly one `GET` function, each service exports exactly one `collect*` function

## Diagnostics

- `curl http://localhost:3000/api/history` — returns HistoryData or `{error: "..."}` with 500
- `curl http://localhost:3000/api/inspect` — returns InspectData or `{error: "..."}` with 500
- `curl http://localhost:3000/api/hooks` — returns HooksData or `{error: "..."}` with 500
- `curl http://localhost:3000/api/export-data?format=markdown` — returns ExportResult or `{error: "..."}` with 500
- All error paths return structured `{error: string}` with Cache-Control: no-store

## Deviations

- inspect-service uses direct file reads instead of child process — plan noted this was acceptable since gsd-db.json has no .js extension imports
- hooks-service calls getHookStatus() + formatHookStatus() from post-unit-hooks.ts rather than separately importing preferences.ts — getHookStatus() internally calls the preferences functions, simpler and correct

## Known Issues

- hooks activeCycles will always be empty `{}` in child process (runtime state not available) — this is by design and documented in the plan
- export-service calls writeExportFile() which creates a file on disk as a side effect — acceptable for read-only data surface since the file is a timestamped export in .gsd/

## Files Created/Modified

- `src/web/history-service.ts` — child-process service loading metrics ledger and computing aggregations
- `src/web/inspect-service.ts` — direct file-read service for gsd-db.json introspection data
- `src/web/hooks-service.ts` — child-process service for hook configuration and status
- `src/web/export-service.ts` — child-process service for generating and reading export content
- `web/app/api/history/route.ts` — thin GET route for history data
- `web/app/api/inspect/route.ts` — thin GET route for inspect data
- `web/app/api/hooks/route.ts` — thin GET route for hooks data
- `web/app/api/export-data/route.ts` — GET route with format query param for export data
