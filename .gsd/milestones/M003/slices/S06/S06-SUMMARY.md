---
id: S06
parent: M003
milestone: M003
provides:
  - Browser-safe settings type definitions (SettingsData and all sub-interfaces)
  - Child-process service aggregating 5 upstream functions (preferences, routing config, budgets, routing history, metrics)
  - /api/settings-data GET route returning combined SettingsData JSON
  - Store state field (settingsData) with phase lifecycle and loadSettingsData() action
  - Three panel components: PrefsPanel, ModelRoutingPanel, BudgetPanel with real data rendering
  - gsd-prefs, gsd-mode, gsd-config command surface sections wired to real panels (not placeholder)
requires:
  - slice: S01
    provides: Upstream modules (preferences.ts, model-router.ts, context-budget.ts, routing-history.ts, metrics.ts) available in merged codebase
  - slice: S02
    provides: Dispatch entries for /gsd prefs, /gsd mode, /gsd config routing to gsd-prefs/gsd-mode/gsd-config surfaces
affects:
  - S08
key_files:
  - web/lib/settings-types.ts
  - src/web/settings-service.ts
  - web/app/api/settings-data/route.ts
  - web/components/gsd/settings-panels.tsx
  - web/lib/command-surface-contract.ts
  - web/lib/gsd-workspace-store.tsx
  - web/components/gsd/command-surface.tsx
key_decisions:
  - D045 (extend existing command surface for settings) — confirmed and executed
  - D058 (generic CommandSurfaceDiagnosticsPhaseState<T>) — reused for settings state as CommandSurfaceSettingsState
patterns_established:
  - Multi-module child-process aggregation (5 upstream imports via env vars, combined JSON payload) — extends the single-module pattern from forensics/doctor/skill-health services
  - Shared settings hook (useSettingsData) for cross-panel store access without coupling to diagnostics infrastructure
  - Settings-local shared UI primitives (SettingsHeader, Pill, FlagBadge, KvRow) — self-contained in settings-panels.tsx
observability_surfaces:
  - GET /api/settings-data returns SettingsData JSON (preferences, routingConfig, budgetAllocation, routingHistory, projectTotals) or 500 with { error: string }
  - commandSurface.settingsData.phase transitions (idle → loading → loaded/error) in workspace store
  - commandSurface.settingsData.error contains fetch failure message
drill_down_paths:
  - .gsd/milestones/M003/slices/S06/tasks/T01-SUMMARY.md
  - .gsd/milestones/M003/slices/S06/tasks/T02-SUMMARY.md
duration: 27m
verification_result: passed
completed_at: 2026-03-16
---

# S06: Extended settings and model management surface

**Settings command surface shows real model routing config, provider budget visibility, and effective preferences — replacing placeholder stubs for gsd-prefs, gsd-mode, and gsd-config.**

## What Happened

Built the complete data pipeline and UI for the settings surface in two tasks:

**T01 — Backend pipeline.** Created browser-safe type definitions in `web/lib/settings-types.ts` (110 lines) mirroring upstream types from 5 modules: preferences.ts, model-router.ts, context-budget.ts, routing-history.ts, and metrics.ts. The child-process service (`src/web/settings-service.ts`) follows the established forensics-service pattern but extends it to aggregate 5 upstream functions in a single child process — `loadEffectiveGSDPreferences()`, `resolveDynamicRoutingConfig()`, `computeBudgets(200000)`, `initRoutingHistory()` → `getRoutingHistory()`, and `loadLedgerFromDisk()` → `getProjectTotals()`. Each module path is passed via env var and imported via `pathToFileURL`. The API route at `/api/settings-data` wraps the service with no-store cache and structured 500 error responses.

**T02 — Store state and panels.** Extended `command-surface-contract.ts` with `CommandSurfaceSettingsState` (reusing the generic `CommandSurfaceDiagnosticsPhaseState<SettingsData>` from S04), added `patchSettingsPhaseState()` helper and `loadSettingsData()` action to the workspace store, and built three panel components in `settings-panels.tsx` (~380 lines):

- **PrefsPanel** — mode, token profile, skill lists (always-use/prefer/avoid), auto-supervisor/UAT/auto-visualize toggles, preference scope/path, warnings
- **ModelRoutingPanel** — dynamic routing enabled/disabled, tier model assignments (light/standard/heavy), routing flags (escalate_on_failure, budget_pressure, cross_provider, hooks), routing history with top patterns and tier outcome badges
- **BudgetPanel** — budget ceiling/enforcement mode, context budget allocations (summary/inline/verification budgets, task count range, continue threshold), project cost totals with full token breakdown (input/output/cache read/write)

Wired into `command-surface.tsx`: `gsd-prefs` renders all three panels, `gsd-mode` focuses ModelRoutingPanel, `gsd-config` renders BudgetPanel. Auto-load fires `loadSettingsData()` when any of the three sections opens and phase is idle.

## Verification

- `npm run build` — exit 0, TypeScript compiles with all new types and imports
- `npm run build:web-host` — exit 0, Next.js production build includes `/api/settings-data` route
- `npx tsx --test src/tests/web-command-parity-contract.test.ts` — 114/118 pass (4 pre-existing `/gsd visualize` failures unrelated to settings, same count before and after changes)
- `rg "case.*gsd-prefs|case.*gsd-mode|case.*gsd-config" web/components/gsd/command-surface.tsx` — confirms 3 dedicated render cases replace placeholders

## Requirements Advanced

- R107 — Settings surface now shows dynamic model routing configuration (tier assignments, escalation/budget-pressure/cross-provider flags, routing history patterns), budget allocation visibility (ceiling, enforcement, context budgets, project cost totals with token breakdown), and effective preferences (mode, token profile, skills, toggles, custom instructions). All data comes from real upstream modules via child-process service.
- R101 — `/gsd prefs`, `/gsd mode`, `/gsd config` now render real content instead of placeholder stubs.

## Requirements Validated

- none (R107 validation requires live runtime verification in S08 parity audit)

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- Created a `useSettingsData()` custom hook inside settings-panels.tsx instead of directly accessing store in each panel — reduces duplication across three panels sharing identical data access. Not in the plan but consistent with React patterns.
- Plan expected 118/118 parity tests passing; actual baseline is 114/118 with 4 pre-existing `/gsd visualize` failures from S03. No regression from S06 changes.

## Known Limitations

- Settings surface is read-only — preferences, routing config, and budget settings cannot be edited from the browser. Upstream TUI has a preferences wizard; browser equivalent would need a separate form surface.
- Budget ceiling and enforcement values come from preferences.md — if no preferences file exists, those fields show "Not set" rather than upstream defaults.
- Routing history and project totals depend on `.gsd/routing-history.json` and `.gsd/metrics.json` existing — empty states are rendered gracefully but the panels are information-sparse on new projects.
- 4 pre-existing parity test failures for `/gsd visualize` (view-navigate vs surface type mismatch) remain from S03.

## Follow-ups

- S08 parity audit should verify settings surface data matches TUI `gsd prefs` output field-for-field
- The 4 pre-existing `/gsd visualize` test failures should be addressed in S09 test hardening

## Files Created/Modified

- `web/lib/settings-types.ts` — new: browser-safe interfaces for SettingsData and all sub-types
- `src/web/settings-service.ts` — new: child-process service aggregating 5 upstream module calls
- `web/app/api/settings-data/route.ts` — new: GET endpoint returning combined settings JSON
- `web/components/gsd/settings-panels.tsx` — new: PrefsPanel, ModelRoutingPanel, BudgetPanel (~380 lines)
- `web/lib/command-surface-contract.ts` — added CommandSurfaceSettingsState, createInitialSettingsState(), settingsData field
- `web/lib/gsd-workspace-store.tsx` — added patchSettingsPhaseState(), loadSettingsData() action
- `web/components/gsd/command-surface.tsx` — added import, auto-load, render cases for gsd-prefs/gsd-mode/gsd-config

## Forward Intelligence

### What the next slice should know
- The settings panels are read-only and follow the same pattern as diagnostics panels (S04) — auto-load on section open, phase state lifecycle, shared header with refresh button. S07's remaining command surfaces can follow this exact pattern.
- The `useSettingsData()` hook pattern (shared store access for multiple panels) is cleaner than what diagnostics-panels.tsx does (each panel accesses the store directly). Consider adopting for S07 surfaces with shared data.

### What's fragile
- The child-process service aggregates 5 upstream modules in one subprocess — if any module's export signature changes, the entire settings fetch fails. The 500 error response includes the failure message but doesn't indicate which module broke.
- `computeBudgets(200000)` uses a hardcoded 200K context window default. If upstream changes the function signature or the default window size matters more, this will need updating.

### Authoritative diagnostics
- `GET /api/settings-data` — returns the full combined payload or a structured error. This is the single source of truth for whether the backend pipeline works.
- `commandSurface.settingsData.phase` in the workspace store — tracks the frontend lifecycle. If the UI shows loading spinner forever, check this field.

### What assumptions changed
- Plan assumed 118/118 parity tests passing — actual baseline is 114/118 with 4 pre-existing failures from S03's view-navigate dispatch pattern. This is not a regression but the plan's expected count was optimistic.
