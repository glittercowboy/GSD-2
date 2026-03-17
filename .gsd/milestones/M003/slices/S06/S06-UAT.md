# S06: Extended settings and model management surface — UAT

**Milestone:** M003
**Written:** 2026-03-16

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: The slice delivers browser UI panels backed by an API route with structured JSON responses. Build success proves type safety, parity tests prove dispatch wiring, and the API route's structured output proves the data pipeline. Live runtime testing is deferred to S08's parity audit.

## Preconditions

- `npm run build` passes (TypeScript compiles)
- `npm run build:web-host` passes (Next.js production build includes `/api/settings-data`)
- Dev server running (`npm run dev` or equivalent) for API route tests
- A `.gsd/` directory exists in the project with at least one of: `preferences.md`, `routing-history.json`, `metrics.json`

## Smoke Test

Run `curl http://localhost:3000/api/settings-data | jq .` — should return a JSON object with `preferences`, `routingConfig`, `budgetAllocation`, `routingHistory`, and `projectTotals` fields (some may be null).

## Test Cases

### 1. API route returns structured SettingsData

1. Start the dev server
2. `curl -s http://localhost:3000/api/settings-data | jq 'keys'`
3. **Expected:** Array contains exactly `["budgetAllocation", "preferences", "projectTotals", "routingConfig", "routingHistory"]`

### 2. API route returns no-store cache header

1. `curl -sI http://localhost:3000/api/settings-data | grep -i cache-control`
2. **Expected:** `Cache-Control: no-store`

### 3. API route returns 500 on upstream failure

1. Temporarily rename a required upstream module (e.g., `mv src/resources/extensions/gsd/preferences.ts src/resources/extensions/gsd/preferences.ts.bak`)
2. `curl -s http://localhost:3000/api/settings-data | jq .`
3. **Expected:** HTTP 500, body `{ "error": "settings data provider not found; missing=..." }`
4. Restore the file: `mv src/resources/extensions/gsd/preferences.ts.bak src/resources/extensions/gsd/preferences.ts`

### 4. Preferences data has correct shape when present

1. Ensure `~/.gsd/preferences.md` or project `.gsd/preferences.md` exists
2. `curl -s http://localhost:3000/api/settings-data | jq '.preferences | keys'`
3. **Expected:** Contains at least `mode`, `scope`, `path`. May include `budgetCeiling`, `budgetEnforcement`, `tokenProfile`, `dynamicRouting`, `customInstructions`, `alwaysUseSkills`, `preferSkills`, `avoidSkills`.

### 5. Routing config always has default structure

1. `curl -s http://localhost:3000/api/settings-data | jq '.routingConfig'`
2. **Expected:** Object with at least `enabled` field (boolean). May include `tier_models`, `escalate_on_failure`, `budget_pressure`, `cross_provider`, `hooks`.

### 6. Budget allocation always has numeric fields

1. `curl -s http://localhost:3000/api/settings-data | jq '.budgetAllocation'`
2. **Expected:** Object with numeric `summaryBudgetChars`, `inlineContextBudgetChars`, `verificationBudgetChars`, `continueThresholdPercent`, and object `taskCountRange` with `min`/`max`.

### 7. /gsd prefs dispatches to gsd-prefs surface

1. Check dispatch: `grep 'case "gsd-prefs"' web/components/gsd/command-surface.tsx`
2. **Expected:** Render case returns `<PrefsPanel />`, `<ModelRoutingPanel />`, `<BudgetPanel />`

### 8. /gsd mode dispatches to gsd-mode surface

1. Check dispatch: `grep 'case "gsd-mode"' web/components/gsd/command-surface.tsx`
2. **Expected:** Render case returns `<ModelRoutingPanel />`

### 9. /gsd config dispatches to gsd-config surface

1. Check dispatch: `grep 'case "gsd-config"' web/components/gsd/command-surface.tsx`
2. **Expected:** Render case returns `<BudgetPanel />`

### 10. Store action loadSettingsData exists and is exported

1. `grep 'loadSettingsData' web/lib/gsd-workspace-store.tsx`
2. **Expected:** Shows async method definition, type union entry, and export in actions record

### 11. Auto-load triggers on section open

1. Check command-surface.tsx for auto-load useEffect
2. **Expected:** When section is `gsd-prefs`, `gsd-mode`, or `gsd-config` and `settingsData.phase === "idle"`, calls `loadSettingsData()`

### 12. Parity contract tests show no regression

1. `npx tsx --test src/tests/web-command-parity-contract.test.ts 2>&1 | grep -E "tests|pass|fail"`
2. **Expected:** 118 tests, 114 pass, 4 fail (pre-existing /gsd visualize failures only)

## Edge Cases

### No preferences file exists

1. Remove or rename all preferences.md files
2. `curl -s http://localhost:3000/api/settings-data | jq '.preferences'`
3. **Expected:** `null` — not a crash. Other fields still populated.

### No routing history file exists

1. Ensure `.gsd/routing-history.json` does not exist
2. `curl -s http://localhost:3000/api/settings-data | jq '.routingHistory'`
3. **Expected:** `null` — not a crash. Other fields still populated.

### No metrics ledger exists

1. Ensure `.gsd/metrics.json` does not exist
2. `curl -s http://localhost:3000/api/settings-data | jq '.projectTotals'`
3. **Expected:** `null` — not a crash. Other fields still populated.

### All optional data missing (fresh project)

1. Use a project directory with empty `.gsd/` (no preferences.md, routing-history.json, metrics.json)
2. `curl -s http://localhost:3000/api/settings-data | jq .`
3. **Expected:** `{ "preferences": null, "routingConfig": {...defaults...}, "budgetAllocation": {...}, "routingHistory": null, "projectTotals": null }` — structured response with null fields, not an error.

## Failure Signals

- `npm run build` fails with import errors in settings-types.ts, settings-service.ts, or settings-panels.tsx
- `npm run build:web-host` fails — missing `/api/settings-data` in route table
- API route returns 500 when upstream modules are present and functional
- API route crashes (unstructured error) instead of returning `{ error: string }`
- Parity tests drop below 114 pass (regression from settings changes)
- `gsd-prefs`/`gsd-mode`/`gsd-config` render cases missing from command-surface.tsx
- `settingsData` field missing from workspace store state

## Requirements Proved By This UAT

- R107 — Settings surface shows dynamic model routing config, budget allocation, and effective preferences from upstream modules
- R101 — `/gsd prefs`, `/gsd mode`, `/gsd config` dispatch to real panels (not placeholder)

## Not Proven By This UAT

- Live browser rendering of panels (requires running dev server and manual browser interaction — deferred to S08 parity audit)
- Preferences editing/mutation (surface is read-only; upstream TUI wizard not replicated)
- Visual correctness of panel layout and styling (artifact-driven UAT checks structure, not visual polish)

## Notes for Tester

- The 4 pre-existing parity test failures are for `/gsd visualize` (view-navigate vs surface type mismatch from S03) — ignore these, they are not settings-related.
- Budget `computeBudgets(200000)` uses a hardcoded 200K context window. The allocation values will vary but should always be positive numbers.
- The `routingConfig` field is never null — `resolveDynamicRoutingConfig()` always returns defaults even when no preferences exist.
