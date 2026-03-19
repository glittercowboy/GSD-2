# S01: CSS token swap — backgrounds, accent, borders, scrollbars

**Goal:** Replace all warm amber design tokens with the Linear-inspired cool indigo palette so every Tailwind utility class and inline token reference renders the new colors.
**Demo:** Open the dashboard — backgrounds are blue-tinted dark, accent is indigo, scrollbars are cool slate. `grep` for any warm hex value returns zero hits across the three source files.

## Must-Haves

- All 12 `@theme {}` CSS variables in `index.css` updated to the target indigo palette values
- `::selection` and all scrollbar CSS replaced with cool-tone equivalents
- `tokens.ts` color object updated to match the CSS vars exactly
- Two hardcoded warm values in `App.tsx` (glow shadow, code block bg/text) replaced with cool equivalents
- Prose string in `App.tsx` updated from "warm amber" to "cool indigo"
- `tsc --noEmit` passes from `studio/`
- `grep` for all old warm hex values across the three files returns 0 lines

## Verification

```bash
# From the worktree root:

# 1. No warm values remain in any of the three source files
grep -c "d4a04e\|e0b366\|3a3125\|403223\|2d241a\|5b4731\|3c2f21\|f5deb3\|120f09\|0a0a0a\|rgba(212" \
  studio/src/renderer/src/styles/index.css \
  studio/src/renderer/src/lib/theme/tokens.ts \
  studio/src/renderer/src/App.tsx
# Expected: all lines show :0

# 2. New accent value is present
grep -c "5e6ad2" studio/src/renderer/src/styles/index.css studio/src/renderer/src/lib/theme/tokens.ts
# Expected: both files show :1 or more

# 3. Type check passes
cd studio && npx tsc --noEmit
# Expected: exit 0
```

## Observability / Diagnostics

- Runtime signals: none — pure static CSS/TS value changes with no runtime event emission
- Inspection surfaces: `grep` for warm hex values across the three source files; visual inspection of rendered dashboard
- Failure visibility: `tsc --noEmit` will surface type errors; stale token values will be visible as amber colors in the rendered UI
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: none (first slice)
- New wiring introduced in this slice: none — only values change, not structure
- What remains before the milestone is truly usable end-to-end: S02 must audit hardcoded Tailwind `amber-*` classes in any component files beyond `App.tsx` (none exist in this worktree, but the grep audit in S02 confirms it)

## Tasks

- [x] **T01: Replace all warm amber tokens with cool indigo palette across index.css, tokens.ts, and App.tsx** `est:20m`
  - Why: This is the entire slice — swap every warm color value in the three source files using the exact mapping from the reference palette. All 12 CSS vars, scrollbar CSS, `::selection`, the TS mirror object, and the two hardcoded warm values in App.tsx.
  - Files: `studio/src/renderer/src/styles/index.css`, `studio/src/renderer/src/lib/theme/tokens.ts`, `studio/src/renderer/src/App.tsx`
  - Do: Apply the token mapping table from the task plan. Update `@theme {}` block (12 vars), `::selection` background, all 6 scrollbar hex values, `tokens.ts` color object (12 properties), and App.tsx hardcoded values (glow rgba, `bg-[#120f09]` → `bg-[#0d0e14]`, `text-[#f5deb3]` → `text-text-primary`, prose "warm amber" → "cool indigo"). No structural changes — only values.
  - Verify: `grep` for all old warm hex values returns 0 hits; `grep` for `5e6ad2` confirms new accent present; `cd studio && npx tsc --noEmit` exits 0
  - Done when: Zero warm hex values in the three files, new indigo values present in both CSS and TS, type check passes

## Files Likely Touched

- `studio/src/renderer/src/styles/index.css`
- `studio/src/renderer/src/lib/theme/tokens.ts`
- `studio/src/renderer/src/App.tsx`
