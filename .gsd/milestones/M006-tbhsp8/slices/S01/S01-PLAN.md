# S01: Fact-Check Control Contract

**Goal:** Define the machine-readable fact-check contract — per-claim annotation schema, aggregate `FACTCHECK-STATUS.json` artifact, impact enum, cycle key, and routing rules — so that runtime, coordinator, and planner code in later slices can consume them without interpretation.
**Demo:** TypeScript types compile, parser/formatter functions round-trip annotation and status artifacts, file-path resolution produces the correct layout, and a test suite proves the contract is stable and machine-checkable.

## Must-Haves

- Per-claim annotation JSON schema: claim ID, verdict (`confirmed` | `refuted` | `inconclusive` | `unverified`), citations array, corrected value (nullable), impact classification (`none` | `task` | `slice` | `milestone`), checked-by field, and timestamp.
- Aggregate `FACTCHECK-STATUS.json` schema: schema version, cycle key (milestone+slice+cycle-number), overall status (`clean` | `has-refutations` | `pending` | `exhausted`), plan-impacting flag (boolean), total/confirmed/refuted/inconclusive/unverified counts, max cycles, current cycle, and claim ID references.
- Deterministic impact enum and routing rules: `none` → no action, `task` → flag for executor, `slice` → reroute to `plan-slice`, `milestone` → reroute to `plan-milestone`.
- File-path conventions: `factcheck/` directory under the slice path, `factcheck/claims/<claim-id>.json` for annotations, `factcheck/FACTCHECK-STATUS.json` for aggregate.
- TypeScript types exported from `types.ts`, parser/formatter functions in a new `factcheck.ts` module, unit tests in `tests/factcheck.test.ts`.

## Proof Level

- This slice proves: contract
- Real runtime required: no
- Human/UAT required: no

## Verification

- `npx vitest run src/resources/extensions/gsd/tests/factcheck.test.ts`
- Tests must cover:
  - Annotation schema: create → serialize → parse round-trip with all verdict/impact combinations
  - Aggregate status: create → serialize → parse round-trip with plan-impacting flag derivation
  - File-path resolution: `resolveFactcheckDir`, `resolveClaimPath`, `resolveStatusPath` produce correct paths
  - Edge cases: empty claims list, max-cycle boundary, missing optional fields
- `npx tsc --noEmit` passes with the new types

## Observability / Diagnostics

- **Runtime signals:** No runtime hooks in this slice — pure contract types and functions. Verification is compile-time (`tsc --noEmit`) and test-time (`vitest`).
- **Inspection surfaces:** Types exported from `types.ts` are visible to IDE/LSP hover. Path functions in `factcheck.ts` return strings directly — no logging, no side effects. Future slices will log when reading/writing these paths.
- **Failure visibility:** Compile errors surface immediately via `tsc`. Test failures show which verdict/impact combinations fail round-trip. Invalid routing rule lookups return `undefined` (no throw).
- **Redaction constraints:** Fact-check annotations may contain corrected values from user content — no secrets expected, but if citations include URLs, treat as potentially sensitive in logs.

## Integration Closure

- Upstream surfaces consumed: `types.ts` (existing type patterns), `files.ts` (existing path resolution patterns)
- New wiring introduced in this slice: none — pure contract definition, no runtime hookup
- What remains before the milestone is truly usable end-to-end: S02 (coordinator writes artifacts), S03 (planner reads them), S04 (runtime acts on routing rules)

## Tasks

- [x] **T01: Define fact-check types, impact enum, and file-layout conventions** `est:45m`
  - Why: Every downstream slice (S02–S05) imports these types. They must exist and compile before parsers or runtime code can be written. Covers R065 (annotation schema), R066 (aggregate status schema), R072 (deterministic routing rules for worker agents).
  - Files: `src/resources/extensions/gsd/types.ts`, `src/resources/extensions/gsd/factcheck.ts`
  - Do: Add `FactCheckVerdict`, `FactCheckImpact`, `FactCheckAnnotation`, `FactCheckAggregateStatus`, and `FactCheckOverallStatus` types to `types.ts`. Create `factcheck.ts` with file-path resolution functions (`resolveFactcheckDir`, `resolveClaimPath`, `resolveStatusPath`) following the existing `resolveMilestoneFile` pattern in `files.ts`. Add a `FACTCHECK_ROUTING_RULES` constant documenting the impact→action mapping as a deterministic lookup table (not prose). Add `deriveOverallStatus` and `derivePlanImpacting` pure functions that compute aggregate fields from a list of annotations.
  - Verify: `npx tsc --noEmit` passes with zero errors
  - Done when: All five type definitions export from `types.ts`, `factcheck.ts` exports path-resolution and derivation functions, and the module compiles cleanly.

- [ ] **T02: Implement annotation/status parsers and contract verification tests** `est:1h`
  - Why: The contract is only real if it round-trips through serialization. Tests prove the schema is stable and machine-checkable, retiring the "artifact contract ambiguity" risk from the roadmap. Covers R065 (annotation durability), R066 (aggregate status machine-readability).
  - Files: `src/resources/extensions/gsd/factcheck.ts`, `src/resources/extensions/gsd/tests/factcheck.test.ts`
  - Do: In `factcheck.ts`, implement `formatAnnotation` / `parseAnnotation` (JSON serialize/deserialize with validation), `formatAggregateStatus` / `parseAggregateStatus` (JSON serialize/deserialize, auto-derives `overallStatus` and `planImpacting` from claim list), and `buildAggregateStatus` (takes annotation array + cycle info, produces complete status object). In `tests/factcheck.test.ts`, write vitest tests: (1) annotation round-trip for each verdict×impact combination, (2) aggregate status round-trip with plan-impacting derivation, (3) `buildAggregateStatus` correctly counts verdicts and sets flags, (4) path-resolution functions produce `<slicePath>/factcheck/claims/<id>.json` and `<slicePath>/factcheck/FACTCHECK-STATUS.json`, (5) edge cases: empty annotation list → `clean` status, cycle at max → `exhausted` status, missing optional `correctedValue` field.
  - Verify: `npx vitest run src/resources/extensions/gsd/tests/factcheck.test.ts` — all tests pass
  - Done when: Tests pass, `parseAnnotation(formatAnnotation(x))` is identity for all valid inputs, `buildAggregateStatus` correctly derives counts/flags/status from annotation arrays.

## Files Likely Touched

- `src/resources/extensions/gsd/types.ts`
- `src/resources/extensions/gsd/factcheck.ts`
- `src/resources/extensions/gsd/tests/factcheck.test.ts`
