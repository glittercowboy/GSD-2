---
estimated_steps: 4
estimated_files: 1
---

# T02: Git integration tests — dispatch-guard and branch operations with new-format IDs

**Slice:** S04 — Integration tests and end-to-end verification
**Milestone:** M001

## Description

Extend `integration-mixed-milestones.test.ts` with ~20 assertions proving `getPriorSliceCompletionBlocker()` and branch operations (`ensureSliceBranch`, `parseSliceBranch`, `mergeSliceToMain`) work correctly with new-format milestone IDs through real git repositories. Then run the full GSD test regression suite.

## Steps

1. Read `tests/dispatch-guard.test.ts` (full file) and the branch lifecycle section of `tests/worktree.test.ts` (~first 100 lines for the `run()` helper and git init pattern, then search for `ensureSliceBranch` usage). Also read the imports from `worktree.ts` to confirm export signatures for `ensureSliceBranch`, `parseSliceBranch`, `getSliceBranchName`, `mergeSliceToMain`, `getCurrentBranch`.

2. Extend `integration-mixed-milestones.test.ts` with a `run()` helper (execSync wrapper) and:
   - **Group 5: dispatch-guard with new-format milestones** (~8 assertions): Create git repo with `M-abc123-001/` (all slices complete) and `M-abc123-002/` (slices incomplete). Commit. Assert `getPriorSliceCompletionBlocker()` returns null (no blocker) for M-abc123-002/S01 when M-abc123-001 is complete. Then test with mixed formats: `M001/` (incomplete) + `M-abc123-002/` — assert blocker message references M001's incomplete slice.
   - **Group 6: Branch operations with new-format IDs** (~12 assertions): Git repo with initial commit. Test `getSliceBranchName("M-abc123-001", "S01")` returns `gsd/M-abc123-001/S01`. Test `parseSliceBranch("gsd/M-abc123-001/S01")` returns correct milestone and slice IDs. Test `ensureSliceBranch` creates the branch, `getCurrentBranch` returns it. Create a file, commit on the slice branch, then `mergeSliceToMain` — verify we're back on main and the commit exists.

3. Run the complete test file: `npx tsx src/resources/extensions/gsd/tests/integration-mixed-milestones.test.ts`. Debug failures — likely causes: files not committed before dispatch-guard check, wrong branch name expectations, merge conflicts.

4. Run full GSD test regression: `npx tsx src/resources/extensions/gsd/tests/derive-state.test.ts`, `npx tsx src/resources/extensions/gsd/tests/dispatch-guard.test.ts`, `npx vitest run src/resources/extensions/gsd/tests/regex-hardening.test.ts`, `npx tsx src/resources/extensions/gsd/tests/unique-milestone-ids.test.ts`. Confirm all pass unchanged.

## Must-Haves

- [ ] Group 5: dispatch-guard with new-format and mixed-format milestones passes all assertions
- [ ] Group 6: Branch operations (ensure, parse, merge) with new-format IDs pass all assertions
- [ ] Full test file passes with ~60 total assertions, 0 failures
- [ ] All existing GSD test files pass unchanged (regression gate)

## Verification

- `npx tsx src/resources/extensions/gsd/tests/integration-mixed-milestones.test.ts` — all ~60 assertions pass
- `npx tsx src/resources/extensions/gsd/tests/derive-state.test.ts` — 106 passed
- `npx tsx src/resources/extensions/gsd/tests/dispatch-guard.test.ts` — 4+ passed
- `npx vitest run src/resources/extensions/gsd/tests/regex-hardening.test.ts` — 83 passed
- `npx tsx src/resources/extensions/gsd/tests/unique-milestone-ids.test.ts` — 63 passed

## Inputs

- `src/resources/extensions/gsd/tests/integration-mixed-milestones.test.ts` — T01 output (Groups 1-4 passing)
- `src/resources/extensions/gsd/tests/dispatch-guard.test.ts` — git init + dispatch-guard test pattern
- `src/resources/extensions/gsd/tests/worktree.test.ts` — branch lifecycle test pattern
- `src/resources/extensions/gsd/dispatch-guard.ts` — `getPriorSliceCompletionBlocker()` API
- `src/resources/extensions/gsd/worktree.ts` — `ensureSliceBranch`, `parseSliceBranch`, `getSliceBranchName`, `mergeSliceToMain`, `getCurrentBranch` APIs
- S04-RESEARCH.md Groups 5-6 specifications and Common Pitfalls (dispatch-guard reads from git branch, not working tree)

## Observability Impact

- **Test diagnostic output:** Groups 5-6 print `=== Group N: ... ===` headers and per-assertion FAIL lines to stderr, matching the existing Groups 1-4 pattern. Summary footer shows cumulative pass/fail counts across all 6 groups.
- **Inspection surface:** `npx tsx src/resources/extensions/gsd/tests/integration-mixed-milestones.test.ts` — exit code 0 means all ~60 assertions pass; exit code 1 with FAIL lines shows which assertions broke.
- **Failure visibility:** Each failed assertion logs `FAIL: <message> — expected <X>, got <Y>` to stderr. Git-related failures will show branch name mismatches or missing files.
- **Temp directory cleanup:** Git repos created in `mkdtempSync` are cleaned up in `finally` blocks — no leftover state between runs.

## Expected Output

- `src/resources/extensions/gsd/tests/integration-mixed-milestones.test.ts` — complete test file with ~60 assertions across Groups 1-6, all passing
