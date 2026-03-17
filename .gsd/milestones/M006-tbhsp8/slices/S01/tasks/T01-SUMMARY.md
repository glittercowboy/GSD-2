---
id: T01
parent: S01
milestone: M006-tbhsp8
provides:
  - FactCheckVerdict, FactCheckImpact, FactCheckOverallStatus literal union types
  - FactCheckAnnotation interface for per-claim annotations
  - FactCheckAggregateStatus interface for aggregate cycle status
  - Path resolution functions for factcheck directory layout
  - FACTCHECK_ROUTING_RULES constant encoding D058 deterministic routing
  - deriveOverallStatus and derivePlanImpacting pure derivation functions
key_files:
  - src/resources/extensions/gsd/types.ts
  - src/resources/extensions/gsd/factcheck.ts
key_decisions:
  - D058 (routing rules) — impact → action mapping encoded as constant lookup table
patterns_established:
  - Literal union types for finite enums (FactCheckVerdict, FactCheckImpact, FactCheckOverallStatus)
  - Pure path-resolution functions using node:path.join following existing files.ts pattern
  - Derivation functions that compute aggregate state from annotation arrays
observability_surfaces:
  - LSP hover on exported types shows schema structure
  - No runtime signals — all functions are pure, no I/O
duration: 15m
verification_result: passed
completed_at: 2026-03-17T17:45:00Z
blocker_discovered: false
---

# T01: Define fact-check types, impact enum, and file-layout conventions

**Added five TypeScript types, three path-resolution functions, routing rules constant, and two derivation functions for the fact-check control contract.**

## What Happened

Fixed observability gaps in S01-PLAN.md and T01-PLAN.md by adding the required sections. Then implemented the fact-check contract foundation:

1. **types.ts** — Appended five new type exports following existing literal union and interface patterns:
   - `FactCheckVerdict` — four-state verdict enum (confirmed/refuted/inconclusive/unverified)
   - `FactCheckImpact` — impact severity enum (none/task/slice/milestone)
   - `FactCheckOverallStatus` — aggregate status enum (clean/has-refutations/pending/exhausted)
   - `FactCheckAnnotation` — per-claim annotation interface with claimId, verdict, citations, correctedValue, impact, checkedBy, timestamp
   - `FactCheckAggregateStatus` — aggregate status interface with schemaVersion, cycleKey, overallStatus, planImpacting, counts, maxCycles, currentCycle, claimIds

2. **factcheck.ts** — Created new module with:
   - Three path-resolution functions using `path.join` from node:path
   - `FACTCHECK_ROUTING_RULES` constant mapping impact → action/target (encodes D058)
   - `deriveOverallStatus` — priority-ordered status derivation (exhausted → has-refutations → pending → clean)
   - `derivePlanImpacting` — boolean check for slice/milestone-impacting refutations

All functions are pure with no I/O or side effects.

## Verification

Ran `npx tsc --noEmit` — passed with zero errors. Verified all exports via grep. Types match schemas described in S01-RESEARCH.md.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | npx tsc --noEmit | 0 | ✅ pass | ~5s |

## Diagnostics

- LSP hover on any exported type shows the full schema
- `grep -E "^export (type|interface)" src/resources/extensions/gsd/types.ts` lists all type exports
- `grep -E "^export (function|const)" src/resources/extensions/gsd/factcheck.ts` lists all function/constant exports

## Deviations

None — implementation followed task plan exactly.

## Known Issues

- **Pre-existing build error** in `packages/pi-coding-agent/src/modes/interactive/components/extension-input.ts:65` — `Input.placeholder` property doesn't exist on the `Input` type from `@gsd/pi-tui`. This blocks `npm run build` in the worktree and causes `npm run test` to fail on `pack-install.test.ts` (which requires `dist/`). Not introduced by T01 — exists in main repo but main repo has cached `dist/`.

## Files Created/Modified

- `src/resources/extensions/gsd/types.ts` — Added five fact-check type exports (FactCheckVerdict, FactCheckImpact, FactCheckOverallStatus, FactCheckAnnotation, FactCheckAggregateStatus)
- `src/resources/extensions/gsd/factcheck.ts` — Created new module with path resolution, routing rules constant, and derivation functions
- `.gsd/milestones/M006-tbhsp8/slices/S01/S01-PLAN.md` — Added Observability / Diagnostics section
- `.gsd/milestones/M006-tbhsp8/slices/S01/tasks/T01-PLAN.md` — Added Observability Impact section
