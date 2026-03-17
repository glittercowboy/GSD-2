---
estimated_steps: 5
estimated_files: 3
---

# T01: Add settings types, child-process service, and API route

**Slice:** S06 — Extended settings and model management surface
**Milestone:** M003

## Description

Create the backend data pipeline for the settings surface: browser-safe type definitions, a child-process service that calls upstream extension modules, and an API route that exposes the combined data to the frontend. This follows the established pattern from `forensics-service.ts` / `web/app/api/forensics/route.ts`.

The child process must call 5 upstream functions across 4 modules (`preferences.ts`, `model-router.ts`, `context-budget.ts`, `routing-history.ts`, `metrics.ts`), combine the results into a single `SettingsData` payload, and serialize to stdout. Turbopack cannot resolve the `.js` extension imports these modules use, so the child-process pattern with `resolve-ts.mjs` is required (per KNOWLEDGE.md).

**Relevant skill:** `frontend-design` is NOT needed for this task (backend only).

## Steps

1. **Create `web/lib/settings-types.ts`** — Browser-safe interfaces mirroring upstream types. Define:
   - `SettingsWorkflowMode` = `"solo" | "team"`
   - `SettingsTokenProfile` = `"budget" | "balanced" | "quality"`
   - `SettingsBudgetEnforcement` = `"warn" | "pause" | "halt"`
   - `SettingsDynamicRoutingConfig` — mirrors `DynamicRoutingConfig` from `model-router.ts`: `{ enabled?: boolean; tier_models?: { light?: string; standard?: string; heavy?: string }; escalate_on_failure?: boolean; budget_pressure?: boolean; cross_provider?: boolean; hooks?: boolean }`
   - `SettingsBudgetAllocation` — mirrors `BudgetAllocation` from `context-budget.ts`: `{ summaryBudgetChars: number; inlineContextBudgetChars: number; taskCountRange: { min: number; max: number }; continueThresholdPercent: number; verificationBudgetChars: number }`
   - `SettingsTierOutcome` = `{ success: number; fail: number }`
   - `SettingsPatternHistory` = `{ light: SettingsTierOutcome; standard: SettingsTierOutcome; heavy: SettingsTierOutcome }`
   - `SettingsRoutingHistory` = `{ patterns: Record<string, SettingsPatternHistory>; feedback: SettingsFeedbackEntry[]; updatedAt: string }` where `SettingsFeedbackEntry` = `{ unitType: string; unitId: string; tier: string; rating: "over" | "under" | "ok"; timestamp: string }`
   - `SettingsProjectTotals` — mirrors `ProjectTotals` from `metrics.ts`: `{ units: number; cost: number; duration: number; tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }; toolCalls: number; assistantMessages: number; userMessages: number }`
   - `SettingsPreferencesData` = `{ mode?: SettingsWorkflowMode; budgetCeiling?: number; budgetEnforcement?: SettingsBudgetEnforcement; tokenProfile?: SettingsTokenProfile; dynamicRouting?: SettingsDynamicRoutingConfig; customInstructions?: string[]; alwaysUseSkills?: string[]; preferSkills?: string[]; avoidSkills?: string[]; autoSupervisor?: { enabled?: boolean; softTimeoutMinutes?: number }; uatDispatch?: boolean; autoVisualize?: boolean; scope: "global" | "project"; path: string; warnings?: string[] }`
   - `SettingsData` = `{ preferences: SettingsPreferencesData | null; routingConfig: SettingsDynamicRoutingConfig; budgetAllocation: SettingsBudgetAllocation; routingHistory: SettingsRoutingHistory | null; projectTotals: SettingsProjectTotals | null }`

2. **Create `src/web/settings-service.ts`** — Follow the `forensics-service.ts` pattern exactly:
   - Import `execFile` from `node:child_process`, `existsSync` from `node:fs`, `join` from `node:path`
   - Import `resolveBridgeRuntimeConfig` from `./bridge-service.ts`
   - Import `SettingsData` type from `../../web/lib/settings-types.ts`
   - Define `SETTINGS_MAX_BUFFER = 2 * 1024 * 1024`
   - `resolveModulePath(packageRoot, moduleName)` → returns `join(packageRoot, "src", "resources", "extensions", "gsd", moduleName)`
   - `resolveTsLoaderPath(packageRoot)` → `join(packageRoot, "src", "resources", "extensions", "gsd", "tests", "resolve-ts.mjs")`
   - `collectSettingsData()` async function:
     - Get `{ packageRoot, projectCwd }` from `resolveBridgeRuntimeConfig()`
     - Resolve loader + module paths, validate existence
     - Build an inline `--eval` script that:
       1. Imports `pathToFileURL` from `node:url`
       2. Dynamically imports `preferences.ts` via `pathToFileURL(process.env.GSD_SETTINGS_PREFS_MODULE)`
       3. Dynamically imports `model-router.ts` via `pathToFileURL(process.env.GSD_SETTINGS_ROUTER_MODULE)`
       4. Dynamically imports `context-budget.ts` via `pathToFileURL(process.env.GSD_SETTINGS_BUDGET_MODULE)`
       5. Dynamically imports `routing-history.ts` via `pathToFileURL(process.env.GSD_SETTINGS_HISTORY_MODULE)`
       6. Dynamically imports `metrics.ts` via `pathToFileURL(process.env.GSD_SETTINGS_METRICS_MODULE)`
       7. Calls `const loaded = prefsMod.loadEffectiveGSDPreferences();`
       8. Builds `preferences` from loaded: extract `mode`, `budget_ceiling`, `budget_enforcement`, `token_profile`, `dynamic_routing`, `custom_instructions`, `always_use_skills`, `prefer_skills`, `avoid_skills`, `auto_supervisor`, `uat_dispatch`, `auto_visualize`, plus `scope`, `path`, `warnings` from `LoadedGSDPreferences` — or null if `loaded` is null
       9. Calls `const routingConfig = prefsMod.resolveDynamicRoutingConfig();`
       10. Calls `const budgetAllocation = budgetMod.computeBudgets(200000);` (use 200K as default context window)
       11. Calls `historyMod.initRoutingHistory(process.env.GSD_SETTINGS_BASE);` then `const routingHistory = historyMod.getRoutingHistory();`
       12. Calls `const ledger = metricsMod.loadLedgerFromDisk(process.env.GSD_SETTINGS_BASE);` then `const projectTotals = ledger ? metricsMod.getProjectTotals(ledger.units) : null;`
       13. Writes `JSON.stringify({ preferences, routingConfig, budgetAllocation, routingHistory, projectTotals })` to stdout
     - Execute via `execFile(process.execPath, ["--import", resolveTsLoader, "--experimental-strip-types", "--input-type=module", "--eval", script], { cwd: packageRoot, env: { ...process.env, GSD_SETTINGS_PREFS_MODULE: prefsPath, GSD_SETTINGS_ROUTER_MODULE: routerPath, GSD_SETTINGS_BUDGET_MODULE: budgetPath, GSD_SETTINGS_HISTORY_MODULE: historyPath, GSD_SETTINGS_METRICS_MODULE: metricsPath, GSD_SETTINGS_BASE: projectCwd }, maxBuffer: SETTINGS_MAX_BUFFER })`
     - Parse stdout JSON, return as `SettingsData`

3. **Create `web/app/api/settings-data/route.ts`** — Follow `web/app/api/forensics/route.ts` exactly:
   - Import `collectSettingsData` from `../../../../src/web/settings-service.ts`
   - `export const runtime = "nodejs"`
   - `export const dynamic = "force-dynamic"`
   - `GET()` handler: try/catch calling `collectSettingsData()`, return `Response.json(payload, { headers: { "Cache-Control": "no-store" } })`. On error, return 500 with `{ error: message }`.

4. **Verify build:** Run `npm run build` to confirm TypeScript compiles with the new files.

5. **Sanity check imports:** Run `rg "settings-types" web/ src/` to confirm the type file is imported only from `settings-service.ts` (and will be imported from store/components in T02).

## Must-Haves

- [ ] `web/lib/settings-types.ts` exists with `SettingsData` and all sub-interfaces
- [ ] `src/web/settings-service.ts` exists with `collectSettingsData()` using child-process pattern
- [ ] `web/app/api/settings-data/route.ts` exists with GET handler
- [ ] Child script calls `initRoutingHistory(base)` before `getRoutingHistory()`
- [ ] Child script handles null from `loadLedgerFromDisk()` (returns null `projectTotals`)
- [ ] Child script handles null from `loadEffectiveGSDPreferences()` (returns null `preferences`)
- [ ] `npm run build` passes

## Verification

- `npm run build` — exit 0 (TypeScript compiles with new types and service)
- `rg "settings-types" web/ src/` shows expected import from `settings-service.ts`
- `rg "collectSettingsData" src/web/ web/app/` shows the service imported in the route

## Inputs

- `src/web/forensics-service.ts` — reference implementation for child-process service pattern (execFile, resolveTsLoaderPath, env vars, script string, error handling)
- `web/app/api/forensics/route.ts` — reference implementation for API route pattern (runtime, dynamic exports, GET handler, error response)
- `web/lib/diagnostics-types.ts` — reference for browser-safe type file structure and documentation comments
- Upstream module paths (all under `src/resources/extensions/gsd/`): `preferences.ts`, `model-router.ts`, `context-budget.ts`, `routing-history.ts`, `metrics.ts`

## Expected Output

- `web/lib/settings-types.ts` — new file with ~80-100 lines of browser-safe interfaces
- `src/web/settings-service.ts` — new file with ~120-150 lines following forensics-service pattern
- `web/app/api/settings-data/route.ts` — new file with ~25 lines following forensics route pattern
