---
estimated_steps: 5
estimated_files: 2
---

# T02: Implement annotation/status parsers and contract verification tests

**Slice:** S01 — Fact-Check Control Contract
**Milestone:** M006-tbhsp8

## Description

Add serialization functions and a comprehensive test suite that proves the fact-check contract round-trips correctly. The parsers validate shape on read (reject malformed JSON), the formatters produce canonical JSON, and `buildAggregateStatus` computes the aggregate from a list of annotations. Tests cover all verdict×impact combinations, edge cases, and path resolution. This retires the "artifact contract ambiguity" risk from the roadmap.

## Steps

1. In `src/resources/extensions/gsd/factcheck.ts`, add serialization functions:
   - `formatAnnotation(a: FactCheckAnnotation): string` — `JSON.stringify(a, null, 2)`
   - `parseAnnotation(json: string): FactCheckAnnotation` — `JSON.parse` + validate required fields exist and have correct types. Throw descriptive error on invalid input.
   - `formatAggregateStatus(s: FactCheckAggregateStatus): string` — `JSON.stringify(s, null, 2)`
   - `parseAggregateStatus(json: string): FactCheckAggregateStatus` — parse + validate `schemaVersion === 1`, required fields present.
2. Add `buildAggregateStatus(annotations: FactCheckAnnotation[], opts: { milestoneId: string; sliceId: string; currentCycle: number; maxCycles: number }): FactCheckAggregateStatus` — counts each verdict type, calls `deriveOverallStatus` and `derivePlanImpacting`, builds `cycleKey` as `${milestoneId}/${sliceId}/cycle-${currentCycle}`, collects `claimIds`.
3. Create `src/resources/extensions/gsd/tests/factcheck.test.ts` with vitest:
   - **Annotation round-trip group:** Test `parseAnnotation(formatAnnotation(x))` is identity for all 4 verdicts × 4 impacts (16 combos — can parameterize). Include case with `correctedValue: null` and with `correctedValue: "fixed value"`.
   - **Aggregate status round-trip group:** Build status from sample annotations, serialize, parse, compare.
   - **buildAggregateStatus group:** (a) empty list → `overallStatus: 'clean'`, `planImpacting: false`, all counts zero. (b) mixed annotations → correct counts, correct `has-refutations` status. (c) refuted+slice impact → `planImpacting: true`. (d) `currentCycle >= maxCycles` with unresolved → `exhausted`.
   - **Path resolution group:** `resolveFactcheckDir`, `resolveClaimPath`, `resolveStatusPath` produce expected path strings.
   - **Validation group:** `parseAnnotation` throws on missing `claimId`, `parseAggregateStatus` throws on wrong `schemaVersion`.
4. Run `npx vitest run src/resources/extensions/gsd/tests/factcheck.test.ts`.
5. Run `npx tsc --noEmit` to confirm no regressions.

## Must-Haves

- [ ] `formatAnnotation` / `parseAnnotation` round-trip correctly
- [ ] `formatAggregateStatus` / `parseAggregateStatus` round-trip correctly
- [ ] `buildAggregateStatus` derives counts, overall status, and plan-impacting flag from annotations
- [ ] All tests pass in `factcheck.test.ts`
- [ ] `parseAnnotation` rejects invalid input with descriptive error

## Verification

- `npx vitest run src/resources/extensions/gsd/tests/factcheck.test.ts` — all tests pass
- `npx tsc --noEmit` — zero errors

## Inputs

- `src/resources/extensions/gsd/types.ts` — T01 types
- `src/resources/extensions/gsd/factcheck.ts` — T01 path-resolution and derivation functions
- Existing test patterns in `src/resources/extensions/gsd/tests/` for vitest conventions

## Expected Output

- `src/resources/extensions/gsd/factcheck.ts` — extended with format/parse/build functions
- `src/resources/extensions/gsd/tests/factcheck.test.ts` — new test file, all tests green
