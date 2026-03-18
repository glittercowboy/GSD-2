---
estimated_steps: 4
estimated_files: 1
---

# T02: Validate report schema and run full proof suite

**Slice:** S03 — Durable Validation and Closeout
**Milestone:** M007-aos64t

## Description

Run all three factcheck test files (S01 fixture, S02 live, S03 audit) together to confirm no regressions and verify the generated validation report is structurally complete. This is the final verification gate — if this passes, the milestone's "durable diagnostics" criterion is met.

## Steps

1. Run all factcheck tests together: `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts src/resources/extensions/gsd/tests/factcheck-runtime-live.test.ts src/resources/extensions/gsd/tests/factcheck-final-audit.test.ts`
2. Read `.gsd/milestones/M007-aos64t/M007-VALIDATION-REPORT.json` and assert: (a) `schemaVersion === 1`, (b) `milestone === "M007-aos64t"`, (c) `result === "PASS"`, (d) `evidence.refutedCount >= 1`, (e) `evidence.rerouteTarget` is a non-empty string, (f) `evidence.correctedValuePresent === true`, (g) `generatedAt` is a valid ISO date.
3. If any test fails, diagnose and fix in T01's test file, then re-run.
4. Confirm the report file is committed as part of the slice deliverables.

## Must-Haves

- [ ] All three factcheck test files pass in a single run
- [ ] Validation report has all required fields with correct types
- [ ] No regressions in S01 or S02 tests

## Verification

- `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts src/resources/extensions/gsd/tests/factcheck-runtime-live.test.ts src/resources/extensions/gsd/tests/factcheck-final-audit.test.ts` — all pass
- `node -e "const r=JSON.parse(require('fs').readFileSync('.gsd/milestones/M007-aos64t/M007-VALIDATION-REPORT.json','utf8')); assert(r.schemaVersion===1); assert(r.result==='PASS'); console.log('OK')"` — passes

## Inputs

- `src/resources/extensions/gsd/tests/factcheck-final-audit.test.ts` — T01 output
- `.gsd/milestones/M007-aos64t/M007-VALIDATION-REPORT.json` — T01 output
- `src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts` — S01 test (must not regress)
- `src/resources/extensions/gsd/tests/factcheck-runtime-live.test.ts` — S02 test (must not regress)

## Expected Output

- All tests passing — milestone proof suite is green
- Validation report confirmed structurally valid — milestone closeout evidence is durable
