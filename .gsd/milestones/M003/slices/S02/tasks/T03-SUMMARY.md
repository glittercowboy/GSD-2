---
id: T03
parent: S02
milestone: M003
provides:
  - Exhaustive GSD dispatch coverage in the parity contract test (30 subcommands × expected outcome)
  - Contract surface wiring end-to-end test proving dispatch→open-request→surface-state for all 20 GSD surfaces
  - Edge case coverage for bare /gsd, /gsd help, unknown subcommands, /export vs /gsd export disambiguation
  - /provider builtin added to EXPECTED_BUILTIN_OUTCOMES and DEFERRED_BROWSER_REJECTS
key_files:
  - src/tests/web-command-parity-contract.test.ts
key_decisions:
  - Hardcoded EXPECTED_GSD_OUTCOMES map (30 entries) instead of dynamically collecting subcommands from commands.ts — simpler, explicit, and self-documenting
  - Added /provider as a deferred browser reject to fix pre-existing parity drift (21 builtins vs 20 expected)
patterns_established:
  - GSD outcome map pattern: EXPECTED_GSD_OUTCOMES classifies each subcommand as surface/prompt/local, test iterates and asserts per-kind properties
  - Contract wiring test pattern: dispatch → surfaceOutcomeToOpenRequest → openCommandSurfaceState → assert open/section/target for every surface
observability_surfaces:
  - npx tsx --test src/tests/web-command-parity-contract.test.ts — all 118 tests pass; new GSD tests immediately surface silent-fallthrough regressions
  - EXPECTED_GSD_OUTCOMES map is the authoritative diagnostic listing of every GSD subcommand and its expected browser behavior
duration: ~12min
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T03: Update parity contract test with exhaustive GSD dispatch coverage

**Added 4 new test blocks (80+ subtests) covering every GSD subcommand dispatch outcome, edge cases, terminal notices, and contract surface wiring end-to-end.**

## What Happened

Updated `web-command-parity-contract.test.ts` to reflect the T01-T02 changes where `/gsd *` commands now dispatch to defined outcomes instead of falling through.

1. Fixed pre-existing parity drift: `/provider` was added upstream as builtin #21 but the test expected 20. Added to `EXPECTED_BUILTIN_OUTCOMES` (reject) and `DEFERRED_BROWSER_REJECTS`.

2. Updated "registered GSD command roots" test: bare `/gsd` still passes through; non-gsd roots (`exit`, `kill`, `worktree`, `wt`) still pass through. The `for (root)` loop now skips `"gsd"` and asserts it separately.

3. Replaced "current GSD command family samples" test with updated assertions: `/gsd status` → surface (not prompt), streaming state irrelevant for surface commands, other family samples unchanged.

4. Added `EXPECTED_GSD_OUTCOMES` map (30 entries: 20 surface, 9 passthrough, 1 local) and exhaustive subtest iterating every entry — asserts kind, surface name, preserved input text, or action as appropriate.

5. Added edge case test block: bare `/gsd`, `/gsd help`, `/gsd unknown-xyz`, `/export` vs `/gsd export` disambiguation, sub-arg preservation (`/gsd forensics detailed`), terminal notice presence/absence.

6. Added contract wiring test: for each of the 20 surface subcommands, dispatches → converts to open request → opens surface state → asserts `open`, `section`, and `selectedTarget` are correctly populated. This proves the T01→T02 pipeline is unbroken.

## Verification

- `npx tsx --test src/tests/web-command-parity-contract.test.ts` — **118 tests pass, 0 fail, 0 skipped**
- `npm run build` — TypeScript compilation succeeds
- `npm run build:web-host` — Next.js production build succeeds
- All slice-level verification checks pass (this is the final task in S02)

## Diagnostics

- Read `EXPECTED_GSD_OUTCOMES` in the test file to see the authoritative mapping of every subcommand → expected kind
- A silent-fallthrough regression triggers a named subtest failure identifying the exact subcommand
- The contract wiring subtest catches section/target routing regressions before they reach the UI

## Deviations

- Added `/provider` to builtin expectations — the upstream `slash-commands.ts` gained a 21st command since the test was last updated. This was a pre-existing drift, not a T03 plan deviation, but was required to make the builtin parity test pass.
- Test file grew to ~689 lines (plan estimated 500-550) due to the comprehensive contract wiring test block being more thorough than estimated.

## Known Issues

None.

## Files Created/Modified

- `src/tests/web-command-parity-contract.test.ts` — expanded from ~330 to ~689 lines with 4 new test blocks covering GSD dispatch exhaustiveness, edge cases, terminal notices, and contract surface wiring
- `.gsd/milestones/M003/slices/S02/tasks/T03-PLAN.md` — added Observability Impact section (pre-flight fix)
