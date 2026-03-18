---
estimated_steps: 5
estimated_files: 2
---

# T01: Create final audit test that writes durable validation report

**Slice:** S03 — Durable Validation and Closeout
**Milestone:** M007-aos64t

## Description

Create `factcheck-final-audit.test.ts` that exercises the same dispatch + prompt assembly proof path as S02's live test, but persists a structured `M007-VALIDATION-REPORT.json` to the milestone directory. This report is the durable evidence artifact that satisfies the milestone's "repeatable diagnostics" success criterion. The test both proves the runtime path and writes the machine-readable closeout artifact.

Relevant installed skills: `validation-protocol` (for verification discipline).

## Steps

1. Create `src/resources/extensions/gsd/tests/factcheck-final-audit.test.ts`. Use the same imports and setup pattern as `factcheck-runtime-live.test.ts` — copy S01 fixtures to a temp dir, use `dist-redirect.mjs` for module resolution, use `--experimental-strip-types`.
2. In the test, run the dispatch rule against the fixture data with `planImpacting: true` and assert the reroute action is returned. Capture the dispatch result.
3. Run prompt assembly (`buildPlanSlicePrompt` or equivalent) against the fixture data and assert the prompt contains the corrected value "5.2.0". Capture a prompt excerpt.
4. Construct the validation report object with schema: `{ schemaVersion: 1, milestone: "M007-aos64t", generatedAt: new Date().toISOString(), evidence: { refutedCount: <from fixture>, rerouteTarget: <from dispatch>, correctedValuePresent: true, promptExcerptContains: "5.2.0", dispatchAction: <captured> }, result: "PASS", proofArtifacts: ["FACTCHECK-STATUS.json", "C001.json", "reroute-action.json"] }`.
5. Write the report to `.gsd/milestones/M007-aos64t/M007-VALIDATION-REPORT.json` (using the real worktree path, not the temp dir). Read it back and assert all required fields are present and `result === "PASS"`.

## Must-Haves

- [ ] Test exercises real dispatch rules and prompt builders (not mocks)
- [ ] Validation report written to `.gsd/milestones/M007-aos64t/M007-VALIDATION-REPORT.json`
- [ ] Report contains all required schema fields: schemaVersion, milestone, generatedAt, evidence (with refutedCount, rerouteTarget, correctedValuePresent, dispatchAction), result, proofArtifacts
- [ ] Report result is "PASS" when dispatch and prompt assertions succeed
- [ ] Test reads back the written report and asserts structural validity

## Verification

- `node --test src/resources/extensions/gsd/tests/factcheck-final-audit.test.ts` passes
- `.gsd/milestones/M007-aos64t/M007-VALIDATION-REPORT.json` exists and is valid JSON with `result: "PASS"`

## Inputs

- `src/resources/extensions/gsd/tests/factcheck-runtime-live.test.ts` — reference for setup pattern, imports, fixture copying, dist-redirect usage
- `src/resources/extensions/gsd/tests/fixtures/factcheck-runtime/` — S01 fixture data (FIXTURE-MANIFEST.json, FACTCHECK-STATUS.json, claim annotations)
- `src/resources/extensions/gsd/tests/dist-redirect.mjs` — module resolution for worktree test execution
- `src/resources/extensions/gsd/auto-dispatch.ts` — dispatch rules including factcheck-reroute
- `src/resources/extensions/gsd/auto-prompts.ts` — loadFactcheckEvidence and buildPlanSlicePrompt

## Expected Output

- `src/resources/extensions/gsd/tests/factcheck-final-audit.test.ts` — new test file exercising proof path and writing validation report
- `.gsd/milestones/M007-aos64t/M007-VALIDATION-REPORT.json` — durable validation artifact with structured evidence
