---
estimated_steps: 4
estimated_files: 2
---

# T03: Add evidence block validator rule and integration tests

**Slice:** S02 — Structured Evidence Format
**Milestone:** M001

## Description

Close R004 by extending the observability validator to reject task summaries that lack a well-formed `## Verification Evidence` section. This makes evidence mandatory infrastructure — not just a prompt suggestion, but a validator-enforced contract.

The implementation follows the exact pattern of the existing `missing_diagnostics_section` / `diagnostics_placeholder_only` rules in `validateTaskSummaryContent()`. Add two rules: one for missing section, one for placeholder-only content. Severity is `"warning"` (matching all existing rules — these are warnings, not errors).

Also add integration-style tests that verify the full chain: VerificationResult → JSON write → validator acceptance/rejection.

## Steps

1. In `src/resources/extensions/gsd/observability-validator.ts`, in the `validateTaskSummaryContent()` function (after the existing diagnostics checks, before the `return issues`), add:
   ```typescript
   const evidence = getSection(content, "Verification Evidence", 2);
   if (!evidence) {
     issues.push({
       severity: "warning",
       scope: "task-summary",
       file,
       ruleId: "evidence_block_missing",
       message: "Task summary is missing `## Verification Evidence`.",
       suggestion: "Add a verification evidence table showing gate check results (command, exit code, verdict, duration).",
     });
   } else if (sectionLooksPlaceholderOnly(evidence)) {
     issues.push({
       severity: "warning",
       scope: "task-summary",
       file,
       ruleId: "evidence_block_placeholder",
       message: "Task summary verification evidence section still looks like placeholder text.",
       suggestion: "Replace placeholders with actual gate results or note that no verification commands were discovered.",
     });
   }
   ```

2. Add validator tests to the existing `src/resources/extensions/gsd/tests/verification-evidence.test.ts` file (append to the bottom). Import `validateTaskSummaryContent` from the validator. Tests:
   - Summary with `## Verification Evidence` section containing a real table → no `evidence_block_missing` or `evidence_block_placeholder` warning
   - Summary missing `## Verification Evidence` entirely → produces `evidence_block_missing` warning
   - Summary with `## Verification Evidence` but only placeholder text (e.g. `{{row}}`) → produces `evidence_block_placeholder` warning
   - Summary with `## Verification Evidence` containing "No verification checks discovered" → no warning (this is valid content, not placeholder)

3. Add an integration-style test that exercises the full chain:
   - Create a `VerificationResult` with 2 checks (1 pass, 1 fail)
   - Call `writeVerificationJSON()` to write to a temp dir
   - Read back the JSON and verify it has the correct shape
   - Call `formatEvidenceTable()` and embed the result in a mock summary
   - Call `validateTaskSummaryContent()` on that summary and verify no evidence warnings

4. Run full verification:
   - `npm run test:unit -- --test-name-pattern "verification-evidence"` — all tests pass
   - `npm run test:unit -- --test-name-pattern "verification-gate"` — 28 S01 tests still pass
   - `npm run test:unit` — no new failures

## Must-Haves

- [ ] `evidence_block_missing` rule fires when `## Verification Evidence` is absent
- [ ] `evidence_block_placeholder` rule fires when section has only placeholder text
- [ ] Neither rule fires when section has real evidence content
- [ ] Integration test proves full chain: VerificationResult → JSON → table → validator accepts
- [ ] All existing tests pass (no regressions)

## Verification

- `npm run test:unit -- --test-name-pattern "verification-evidence"` — all tests pass (T01 + T03 tests combined)
- `npm run test:unit -- --test-name-pattern "verification-gate"` — 28 S01 tests still pass
- `npm run test:unit` — no new failures beyond pre-existing ones

## Inputs

- `src/resources/extensions/gsd/observability-validator.ts` — `validateTaskSummaryContent()` at line ~267, existing `getSection()` and `sectionLooksPlaceholderOnly()` helpers
- `src/resources/extensions/gsd/tests/verification-evidence.test.ts` — T01's test file (append to it)
- `src/resources/extensions/gsd/verification-evidence.ts` — T01's `writeVerificationJSON` and `formatEvidenceTable` functions
- Pattern reference: lines 280–300 of observability-validator.ts show the `missing_diagnostics_section` / `diagnostics_placeholder_only` pattern to copy

## Observability Impact

- **New validator rules:** `evidence_block_missing` and `evidence_block_placeholder` warnings appear in gate stderr when a task summary lacks `## Verification Evidence` or has only placeholder content. Inspect with: `grep -E "evidence_block_(missing|placeholder)" <gate-output>`.
- **Regression safety:** Existing `missing_diagnostics_section` / `diagnostics_placeholder_only` rules unchanged — verified by running the full `verification-gate` test suite.
- **Failure visibility:** If the evidence section validator has a bug (e.g., false positive), the symptom is spurious warnings in gate output. The `ruleId` field in each warning uniquely identifies the source rule for debugging.

## Expected Output

- `src/resources/extensions/gsd/observability-validator.ts` — modified with 2 new validation rules (~15 lines added)
- `src/resources/extensions/gsd/tests/verification-evidence.test.ts` — extended with 5+ validator and integration tests
