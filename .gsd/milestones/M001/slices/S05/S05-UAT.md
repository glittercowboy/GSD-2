# S05: Worktree Isolation + Merge Reconciliation — UAT

**Milestone:** M001
**Written:** 2025-03-15

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: Worktree DB copy and reconciliation are fully exercised by the 37-assertion unit test suite which creates real SQLite databases, runs actual ATTACH/DETACH operations, and verifies data integrity. The wiring into the worktree lifecycle is verified by compilation and grep confirmation. Live runtime UAT would require manual worktree creation which adds no additional coverage over the contract tests.

## Preconditions

- Repository is on the `memory-db` branch with S05 changes compiled
- `npx tsc --noEmit` passes with 0 errors
- `npm run test:unit` passes with 288 tests, 0 failures

## Smoke Test

Run `npm run test:unit -- --test-name-pattern "worktree-db"` — all 36 test cases pass, confirming DB copy, merge, conflict detection, and edge case handling all work.

## Test Cases

### 1. DB Copy on Worktree Creation

1. Verify `copyWorktreeDb` is called in `createWorktree()`: `grep -n "copyWorktreeDb" src/resources/extensions/gsd/worktree-manager.ts`
2. **Expected:** 2 matches — one import line and one call line after `git worktree add`

### 2. DB Copy Correctness

1. Run `npm run test:unit -- --test-name-pattern "worktree-db"`
2. Check "copyWorktreeDb" test group passes — verifies:
   - Copied DB file exists and is queryable
   - WAL and SHM files are NOT copied
   - Missing source DB returns false (non-fatal)
   - Nested destination directories are created
3. **Expected:** All copyWorktreeDb assertions pass

### 3. Reconciliation Merges Rows

1. Run `npm run test:unit -- --test-name-pattern "worktree-db"`
2. Check "reconcileWorktreeDb" test group passes — verifies:
   - New decisions from worktree appear in main after reconciliation
   - New requirements from worktree appear in main
   - New artifacts from worktree appear in main
   - Row counts in the return object are accurate
3. **Expected:** All merge assertions pass, stderr shows `"gsd-db: reconciled N decisions, N requirements, N artifacts (0 conflicts)"`

### 4. Conflict Detection

1. Run `npm run test:unit -- --test-name-pattern "worktree-db"`
2. Check the conflict detection test — verifies:
   - A decision modified in both main and worktree is flagged
   - Conflict count is 1 in the result
   - stderr shows `"  - decision D001: modified in both main and worktree"`
   - Worktree version wins (INSERT OR REPLACE)
3. **Expected:** Conflict detected, reported, worktree version persists

### 5. Reconciliation Wired into Deterministic Merge

1. `grep -n "reconcileWorktreeDb" src/resources/extensions/gsd/worktree-command.ts`
2. **Expected:** 4 matches — 2 dynamic imports and 2 call sites (one in deterministic path around line 681, one in LLM path around line 730)

### 6. Reconciliation Wired into LLM Fallback Merge

1. Check the LLM fallback path in `worktree-command.ts` near line 730
2. **Expected:** `reconcileWorktreeDb` is called before `pi.sendMessage()` dispatch, wrapped in try/catch with dynamic import

### 7. Graceful Degradation — No DB Available

1. Verify both call sites use `try { await import("./gsd-db.js") } catch` pattern
2. `grep -A3 'import.*gsd-db' src/resources/extensions/gsd/worktree-manager.ts`
3. `grep -A3 'import.*gsd-db' src/resources/extensions/gsd/worktree-command.ts`
4. **Expected:** All imports are inside try/catch blocks — if gsd-db.js is unavailable, worktree operations proceed normally

### 8. Async createWorktree Signature

1. `grep "async.*createWorktree\|createWorktree.*Promise" src/resources/extensions/gsd/worktree-manager.ts`
2. `grep "await.*createWorktree" src/resources/extensions/gsd/worktree-command.ts`
3. **Expected:** createWorktree is async, call site uses await

### 9. Full Test Suite — No Regressions

1. Run `npm run test:unit`
2. **Expected:** 288 passed, 0 failed — no existing worktree, integration, or other tests broken

## Edge Cases

### Missing Worktree DB on Reconciliation

1. In the worktree-db test suite, check the "missing worktree DB" test case
2. **Expected:** Returns 0 merged rows, no error thrown, no crash

### Paths with Spaces

1. In the worktree-db test suite, check the "paths with spaces" test case
2. **Expected:** Both copy and reconciliation work correctly with space-containing paths (no SQL injection via ATTACH)

### Identical DBs (No Changes)

1. In the worktree-db test suite, check the "identical DB" test case
2. **Expected:** Reconciliation returns counts but no conflicts, INSERT OR REPLACE is idempotent

### Post-Reconciliation DB Usability

1. In the worktree-db test suite, check that after reconciliation, DETACH has completed and the main DB is still queryable
2. **Expected:** Main DB returns all merged rows, no "database locked" or ATTACH state leakage

## Failure Signals

- `npm run test:unit -- --test-name-pattern "worktree-db"` has any failures
- `npx tsc --noEmit` reports errors in worktree-manager.ts or worktree-command.ts
- `grep "copyWorktreeDb" src/resources/extensions/gsd/worktree-manager.ts` returns 0 matches
- `grep "reconcileWorktreeDb" src/resources/extensions/gsd/worktree-command.ts` returns fewer than 4 matches
- Full test suite shows regressions in worktree-manager.test.ts or worktree-integration.test.ts (async signature change)

## Requirements Proved By This UAT

- R012 — Worktree DB isolation: DB copied on creation, copy skips WAL/SHM, copy failure non-fatal
- R013 — Worktree merge reconciliation: row-level merge via ATTACH, conflict detection, wired into both merge paths

## Not Proven By This UAT

- Live runtime worktree creation with actual `git worktree add` producing a real `.gsd/gsd.db` copy (covered by contract tests, not end-to-end)
- Merge reconciliation after a real git merge of a worktree branch (would require full project lifecycle test — deferred to S07)
- Performance under large DB sizes (hundreds of rows per table)

## Notes for Tester

- All verification is artifact-driven — run the grep commands and test commands listed above. No manual git worktree creation needed.
- The stderr output from the test run shows reconciliation reports (e.g., `"gsd-db: reconciled 2 decisions, 1 requirements, 1 artifacts (0 conflicts)"`) — this confirms the observability surfaces are working.
- D017 (createWorktree async change) was the only unplanned deviation. It's minimal impact — only 5 `await` additions in tests.
