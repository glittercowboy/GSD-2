---
estimated_steps: 5
estimated_files: 3
---

# T01: Replace all warm amber tokens with cool indigo palette across index.css, tokens.ts, and App.tsx

**Slice:** S01 — CSS token swap — backgrounds, accent, borders, scrollbars
**Milestone:** M001-sa0s98

## Description

Mechanically replace every warm amber color value in the three source files with the corresponding cool indigo value from the reference palette. This covers the Tailwind v4 `@theme {}` CSS variables (12 tokens), the `::selection` background, all scrollbar CSS hex values, the TypeScript mirror object in `tokens.ts`, and the hardcoded warm values in `App.tsx`. No structural changes — only value swaps using the exact mapping below.

**Relevant skills:** none needed — this is a mechanical find-and-replace task.

## Steps

1. **Update `studio/src/renderer/src/styles/index.css`** — Replace all values in the `@theme {}` block, the `::selection` background, and all scrollbar CSS using these exact mappings:

   **`@theme {}` block:**
   | Token | Old | New |
   |-------|-----|-----|
   | `--color-bg-primary` | `#0a0a0a` | `#0f1115` |
   | `--color-bg-secondary` | `#111111` | `#16181d` |
   | `--color-bg-tertiary` | `#1a1a1a` | `#1e2028` |
   | `--color-bg-hover` | `#222222` | `#272a33` |
   | `--color-border` | `#262626` | `#2b2e38` |
   | `--color-border-active` | `#333333` | `#3b3f4c` |
   | `--color-text-primary` | `#e5e5e5` | `#ededef` |
   | `--color-text-secondary` | `#a3a3a3` | `#a1a1aa` |
   | `--color-text-tertiary` | `#737373` | `#71717a` |
   | `--color-accent` | `#d4a04e` | `#5e6ad2` |
   | `--color-accent-hover` | `#e0b366` | `#7c85db` |
   | `--color-accent-muted` | `rgba(212, 160, 78, 0.15)` | `rgba(94, 106, 210, 0.12)` |

   **`::selection`:**
   | Old | New |
   |-----|-----|
   | `rgba(212, 160, 78, 0.28)` | `rgba(94, 106, 210, 0.20)` |

   **Scrollbar CSS:**
   | Location | Old | New |
   |----------|-----|-----|
   | `scrollbar-color` | `#3a3125 #111111` | `#2b2e38 #16181d` |
   | scrollbar-track `background` | `#111111` | `#16181d` |
   | scrollbar-thumb gradient start | `#403223` | `#2b2e38` |
   | scrollbar-thumb gradient end | `#2d241a` | `#1e2028` |
   | scrollbar-thumb `border` | `#111111` | `#16181d` |
   | scrollbar-thumb:hover gradient start | `#5b4731` | `#3b3f4c` |
   | scrollbar-thumb:hover gradient end | `#3c2f21` | `#2b2e38` |

2. **Update `studio/src/renderer/src/lib/theme/tokens.ts`** — Replace the 12 color values in the `colors` object to match the CSS vars exactly:
   | Property | Old | New |
   |----------|-----|-----|
   | `bgPrimary` | `'#0a0a0a'` | `'#0f1115'` |
   | `bgSecondary` | `'#111111'` | `'#16181d'` |
   | `bgTertiary` | `'#1a1a1a'` | `'#1e2028'` |
   | `bgHover` | `'#222222'` | `'#272a33'` |
   | `border` | `'#262626'` | `'#2b2e38'` |
   | `borderActive` | `'#333333'` | `'#3b3f4c'` |
   | `textPrimary` | `'#e5e5e5'` | `'#ededef'` |
   | `textSecondary` | `'#a3a3a3'` | `'#a1a1aa'` |
   | `textTertiary` | `'#737373'` | `'#71717a'` |
   | `accent` | `'#d4a04e'` | `'#5e6ad2'` |
   | `accentHover` | `'#e0b366'` | `'#7c85db'` |
   | `accentMuted` | `'rgba(212, 160, 78, 0.15)'` | `'rgba(94, 106, 210, 0.12)'` |

3. **Update `studio/src/renderer/src/App.tsx`** — Fix the four hardcoded warm values:
   | Location | Old | New |
   |----------|-----|-----|
   | Status dot glow shadow (line ~17) | `rgba(212,160,78,0.7)` | `rgba(94,106,210,0.7)` |
   | Code block background (line ~51) | `bg-[#120f09]` | `bg-[#0d0e14]` |
   | Code text color (line ~53) | `text-[#f5deb3]` | `text-text-primary` |
   | Prose string (line ~26) | `warm amber system accent` | `cool indigo system accent` |

4. **Run grep audit** to confirm zero warm values remain:
   ```bash
   grep -n "d4a04e\|e0b366\|3a3125\|403223\|2d241a\|5b4731\|3c2f21\|f5deb3\|120f09\|0a0a0a\|rgba(212" \
     studio/src/renderer/src/styles/index.css \
     studio/src/renderer/src/lib/theme/tokens.ts \
     studio/src/renderer/src/App.tsx
   ```
   Expected: 0 lines of output.

5. **Run type check** from `studio/`:
   ```bash
   cd studio && npx tsc --noEmit
   ```
   Expected: exit code 0, no errors.

## Must-Haves

- [ ] All 12 `@theme {}` CSS variables updated to target values
- [ ] `::selection` background uses cool indigo rgba
- [ ] All 7 scrollbar hex values replaced with cool-tone equivalents
- [ ] `tokens.ts` color object has all 12 properties updated to match CSS
- [ ] App.tsx glow shadow, code block bg, code text color, and prose string all updated
- [ ] `grep` for old warm hex values returns 0 hits
- [ ] `tsc --noEmit` exits 0

## Verification

- `grep -c "d4a04e\|e0b366\|3a3125\|403223\|2d241a\|5b4731\|3c2f21\|f5deb3\|120f09\|0a0a0a" studio/src/renderer/src/styles/index.css studio/src/renderer/src/lib/theme/tokens.ts studio/src/renderer/src/App.tsx` — all lines show `:0`
- `grep -c "5e6ad2" studio/src/renderer/src/styles/index.css studio/src/renderer/src/lib/theme/tokens.ts` — both show `:1` or more
- `cd studio && npx tsc --noEmit` — exit code 0

## Inputs

- `studio/src/renderer/src/styles/index.css` — current file with warm amber `@theme {}` tokens and scrollbar CSS
- `studio/src/renderer/src/lib/theme/tokens.ts` — current file with warm amber color mirror object
- `studio/src/renderer/src/App.tsx` — current file with hardcoded warm values in glow shadow, code block, and prose

## Expected Output

- `studio/src/renderer/src/styles/index.css` — all CSS variables, `::selection`, and scrollbar CSS updated to cool indigo palette
- `studio/src/renderer/src/lib/theme/tokens.ts` — all 12 color properties updated to match new CSS vars
- `studio/src/renderer/src/App.tsx` — glow shadow, code block bg/text, and prose string updated; no warm hex values remain
