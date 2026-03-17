---
estimated_steps: 5
estimated_files: 2
---

# T01: Define fact-check types, impact enum, and file-layout conventions

**Slice:** S01 — Fact-Check Control Contract
**Milestone:** M006-tbhsp8

## Description

Define the TypeScript types and pure functions that form the fact-check contract. This is the foundation every downstream slice imports. The types cover per-claim annotations (R065), aggregate status (R066), and a deterministic routing-rules constant (R072/D058) that maps impact levels to planner actions without interpretation.

Follow the existing patterns in `types.ts` (literal union types, pure interfaces) and `files.ts` (path-resolution helpers). The new `factcheck.ts` module holds path resolution and pure derivation functions — no I/O, no side effects.

## Steps

1. In `src/resources/extensions/gsd/types.ts`, append these types at the end of the file (before any closing comments):
   - `FactCheckVerdict = 'confirmed' | 'refuted' | 'inconclusive' | 'unverified'`
   - `FactCheckImpact = 'none' | 'task' | 'slice' | 'milestone'`
   - `FactCheckOverallStatus = 'clean' | 'has-refutations' | 'pending' | 'exhausted'`
   - `FactCheckAnnotation` interface: `{ claimId: string; verdict: FactCheckVerdict; citations: string[]; correctedValue?: string | null; impact: FactCheckImpact; checkedBy: string; timestamp: string; }`
   - `FactCheckAggregateStatus` interface: `{ schemaVersion: 1; cycleKey: string; overallStatus: FactCheckOverallStatus; planImpacting: boolean; counts: { total: number; confirmed: number; refuted: number; inconclusive: number; unverified: number; }; maxCycles: number; currentCycle: number; claimIds: string[]; }`
2. Create `src/resources/extensions/gsd/factcheck.ts`. Add path-resolution functions:
   - `resolveFactcheckDir(slicePath: string): string` → `<slicePath>/factcheck`
   - `resolveClaimPath(slicePath: string, claimId: string): string` → `<slicePath>/factcheck/claims/<claimId>.json`
   - `resolveStatusPath(slicePath: string): string` → `<slicePath>/factcheck/FACTCHECK-STATUS.json`
   - Use `path.join` (import from `node:path`).
3. Add a `FACTCHECK_ROUTING_RULES` exported constant — a `Record<FactCheckImpact, { action: string; target: string }>` mapping:
   - `none` → `{ action: 'continue', target: 'none' }`
   - `task` → `{ action: 'flag-executor', target: 'task' }`
   - `slice` → `{ action: 'reroute', target: 'plan-slice' }`
   - `milestone` → `{ action: 'reroute', target: 'plan-milestone' }`
4. Add pure derivation functions:
   - `deriveOverallStatus(annotations: FactCheckAnnotation[], currentCycle: number, maxCycles: number): FactCheckOverallStatus` — returns `exhausted` if currentCycle >= maxCycles and any unresolved remain, `has-refutations` if any refuted, `pending` if any unverified/inconclusive, otherwise `clean`.
   - `derivePlanImpacting(annotations: FactCheckAnnotation[]): boolean` — true if any annotation has `verdict === 'refuted'` and `impact === 'slice' || impact === 'milestone'`.
5. Run `npx tsc --noEmit` to confirm compilation.

## Must-Haves

- [ ] All five types/interfaces exported from `types.ts`
- [ ] `factcheck.ts` exports 3 path-resolution functions, routing rules constant, and 2 derivation functions
- [ ] `FACTCHECK_ROUTING_RULES` encodes D058 routing (plan-slice/plan-milestone for pre-execution corrections)
- [ ] No runtime I/O — all functions are pure

## Verification

- `npx tsc --noEmit` passes with zero errors on the full project
- Manual review: types match the schemas described in S01-RESEARCH.md

## Inputs

- `src/resources/extensions/gsd/types.ts` — existing type patterns to follow
- `src/resources/extensions/gsd/files.ts` — existing path-resolution pattern (`resolveMilestoneFile`)
- S01-RESEARCH.md schema definitions
- D058 (routing rules), D060 (JSON source of truth), D061 (deterministic planner standard)

## Observability Impact

- **What signals change:** No runtime signals in this task — pure TypeScript definitions and functions. The `deriveOverallStatus` and `derivePlanImpacting` functions return values directly; callers (future slices) will log decisions.
- **How a future agent inspects:** LSP hover on `FactCheckAnnotation` or `FactCheckAggregateStatus` shows the schema. Path resolution functions are single-line and self-documenting.
- **Failure visibility:** If routing rules are misconfigured, `FACTCHECK_ROUTING_RULES[impact]` returns `undefined` rather than throwing — downstream code must handle missing keys. Type errors surface at compile time.

## Expected Output

- `src/resources/extensions/gsd/types.ts` — extended with 5 new type exports
- `src/resources/extensions/gsd/factcheck.ts` — new module with path resolution, routing rules, and derivation functions
