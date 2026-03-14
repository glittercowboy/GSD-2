# S01: PR Quality Audit

**Goal:** Verify all 4 PR feedback fixes are correctly implemented, no stale references remain, and the full test suite passes.
**Demo:** A verification report with pass/fail evidence for all 6 requirements, backed by grep output and test results.

## Must-Haves

- R001 verified: `findMilestoneIds` defined exactly once in `guided-flow.ts`, all 3 callers import it
- R002 verified: `parseMilestoneId` returns `suffix` field, zero `.prefix` references in GSD extension
- R003 verified: All test files use shared `createTestContext()`, no inline `assertEq`/`assertTrue`/`assertMatch` definitions outside `test-helpers.ts`
- R004 verified: Zero instances of "valueable" in the codebase
- R005 verified: Full test suite passes with zero failures
- R006 verified: Changed files follow codebase import/naming conventions (mixed `.js`/`.ts` extensions are pre-existing, not a PR regression)

## Verification

- `rg 'function findMilestoneIds' src/resources/extensions/gsd/ --type ts` returns exactly 1 match
- `rg '\.prefix' src/resources/extensions/gsd/ --type ts` returns 0 matches
- `rg 'function assert(Eq|True|Match)' src/resources/extensions/gsd/tests/ --type ts` returns matches only in `test-helpers.ts`
- `rg -i 'valueable' .` returns 0 matches
- `npm test` exits 0 with all tests passing

## Tasks

- [x] **T01: Run full PR quality audit and document results** `est:20m`
  - Why: Single task covers all 6 requirements — each is a grep or test command with binary pass/fail
  - Files: `src/resources/extensions/gsd/guided-flow.ts`, `src/resources/extensions/gsd/state.ts`, `src/resources/extensions/gsd/files.ts`, `src/resources/extensions/gsd/workspace-index.ts`, `src/resources/extensions/gsd/tests/test-helpers.ts`
  - Do: Run targeted `rg` searches for R001–R004, run `npm test` for R005, spot-check import conventions on changed files for R006. If any check fails, fix the defect inline before continuing.
  - Verify: All 6 requirement checks pass; `npm test` exits 0
  - Done when: S01-SUMMARY.md written with pass/fail evidence for each requirement, all 6 requirements pass

## Observability / Diagnostics

- **Inspection surface:** S01-SUMMARY.md serves as the durable audit report — each requirement has pass/fail status with raw grep/test output as evidence
- **Failure visibility:** Any failing requirement is documented with the exact command output showing the discrepancy, enabling immediate root-cause identification
- **Redaction:** No secrets or credentials involved in this audit slice

## Verification

(existing verification plus diagnostic check)

- If any R001–R004 grep check fails, the summary must include the unexpected output verbatim so the next agent can diagnose without re-running

## Files Likely Touched

- `src/resources/extensions/gsd/guided-flow.ts` (read-only audit)
- `src/resources/extensions/gsd/state.ts` (read-only audit)
- `src/resources/extensions/gsd/files.ts` (read-only audit)
- `src/resources/extensions/gsd/workspace-index.ts` (read-only audit)
- `src/resources/extensions/gsd/tests/test-helpers.ts` (read-only audit)
