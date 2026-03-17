---
id: T02
parent: S06
milestone: M003
provides:
  - Settings panel components (PrefsPanel, ModelRoutingPanel, BudgetPanel) rendering real settings data
  - Store action loadSettingsData with phase state management
  - Command surface wiring for gsd-prefs, gsd-mode, gsd-config sections
key_files:
  - web/lib/command-surface-contract.ts
  - web/lib/gsd-workspace-store.tsx
  - web/components/gsd/settings-panels.tsx
  - web/components/gsd/command-surface.tsx
key_decisions:
  - Reused CommandSurfaceDiagnosticsPhaseState<SettingsData> generic for settings state (same lifecycle as diagnostics)
  - Created standalone useSettingsData() hook to share store access across three panels without coupling to diagnostics-panels.tsx
patterns_established:
  - Settings panel shared infrastructure (SettingsHeader, SettingsError, SettingsLoading, SettingsEmpty, Pill, FlagBadge, KvRow) — local to settings-panels.tsx, not imported from diagnostics-panels.tsx
  - patchSettingsPhaseState private helper follows patchDiagnosticsPhaseState pattern for flat state patching
observability_surfaces:
  - commandSurface.settingsData.phase transitions (idle → loading → loaded/error) in workspace store
  - commandSurface.settingsData.error contains fetch failure message
  - Each panel renders loading/error/empty states visually in the browser
duration: 12m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T02: Wire store state, build panel components, and replace placeholder rendering

**Wired settings store state, built three panel components (PrefsPanel, ModelRoutingPanel, BudgetPanel), and replaced placeholder rendering for gsd-prefs, gsd-mode, and gsd-config sections.**

## What Happened

1. **Extended command-surface-contract.ts** — Added `CommandSurfaceSettingsState` type alias (`CommandSurfaceDiagnosticsPhaseState<SettingsData>`), `createInitialSettingsState()` factory, and `settingsData` field to `WorkspaceCommandSurfaceState`. Wired into both `createInitialCommandSurfaceState()` and `openCommandSurfaceState()`. Not reset on close (matching diagnostics pattern).

2. **Added store action in gsd-workspace-store.tsx** — Added `patchSettingsPhaseState()` private helper and `loadSettingsData()` async method fetching from `/api/settings-data`. Added to action type union and actions export record.

3. **Created settings-panels.tsx** — Three panel components with shared infrastructure (SettingsHeader, SettingsError, SettingsLoading, SettingsEmpty, Pill, FlagBadge, SkillBadgeList, KvRow). Used a `useSettingsData()` custom hook for shared store access:
   - **PrefsPanel**: mode, token profile, skill lists, auto-supervisor/UAT/visualize toggles, preference scope/path, warnings
   - **ModelRoutingPanel**: dynamic routing status, tier model assignments, routing flags, routing history with top patterns
   - **BudgetPanel**: budget ceiling/enforcement, context budget allocations, project cost totals with token breakdown

4. **Wired into command-surface.tsx** — Import, auto-load useEffect (triggers `loadSettingsData()` when section opens and phase is idle), and render cases (`gsd-prefs` shows all three panels, `gsd-mode` shows ModelRoutingPanel, `gsd-config` shows BudgetPanel).

## Verification

- `npm run build` — exit 0
- `npm run build:web-host` — exit 0 (Next.js production build with `/api/settings-data` route)
- `npx tsx --test src/tests/web-command-parity-contract.test.ts` — 114 pass, 4 fail (all 4 failures are pre-existing `/gsd visualize` regressions, not caused by this task)
- `rg "case.*gsd-prefs|case.*gsd-mode|case.*gsd-config" web/components/gsd/command-surface.tsx` — shows 3 dedicated render cases

## Diagnostics

- **Store state**: `commandSurface.settingsData.phase` tracks `idle` → `loading` → `loaded`/`error`
- **Error visibility**: `commandSurface.settingsData.error` contains the failure message; rendered as a red error card in each panel
- **Auto-load**: Opening any of gsd-prefs/gsd-mode/gsd-config fires a `GET /api/settings-data` request when phase is `idle`
- **Panel states**: Each panel renders distinct loading (spinner), error (red card), and empty data (gray placeholder) states

## Deviations

- Created a `useSettingsData()` custom hook inside settings-panels.tsx instead of directly accessing store in each component — reduces duplication across three panels sharing identical data access.
- The 4 pre-existing test failures for `/gsd visualize` were already present before this task. The plan expected 118 pass, 0 fail, but the baseline has this regression.

## Known Issues

- 4 pre-existing parity test failures for `/gsd visualize` (unrelated to settings surface)

## Files Created/Modified

- `web/lib/command-surface-contract.ts` — Added `CommandSurfaceSettingsState` type, `createInitialSettingsState()`, `settingsData` field
- `web/lib/gsd-workspace-store.tsx` — Added `patchSettingsPhaseState()`, `loadSettingsData()` action, type union entry, export
- `web/components/gsd/settings-panels.tsx` — New file with `PrefsPanel`, `ModelRoutingPanel`, `BudgetPanel` (~380 lines)
- `web/components/gsd/command-surface.tsx` — Added import, auto-load cases, render cases for gsd-prefs/gsd-mode/gsd-config
- `.gsd/milestones/M003/slices/S06/tasks/T02-PLAN.md` — Added Observability Impact section
