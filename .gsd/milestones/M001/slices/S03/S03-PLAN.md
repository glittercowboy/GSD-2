# S03: CustomWorkflowEngine — Linear Step Execution

**Goal:** A hardcoded 3-step workflow definition runs through auto-mode's engine interface: the custom engine derives state from GRAPH.yaml, dispatches steps in order, and marks them complete via reconcile.
**Demo:** An integration test creates a 3-step hardcoded workflow, runs `deriveState → resolveDispatch → reconcile` in a loop, and all 3 steps reach "complete" status in the GRAPH.yaml file. `resolveEngine({ activeEngineId: "custom:/tmp/run" })` returns `CustomWorkflowEngine`.

## Must-Haves

- `graph.ts` — pure data module: read/write GRAPH.yaml, step status tracking (pending → active → complete), topological dispatch order for linear steps
- `CustomWorkflowEngine` implementing `WorkflowEngine` — `deriveState()` reads GRAPH.yaml, `resolveDispatch()` returns next pending step, `reconcile()` marks step complete, `getDisplayMetadata()` returns workflow progress
- `CustomExecutionPolicy` implementing `ExecutionPolicy` — stub methods with neutral return values (parallel to DevExecutionPolicy stubs, real implementation is S05+)
- `resolveEngine()` updated: `"custom:*"` prefix routes to `CustomWorkflowEngine`, satisfying R005's "custom" branch requirement
- `EngineState.raw` returns a GSDState-compatible stub with neutral values so `dispatchNextUnit()` code between `engine.deriveState()` and `engine.resolveDispatch()` doesn't crash
- Existing contract test updated: `resolveEngine({ activeEngineId: "custom" })` no longer throws
- Integration test proving full 3-step dispatch cycle
- All 1590+ existing tests still pass (zero regression)

## Proof Level

- This slice proves: integration (engine interface → GRAPH.yaml state → dispatch cycle)
- Real runtime required: no (test exercises engine methods directly, no auto-loop runtime)
- Human/UAT required: no

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/custom-engine-integration.test.ts` — all assertions pass (3-step dispatch cycle, graph read/write, resolver routing, GSDState stub compatibility)
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/dev-engine-contract.test.ts` — existing 18 assertions pass (resolver test updated for "custom" branch)
- `npx tsc --noEmit --project tsconfig.extensions.json` — 0 type errors
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/*.test.ts` — full suite passes, zero new failures vs 1590 baseline

## Observability / Diagnostics

- Runtime signals: `resolveEngine()` throws `"Unknown engine: ${id}"` for IDs that don't match `"dev"` or `"custom:*"` prefix — existing error path preserved for truly unknown engines
- Inspection surfaces: GRAPH.yaml file is human-readable YAML showing step statuses; `CustomWorkflowEngine.getDisplayMetadata()` returns `stepCount` with completed/total
- Failure visibility: `deriveState()` surfaces graph parse errors; `resolveDispatch()` returns `{ action: "stop" }` when all steps are complete or graph is empty

## Integration Closure

- Upstream surfaces consumed: `workflow-engine.ts` (WorkflowEngine interface), `execution-policy.ts` (ExecutionPolicy interface), `engine-types.ts` (EngineState, EngineDispatchAction, StepContract, etc.), `engine-resolver.ts` (resolveEngine function + ResolvedEngine type)
- New wiring introduced in this slice: `resolveEngine()` gains `"custom:*"` branch returning CustomWorkflowEngine + CustomExecutionPolicy; no changes to `auto.ts` — the existing polymorphic path from S02 handles any engine that satisfies the interface
- What remains before the milestone is truly usable end-to-end: YAML definition loading (S04), run snapshotting (S04), context continuity (S05), verification policies (S05), iteration (S06), CLI commands (S07), dashboard integration (S08)

## Tasks

- [x] **T01: Implement graph.ts, CustomWorkflowEngine, CustomExecutionPolicy, and wire resolveEngine "custom" branch** `est:45m`
  - Why: All production code for S03 — graph data module, engine + policy implementations, and resolver routing. These are tightly coupled (engine reads graph, resolver creates engine) and small enough to build together (~400 lines total).
  - Files: `src/resources/extensions/gsd/graph.ts`, `src/resources/extensions/gsd/custom-workflow-engine.ts`, `src/resources/extensions/gsd/custom-execution-policy.ts`, `src/resources/extensions/gsd/engine-resolver.ts`
  - Do: (1) Create `graph.ts` — pure data module with types `GraphStep { id, title, status, prompt, dependsOn }` and `WorkflowGraph { steps, metadata }`, functions `readGraph(runDir)`, `writeGraph(runDir, graph)`, `getNextPendingStep(graph)`, `markStepComplete(graph, stepId)`. GRAPH.yaml format: `steps:` array with `id`, `title`, `status` (pending/active/complete), `prompt`, `depends_on`. (2) Create `custom-workflow-engine.ts` implementing WorkflowEngine — `engineId` is `"custom"`, constructor takes `runDir` parameter, `deriveState()` reads GRAPH.yaml and builds EngineState with GSDState-compatible stub in `.raw` (null activeMilestone/activeSlice/activeTask, phase "executing", empty arrays for registry/decisions/blockers), `resolveDispatch()` calls `getNextPendingStep()` and returns dispatch or stop, `reconcile()` calls `markStepComplete()` and writes GRAPH.yaml, `getDisplayMetadata()` returns step progress. (3) Create `custom-execution-policy.ts` — stub methods mirroring DevExecutionPolicy patterns. (4) Update `engine-resolver.ts`: add imports, add `id.startsWith("custom:")` branch that extracts runDir from `id.slice("custom:".length)` and returns CustomWorkflowEngine + CustomExecutionPolicy. Keep the unknown-ID throw as final fallback. Only import `.js` extensions per project convention.
  - Verify: `npx tsc --noEmit --project tsconfig.extensions.json` — 0 errors
  - Done when: All four files exist, typecheck passes, resolveEngine handles "custom:*" IDs
  - Observability Impact: resolveEngine now has 3 paths (dev, custom:*, unknown-throw). Unknown engine error message unchanged.

- [x] **T02: Write integration test and update existing contract test for custom engine** `est:30m`
  - Why: Proves the 3-step dispatch cycle works end-to-end through the engine interface and that existing tests aren't broken by the resolver change.
  - Files: `src/resources/extensions/gsd/tests/custom-engine-integration.test.ts`, `src/resources/extensions/gsd/tests/dev-engine-contract.test.ts`
  - Do: (1) Create `custom-engine-integration.test.ts` with tests: (a) `readGraph/writeGraph` roundtrip in a tmp dir, (b) `getNextPendingStep` returns first pending step, (c) `markStepComplete` transitions step status, (d) `resolveEngine({ activeEngineId: "custom:/tmp/run" })` returns CustomWorkflowEngine with engineId "custom", (e) Full 3-step dispatch cycle: create a GRAPH.yaml with 3 steps in a tmp dir, call `engine.deriveState()` → verify EngineState shape and GSDState stub compatibility (phase, null refs, empty arrays), call `engine.resolveDispatch()` → get first step dispatch, call `engine.reconcile()` → step marked complete in GRAPH.yaml, loop 3 times until all complete, verify final `resolveDispatch()` returns `{ action: "stop" }`, (f) `getDisplayMetadata()` returns correct stepCount. (2) Update `dev-engine-contract.test.ts`: change the "resolveEngine with unknown activeEngineId throws" test — `"custom"` alone (without `:` path) should still throw since it's not a valid custom engine ID, but `"custom:/some/path"` should NOT throw. Add a test for `"custom:/tmp/test"` returning CustomWorkflowEngine. Ensure `"bogus"` still throws. Use `node:fs` `mkdtempSync` + `rmSync` for test isolation. Follow patterns from existing tests: `import test from "node:test"`, `import assert from "node:assert/strict"`, import from `"../module.ts"` paths. Skills: test runner is Node built-in (`node:test`), use `--import ./src/resources/extensions/gsd/tests/resolve-ts.mjs` loader per K001/L003.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/custom-engine-integration.test.ts` passes AND `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/dev-engine-contract.test.ts` passes AND `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/*.test.ts` — zero new failures vs 1590 baseline
  - Done when: Integration test proves 3-step dispatch cycle, contract test updated for custom branch, full suite has zero new failures

## Files Likely Touched

- `src/resources/extensions/gsd/graph.ts` (new)
- `src/resources/extensions/gsd/custom-workflow-engine.ts` (new)
- `src/resources/extensions/gsd/custom-execution-policy.ts` (new)
- `src/resources/extensions/gsd/engine-resolver.ts` (modify — add custom branch)
- `src/resources/extensions/gsd/tests/custom-engine-integration.test.ts` (new)
- `src/resources/extensions/gsd/tests/dev-engine-contract.test.ts` (modify — update resolver tests)
