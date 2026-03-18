---
estimated_steps: 7
estimated_files: 1
---

# T01: Apply font size to View tab and add dual shiki theme support

**Slice:** S04 — Final Polish & Verification
**Milestone:** M009

## Description

The View tab ignores `useEditorFontSize()` — only the Edit tab's CodeEditor receives it. Additionally, shiki only loads `github-dark-default`, so code in the View tab renders with dark colors regardless of the active theme. This task fixes both gaps in `file-content-viewer.tsx`:

1. **Font size:** Import `useEditorFontSize()` result into the render path for the View tab. Apply it as an inline `fontSize` style on the containers that wrap `ReadOnlyContent` — both the tabbed View `TabsContent` and the read-only fallback div.

2. **Dual shiki theme:** Import `useTheme` from `next-themes`. Derive the shiki theme name from `resolvedTheme` (defaulting to `"github-dark-default"` when undefined). Load both `github-dark-default` and `github-light-default` in the `getHighlighter()` singleton. Thread the theme name through `ReadOnlyContent` → `CodeViewer` / `MarkdownViewer` so `codeToHtml()` uses the correct theme at render time. Add the theme to `MarkdownViewer`'s `useEffect` dependency array so code blocks re-highlight when the user toggles light/dark mode.

Note: `useEditorFontSize()` is already imported at line 8 and called at line 393. The hook call and `fontSize` variable already exist — they just need to flow into the View tab containers.

## Steps

1. Add `import { useTheme } from "next-themes"` at the top of `file-content-viewer.tsx`.

2. Modify the `getHighlighter()` singleton (around line 109-113) to load both themes:
   ```ts
   themes: ["github-dark-default", "github-light-default"],
   ```

3. Update `CodeViewer` to accept a `shikiTheme` prop (type `string`, default `"github-dark-default"`). Use `shikiTheme` in the `codeToHtml({ theme: shikiTheme })` call instead of the hardcoded `"github-dark-default"`.

4. Update `MarkdownViewer` to accept a `shikiTheme` prop. Use it in the `codeToHtml({ theme: shikiTheme })` call inside the `useEffect`. Add `shikiTheme` to the `useEffect` dependency array alongside `content` and `filepath`.

5. Update `ReadOnlyContent` to accept `fontSize: number` and `shikiTheme: string` props. Wrap the returned JSX in a `<div style={{ fontSize }}>` container. Pass `shikiTheme` through to both `MarkdownViewer` and `CodeViewer`.

6. In the `FileContentViewer` component body (around line 393), add `useTheme()` call and derive the shiki theme:
   ```ts
   const { resolvedTheme } = useTheme()
   const shikiTheme = resolvedTheme === "light" ? "github-light-default" : "github-dark-default"
   ```

7. Pass `fontSize` and `shikiTheme` to all `ReadOnlyContent` render sites — both the read-only fallback path (line ~413) and the tabbed View `TabsContent` (line ~465). Also apply `style={{ fontSize }}` to the View `TabsContent` wrapper div.

## Must-Haves

- [ ] Both `github-dark-default` and `github-light-default` loaded in `getHighlighter()` singleton
- [ ] `useTheme()` called in `FileContentViewer`, `resolvedTheme` drives shiki theme name
- [ ] `CodeViewer` uses dynamic theme name instead of hardcoded `"github-dark-default"`
- [ ] `MarkdownViewer` uses dynamic theme name and re-highlights on theme change
- [ ] `fontSize` from `useEditorFontSize()` applied to View tab container via inline style
- [ ] `npm run build:web-host` exits 0

## Verification

- `npm run build:web-host` exits 0
- `grep -c "github-light-default" web/components/gsd/file-content-viewer.tsx` returns ≥2 (one in getHighlighter, one in the theme derivation)
- `grep -c "useTheme" web/components/gsd/file-content-viewer.tsx` returns ≥1
- `grep -c "shikiTheme" web/components/gsd/file-content-viewer.tsx` returns ≥5

## Inputs

- `web/components/gsd/file-content-viewer.tsx` — current state has `useEditorFontSize()` imported (line 8) and called (line 393) but only passed to `CodeEditor`. Shiki theme hardcoded as `"github-dark-default"` in three places: `getHighlighter()` themes array (line ~111), `CodeViewer` `codeToHtml` call (line ~154), `MarkdownViewer` `codeToHtml` call (line ~251).
- S02 established the View/Edit tab architecture, `ReadOnlyContent` helper, and the `CodeEditor` component which already handles light/dark via its own `useTheme()` call.
- Shiki v4 (`"shiki": "^4.0.2"` in package.json) includes `github-light-default` as a bundled theme — no new dependency needed.

## Observability Impact

**What changes:**
- Shiki singleton now loads two themes instead of one — increases initial highlight load time marginally but enables correct theme rendering.
- `MarkdownViewer` `useEffect` gains `shikiTheme` as a dependency — markdown re-renders when the user toggles theme, producing a brief loading state.
- `CodeViewer` `useEffect` gains `shikiTheme` as a dependency — code re-highlights on theme toggle.

**How to inspect:**
- DevTools Elements panel: any `.file-viewer-code` container's inline `style` should include `fontSize` matching the user's setting.
- DevTools Elements panel: shiki-generated `<pre>` elements include inline `style="background-color:..."` — `#0d1117` for dark, `#fff` for light.
- React DevTools: `ReadOnlyContent` props should show `fontSize` and `shikiTheme` values.

**Failure state visibility:**
- If the highlighter singleton fails, `highlighterPromise` resets to `null` and the next render retries. Persistent failure degrades to `PlainViewer` (line-numbered plain text).
- If `resolvedTheme` is undefined (SSR/hydration), defaults to dark theme — worst case is a flash of dark-themed code in light mode, self-correcting after hydration.

## Expected Output

- `web/components/gsd/file-content-viewer.tsx` — updated with dual shiki theme loading, `useTheme()` integration, font size applied to View tab containers, and reactive theme switching in `MarkdownViewer`
