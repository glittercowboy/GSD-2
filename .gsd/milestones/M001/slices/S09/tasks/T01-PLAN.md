---
estimated_steps: 4
estimated_files: 1
skills_used:
  - test
---

# T01: Write end-to-end workflow pipeline integration test

**Slice:** S09 — End-to-End Integration Test
**Milestone:** M001

## Description

Write a comprehensive integration test that proves the assembled workflow engine pipeline works end-to-end. The test exercises every engine feature in a single multi-step workflow: dependency-ordered dispatch, parameter substitution, content-heuristic and shell-command verification, context injection via `context_from`, iterate/fan-out expansion, dashboard metadata, and completion detection.

The test operates at the **engine level** (CustomWorkflowEngine + CustomExecutionPolicy + real temp directories), NOT through `autoLoop()`. This avoids the timing-dependent `resolveAgentEnd` pattern that causes flakiness in `custom-engine-loop-integration.test.ts`.

Follow the established pattern from `iterate-engine-integration.test.ts` — it's the cleanest model: real temp dirs via `mkdtempSync`, `makeTempRun()` helper, `dispatch()`/`reconcile()` helpers, cleanup via `afterEach`.

## Steps

1. **Set up test file with imports and helpers.** Import `CustomWorkflowEngine` from `../custom-workflow-engine.ts`, `CustomExecutionPolicy` from `../custom-execution-policy.ts`, `createRun`/`listRuns` from `../run-manager.ts`, `writeGraph`/`readGraph` from `../graph.ts`, `validateDefinition` from `../definition-loader.ts`, `unitVerb`/`unitPhaseLabel` from `../auto-dashboard.ts`. Create `makeTempRun()`, `dispatch()`, `reconcile()`, `makeStep()` helpers following the iterate test pattern. Use `node:test` (describe/it/afterEach), `node:assert/strict`, real temp dirs with cleanup.

2. **Define a multi-feature YAML workflow and write the core integration test.** Design a 4-step workflow definition that exercises every feature in one flow:
   - Step `gather`: no deps, produces `output/gather-results.md`, content-heuristic verify (minSize: 10), uses `{{ target }}` param
   - Step `scan`: depends on `gather`, iterates over `output/gather-results.md` with pattern `^- (.+)$`, shell-command verify (`test -f` on produced file), prompt uses `{{ item }}`
   - Step `analyze`: depends on `scan`, context_from `scan`, content-heuristic verify, produces `output/analysis.md`
   - Step `report`: depends on `analyze`, context_from `analyze`, produces `output/report.md`, prompt uses `{{ target }}` param
   
   The definition must have `params: { target: "default-target" }` and the test should call `createRun()` with override `{ target: "my-project" }` to prove substitution works.

   The main test drives the full loop:
   - Create a temp base dir that looks like a project (with `.gsd/workflow-defs/` containing the YAML definition)
   - Call `createRun(basePath, "e2e-pipeline", { target: "my-project" })` — verify it returns a valid runDir with DEFINITION.yaml, GRAPH.yaml, and PARAMS.json
   - Instantiate `CustomWorkflowEngine(runDir)` and `CustomExecutionPolicy(runDir)`
   - **Step 1 (gather):** dispatch → assert unitId is `e2e-pipeline/gather`, prompt contains "my-project" (param substituted). Write `output/gather-results.md` with bullet list content (for iterate). Reconcile. Verify with policy → assert "continue" (content-heuristic passes). Assert dashboard metadata shows Step 1/4.
   - **Step 2 (scan with iterate):** dispatch → assert the step expands into sub-steps (one per bullet item). Dispatch each instance, write its artifact, reconcile. Verify each instance with shell-command policy. Assert downstream `analyze` is blocked until all instances complete.
   - **Step 3 (analyze):** dispatch → assert prompt includes injected context from scan artifacts. Write artifact. Reconcile. Verify.
   - **Step 4 (report):** dispatch → assert prompt includes injected context from analyze AND param substitution. Write artifact. Reconcile. Verify.
   - After all steps: `deriveState()` → assert `isComplete === true`. Dashboard metadata shows all steps complete.

3. **Add targeted edge-case tests.** Add a describe block that tests `createRun()` with `listRuns()` integration — verify the created run shows up in listings with correct metadata. Add a test that `validateDefinition()` accepts the e2e definition (proving it's valid V1 schema).

4. **Run the test and fix any issues.** Execute the test file directly with `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/e2e-workflow-pipeline-integration.test.ts`. All tests must pass. Then run `npm run test:integration` to confirm the glob picks it up and it passes alongside other integration tests.

## Must-Haves

- [ ] Test file exists at `src/resources/extensions/gsd/tests/e2e-workflow-pipeline-integration.test.ts`
- [ ] One multi-feature workflow definition exercises: dependency ordering, parameter substitution, content-heuristic verification, shell-command verification, context_from injection, iterate/fan-out
- [ ] Main test drives the full engine loop: createRun → derive → dispatch → write artifact → reconcile → verify → repeat for all steps
- [ ] Dependency ordering: steps dispatch only when their requires are complete
- [ ] Context injection: dispatched prompts include content from prior step artifacts
- [ ] Iterate expansion: step with iterate config expands into sub-steps, blocks downstream
- [ ] Parameter substitution: `{{ target }}` resolves from overrides (not defaults)
- [ ] Verification: content-heuristic and shell-command policies return "continue" on valid artifacts
- [ ] Dashboard metadata: `getDisplayMetadata()` returns correct stepCount at each stage
- [ ] Completion: `deriveState()` returns `isComplete: true` after all steps
- [ ] All tests pass when run with `npm run test:integration`

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/e2e-workflow-pipeline-integration.test.ts` — all tests pass
- `npm run test:integration` — includes this test and all tests pass (or at least no NEW failures — existing flaky tests in `custom-engine-loop-integration.test.ts` are pre-existing)

## Inputs

- `src/resources/extensions/gsd/tests/iterate-engine-integration.test.ts` — reference pattern for helpers, temp dir setup, engine-level testing
- `src/resources/extensions/gsd/tests/custom-workflow-engine.test.ts` — reference for CustomWorkflowEngine + CustomExecutionPolicy test patterns
- `src/resources/extensions/gsd/custom-workflow-engine.ts` — CustomWorkflowEngine class (deriveState, resolveDispatch, reconcile, getDisplayMetadata)
- `src/resources/extensions/gsd/custom-execution-policy.ts` — CustomExecutionPolicy class (verify delegates to runCustomVerification)
- `src/resources/extensions/gsd/run-manager.ts` — createRun(), listRuns() functions
- `src/resources/extensions/gsd/graph.ts` — readGraph(), writeGraph(), getNextPendingStep(), markStepComplete(), expandIteration(), initializeGraph()
- `src/resources/extensions/gsd/definition-loader.ts` — WorkflowDefinition, StepDefinition types, validateDefinition(), loadDefinition(), substituteParams()
- `src/resources/extensions/gsd/context-injector.ts` — injectContext() function
- `src/resources/extensions/gsd/custom-verification.ts` — runCustomVerification() function
- `src/resources/extensions/gsd/auto-dashboard.ts` — unitVerb(), unitPhaseLabel() exported helpers

## Expected Output

- `src/resources/extensions/gsd/tests/e2e-workflow-pipeline-integration.test.ts` — comprehensive integration test proving the full engine pipeline
