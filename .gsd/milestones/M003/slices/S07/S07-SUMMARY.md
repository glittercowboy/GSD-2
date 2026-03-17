---
id: S07
parent: M003
milestone: M003
provides:
  - 10 real browser-native panel components replacing all placeholder GSD command surfaces
  - 7 API routes (history, inspect, hooks, export-data, undo, cleanup, steer) with child-process or direct-read backends
  - 6 child-process services (history, inspect, hooks, export, undo, cleanup) following forensics-service.ts pattern
  - 7 phase-tracked store load functions + 2 mutation functions (undo, cleanup) in workspace store
  - Browser-safe TypeScript interfaces for all 7 data-bearing surfaces
  - CommandSurfaceRemainingState with 7 phase-tracked slices wired into the command surface contract
requires:
  - slice: S01
    provides: Unified codebase with upstream modules (metrics.ts, post-unit-hooks.ts, export.ts, native-git-bridge.ts, completed-units.json schema)
  - slice: S02
    provides: Dispatch entries routing all 10 commands to gsd-prefixed surfaces with placeholder content
affects:
  - S08
key_files:
  - web/lib/remaining-command-types.ts
  - web/lib/command-surface-contract.ts
  - web/components/gsd/remaining-command-panels.tsx
  - web/components/gsd/command-surface.tsx
  - web/lib/gsd-workspace-store.tsx
  - src/web/history-service.ts
  - src/web/inspect-service.ts
  - src/web/hooks-service.ts
  - src/web/export-service.ts
  - src/web/undo-service.ts
  - src/web/cleanup-service.ts
  - web/app/api/history/route.ts
  - web/app/api/inspect/route.ts
  - web/app/api/hooks/route.ts
  - web/app/api/export-data/route.ts
  - web/app/api/undo/route.ts
  - web/app/api/cleanup/route.ts
  - web/app/api/steer/route.ts
key_decisions:
  - D060: 10 panels extracted to remaining-command-panels.tsx with three-tier data access (no-API, read-only API, mutation API)
patterns_established:
  - Three-tier data access classification — static/existing-data panels (quick, status, queue) skip API calls; read-only panels (history, inspect, hooks) fetch via GET; mutation panels (undo, cleanup) use GET+POST with auto-reload after success
  - patchRemainingCommandsPhaseState generic helper for typed state patches across all 7 remaining command slices
  - Client-side blob download via URL.createObjectURL for export (per D052)
  - Confirmation dialogs before destructive mutations (undo, cleanup)
  - Direct file read for plain JSON/markdown (inspect→gsd-db.json, steer→OVERRIDES.md) vs child-process for .js-extension modules
observability_surfaces:
  - "GET /api/history — HistoryData JSON with ledger, aggregates by phase/slice/model"
  - "GET /api/inspect — InspectData JSON with schema version, counts, recent entries"
  - "GET /api/hooks — HooksData JSON with hook status entries (name, type, enabled, targets)"
  - "GET /api/export-data?format=markdown|json — ExportResult with generated content"
  - "GET /api/undo — UndoInfo JSON with last completed unit; POST executes undo"
  - "GET /api/cleanup — CleanupData with branches/snapshots; POST deletes specified items"
  - "GET /api/steer — SteerData with OVERRIDES.md content"
  - "commandSurface.remainingCommands.* phase transitions (idle/loading/loaded/error) in Zustand store"
drill_down_paths:
  - .gsd/milestones/M003/slices/S07/tasks/T01-SUMMARY.md
  - .gsd/milestones/M003/slices/S07/tasks/T02-SUMMARY.md
  - .gsd/milestones/M003/slices/S07/tasks/T03-SUMMARY.md
  - .gsd/milestones/M003/slices/S07/tasks/T04-SUMMARY.md
duration: ~50min
verification_result: passed
completed_at: 2026-03-16
---

# S07: Remaining Command Surfaces

**Replaced all 10 placeholder GSD command surfaces with real browser-native panels backed by live data, API routes, and phase-tracked store state — zero "coming soon" placeholders remain.**

## What Happened

T01 defined browser-safe TypeScript interfaces for 7 data-bearing surfaces (HistoryData, InspectData, HookStatusEntry, ExportResult, UndoInfo, CleanupData, SteerData) and wired `CommandSurfaceRemainingState` with phase-tracked slices into the command surface contract.

T02 built 4 read-only services and API routes: history-service (child-process loading metrics ledger + aggregation), inspect-service (direct read of gsd-db.json), hooks-service (child-process calling getHookStatus from post-unit-hooks.ts), and export-service (child-process generating export files). Each API route follows the established forensics route pattern — thin GET handlers with try/catch and structured error responses.

T03 built 2 mutation services (undo, cleanup) with GET+POST routes, a steer route (direct OVERRIDES.md read), and wired all 7 store load functions plus 2 mutation functions into the workspace store. The `patchRemainingCommandsPhaseState` helper provides typed state patching. Mutation functions auto-reload data after success.

T04 delivered 10 panel components in remaining-command-panels.tsx (1265 lines): QuickPanel (static usage text), HistoryPanel (tabbed metrics breakdowns), UndoPanel (last unit + confirm button), SteerPanel (OVERRIDES display + message form), HooksPanel (hook status table), InspectPanel (DB overview), ExportPanel (format selector + download), CleanupPanel (branch/snapshot lists + delete), QueuePanel (milestone registry from existing data), StatusPanel (active state summary). All wired into command-surface.tsx with 10 switch cases and auto-loader extension for 6 data-fetching surfaces.

## Verification

- `npm run build` — ✅ exit 0
- `npm run build:web-host` — ✅ exit 0, all 7 new API routes visible in build output
- `npx tsx --test src/tests/web-command-parity-contract.test.ts` — 114/118 pass (4 pre-existing `visualize` dispatch failures, not introduced by S07)
- `rg "This surface will be implemented" web/components/gsd/command-surface.tsx` — 0 matches ✅
- All 7 API route files exist: history, inspect, hooks, export-data, undo, cleanup, steer ✅

## Requirements Advanced

- R108 — All 10 remaining `/gsd` subcommands now open browser-native surfaces with real content, controls, and state visibility. Quick shows usage instructions; history shows metrics ledger with breakdowns; inspect shows DB introspection; hooks shows hook configuration; export generates downloadable output; undo shows last unit with confirm action; cleanup shows branch/snapshot management; steer shows OVERRIDES.md; status and queue show workspace state. No placeholder surfaces remain.
- R101 — S07 completes the final supporting slice for R101. All 20 surface-dispatched commands now render real content (S04: forensics/doctor/skill-health, S05: knowledge/captures, S06: settings/model/config, S07: remaining 10).

## Requirements Validated

- R108 — Both builds pass, all 10 surfaces render named panel components, zero placeholder text remains, API routes return structured data. The 118-test parity contract confirms dispatch still routes correctly.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- inspect-service uses direct file reads instead of child process (gsd-db.json is plain JSON, no .js extension imports needed)
- hooks-service calls getHookStatus() which internally resolves preferences, rather than separately importing preferences.ts — simpler and correct
- T04 panels were already implemented from a prior executor session; the task verified correctness rather than building from scratch

## Known Limitations

- hooks activeCycles will always be empty `{}` in child process (runtime state not available from a spawned process) — by design
- 4 pre-existing test failures related to `/gsd visualize` dispatching as `view-navigate` instead of `surface` — these existed before S07 and are tracked for S08/S09
- export-service calls writeExportFile() which creates a file on disk as a side effect before reading it back — acceptable for the data surface

## Follow-ups

- S08 parity audit should verify all 10 panels render correctly with real project data and match TUI behavior
- The 4 `visualize` test failures should be resolved in S09 test hardening (the dispatch is correct as `view-navigate` per D053, the test expectations need updating)

## Files Created/Modified

- `web/lib/remaining-command-types.ts` — NEW: browser-safe interfaces for 7 command surfaces (130 lines)
- `web/lib/command-surface-contract.ts` — EDIT: CommandSurfaceRemainingState, createInitialRemainingState(), remainingCommands field
- `src/web/history-service.ts` — NEW: child-process service for metrics ledger + aggregations
- `src/web/inspect-service.ts` — NEW: direct file-read service for gsd-db.json
- `src/web/hooks-service.ts` — NEW: child-process service for hook configuration status
- `src/web/export-service.ts` — NEW: child-process service for generating export content
- `src/web/undo-service.ts` — NEW: child-process service for undo info + execution
- `src/web/cleanup-service.ts` — NEW: child-process service for branch/snapshot management
- `web/app/api/history/route.ts` — NEW: GET route for history metrics data
- `web/app/api/inspect/route.ts` — NEW: GET route for DB introspection
- `web/app/api/hooks/route.ts` — NEW: GET route for hook status
- `web/app/api/export-data/route.ts` — NEW: GET route with format param for export
- `web/app/api/undo/route.ts` — NEW: GET+POST route for undo
- `web/app/api/cleanup/route.ts` — NEW: GET+POST route for cleanup
- `web/app/api/steer/route.ts` — NEW: GET route for OVERRIDES.md
- `web/lib/gsd-workspace-store.tsx` — EDIT: 7 load functions, 2 mutation functions, patchRemainingCommandsPhaseState helper
- `web/components/gsd/remaining-command-panels.tsx` — NEW: 10 panel components (1265 lines)
- `web/components/gsd/command-surface.tsx` — EDIT: 10 switch cases, auto-loader extension, placeholder removal

## Forward Intelligence

### What the next slice should know
- All 20 GSD surface-dispatched commands now render real content. S08 parity audit has a complete set of surfaces to compare against TUI behavior.
- The three panel files follow a consistent pattern: diagnostics-panels.tsx (S04, 525 lines), settings-panels.tsx (S06, 498 lines), remaining-command-panels.tsx (S07, 1265 lines). Each uses shared PanelHeader/PanelError/PanelLoading/PanelEmpty infrastructure.
- API routes split into three patterns: direct file read (inspect, steer, knowledge), child-process (history, hooks, export, undo, cleanup, forensics, doctor, skill-health, captures, visualizer, settings-data), and existing bridge reuse (status, queue use workspace store data).

### What's fragile
- The 4 `visualize` test failures are a known gap between D053's view-navigate dispatch and the test's `surface` expectation — S09 should update the test expectations, not the dispatch logic
- hooks activeCycles is always empty in child-process context — if the parity audit expects runtime cycle data, this will surface as a gap
- remaining-command-panels.tsx at 1265 lines is the largest panel file — if S08 finds gaps requiring significant additions, consider splitting

### Authoritative diagnostics
- `commandSurface.remainingCommands.*` in the Zustand store — each of the 7 data-fetching panels shows phase transitions (idle→loading→loaded/error) with error strings on failure
- `curl http://localhost:3000/api/{history,inspect,hooks,export-data,undo,cleanup,steer}` — each returns structured JSON or `{error}` with 500
- `rg "This surface will be implemented" web/components/gsd/command-surface.tsx` — must return 0 matches; any match means a panel is missing

### What assumptions changed
- T04 assumed panels needed to be built from scratch but they were already implemented from a prior executor session — the task became verification-focused rather than implementation-focused
- inspect-service was originally planned as child-process but gsd-db.json being plain JSON made direct read the better choice
