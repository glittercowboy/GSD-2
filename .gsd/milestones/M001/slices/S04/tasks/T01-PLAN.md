---
estimated_steps: 5
estimated_files: 1
---

# T01: Filesystem integration tests — deriveState, indexWorkspace, inlinePriorMilestoneSummary

**Slice:** S04 — Integration tests and end-to-end verification
**Milestone:** M001

## Description

Create `integration-mixed-milestones.test.ts` with ~42 assertions proving `deriveState()`, `indexWorkspace()`, and `inlinePriorMilestoneSummary()` all work correctly with new-format (`M-abc123-001`) and mixed old+new format milestone directories on disk. Uses real filesystem fixtures — no mocking.

## Steps

1. Read `tests/derive-state.test.ts` (first ~120 lines) and `tests/workspace-index.test.ts` (full file) to extract the exact fixture helper patterns, imports, and assertion helpers. Note how `deriveState()` and `indexWorkspace()` are called and what they return.

2. Read `src/resources/extensions/gsd/files.ts` to find the `inlinePriorMilestoneSummary()` export signature and understand what it returns.

3. Create `src/resources/extensions/gsd/tests/integration-mixed-milestones.test.ts` with:
   - Assertion helpers: `assertEq`, `assertTrue`, `assertMatch` (same pattern as other tests)
   - Fixture helpers: `createFixtureBase`, `writeRoadmap`, `writePlan`, `writeMilestoneSummary` — copy from derive-state.test.ts
   - **Group 1: deriveState with new-format-only milestones** (~12 assertions): Create `M-abc123-001/` with roadmap (heading `# M-abc123-001: Test Feature`) + 2 slices (S01 complete, S02 in-progress). Assert: phase is `execute-task` or similar active phase, registry has 1 entry with id `M-abc123-001`, title correctly stripped to `Test Feature`, progress counts correct, `activeMilestone.id === "M-abc123-001"`.
   - **Group 2: deriveState with mixed-format milestones** (~15 assertions): Create `M001/` (complete — all slices checked, has summary) + `M-abc123-002/` (active with slices). Assert: registry length 2, sorted by seq number (M001 first, M-abc123-002 second), M001 is complete, M-abc123-002 is active, `activeMilestone.id === "M-abc123-002"`, both titles correctly stripped.
   - **Group 3: indexWorkspace with mixed-format milestones** (~10 assertions): Same fixture as Group 2. Call `indexWorkspace()`. Assert: both milestones in index, titles stripped from both formats, scopes include new-format paths.
   - **Group 4: inlinePriorMilestoneSummary with mixed formats** (~5 assertions): Create `M001/` with `M001-SUMMARY.md` + `M-abc123-002/` as active. Call `inlinePriorMilestoneSummary("M-abc123-002", base)`. Assert result is non-null, contains M001's summary content.
   - Summary footer: print passed/failed counts, exit 1 if any failed.

4. Run the test: `npx tsx src/resources/extensions/gsd/tests/integration-mixed-milestones.test.ts`. Debug any failures — likely causes: incorrect roadmap heading format, missing `milestoneIdSort` expectations in assertions, wrong file naming convention.

5. Verify the existing tests still pass: `npx tsx src/resources/extensions/gsd/tests/derive-state.test.ts` and `npx tsx src/resources/extensions/gsd/tests/workspace-index.test.ts`.

## Must-Haves

- [ ] Group 1: deriveState with new-format-only milestones passes all assertions
- [ ] Group 2: deriveState with mixed old+new format milestones passes all assertions
- [ ] Group 3: indexWorkspace with mixed formats passes all assertions
- [ ] Group 4: inlinePriorMilestoneSummary across format boundary passes all assertions
- [ ] Existing derive-state.test.ts and workspace-index.test.ts still pass

## Observability Impact

- **New signals:** Test file prints per-group headers (`=== Group N: ... ===`) and per-assertion PASS/FAIL to stdout/stderr. Summary footer shows total counts.
- **Inspection:** Run `npx tsx src/resources/extensions/gsd/tests/integration-mixed-milestones.test.ts` — zero-dependency, no test framework. Output is self-describing.
- **Failure visibility:** Each failed assertion prints expected vs actual with the assertion label. Exit code 1 on any failure enables CI integration.

## Verification

- `npx tsx src/resources/extensions/gsd/tests/integration-mixed-milestones.test.ts` — ~42 assertions, 0 failures
- `npx tsx src/resources/extensions/gsd/tests/derive-state.test.ts` — 106 passed (regression)

## Inputs

- `src/resources/extensions/gsd/tests/derive-state.test.ts` — fixture helper patterns (createFixtureBase, writeRoadmap, writePlan, writeMilestoneSummary)
- `src/resources/extensions/gsd/tests/workspace-index.test.ts` — indexWorkspace test pattern
- `src/resources/extensions/gsd/state.ts` — `deriveState()` API
- `src/resources/extensions/gsd/workspace-index.ts` — `indexWorkspace()` API
- `src/resources/extensions/gsd/files.ts` — `inlinePriorMilestoneSummary()` API
- S04-RESEARCH.md Groups 1-4 specifications and Common Pitfalls section

## Expected Output

- `src/resources/extensions/gsd/tests/integration-mixed-milestones.test.ts` — new test file with ~42 assertions across Groups 1-4, all passing
