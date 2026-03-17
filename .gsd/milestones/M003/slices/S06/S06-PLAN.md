# S06: Extended settings and model management surface

**Goal:** The settings command surface shows real data for model routing configuration, provider budget visibility, and effective preferences — replacing the placeholder stubs for `gsd-prefs`, `gsd-mode`, and `gsd-config`.
**Demo:** `/gsd prefs` in the browser terminal opens the settings surface with a loaded preferences overview, model routing configuration (tier assignments, escalation flags), and budget/cost metrics. `/gsd mode` focuses the mode section. `/gsd config` shows tool API key status (read-only).

## Must-Haves

- Browser-safe type definitions mirroring upstream `GSDPreferences`, `DynamicRoutingConfig`, `BudgetAllocation`, `RoutingHistoryData`, and `ProjectTotals`
- Child-process service calling upstream `loadEffectiveGSDPreferences()`, `resolveDynamicRoutingConfig()`, `computeBudgets()`, `getRoutingHistory()`, and `loadLedgerFromDisk()` via `execFile` + `resolve-ts.mjs`
- `/api/settings-data` GET route returning a combined `SettingsData` payload
- Store state field (`settingsData`) using `CommandSurfaceDiagnosticsPhaseState<SettingsData>` with a `loadSettingsData()` action
- Three panel components: `PrefsPanel` (effective preferences overview), `ModelRoutingPanel` (routing config, tier models, history), `BudgetPanel` (budget ceiling, enforcement, allocation, cost totals)
- `gsd-prefs`, `gsd-mode`, `gsd-config` sections in `command-surface.tsx` render real panels (not placeholder)
- Auto-load on section open, matching the forensics/doctor/skill-health pattern
- Graceful empty states when `routing-history.json` or `metrics.json` don't exist

## Proof Level

- This slice proves: integration
- Real runtime required: yes (API route hits real `.gsd/` files)
- Human/UAT required: no

## Verification

- `npm run build` — TypeScript compiles with all new types and imports
- `npm run build:web-host` — Next.js production build succeeds with new API route and components
- `npx tsx --test src/tests/web-command-parity-contract.test.ts` — 118 tests still pass (no dispatch regression)

## Observability / Diagnostics

- Runtime signals: `settingsData.phase` transitions (`idle` → `loading` → `loaded`/`error`) in workspace store
- Inspection surfaces: `GET /api/settings-data` returns JSON with `preferences`, `routingConfig`, `budgetAllocation`, `routingHistory`, `projectTotals` fields (or `null` where data is missing)
- Failure visibility: `settingsData.error` contains the error message; API route returns 500 with `{ error: string }` on service failure

## Integration Closure

- Upstream surfaces consumed: `preferences.ts` (`loadEffectiveGSDPreferences()`, `resolveDynamicRoutingConfig()`), `context-budget.ts` (`computeBudgets()`), `routing-history.ts` (`initRoutingHistory()`, `getRoutingHistory()`), `metrics.ts` (`loadLedgerFromDisk()`, `getProjectTotals()`)
- New wiring introduced: `/api/settings-data` route → `settings-service.ts` → child process → upstream modules; store `loadSettingsData()` → panels; `command-surface.tsx` auto-load + render for three sections
- What remains before the milestone is truly usable end-to-end: S07 (remaining command surfaces), S08 (parity audit), S09 (test hardening)

## Tasks

- [ ] **T01: Add settings types, child-process service, and API route** `est:40m`
  - Why: The data pipeline must exist before the UI can render. Types define the browser-safe contract, the service provides the data, and the API route exposes it to the frontend.
  - Files: `web/lib/settings-types.ts`, `src/web/settings-service.ts`, `web/app/api/settings-data/route.ts`
  - Do: (1) Create `web/lib/settings-types.ts` with browser-safe interfaces mirroring upstream types: `SettingsPreferencesData` (effective merged preferences), `SettingsRoutingConfig` (dynamic routing config + tier assignments), `SettingsBudgetData` (allocation + ceiling + enforcement + project totals), `SettingsRoutingHistory` (pattern history + feedback), and the combined `SettingsData` payload. (2) Create `src/web/settings-service.ts` following the `forensics-service.ts` pattern: child-process via `execFile` + `resolve-ts.mjs` + `--experimental-strip-types` that imports upstream modules, calls the 5 data functions, serializes a combined JSON payload to stdout. Must `initRoutingHistory(base)` before `getRoutingHistory()`. Must handle null returns from `loadLedgerFromDisk()` and `getRoutingHistory()`. Pass `projectCwd` via env var. (3) Create `web/app/api/settings-data/route.ts` following the `forensics/route.ts` pattern: GET handler calling `collectSettingsData()`, returning JSON with no-store cache.
  - Verify: `npm run build` succeeds with new files
  - Done when: TypeScript compiles and the API route module is structurally correct

- [ ] **T02: Wire store state, build panel components, and replace placeholder rendering** `est:50m`
  - Why: This task delivers the visible UI — the panels that show real settings data when `/gsd prefs`, `/gsd mode`, or `/gsd config` is entered. Without this, the API route exists but users see nothing.
  - Files: `web/lib/command-surface-contract.ts`, `web/lib/gsd-workspace-store.tsx`, `web/components/gsd/settings-panels.tsx`, `web/components/gsd/command-surface.tsx`
  - Do: (1) In `command-surface-contract.ts`: add `CommandSurfaceSettingsState` using `CommandSurfaceDiagnosticsPhaseState<SettingsData>`, add `settingsData` field to `WorkspaceCommandSurfaceState`, add `createInitialSettingsState()` factory, wire into `createInitialCommandSurfaceState()`. (2) In `gsd-workspace-store.tsx`: add `patchSettingsPhaseState()` helper and `loadSettingsData()` action following the `loadForensicsDiagnostics()` pattern — fetch from `/api/settings-data`, patch phase state. Export in the actions type union. (3) Create `web/components/gsd/settings-panels.tsx` with three components: `PrefsPanel` (preferences overview — mode, skills, custom instructions, notifications, hooks summary), `ModelRoutingPanel` (routing enabled/disabled, tier model assignments, escalation/budget-pressure/cross-provider flags, routing history patterns), `BudgetPanel` (ceiling, enforcement mode, token profile, budget allocations, project cost totals). Use `DiagHeader`-style header with refresh. Handle loading/error/empty states. (4) In `command-surface.tsx`: import settings panels, add auto-load `useEffect` cases for `gsd-prefs`/`gsd-mode`/`gsd-config` sections (when `settingsData.phase === "idle"`, call `loadSettingsData()`), add render cases returning the appropriate panel for each section. The `gsd-prefs` section renders all three panels, `gsd-mode` focuses `ModelRoutingPanel`, `gsd-config` renders `BudgetPanel` plus a tool-key status section.
  - Verify: `npm run build`, `npm run build:web-host`, `npx tsx --test src/tests/web-command-parity-contract.test.ts` (118 pass)
  - Done when: All three build/test commands pass. The `gsd-prefs`/`gsd-mode`/`gsd-config` sections render real panel components instead of placeholder text.

## Files Likely Touched

- `web/lib/settings-types.ts` (new)
- `src/web/settings-service.ts` (new)
- `web/app/api/settings-data/route.ts` (new)
- `web/lib/command-surface-contract.ts`
- `web/lib/gsd-workspace-store.tsx`
- `web/components/gsd/settings-panels.tsx` (new)
- `web/components/gsd/command-surface.tsx`
