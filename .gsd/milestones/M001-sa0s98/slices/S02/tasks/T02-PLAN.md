---
estimated_steps: 4
estimated_files: 9
---

# T02: Replace all hardcoded amber classes and warm rgba/hex values in 9 component files

**Slice:** S02 — Component audit — fix hardcoded warm color overrides
**Milestone:** M001-sa0s98

## Description

After T01 swapped the token files, 9 component files still contain hardcoded `amber-*` Tailwind classes or raw warm rgba/hex values. This task applies the substitution table to all 9 files, then runs the full verification suite to prove R002 (zero amber remaining) and R003 (build passes).

**Key semantic rule:** Warning indicators (`amber-*` → `yellow-*`) stay visually warm because they represent semantic warning states. Active/accent states (`amber-*` → `text-accent`/`bg-accent-muted`) become indigo because they represent the theme accent. The DAG parked state becomes dark neutral (inactive, not warning). The CostByPhase chart color becomes yellow-500 hex for chart-level distinctness.

**Relevant skills:** none needed — mechanical text substitution.

## Steps

1. **Apply substitutions to all 9 component files.** Use the exact replacements below. For each file, read it first, then apply the edit:

   **`web/src/components/connection/ConnectionBanner.tsx`**
   - Line 21: `bg-amber-900/50 border-b border-amber-700/40` → `bg-yellow-900/30 border-b border-yellow-700/30`
   - Line 22: `text-amber-200` → `text-yellow-200`
   - Line 26: `text-amber-400` → `text-yellow-400`

   **`web/src/components/layout/TopBar.tsx`**
   - Line 44: `bg-amber-400` → `bg-yellow-400`

   **`web/src/components/primitives/Badge.tsx`**
   - Line 16: `bg-amber-900/50 text-amber-300 ring-1 ring-amber-700/40` → `bg-yellow-900/50 text-yellow-300 ring-1 ring-yellow-700/40`

   **`web/src/components/primitives/ProgressBar.tsx`**
   - Line 19: `bg-amber-500` → `bg-yellow-500`

   **`web/src/views/logs/LogControls.tsx`**
   - Line 23: `text-amber-300 bg-amber-900/30 ring-1 ring-amber-700/30` → `text-yellow-300 bg-yellow-900/30 ring-1 ring-yellow-700/30`
   - Line 87: `text-amber-300 bg-amber-900/20 border-amber-700/30 hover:bg-amber-900/30` → `text-accent bg-accent-muted border-accent/30 hover:bg-accent/20` (this is the pause button active state — accent, not warning)

   **`web/src/views/health/BudgetPressure.tsx`**
   - Line 22: `bg-amber-500` → `bg-yellow-500`

   **`web/src/views/health/EnvironmentChecks.tsx`**
   - Line 40: `text-amber-400` → `text-yellow-400`

   **`web/src/views/metrics/CostByPhase.tsx`**
   - Line 28: `'#f59e0b'` → `'#eab308'` (and update the comment from `// amber-500` to `// yellow-500`)

   **`web/src/views/visualizer/DAGNode.tsx`**
   - Line 19: `'rgba(212, 160, 78, 0.2)'` → `'rgba(94, 106, 210, 0.2)'` (update comment to `// accent/20`)
   - Line 21: `'rgba(120, 53, 15, 0.45)'` → `'rgba(30, 32, 40, 0.8)'` (update comment to `// bg-tertiary/80`)
   - Line 29: `'rgba(245, 158, 11, 0.3)'` → `'rgba(63, 63, 70, 0.5)'` (cool zinc border)

2. **Run grep audit for zero amber-* classes:**
   ```bash
   grep -rn "amber-" web/src/
   # Must return exit code 1 (no matches)
   ```

3. **Run grep audit for zero warm rgba values:**
   ```bash
   grep -rn "rgba(212, 160, 78\|rgba(120, 53, 15\|rgba(245, 158, 11" web/src/
   # Must return exit code 1 (no matches)
   ```

4. **Run build verification:**
   ```bash
   # Install web deps if needed
   cd web && npm install && npm run build
   # Must exit 0

   # Studio tsc still passes
   cd studio && npx tsc --noEmit
   # Must exit 0
   ```

## Must-Haves

- [ ] All `amber-*` Tailwind classes replaced in all 9 files (warning → `yellow-*`, accent → `text-accent`/`bg-accent-muted`)
- [ ] DAGNode.tsx: all 3 warm rgba values replaced (active → indigo, parked fill → dark slate, parked stroke → zinc)
- [ ] CostByPhase.tsx: `#f59e0b` → `#eab308`
- [ ] `grep -rn "amber-" web/src/` returns zero results
- [ ] `grep -rn "rgba(212, 160, 78\|rgba(120, 53, 15\|rgba(245, 158, 11" web/src/` returns zero results
- [ ] `npm run build` from `web/` exits 0
- [ ] `npx tsc --noEmit` from `studio/` exits 0

## Verification

```bash
# 1. Zero amber-* Tailwind classes
grep -rn "amber-" web/src/
# Expected: exit 1 (no matches) = PASS

# 2. Zero warm rgba values
grep -rn "rgba(212, 160, 78\|rgba(120, 53, 15\|rgba(245, 158, 11" web/src/
# Expected: exit 1 (no matches) = PASS

# 3. Zero old warm hex in CSS (full audit)
grep -n "d4a04e\|e0b366\|3a3125\|403223\|2d241a\|5b4731\|3c2f21\|f5deb3\|0a0a0a" web/src/styles/index.css
# Expected: no output = PASS

# 4. Indigo accent present
grep -c "5e6ad2" web/src/styles/index.css web/src/lib/theme/tokens.ts
# Expected: both :1

# 5. Build
cd web && npm run build
# Expected: exit 0

# 6. Type check
cd studio && npx tsc --noEmit
# Expected: exit 0
```

## Inputs

- T01 output: `web/src/styles/index.css` and `web/src/lib/theme/tokens.ts` already updated with indigo palette
- All 9 component files present in `web/src/` (checked out in T01)

## Expected Output

- 9 component files updated with zero amber references
- `grep -rn "amber-" web/src/` returns zero results (R002 satisfied)
- `npm run build` exits 0 (R003 satisfied)
- `npx tsc --noEmit` exits 0
