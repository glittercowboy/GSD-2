---
estimated_steps: 3
estimated_files: 3
skills_used: []
---

# T02: Wire progress widget into custom engine loop and fix dashboard overlay

**Slice:** S07 — CLI Surface + Dashboard Integration
**Milestone:** M001

## Description

The custom engine path in `auto/loop.ts` bypasses `runDispatch` (which is where `deps.updateProgressWidget()` gets called on the dev path), so the TUI progress widget never renders during custom workflow execution. Fix this by adding the `updateProgressWidget` call in the custom engine path. Additionally, the dashboard overlay's `unitLabel()` function is missing a `custom-step` case — it falls through to `default: return type` which renders the raw string "custom-step" instead of "Workflow Step".

## Steps

1. **Add `updateProgressWidget` to custom engine path in `auto/loop.ts`:**
   - Locate the custom engine path (around line 127, the `if (s.activeEngineId != null && s.activeEngineId !== "dev" && !sidecarItem)` block).
   - After building `iterData` (the object with `unitType`, `unitId`, `state`, etc.) and **before** `runGuards`, add: `deps.updateProgressWidget(ctx, iterData.unitType, iterData.unitId, iterData.state);`
   - This mirrors the dev path where `updateProgressWidget` is called in `runDispatch` (phases.ts:879).

2. **Add `custom-step` case to `unitLabel` in `dashboard-overlay.ts`:**
   - In the `unitLabel()` function (around line 30), add `case "custom-step": return "Workflow Step";` before the `default` case.

3. **Write tests in `src/resources/extensions/gsd/tests/dashboard-custom-engine.test.ts`:**
   - Import `unitLabel` from `dashboard-overlay.ts` — note: `unitLabel` is a module-level function, not exported. If it's not exported, test it indirectly by checking the overlay renders correctly, OR add an export. Alternatively, since the function is simple, verify it by reading the source with a grep assertion.
   - **Better approach**: Test `unitVerb("custom-step")` and `unitPhaseLabel("custom-step")` from `auto-dashboard.ts` (these are already exported and already handle custom-step), then add a source-level assertion that `dashboard-overlay.ts` contains `"custom-step"` case.
   - For the `updateProgressWidget` call: assert that the string `updateProgressWidget` appears in the custom engine path block in `auto/loop.ts` (source-level grep test), OR use the `custom-engine-loop-integration.test.ts` mock pattern to verify the mock's `updateProgressWidget` was called during a custom engine loop iteration.
   - Use `node:test` with `node:assert/strict`.

## Must-Haves

- [ ] `deps.updateProgressWidget()` called in custom engine path before `runGuards`
- [ ] `unitLabel("custom-step")` returns `"Workflow Step"` in dashboard-overlay.ts
- [ ] Test file verifies both changes

## Verification

- `npx tsx --test src/resources/extensions/gsd/tests/dashboard-custom-engine.test.ts` passes
- `rg "updateProgressWidget" src/resources/extensions/gsd/auto/loop.ts` shows the call in the custom engine block
- `rg "custom-step" src/resources/extensions/gsd/dashboard-overlay.ts` shows the new case

## Inputs

- `src/resources/extensions/gsd/auto/loop.ts` — custom engine path that needs the `updateProgressWidget` call
- `src/resources/extensions/gsd/dashboard-overlay.ts` — `unitLabel()` function that needs the `custom-step` case
- `src/resources/extensions/gsd/auto-dashboard.ts` — already has `custom-step` mappings for `unitVerb` and `unitPhaseLabel` (reference)
- `src/resources/extensions/gsd/tests/custom-engine-loop-integration.test.ts` — reference for mock LoopDeps pattern

## Expected Output

- `src/resources/extensions/gsd/auto/loop.ts` — modified with `updateProgressWidget` call in custom engine path
- `src/resources/extensions/gsd/dashboard-overlay.ts` — modified with `custom-step` case in `unitLabel()`
- `src/resources/extensions/gsd/tests/dashboard-custom-engine.test.ts` — new test file verifying both changes

## Observability Impact

- **Progress widget:** The TUI progress widget now renders during custom workflow execution (previously blank). The widget shows the current `custom-step` unit type and ID, matching the dev path behavior. Visible in the dashboard overlay's "Now:" line.
- **Dashboard overlay:** `unitLabel("custom-step")` now returns `"Workflow Step"` instead of the raw `"custom-step"` string, making the overlay display human-readable for custom workflow units.
- **Inspection:** Run `rg "updateProgressWidget" src/resources/extensions/gsd/auto/loop.ts` to verify the call exists in the custom engine path. Run `rg "custom-step" src/resources/extensions/gsd/dashboard-overlay.ts` to verify the label case exists.
- **Failure state:** If `updateProgressWidget` throws during the custom engine path, the blanket catch in `autoLoop` handles it with graduated recovery (same as any iteration error). The widget call is side-effect only and does not affect engine dispatch.
