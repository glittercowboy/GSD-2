---
estimated_steps: 4
estimated_files: 2
---

# T01: Retrieve web/ tree and apply indigo token swap to CSS and TS token files

**Slice:** S02 — Component audit — fix hardcoded warm color overrides
**Milestone:** M001-sa0s98

## Description

The `web/` directory doesn't exist in this worktree (`milestone/M001-sa0s98`). It lives on branch `milestone/M001-80jit8`. This task checks out the entire `web/` tree and then applies the same indigo palette token swap that S01 already applied to `studio/`. Two files need updating: `web/src/styles/index.css` (CSS vars + scrollbar + selection) and `web/src/lib/theme/tokens.ts` (TS mirror).

**Relevant skills:** none needed — this is mechanical text substitution.

## Steps

1. **Retrieve web/ from the other branch.** Run `git checkout milestone/M001-80jit8 -- web/` from the worktree root. This stages the full `web/` directory without switching branches.

2. **Update `web/src/styles/index.css` `@theme {}` block.** Replace all 12 CSS custom properties with the S01 indigo values:
   - `--color-bg-primary: #0a0a0a` → `#0f1115`
   - `--color-bg-secondary: #111111` → `#16181d`
   - `--color-bg-tertiary: #1a1a1a` → `#1e2028`
   - `--color-bg-hover: #222222` → `#272a33`
   - `--color-border: #262626` → `#2b2e38`
   - `--color-border-active: #333333` → `#3b3f4c`
   - `--color-text-primary: #e5e5e5` → `#ededef`
   - `--color-text-secondary: #a3a3a3` → `#a1a1aa`
   - `--color-text-tertiary: #737373` → `#71717a`
   - `--color-accent: #d4a04e` → `#5e6ad2`
   - `--color-accent-hover: #e0b366` → `#7c85db`
   - `--color-accent-muted: rgba(212, 160, 78, 0.15)` → `rgba(94, 106, 210, 0.12)`

3. **Update `web/src/styles/index.css` selection + scrollbar CSS.** Replace:
   - `::selection` background: `rgba(212, 160, 78, 0.28)` → `rgba(94, 106, 210, 0.20)`
   - `scrollbar-color`: `#3a3125 #111111` → `#2b2e38 #16181d`
   - `scrollbar-track` background: `#111111` → `#16181d`
   - `scrollbar-thumb` gradient: `linear-gradient(180deg, #403223 0%, #2d241a 100%)` → `linear-gradient(180deg, #2b2e38 0%, #1e2028 100%)`
   - `scrollbar-thumb` border: `2px solid #111111` → `2px solid #16181d`
   - `scrollbar-thumb:hover` gradient: `linear-gradient(180deg, #5b4731 0%, #3c2f21 100%)` → `linear-gradient(180deg, #3b3f4c 0%, #2b2e38 100%)`

4. **Update `web/src/lib/theme/tokens.ts`** — replace all 12 color properties:
   - `bgPrimary: '#0a0a0a'` → `'#0f1115'`
   - `bgSecondary: '#111111'` → `'#16181d'`
   - `bgTertiary: '#1a1a1a'` → `'#1e2028'`
   - `bgHover: '#222222'` → `'#272a33'`
   - `border: '#262626'` → `'#2b2e38'`
   - `borderActive: '#333333'` → `'#3b3f4c'`
   - `textPrimary: '#e5e5e5'` → `'#ededef'`
   - `textSecondary: '#a3a3a3'` → `'#a1a1aa'`
   - `textTertiary: '#737373'` → `'#71717a'`
   - `accent: '#d4a04e'` → `'#5e6ad2'`
   - `accentHover: '#e0b366'` → `'#7c85db'`
   - `accentMuted: 'rgba(212, 160, 78, 0.15)'` → `'rgba(94, 106, 210, 0.12)'`

## Must-Haves

- [ ] `web/` directory exists in the worktree after git checkout
- [ ] All 12 `@theme {}` CSS vars have the indigo values
- [ ] `::selection` rgba uses `rgba(94, 106, 210, 0.20)`
- [ ] All 7 scrollbar hex/gradient values use cool tones (no `#3a3125`, `#403223`, `#2d241a`, `#5b4731`, `#3c2f21`)
- [ ] All 12 `tokens.ts` color properties have indigo values
- [ ] Zero warm hex values remain in either file

## Verification

```bash
# Zero warm hex/rgba in index.css
grep -n "d4a04e\|e0b366\|3a3125\|403223\|2d241a\|5b4731\|3c2f21\|f5deb3\|0a0a0a\|rgba(212, 160" web/src/styles/index.css
# Expected: no output, exit 1 = PASS

# Zero warm hex in tokens.ts
grep -n "0a0a0a\|111111\|1a1a1a\|222222\|262626\|333333\|e5e5e5\|a3a3a3\|737373\|d4a04e\|e0b366\|rgba(212" web/src/lib/theme/tokens.ts
# Expected: no output, exit 1 = PASS

# Indigo accent present in both files
grep -c "5e6ad2" web/src/styles/index.css web/src/lib/theme/tokens.ts
# Expected: index.css:1, tokens.ts:1 = PASS
```

## Inputs

- `studio/src/renderer/src/styles/index.css` — authoritative reference for all indigo palette values (S01 output)
- `studio/src/renderer/src/lib/theme/tokens.ts` — authoritative reference for TS token values (S01 output)
- Branch `milestone/M001-80jit8` — source of the `web/` directory tree

## Expected Output

- `web/` directory tree present in worktree (checked out from other branch)
- `web/src/styles/index.css` — `@theme {}` block, `::selection`, and scrollbar CSS all updated to cool indigo palette
- `web/src/lib/theme/tokens.ts` — all 12 color properties updated to match new CSS vars
