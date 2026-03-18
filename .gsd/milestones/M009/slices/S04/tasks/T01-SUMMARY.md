---
id: T01
parent: S04
milestone: M009
provides:
  - Dual shiki theme support (github-dark-default + github-light-default) driven by useTheme()
  - Font size from useEditorFontSize() applied to View tab containers
  - Reactive theme switching in MarkdownViewer and CodeViewer via useEffect dependency
key_files:
  - web/components/gsd/file-content-viewer.tsx
key_decisions:
  - Use resolvedTheme from next-themes to derive shiki theme name, defaulting to dark when undefined (SSR safety)
patterns_established:
  - Thread shikiTheme prop through ReadOnlyContent → CodeViewer/MarkdownViewer for theme-aware rendering
  - Apply fontSize via inline style on both the container div and the ReadOnlyContent wrapper for redundant coverage
observability_surfaces:
  - Shiki-generated pre elements include inline background-color style (#0d1117 dark, #fff light) — inspectable in DevTools
  - ReadOnlyContent container div has inline fontSize style — inspectable in DevTools Elements panel
  - Shiki singleton catch-and-reset pattern ensures highlighting failures are transient, not permanent
duration: 8m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T01: Apply font size to View tab and add dual shiki theme support

**Added dual shiki theme loading (dark + light) driven by useTheme(), applied useEditorFontSize() to View tab containers, and made MarkdownViewer/CodeViewer re-highlight reactively on theme change**

## What Happened

All seven steps from the task plan were applied to `file-content-viewer.tsx`:

1. Added `import { useTheme } from "next-themes"`.
2. Updated `getHighlighter()` singleton to load both `github-dark-default` and `github-light-default` themes.
3. `CodeViewer` now accepts a `shikiTheme` prop (default `"github-dark-default"`) and uses it in `codeToHtml()`. Added `shikiTheme` to the `useEffect` dependency array so code re-highlights on theme toggle.
4. `MarkdownViewer` now accepts a `shikiTheme` prop, uses it in `codeToHtml()` for fenced code blocks, and includes `shikiTheme` in its `useEffect` dependency array for reactive re-rendering.
5. `ReadOnlyContent` now accepts `fontSize` and `shikiTheme` props, wraps its output in a `<div style={{ fontSize }}>`, and passes `shikiTheme` through to child viewers.
6. `FileContentViewer` calls `useTheme()`, derives `shikiTheme` from `resolvedTheme`, and passes both `fontSize` and `shikiTheme` to all `ReadOnlyContent` render sites.
7. Both the read-only fallback path and the tabbed View `TabsContent` receive `fontSize` (as inline style) and `shikiTheme`.

## Verification

- `npm run build:web-host` exits 0 — build completes successfully with no new warnings.
- `grep -c "github-light-default"` returns 2 (getHighlighter themes array + theme derivation ternary).
- `grep -c "useTheme"` returns 2 (import + call).
- `grep -c "shikiTheme"` returns 12 (props, derivation, pass-through, usage in codeToHtml, dependency arrays).
- `grep -c "fontSize"` returns 8 (hook call, inline styles on containers, prop threading).

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm run build:web-host` | 0 | ✅ pass | 13.4s |
| 2 | `grep -c "github-light-default" web/components/gsd/file-content-viewer.tsx` (≥2) | 0 | ✅ pass (2) | <1s |
| 3 | `grep -c "useTheme" web/components/gsd/file-content-viewer.tsx` (≥1) | 0 | ✅ pass (2) | <1s |
| 4 | `grep -c "shikiTheme" web/components/gsd/file-content-viewer.tsx` (≥5) | 0 | ✅ pass (12) | <1s |

## Diagnostics

- **Shiki theme in use:** Inspect any `.file-viewer-code` container's `<pre>` element — `style="background-color:#0d1117"` = dark theme, `style="background-color:#fff"` = light theme.
- **Font size applied:** Inspect the View `TabsContent` or read-only wrapper div — `style` attribute should include `fontSize` matching the user's editor font size setting.
- **Theme reactivity:** Toggle dark/light mode — `MarkdownViewer` and `CodeViewer` re-render because `shikiTheme` is in their `useEffect` dependency arrays.
- **Failure mode:** If shiki fails to load, `highlighterPromise` resets to `null` and the next render retries. Persistent failure degrades to `PlainViewer` (plain text with line numbers).

## Deviations

None — all seven steps executed as planned.

## Known Issues

None.

## Files Created/Modified

- `web/components/gsd/file-content-viewer.tsx` — Added dual shiki theme loading, useTheme integration, shikiTheme prop threading through CodeViewer/MarkdownViewer/ReadOnlyContent, fontSize applied to View tab containers, and reactive dependency arrays
- `.gsd/milestones/M009/slices/S04/S04-PLAN.md` — Added Observability / Diagnostics section and diagnostic verification step (pre-flight fix)
- `.gsd/milestones/M009/slices/S04/tasks/T01-PLAN.md` — Added Observability Impact section (pre-flight fix)
