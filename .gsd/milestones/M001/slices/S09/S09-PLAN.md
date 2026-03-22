# S09: End-to-End Integration Test

**Goal:** A single comprehensive integration test proves the assembled workflow engine pipeline works end-to-end — from YAML definition through run creation, dependency-ordered dispatch, verification, context injection, iterate/fan-out, parameter substitution, and dashboard metadata.
**Demo:** `npm run test:integration -- --test-name-pattern "e2e-workflow-pipeline"` passes, exercising every engine feature in a single multi-step workflow.

## Must-Haves

- Test exercises the full engine-level pipeline: `createRun()` → `deriveState()` → `resolveDispatch()` → artifact write → `reconcile()` → `verify()` → repeat
- One multi-feature YAML definition tests dependency ordering, parameter substitution, content-heuristic verification, shell-command verification, `context_from` injection, and iterate/fan-out — all in one flow
- Dependency ordering proven: steps dispatch only when their `requires` dependencies are complete
- Context injection proven: dispatched prompts include content from prior step artifacts via `context_from`
- Iterate/fan-out proven: a step with `iterate` config expands into sub-steps, dispatches each, and blocks downstream until all complete
- Parameter substitution proven: `{{ param }}` placeholders resolve from defaults and overrides
- Verification proven: content-heuristic and shell-command policies return "continue" when criteria met
- Dashboard metadata proven: `getDisplayMetadata()` returns correct step count and progress at each stage
- Completion detection proven: after all steps complete, `deriveState()` returns `isComplete: true`

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test --test-name-pattern "e2e-workflow-pipeline" src/resources/extensions/gsd/tests/e2e-workflow-pipeline-integration.test.ts` — all tests pass
- `npm run test:integration` — includes this test via the `*integration*` glob and passes

## Tasks

- [ ] **T01: Write end-to-end workflow pipeline integration test** `est:45m`
  - Why: This is the sole task for S09 — it proves the assembled engine pipeline works by driving a multi-feature workflow definition through the full engine lifecycle at the engine level (not through autoLoop, avoiding timing-dependent flakiness).
  - Files: `src/resources/extensions/gsd/tests/e2e-workflow-pipeline-integration.test.ts`
  - Do: Write a single test file following the `iterate-engine-integration.test.ts` pattern (real temp dirs, `makeTempRun` helper, `dispatch`/`reconcile` helpers). Define a 4-step workflow YAML definition that exercises params, context_from, iterate, content-heuristic and shell-command verification, and dependency ordering. Drive the engine loop manually: derive → dispatch → write artifact → reconcile → verify. Assert dispatch ordering, enriched prompts, verification outcomes, dashboard metadata at each stage, and final completion.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/e2e-workflow-pipeline-integration.test.ts`
  - Done when: All tests pass, exercising every engine feature in one integrated flow

## Files Likely Touched

- `src/resources/extensions/gsd/tests/e2e-workflow-pipeline-integration.test.ts`
