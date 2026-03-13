# S04: Integration tests and end-to-end verification

**Goal:** Prove mixed-format milestone directories work through all real code paths — `deriveState()`, `indexWorkspace()`, `inlinePriorMilestoneSummary()`, `getPriorSliceCompletionBlocker()`, and branch operations — with integration tests using actual filesystem and git fixtures.
**Demo:** `npx tsx src/resources/extensions/gsd/tests/integration-mixed-milestones.test.ts` passes ~60 assertions covering both new-format-only and mixed old+new format milestones through every integration surface. All existing GSD tests still pass.

## Must-Haves

- `deriveState()` correctly handles new-format-only milestones (phase detection, registry, progress)
- `deriveState()` correctly handles mixed old+new format milestones (sorted by seq number, correct active milestone)
- `indexWorkspace()` produces correct index with mixed-format milestones (titles stripped, scopes correct)
- `inlinePriorMilestoneSummary()` finds prior milestone summaries across format boundaries
- `getPriorSliceCompletionBlocker()` blocks/allows correctly with new-format milestone dirs in git
- Branch operations (ensure, parse, merge) work with new-format milestone IDs through real git

## Proof Level

- This slice proves: integration (real filesystem + git, no mocks)
- Real runtime required: no (tests exercise library functions directly)
- Human/UAT required: no

## Verification

- `npx tsx src/resources/extensions/gsd/tests/integration-mixed-milestones.test.ts` — ~60 assertions, 0 failures
- `npx tsx src/resources/extensions/gsd/tests/derive-state.test.ts` — 106 passed (regression)
- `npx tsx src/resources/extensions/gsd/tests/dispatch-guard.test.ts` — 4+ passed (regression)
- `npx vitest run src/resources/extensions/gsd/tests/regex-hardening.test.ts` — 83 passed (regression)

## Observability / Diagnostics

- **Runtime signals:** Test runner prints per-group pass/fail counts and exits with code 1 on any failure. Each assertion failure logs the expected vs actual values.
- **Inspection surfaces:** Run any test file directly with `npx tsx <file>` to see pass/fail output. No special environment or test framework needed.
- **Failure visibility:** Failed assertions print `FAIL: <message> — expected <X>, got <Y>` to stderr. The summary footer shows total passed/failed counts.
- **Redaction constraints:** Tests use temp directories (`mkdtempSync`) that are auto-cleaned. No secrets or user data involved.

## Integration Closure

- Upstream surfaces consumed: `deriveState()` from state.ts, `indexWorkspace()` from workspace-index.ts, `inlinePriorMilestoneSummary()` from files.ts, `getPriorSliceCompletionBlocker()` from dispatch-guard.ts, `ensureSliceBranch()`/`parseSliceBranch()`/`mergeSliceToMain()` from worktree.ts
- New wiring introduced in this slice: none — test-only
- What remains before the milestone is truly usable end-to-end: nothing — S01-S03 delivered all production code, S04 closes the proof gap

## Tasks

- [x] **T01: Filesystem integration tests — deriveState, indexWorkspace, inlinePriorMilestoneSummary** `est:30m`
  - Why: No existing test creates `M-abc123-001/` dirs and runs real state derivation or workspace indexing through them. This proves the core integration surfaces work with both formats.
  - Files: `src/resources/extensions/gsd/tests/integration-mixed-milestones.test.ts`
  - Do: Create test file with Groups 1-4 from research. Follow `derive-state.test.ts` fixture pattern (mkdtempSync + try/finally). Use `writeRoadmap()`, `writePlan()`, `writeMilestoneSummary()` helpers parameterized with new-format IDs. Import `deriveState`, `indexWorkspace`, `inlinePriorMilestoneSummary`. Assert registry order respects `milestoneIdSort`, titles strip both formats, active milestone detection works.
  - Verify: `npx tsx src/resources/extensions/gsd/tests/integration-mixed-milestones.test.ts` — ~42 assertions pass
  - Done when: File runs with 0 failures covering deriveState (new-only + mixed), indexWorkspace (mixed), and inlinePriorMilestoneSummary (mixed)

- [x] **T02: Git integration tests — dispatch-guard and branch operations with new-format IDs** `est:25m`
  - Why: dispatch-guard and branch operations are git-dependent code paths that haven't been tested with new-format milestone directories. This closes the last proof gap.
  - Files: `src/resources/extensions/gsd/tests/integration-mixed-milestones.test.ts`
  - Do: Extend the test file with Groups 5-6 from research. Follow `dispatch-guard.test.ts` git init pattern (run() helper, git config, commits). Test `getPriorSliceCompletionBlocker()` with new-format milestone dirs — blocking when prior incomplete, allowing when complete, mixed formats. Test `ensureSliceBranch`, `parseSliceBranch`, `mergeSliceToMain` with new-format IDs through real git. Run full regression suite.
  - Verify: `npx tsx src/resources/extensions/gsd/tests/integration-mixed-milestones.test.ts` — all ~60 assertions pass; existing tests still pass
  - Done when: Complete test file passes with 0 failures, all existing GSD test files pass unchanged

## Files Likely Touched

- `src/resources/extensions/gsd/tests/integration-mixed-milestones.test.ts` (new)
