---
estimated_steps: 5
estimated_files: 5
---

# T01: Run full PR quality audit and document results

**Slice:** S01 — PR Quality Audit
**Milestone:** M003

## Description

Execute all 6 requirement checks mechanically: grep-based pattern searches for R001–R004, full test suite run for R005, and import convention spot-check for R006. Document each result with pass/fail evidence. Fix any defects found inline.

## Steps

1. R001 — Verify `findMilestoneIds` is defined exactly once: `rg 'function findMilestoneIds' src/resources/extensions/gsd/ --type ts`. Then verify all 3 callers (`state.ts`, `files.ts`, `workspace-index.ts`) import it from `guided-flow`.
2. R002 — Verify `suffix` not `prefix`: `rg '\.prefix' src/resources/extensions/gsd/ --type ts` must return 0 matches. Confirm `parseMilestoneId` return type uses `suffix`.
3. R003 — Verify shared test helpers: `rg 'function assert(Eq|True|Match)' src/resources/extensions/gsd/tests/ --type ts` must show matches only in `test-helpers.ts`. Domain-specific helpers like `assertClose` in `metrics.test.ts` are acceptable.
4. R004 — Verify typo fix: `rg -i 'valueable' .` must return 0 matches.
5. R005+R006 — Run `npm test` and verify all tests pass. Spot-check a sample of changed files for import convention consistency (mixed `.js`/`.ts` extensions are pre-existing per research).

## Must-Haves

- [ ] R001: `findMilestoneIds` defined exactly once, imported by all callers
- [ ] R002: Zero `.prefix` references, `suffix` field confirmed
- [ ] R003: No inline assertion helpers outside `test-helpers.ts`
- [ ] R004: Zero "valueable" matches
- [ ] R005: `npm test` exits 0
- [ ] R006: Import conventions consistent with pre-existing patterns

## Verification

- Each `rg` command returns the expected result count
- `npm test` exits 0 with all tests passing
- S01-SUMMARY.md written with evidence for all 6 requirements

## Observability Impact

- **Signals:** No runtime signals changed — this is a read-only audit task
- **Inspection:** S01-SUMMARY.md is the primary artifact; each requirement has raw command output as evidence
- **Failure state:** If a check fails and is fixed inline, the summary documents both the failure evidence and the fix applied

## Inputs

- S01-RESEARCH.md findings (all checks expected to pass based on static analysis)
- `src/resources/extensions/gsd/` directory (audit target)

## Expected Output

- `.gsd/milestones/M003/slices/S01/S01-SUMMARY.md` — verification report with pass/fail evidence per requirement
