# S02: Component audit — fix hardcoded warm color overrides

**Goal:** Zero amber/warm-toned color references remain anywhere in `web/src/` — all CSS tokens, TS tokens, Tailwind classes, and JS rgba/hex values use the Linear cool indigo palette (or semantic yellow for warning states).
**Demo:** `grep -rn "amber-" web/src/` returns zero results; `grep -rn "rgba(212\|rgba(120, 53\|rgba(245, 158" web/src/` returns zero results; `npm run build` from `web/` exits 0.

## Must-Haves

- `web/src/styles/index.css` `@theme {}` block uses identical indigo token values as `studio/` (S01 output)
- `web/src/lib/theme/tokens.ts` colors object matches the indigo palette
- `::selection` rgba and all scrollbar hex values in `index.css` use cool tones (no warm brown)
- All 9 component files have zero `amber-*` Tailwind classes — warning semantics use `yellow-*` family, active/accent states use `text-accent`/`bg-accent-muted`
- DAGNode.tsx raw rgba values replaced: active → indigo, parked → dark slate
- CostByPhase.tsx hex `#f59e0b` → `#eab308`
- `npm run build` exits 0 (R003)

## Proof Level

- This slice proves: integration (visual palette consistency across all component files + build contract)
- Real runtime required: no (grep audit + build is sufficient; browser verification is UAT at milestone close)
- Human/UAT required: yes — side-by-side visual check deferred to milestone close

## Verification

```bash
# 1. Zero amber-* Tailwind classes in web/src/
grep -rn "amber-" web/src/
# Expected: exit code 1 (no matches) = PASS

# 2. Zero old warm rgba values
grep -rn "rgba(212, 160, 78\|rgba(120, 53, 15\|rgba(245, 158, 11" web/src/
# Expected: exit code 1 (no matches) = PASS

# 3. Zero old warm hex values in CSS
grep -n "d4a04e\|e0b366\|3a3125\|403223\|2d241a\|5b4731\|3c2f21\|f5deb3\|0a0a0a" web/src/styles/index.css
# Expected: no output = PASS

# 4. Indigo accent present in both token sources
grep -c "5e6ad2" web/src/styles/index.css web/src/lib/theme/tokens.ts
# Expected: both show :1

# 5. Build passes (R003)
cd web && npm run build
# Expected: exit 0

# 6. Studio tsc still passes
cd studio && npx tsc --noEmit
# Expected: exit 0
```

## Observability / Diagnostics

- Runtime signals: none — this is a static asset change, no runtime instrumentation needed
- Inspection surfaces: `grep -rn "amber-" web/src/` is the definitive audit command; `grep -c "5e6ad2" web/src/styles/index.css web/src/lib/theme/tokens.ts` confirms the new palette is in place
- Failure visibility: any grep hit on `amber-` or old warm hex/rgba values in `web/src/` indicates a missed replacement — the file and line number from grep output pinpoints the exact location
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: S01's token values (from `studio/src/renderer/src/styles/index.css` and `studio/src/renderer/src/lib/theme/tokens.ts`) — these are the authoritative indigo palette values copied into `web/`
- New wiring introduced in this slice: none — only value replacements in existing files
- What remains before the milestone is truly usable end-to-end: browser visual verification across all routes (milestone-level UAT)

## Tasks

- [x] **T01: Retrieve web/ tree and apply indigo token swap to CSS and TS token files** `est:15m`
  - Why: `web/` doesn't exist in this worktree — must be checked out from `milestone/M001-80jit8`. The two token files (`index.css` `@theme {}` block + `tokens.ts`) still have the old amber palette and need the same swap S01 applied to `studio/`.
  - Files: `web/src/styles/index.css`, `web/src/lib/theme/tokens.ts`
  - Do: `git checkout milestone/M001-80jit8 -- web/` to land the full web tree, then update all 12 CSS vars in `@theme {}`, `::selection` rgba, 7 scrollbar hex values, and all 12 TS color properties to match the S01 indigo values exactly.
  - Verify: `grep -n "d4a04e\|e0b366\|3a3125\|403223\|2d241a\|5b4731\|3c2f21\|0a0a0a\|rgba(212, 160" web/src/styles/index.css` returns nothing; `grep -c "5e6ad2" web/src/styles/index.css web/src/lib/theme/tokens.ts` returns :1 for both
  - Done when: Both token files have the complete indigo palette, zero warm hex/rgba values remain in either file

- [x] **T02: Replace all hardcoded amber classes and warm rgba/hex values in 9 component files** `est:20m`
  - Why: 9 component files use hardcoded `amber-*` Tailwind classes or raw warm rgba/hex values that bypass CSS vars. These are the only remaining warm references after T01's token swap. Covers R002 (zero amber remaining) and R003 (build passes).
  - Files: `web/src/components/connection/ConnectionBanner.tsx`, `web/src/components/layout/TopBar.tsx`, `web/src/components/primitives/Badge.tsx`, `web/src/components/primitives/ProgressBar.tsx`, `web/src/views/logs/LogControls.tsx`, `web/src/views/health/BudgetPressure.tsx`, `web/src/views/health/EnvironmentChecks.tsx`, `web/src/views/metrics/CostByPhase.tsx`, `web/src/views/visualizer/DAGNode.tsx`
  - Do: Apply substitution table from research — warning-role `amber-*` → `yellow-*`, pause button active state → `text-accent bg-accent-muted`, DAGNode active → indigo rgba, DAGNode parked → dark slate rgba, CostByPhase hex → `#eab308`. Then run full verification: grep audits for zero amber/warm values, `npm run build` from web/, `npx tsc --noEmit` from studio/.
  - Verify: All 6 verification commands from the slice verification section pass
  - Done when: `grep -rn "amber-" web/src/` exits 1 (zero results), `npm run build` exits 0, `npx tsc --noEmit` exits 0

## Files Likely Touched

- `web/src/styles/index.css`
- `web/src/lib/theme/tokens.ts`
- `web/src/components/connection/ConnectionBanner.tsx`
- `web/src/components/layout/TopBar.tsx`
- `web/src/components/primitives/Badge.tsx`
- `web/src/components/primitives/ProgressBar.tsx`
- `web/src/views/logs/LogControls.tsx`
- `web/src/views/health/BudgetPressure.tsx`
- `web/src/views/health/EnvironmentChecks.tsx`
- `web/src/views/metrics/CostByPhase.tsx`
- `web/src/views/visualizer/DAGNode.tsx`
