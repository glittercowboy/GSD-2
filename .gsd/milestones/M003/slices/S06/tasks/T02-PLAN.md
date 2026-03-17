---
estimated_steps: 5
estimated_files: 4
---

# T02: Wire store state, build panel components, and replace placeholder rendering

**Slice:** S06 — Extended settings and model management surface
**Milestone:** M003

## Description

Deliver the visible UI for the settings surface. Add store state for settings data, create three panel components showing real data, and wire them into the command surface renderer — replacing the placeholder stubs for `gsd-prefs`, `gsd-mode`, and `gsd-config`.

This follows the exact pattern from S04 (diagnostics panels) and S05 (knowledge/captures): state type in contract → store action → panel components → command-surface rendering + auto-load.

**Relevant installed skill:** `frontend-design` — load it before building the panel components for design quality guidance.

## Steps

1. **Extend `web/lib/command-surface-contract.ts`** — Add settings state:
   - Import `SettingsData` from `./settings-types`
   - Add `CommandSurfaceSettingsState` type alias: `CommandSurfaceDiagnosticsPhaseState<SettingsData>` (reuses the existing generic — same loading lifecycle as diagnostics)
   - Add `settingsData: CommandSurfaceSettingsState` field to `WorkspaceCommandSurfaceState` (after `knowledgeCaptures`)
   - Add `createInitialSettingsState()` factory: `return createInitialDiagnosticsPhaseState<SettingsData>()`
   - Wire into `createInitialCommandSurfaceState()`: add `settingsData: createInitialSettingsState()`
   - Also wire into `closeCommandSurfaceState()` if it resets data states (check the existing pattern — forensics/doctor are NOT reset on close, so settings shouldn't be either)

2. **Add store action in `web/lib/gsd-workspace-store.tsx`**:
   - Import `SettingsData` from `./settings-types`
   - Add a private `patchSettingsPhaseState(patch)` helper method — follows `patchDiagnosticsPhaseState` pattern but patches `commandSurface.settingsData`:
     ```
     private patchSettingsPhaseState(patch: Partial<CommandSurfaceDiagnosticsPhaseState<SettingsData>>): void {
       this.patchState({
         commandSurface: {
           ...this.state.commandSurface,
           settingsData: { ...this.state.commandSurface.settingsData, ...patch },
         },
       })
     }
     ```
   - Add `loadSettingsData` async method following the `loadForensicsDiagnostics` pattern:
     ```
     loadSettingsData = async (): Promise<SettingsData | null> => {
       this.patchSettingsPhaseState({ phase: "loading", error: null })
       try {
         const response = await fetch("/api/settings-data", { method: "GET", cache: "no-store", headers: { Accept: "application/json" } })
         const payload = await response.json().catch(() => null)
         if (!response.ok || !payload) {
           const message = payload?.error ?? `Settings request failed with ${response.status}`
           this.patchSettingsPhaseState({ phase: "error", error: message })
           return null
         }
         this.patchSettingsPhaseState({ phase: "loaded", data: payload as SettingsData, lastLoadedAt: new Date().toISOString() })
         return payload as SettingsData
       } catch (error) {
         const message = normalizeClientError(error)
         this.patchSettingsPhaseState({ phase: "error", error: message })
         return null
       }
     }
     ```
   - Add `"loadSettingsData"` to the `GSDWorkspaceStoreActions` type union (where `loadForensicsDiagnostics` etc. are listed)
   - Export `loadSettingsData` in the actions record (where `loadForensicsDiagnostics`, `loadKnowledgeData` etc. are exported)

3. **Create `web/components/gsd/settings-panels.tsx`** — Three panel components following the `diagnostics-panels.tsx` pattern:

   **Shared infrastructure:**
   - `"use client"` directive
   - Import from `@/lib/settings-types`: `SettingsData`, `SettingsPreferencesData`, `SettingsDynamicRoutingConfig`, `SettingsRoutingHistory`, `SettingsProjectTotals`, `SettingsBudgetAllocation`
   - Import from `@/lib/gsd-workspace-store`: `useGSDWorkspaceActions`, `useGSDWorkspaceState`, `formatCost`
   - Import shared UI: `Badge` from `@/components/ui/badge`, `Button` from `@/components/ui/button`, lucide icons (`Settings`, `Cpu`, `DollarSign`, `RefreshCw`, `LoaderCircle`, `CheckCircle2`, `AlertTriangle`, `Zap`, `Layers`)
   - Import `cn` from `@/lib/utils`
   - Reuse the `DiagHeader`-like pattern (inline — don't import from diagnostics-panels to avoid coupling): a header with title + refresh button. Or create a minimal `SettingsHeader` helper.

   **`PrefsPanel` component:**
   - Reads `commandSurface.settingsData` from store via `useGSDWorkspaceState()`
   - Gets `loadSettingsData` from `useGSDWorkspaceActions()`
   - Shows loading spinner when `phase === "loading"`, error message when `phase === "error"`, empty state when `data === null`
   - When loaded, shows:
     - **Mode** badge: "solo" or "team" (from `preferences.mode`)
     - **Token Profile** badge: "budget" / "balanced" / "quality"
     - **Skills**: always_use, prefer, avoid lists (compact badges)
     - **Custom Instructions**: count of entries
     - **Auto-Supervisor**: enabled/disabled + timeout
     - **UAT Dispatch**: on/off
     - **Auto-Visualize**: on/off
     - **Preference Scope**: global vs project, with file path
     - **Warnings**: any validation warnings from preference loading
   - Refresh button calls `loadSettingsData()`

   **`ModelRoutingPanel` component:**
   - Same store access pattern
   - When loaded, shows:
     - **Dynamic Routing**: enabled/disabled badge (from `routingConfig.enabled`)
     - **Tier Model Assignments**: three rows for light/standard/heavy with model IDs (from `routingConfig.tier_models`)
     - **Routing Flags**: escalate_on_failure, budget_pressure, cross_provider, hooks — each as on/off pills
     - **Routing History** (if `routingHistory` is non-null):
       - Pattern count: `Object.keys(routingHistory.patterns).length` patterns tracked
       - Top 5 patterns by total attempts (success+fail across tiers), showing pattern name and per-tier success/fail counts
       - Feedback count: `routingHistory.feedback.length` entries
     - Empty state when routing history is null ("No routing history yet")
   - Refresh button calls `loadSettingsData()`

   **`BudgetPanel` component:**
   - Same store access pattern
   - When loaded, shows:
     - **Budget Ceiling**: from `preferences.budgetCeiling` (formatted as currency, or "Not set")
     - **Budget Enforcement**: from `preferences.budgetEnforcement` badge ("warn"/"pause"/"halt" or "Not set")
     - **Token Profile**: from `preferences.tokenProfile`
     - **Context Budget Allocations** (from `budgetAllocation`):
       - Summary budget: `summaryBudgetChars` chars
       - Inline context budget: `inlineContextBudgetChars` chars
       - Verification budget: `verificationBudgetChars` chars
       - Task count range: `min`-`max`
       - Continue threshold: `continueThresholdPercent`%
     - **Project Cost Totals** (from `projectTotals`, if non-null):
       - Total units, total cost (formatted), total duration
       - Token breakdown: input/output/cache-read/cache-write/total
       - Tool calls, assistant messages, user messages
     - Empty state when projectTotals is null ("No execution metrics yet")
   - Refresh button calls `loadSettingsData()`

4. **Wire panels into `web/components/gsd/command-surface.tsx`**:
   - Import `{ PrefsPanel, ModelRoutingPanel, BudgetPanel }` from `./settings-panels`
   - **Auto-load:** In the existing `useEffect` block that auto-loads diagnostics/knowledge data (around line 387-405), add cases:
     ```
     } else if (
       (commandSurface.section === "gsd-prefs" ||
        commandSurface.section === "gsd-mode" ||
        commandSurface.section === "gsd-config") &&
       commandSurface.settingsData.phase === "idle"
     ) {
       void loadSettingsData()
     }
     ```
     Note: Access `settingsData` from `commandSurface` not from a destructured local — check existing pattern to confirm whether it comes from `commandSurface.settingsData` or a separate destructure.
   - **Render:** In the `renderSection()` switch (around line 1959-1972), add cases BEFORE the generic `gsd-*` fallback:
     ```
     case "gsd-prefs": return (
       <div className="space-y-6">
         <PrefsPanel />
         <ModelRoutingPanel />
         <BudgetPanel />
       </div>
     )
     case "gsd-mode": return <ModelRoutingPanel />
     case "gsd-config": return <BudgetPanel />
     ```
   - The `loadSettingsData` action must be destructured from `useGSDWorkspaceActions()` at the top of the component (wherever `loadForensicsDiagnostics` etc. are destructured).

5. **Verify:**
   - Run `npm run build` — must pass
   - Run `npm run build:web-host` — must pass
   - Run `npx tsx --test src/tests/web-command-parity-contract.test.ts` — 118 tests must pass
   - Grep for remaining placeholder text to confirm the three sections no longer fall through to the generic stub: `rg "gsd-prefs|gsd-mode|gsd-config" web/components/gsd/command-surface.tsx` should show render cases, not placeholder

## Must-Haves

- [ ] `CommandSurfaceSettingsState` type added to contract with `settingsData` field in `WorkspaceCommandSurfaceState`
- [ ] `loadSettingsData()` store action fetches from `/api/settings-data` and patches `settingsData` phase state
- [ ] `PrefsPanel` component renders effective preferences (mode, skills, custom instructions, etc.)
- [ ] `ModelRoutingPanel` component renders routing config (enabled, tier models, flags) and routing history
- [ ] `BudgetPanel` component renders budget ceiling, enforcement, allocations, and project cost totals
- [ ] All three panels handle loading, error, and empty states gracefully
- [ ] `gsd-prefs` section renders all three panels
- [ ] `gsd-mode` section renders `ModelRoutingPanel`
- [ ] `gsd-config` section renders `BudgetPanel`
- [ ] Auto-load triggers `loadSettingsData()` when section opens and state is idle
- [ ] `npm run build`, `npm run build:web-host`, parity test all pass

## Verification

- `npm run build` — exit 0
- `npm run build:web-host` — exit 0
- `npx tsx --test src/tests/web-command-parity-contract.test.ts` — 118 tests pass, 0 fail
- `rg "case.*gsd-prefs|case.*gsd-mode|case.*gsd-config" web/components/gsd/command-surface.tsx` shows 3 dedicated render cases

## Inputs

- `web/lib/settings-types.ts` — the `SettingsData` type and sub-interfaces created in T01
- `web/app/api/settings-data/route.ts` — the API endpoint created in T01
- `web/components/gsd/diagnostics-panels.tsx` — reference implementation for panel component pattern (DiagHeader, loading/error/empty states, store access, refresh)
- `web/components/gsd/knowledge-captures-panel.tsx` — reference for panel component with tabbed content and shared store access
- `web/lib/command-surface-contract.ts` — existing `CommandSurfaceDiagnosticsPhaseState<T>`, `WorkspaceCommandSurfaceState`, `createInitialDiagnosticsPhaseState()`
- `web/lib/gsd-workspace-store.tsx` — existing `patchDiagnosticsPhaseState()`, `loadForensicsDiagnostics()`, action type union
- `web/components/gsd/command-surface.tsx` — existing auto-load useEffect (around line 387) and renderSection switch (around line 1959)

## Expected Output

- `web/lib/command-surface-contract.ts` — modified with `CommandSurfaceSettingsState` type and `settingsData` field
- `web/lib/gsd-workspace-store.tsx` — modified with `patchSettingsPhaseState()` and `loadSettingsData()` action
- `web/components/gsd/settings-panels.tsx` — new file with `PrefsPanel`, `ModelRoutingPanel`, `BudgetPanel` components (~300-400 lines)
- `web/components/gsd/command-surface.tsx` — modified with import, auto-load cases, and render cases for gsd-prefs/gsd-mode/gsd-config
