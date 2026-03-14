---
estimated_steps: 5
estimated_files: 2
---

# T04: Run full test suite

**Slice:** S01 — Upstream Merge and Verification
**Milestone:** M003

## Description

Execute the complete test suite to verify M001/M002 behavior survived the merge. Fix any test failures introduced by the merge.

## Steps

1. Run `npm test -w @gsd/pi-ai` — should pass all 32 tests
2. Run `node --test packages/pi-coding-agent/dist/core/model-registry-scenario.test.js` — should pass all 9 scenario tests
3. If tests fail, examine failures:
   - Import errors (check .js specifier convention)
   - Missing exports (check index.ts)
   - Behavioral regressions (check conflict resolutions in T02)
4. Fix any issues and re-run tests
5. Continue until all 41 tests pass (32 + 9)

## Must-Haves

- [ ] All 32 pi-ai tests pass
- [ ] All 9 scenario tests pass
- [ ] No test pollution of ~/.gsd/agent/ (tmpdir isolation intact)

## Verification

- `npm test -w @gsd/pi-ai` — exits 0, shows "32 tests passed"
- `node --test packages/pi-coding-agent/dist/core/model-registry-scenario.test.js` — exits 0, shows 9 tests passed
- `ls ~/.gsd/agent/cache/` — no test artifacts (tmpdir isolation working)

## Inputs

- Compiled JavaScript from T03
- Test files from M001/M002

## Expected Output

- All tests pass with clean exit codes
- Verified M001/M002 behavior (cache, fallback, scenario coverage)

## Observability Impact

This task produces the following diagnostic signals for future agents:
- **Test output:** stdout/stderr from `npm test` and `node --test` showing pass/fail status, file paths, and line numbers for any failures
- **Exit codes:** Non-zero exit on test failure indicates regression introduced by merge
- **Failure patterns:**
  - Import errors → check `.js` extension convention (D017)
  - Missing exports → verify `index.ts` barrel exports
  - Behavioral regressions → trace to T02 conflict resolutions
- **Cache isolation:** `ls ~/.gsd/agent/cache/` post-test verifies tmpdir isolation (should be empty or unchanged)

Inspection commands for debugging:
- `npm test -w @gsd/pi-ai -- --reporter=spec` — detailed test output
- `node --test --test-reporter=spec packages/pi-coding-agent/dist/core/model-registry-scenario.test.js` — verbose scenario test output

No runtime state changes — this is a verification-only task.
