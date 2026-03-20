---
estimated_steps: 3
estimated_files: 2
---

# T02: Write integration test and update existing contract test for custom engine

## Observability Impact

- **Test failure diagnostics**: Integration test names are descriptive and map 1:1 to the dispatch cycle phases — a failing test name tells you exactly which phase broke (deriveState, resolveDispatch, reconcile, or display metadata).
- **Resolver coverage**: Contract test now covers all three resolver branches (dev, custom:*, unknown-throw) — a regression in routing shows up as a named test failure.
- **GSDState stub validation**: The integration test explicitly asserts stub shape (activeMilestone non-null, phase "executing", empty arrays) — if the auto-loop's early-exit guards change, these tests will catch the mismatch.
- **GRAPH.yaml disk state**: The 3-step cycle test verifies on-disk state after each reconcile, so a broken atomic write or serialization bug surfaces as a specific step-status assertion failure.

**Slice:** S03 — CustomWorkflowEngine — Linear Step Execution
**Milestone:** M001

## Description

Write the integration test proving the 3-step dispatch cycle works end-to-end through the engine interface, and update the existing resolver contract test now that `"custom:*"` IDs are valid. This is the slice's proof — without these tests passing, the slice demo is unverified.

Use Node built-in test runner (`node:test`), `node:assert/strict`, and the `resolve-ts.mjs` loader (per K001/L003). Use `node:fs` `mkdtempSync`/`rmSync` for test isolation — each test gets a fresh tmp directory with its own GRAPH.yaml.

## Steps

1. **Create `custom-engine-integration.test.ts`** with the following test groups:
   - **graph.ts data operations**: `writeGraph`/`readGraph` roundtrip in tmp dir (write 3 steps, read back, verify structure). `getNextPendingStep` returns first pending step. `getNextPendingStep` returns null when all steps are complete. `markStepComplete` transitions a step from pending to complete.
   - **Resolver routing**: `resolveEngine({ activeEngineId: "custom:/tmp/test" })` returns engine with `engineId === "custom"` and policy that is `CustomExecutionPolicy`. `resolveEngine({ activeEngineId: "custom" })` (no colon-path — malformed) — decide behavior: if the code uses `id.startsWith("custom:")`, then bare `"custom"` won't match and will throw. Test this. `resolveEngine({ activeEngineId: "bogus" })` still throws.
   - **Full 3-step dispatch cycle**: Create tmp dir with GRAPH.yaml containing 3 steps (step-1, step-2, step-3). Instantiate `CustomWorkflowEngine(tmpDir)`. Loop 3 times: call `engine.deriveState(tmpDir)` → verify `EngineState` shape (phase, currentMilestoneId, isComplete, and `raw` is GSDState-compatible with non-null activeMilestone, "executing" phase, empty arrays). Call `engine.resolveDispatch(state, { basePath: tmpDir })` → verify dispatch action has `unitType: "custom-step"` and correct step ID. Call `engine.reconcile(state, completedStep)` → verify outcome is "continue" (not "stop"). After 3 iterations, call `resolveDispatch` one more time → verify `{ action: "stop" }`. Read GRAPH.yaml and verify all 3 steps have status "complete".
   - **Display metadata**: Call `getDisplayMetadata(state)` mid-cycle, verify `engineLabel`, `currentPhase`, `stepCount` with correct completed/total counts.

2. **Update `dev-engine-contract.test.ts`**: Find the test `"resolveEngine with unknown activeEngineId throws"` which currently tests that `"custom"` throws. Change it: bare `"custom"` (no colon) should still throw (it's not `"custom:*"`). Add a new test: `"resolveEngine with custom:* activeEngineId returns CustomWorkflowEngine"` — `resolveEngine({ activeEngineId: "custom:/tmp/test" })` returns engine with `engineId === "custom"`. Keep the `"bogus"` throws test. Import `CustomWorkflowEngine` from `"../custom-workflow-engine.ts"` for `instanceof` check.

3. **Run full test suite** to verify zero regressions: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/*.test.ts` — expect 1590+ pass, 1 pre-existing fail (L001), 3 skipped, zero new failures.

## Must-Haves

- [ ] Integration test exercises full 3-step `deriveState → resolveDispatch → reconcile` loop
- [ ] Integration test verifies GRAPH.yaml state after each reconcile (step marked complete on disk)
- [ ] Integration test verifies GSDState stub compatibility in `EngineState.raw` (non-null activeMilestone, "executing" phase, empty arrays)
- [ ] Integration test verifies `resolveDispatch` returns `{ action: "stop" }` after all steps complete
- [ ] Existing contract test updated: `"custom"` (bare) still throws, `"custom:/path"` returns CustomWorkflowEngine
- [ ] Full suite passes with zero new failures vs 1590 baseline

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/custom-engine-integration.test.ts` — all tests pass
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/dev-engine-contract.test.ts` — 18+ assertions pass (was 18, now 20+ with new custom tests)
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/*.test.ts` — zero new failures vs 1590 baseline

## Inputs

- `src/resources/extensions/gsd/graph.ts` — T01 output: readGraph, writeGraph, getNextPendingStep, markStepComplete, GraphStep, WorkflowGraph
- `src/resources/extensions/gsd/custom-workflow-engine.ts` — T01 output: CustomWorkflowEngine class
- `src/resources/extensions/gsd/custom-execution-policy.ts` — T01 output: CustomExecutionPolicy class
- `src/resources/extensions/gsd/engine-resolver.ts` — T01 output: resolveEngine with custom branch
- `src/resources/extensions/gsd/engine-types.ts` — EngineState, EngineDispatchAction type definitions
- `src/resources/extensions/gsd/tests/dev-engine-contract.test.ts` — existing 18-assertion contract test to update
- `src/resources/extensions/gsd/tests/resolve-ts.mjs` — test loader (must use `--import` flag)

## Expected Output

- `src/resources/extensions/gsd/tests/custom-engine-integration.test.ts` — ~150-200 lines, 10+ test assertions covering graph operations, resolver routing, full dispatch cycle, and display metadata
- `src/resources/extensions/gsd/tests/dev-engine-contract.test.ts` — modified: resolver "custom" test updated, new "custom:*" test added (~20 lines net change)
