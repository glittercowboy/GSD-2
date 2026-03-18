---
estimated_steps: 3
estimated_files: 1
---

# T02: Add light-mode CSS variants for file viewer and markdown

**Slice:** S04 — Final Polish & Verification
**Milestone:** M009

## Description

`.file-viewer-code` and `.markdown-body` in `globals.css` use hardcoded dark oklch values that are unreadable in light mode. For example, `.markdown-body` text is `oklch(0.85 0 0)` (light gray — invisible on white), heading borders are `oklch(0.22 0 0)` (nearly black — too harsh), and `.line:hover` background is `oklch(0.15 0 0)` (dark — invisible on dark, jarring on light).

The fix: replace hardcoded oklch values with CSS custom properties from the existing `:root`/`.dark` design token system. The design system already defines `--foreground`, `--border`, `--muted`, `--muted-foreground` tokens that resolve to appropriate values in both light and dark modes. This avoids the need for separate `.dark` scoped overrides — the variables handle it automatically.

## Steps

1. In `web/app/globals.css`, update `.file-viewer-code` selectors:
   - `.file-viewer-code code .line:hover` — change `background: oklch(0.15 0 0)` to `background: var(--muted)`
   - `.file-viewer-code code .line::before` — change `color: oklch(0.35 0 0)` to `color: var(--muted-foreground)` (line numbers). Note: there's also a `--code-line-number` token defined in both `:root` and `.dark` — using `var(--code-line-number)` would be even more precise if present.

2. Update `.markdown-body` selectors:
   - `.markdown-body` — change `color: oklch(0.85 0 0)` to `color: var(--foreground)`
   - `.markdown-body h1` border-bottom — change `oklch(0.22 0 0)` to `var(--border)`
   - `.markdown-body h2` border-bottom — change `oklch(0.22 0 0)` to `var(--border)`
   - `.markdown-body hr` border-top — change `oklch(0.22 0 0)` to `var(--border)`
   - `.markdown-body blockquote` border-left — change `oklch(0.3 0 0)` to `var(--muted-foreground)`
   - `.markdown-body blockquote` color — change `oklch(0.6 0 0)` to `var(--muted-foreground)`
   - `.markdown-body strong` color — change `oklch(0.92 0 0)` to `var(--foreground)` (bold text should match normal text color in both themes)
   - `.markdown-body del` color — change `oklch(0.5 0 0)` to `var(--muted-foreground)`

3. Leave `.markdown-body input[type="checkbox"]` `accent-color: oklch(0.65 0.15 145)` as-is — it's a green accent that works in both themes.

## Must-Haves

- [ ] No hardcoded oklch values remain in `.file-viewer-code` selectors (line hover bg, line number color)
- [ ] No hardcoded oklch color values remain in `.markdown-body` selectors (except checkbox accent-color)
- [ ] All replacements use existing CSS custom properties from the `:root`/`.dark` token system
- [ ] `npm run build:web-host` exits 0

## Verification

- `npm run build:web-host` exits 0
- Count hardcoded oklch in file-viewer/markdown sections: only the checkbox accent-color should remain
  ```bash
  # Should show only the accent-color line
  awk '/\.file-viewer-code/,/^[^ .}]/' web/app/globals.css | grep -c "oklch"
  awk '/\.markdown-body/,/^[^ .}]/' web/app/globals.css | grep -c "oklch"
  ```
- Count CSS variable usage: `grep -c "var(--" web/app/globals.css` should increase by ~10

## Inputs

- `web/app/globals.css` — current state has 10 hardcoded oklch values across `.file-viewer-code` and `.markdown-body` selectors (lines 150-290)
- Design token reference: `:root` (light) defines `--foreground: oklch(0.15 0 0)`, `--border: oklch(0.85 0 0)`, `--muted: oklch(0.93 0 0)`, `--muted-foreground: oklch(0.45 0 0)`, `--code-line-number: oklch(0.55 0 0)`. `.dark` defines `--foreground: oklch(0.9 0 0)`, `--border: oklch(0.2 0 0)`, `--muted: oklch(0.15 0 0)`, `--muted-foreground: oklch(0.55 0 0)`, `--code-line-number: oklch(0.35 0 0)`.

## Expected Output

- `web/app/globals.css` — all `.file-viewer-code` and `.markdown-body` color/background/border values replaced with `var(--token)` references that resolve correctly in both light and dark themes
