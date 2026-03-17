---
id: T02
parent: S08
milestone: M003
provides:
  - Corrected test contract for /gsd visualize dispatch (view-navigate instead of surface)
  - Full green parity contract test suite (118/118 pass)
key_files:
  - src/tests/web-command-parity-contract.test.ts
key_decisions:
  - Test contract now models view-navigate as a first-class dispatch kind alongside surface/prompt/local
patterns_established:
  - When a subcommand dispatches as a full-view navigation rather than a command surface panel, use the view-navigate kind in both the dispatch implementation and test contract
observability_surfaces:
  - Test assertion: npx tsx --test src/tests/web-command-parity-contract.test.ts (118/118 pass confirms parity)
duration: 5m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T02: Fix /gsd visualize test assertions and verify full green suite

**Aligned test contract with D053: `/gsd visualize` dispatches as `view-navigate`, not `surface` — 118/118 tests pass, both builds green.**

## What Happened

Four pre-existing test failures existed because `EXPECTED_GSD_OUTCOMES` mapped `visualize → "surface"` while the actual dispatch (per D053) returns `kind: "view-navigate"`. The dispatch behavior is correct — the visualizer is a full app-shell view, not a command surface panel — so the tests needed to match reality.

Changes made to `web-command-parity-contract.test.ts`:
1. Added `"view-navigate"` to the `EXPECTED_GSD_OUTCOMES` Map type annotation
2. Changed `["visualize", "surface"]` to `["visualize", "view-navigate"]` and updated the surface count comment from 20 to 19
3. Updated the exhaustive iteration test to include a `view-navigate` case that asserts `outcome.view === subcommand`
4. Updated the surface count comment in the size-30 assertion from "20 surface" to "19 surface + 1 view-navigate"
5. Changed the end-to-end surface wiring test from expecting 20 to 19 surfaces
6. Added a dedicated test: `/gsd visualize dispatches as view-navigate to the visualizer view`

## Verification

- `npx tsx --test src/tests/web-command-parity-contract.test.ts` — **118/118 pass, 0 failures** (was 4 failures before)
- `npm run build` — **exit 0**
- `npm run build:web-host` — **exit 0**
- Slice-level checks:
  - `S08-PARITY-AUDIT.md` exists ✅
  - `rg "This surface will be implemented" web/components/gsd/command-surface.tsx` — 0 matches ✅

## Diagnostics

Run `npx tsx --test src/tests/web-command-parity-contract.test.ts` to verify the contract holds. Key assertions:
- `/gsd visualize -> view-navigate` in the exhaustive iteration test
- Dedicated view-navigate test verifies `kind: "view-navigate"` and `view: "visualize"`
- Surface count guard at 19 catches accidental reclassification
- Size-30 guard catches missing subcommands

## Deviations

Added `view-navigate` case handling in the exhaustive iteration test (not explicitly in the plan but necessary — the iteration asserts surface-specific properties for surface outcomes, so it needed a parallel assertion for view-navigate outcomes to verify `outcome.view`).

## Known Issues

None.

## Files Created/Modified

- `src/tests/web-command-parity-contract.test.ts` — Fixed visualize dispatch expectations, added view-navigate type and dedicated test
- `.gsd/milestones/M003/slices/S08/tasks/T02-PLAN.md` — Added Observability Impact section (pre-flight fix)
