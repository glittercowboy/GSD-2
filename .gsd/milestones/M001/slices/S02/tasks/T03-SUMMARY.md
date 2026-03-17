---
id: T03
parent: S02
milestone: M001
provides:
  - evidence_block_missing validator rule fires when ## Verification Evidence is absent
  - evidence_block_placeholder validator rule fires when section has only placeholder content
  - integration test proving full chain VerificationResult → JSON → table → validator accepts
key_files:
  - src/resources/extensions/gsd/observability-validator.ts
  - src/resources/extensions/gsd/tests/verification-evidence.test.ts
key_decisions:
  - Placeholder test uses pure {{evidence_table}} line (not table-with-{{row}}) because normalizeMeaningfulLines strips bare mustache lines but not table header/separator rows
patterns_established:
  - Evidence validator rules follow same getSection + sectionLooksPlaceholderOnly pattern as diagnostics rules
observability_surfaces:
  - evidence_block_missing warning in gate stderr when ## Verification Evidence section is absent
  - evidence_block_placeholder warning in gate stderr when section has only placeholder content
  - ruleId field in each ValidationIssue uniquely identifies the source rule for debugging
duration: 8m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T03: Add evidence block validator rule and integration tests

**Added evidence_block_missing and evidence_block_placeholder validator rules to enforce ## Verification Evidence section in task summaries, with integration tests proving the full evidence chain.**

## What Happened

Extended `validateTaskSummaryContent()` in `observability-validator.ts` with two new rules following the exact pattern of the existing `missing_diagnostics_section` / `diagnostics_placeholder_only` rules. Both use severity `"warning"` to match existing conventions.

Added 5 new tests to the existing `verification-evidence.test.ts` file:
- 4 validator unit tests: real table accepted, missing section warned, placeholder warned, "no checks discovered" accepted
- 1 integration test: creates a VerificationResult → writes JSON to temp dir → reads back and validates shape → generates evidence table → embeds in mock summary → validates with `validateTaskSummaryContent()` and confirms no evidence warnings

## Verification

- `npm run test:unit -- --test-name-pattern "verification-evidence"` — 15 tests pass (10 T01 + 5 T03)
- `npm run test:unit -- --test-name-pattern "verification-gate"` — 28 S01 tests pass
- `npm run test:unit` — 8 pre-existing failures (chokidar/octokit missing packages), no new failures

### Slice-level verification (S02 final task):
- ✅ `npm run test:unit -- --test-name-pattern "verification-evidence"` — all 15 pass
- ✅ `npm run test:unit -- --test-name-pattern "verification-gate"` — all 28 pass
- ✅ `npm run test:unit` — no new failures
- ⏭ `npx --yes tsx src/resources/extensions/gsd/verification-evidence.ts` — not re-run (T01 verified compilation, no changes to that file in T03)

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | npm run test:unit -- --test-name-pattern "verification-evidence" | 0 | ✅ pass | 21.8s |
| 2 | npm run test:unit -- --test-name-pattern "verification-gate" | 0 | ✅ pass | 55.0s |
| 3 | npm run test:unit | 0 | ✅ pass | 43.5s |

## Diagnostics

- **Validator rule inspection:** `grep -n "evidence_block" src/resources/extensions/gsd/observability-validator.ts` shows both rule definitions
- **Test coverage:** `npm run test:unit -- --test-name-pattern "verification-evidence"` runs all 15 evidence tests (T01 writer + T03 validator)
- **False positive debugging:** If the validator produces unexpected warnings, check the `ruleId` field — `evidence_block_missing` means the section heading wasn't found, `evidence_block_placeholder` means `sectionLooksPlaceholderOnly()` returned true
- **normalizeMeaningfulLines gotcha:** This helper strips lines matching `^\{\{.+\}\}$` before placeholder detection — table structure rows (headers, separators) survive the filter and are treated as real content

## Deviations

- Placeholder test content changed from `| {{row}} |` (table with mustache row) to `{{evidence_table}}` (bare mustache line). The original test fixture didn't trigger `sectionLooksPlaceholderOnly` because `normalizeMeaningfulLines` strips bare mustache lines but preserves table header/separator rows, leaving non-placeholder content. The bare mustache form correctly tests the placeholder path.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/observability-validator.ts` — added `evidence_block_missing` and `evidence_block_placeholder` rules (~15 lines)
- `src/resources/extensions/gsd/tests/verification-evidence.test.ts` — added 5 validator/integration tests + test fixtures
- `.gsd/milestones/M001/slices/S02/tasks/T03-PLAN.md` — added Observability Impact section (pre-flight fix)
