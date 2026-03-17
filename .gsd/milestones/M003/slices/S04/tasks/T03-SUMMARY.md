---
id: T03
parent: S04
milestone: M003
provides:
  - contract test suite validating full S04 diagnostics pipeline (types, state, dispatch, sections, store)
key_files:
  - src/tests/web-diagnostics-contract.test.ts
key_decisions:
  - Block 5 uses compile-time type aliases instead of prototype checks because store methods are arrow-function class fields (instance properties)
patterns_established:
  - Type import via static `import type` + runtime import via dynamic `await import()` to satisfy esbuild strip-types constraint
observability_surfaces:
  - npx tsx --test src/tests/web-diagnostics-contract.test.ts — 28 tests across 5 describe blocks
duration: 8m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T03: Contract tests and build verification

**Created 28-test contract suite validating the full S04 diagnostics pipeline: type exports, contract state shape, dispatch routing, section mapping, and store method existence.**

## What Happened

Created `src/tests/web-diagnostics-contract.test.ts` with 5 test blocks:
1. **Type exports (12 tests)** — minimal valid fixtures for all 8 diagnostics interfaces (`ForensicReport`, `ForensicAnomaly`, `ForensicUnitTrace`, `ForensicCrashLock`, `ForensicMetricsSummary`, `ForensicRecentUnit`, `DoctorIssue`, `DoctorReport`, `DoctorFixResult`, `SkillHealthEntry`, `SkillHealSuggestion`, `SkillHealthReport`) with field-level assertions.
2. **Contract state (4 tests)** — `createInitialCommandSurfaceState()` produces `diagnostics.forensics/doctor/skillHealth` sub-states with idle defaults and doctor-specific fix fields.
3. **Dispatch→surface pipeline (4 tests)** — `/gsd forensics`, `/gsd doctor`, `/gsd skill-health`, `/gsd doctor fix` all dispatch to correct surfaces.
4. **Surface→section mapping (3 tests)** — `gsd-forensics/doctor/skill-health` surfaces map to matching sections.
5. **Store method existence (5 tests)** — compile-time type aliases verify `loadForensicsDiagnostics`, `loadDoctorDiagnostics`, `applyDoctorFixes`, `loadSkillHealthDiagnostics` on `GSDWorkspaceStore`; runtime check confirms constructable export.

Hit one issue: the plan specified `prototype` checks for store methods, but these are arrow-function class fields (instance properties, not prototype methods). Fixed by using compile-time `GSDWorkspaceStore["methodName"]` type aliases that fail at build time if the method is removed.

## Verification

- `npx tsx --test src/tests/web-diagnostics-contract.test.ts` — **28/28 pass**, exit 0
- `npx tsx --test src/tests/web-command-parity-contract.test.ts` — **114/118 pass** (4 pre-existing `/gsd visualize` failures unrelated to S04)
- `npm run build` — exit 0
- `npm run build:web-host` — exit 0

## Diagnostics

- Run `npx tsx --test src/tests/web-diagnostics-contract.test.ts` — structured output by describe block isolates which pipeline stage broke
- Each test block annotated with requirement references: R103 (forensics), R104 (doctor), R105 (skill-health)

## Deviations

- **Block 5 approach:** Plan specified `typeof GSDWorkspaceStore.prototype.method === "function"` checks. Arrow-function class fields don't exist on `prototype`, so used compile-time type aliases + `keyof Pick` runtime assertions instead. Same contract guarantee, different mechanism.
- **Parity test:** Plan expected 118/118 pass. Result is 114/118 — the 4 failures are pre-existing `/gsd visualize` dispatch changes (view-navigate vs surface) from a prior slice, not related to S04 diagnostics work.

## Known Issues

- Pre-existing: `/gsd visualize` dispatch returns `view-navigate` instead of `surface` in parity tests (4 failures) — tracked outside S04 scope.

## Files Created/Modified

- `src/tests/web-diagnostics-contract.test.ts` — new, 28 contract tests across 5 blocks
- `.gsd/milestones/M003/slices/S04/tasks/T03-PLAN.md` — added Observability Impact section
- `.gsd/milestones/M003/slices/S04/S04-PLAN.md` — marked T03 `[x]`
