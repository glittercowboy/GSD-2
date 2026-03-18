# S04: Final Polish & Verification

**Goal:** All editor features work end-to-end — font size applies to both View and Edit tabs, shiki renders the correct theme in light and dark modes, CSS is readable in both themes, and the edit→save→view round-trip works for both code and markdown files.
**Demo:** Toggle dark/light mode → shiki View tab switches between `github-dark-default` and `github-light-default` themes with readable CSS in both. Change editor font size in settings → both View and Edit tabs reflect the new size. Edit a `.ts` file → Save → switch to View → updated content shown. Same for a `.md` file.

## Must-Haves

- `useEditorFontSize()` font size applied to the View tab container (both read-only and tabbed modes)
- Shiki loads both `github-dark-default` and `github-light-default` themes
- `useTheme()` drives shiki theme selection — dark mode uses `github-dark-default`, light mode uses `github-light-default`
- `MarkdownViewer` re-highlights when theme changes (theme in `useEffect` dependency array)
- `.file-viewer-code` and `.markdown-body` CSS uses design tokens or scoped `.dark` overrides — readable in both themes
- `npm run build:web-host` exits 0
- Browser verification of edit→save→view, font size, and theme switching

## Proof Level

- This slice proves: final-assembly
- Real runtime required: yes
- Human/UAT required: yes (visual theme comparison)

## Verification

- `npm run build:web-host` exits 0 after T01 and T02
- Browser: open a `.ts` file → View tab shows shiki highlighting → Edit tab shows CodeMirror → modify → Save → switch to View → content updated
- Browser: open a `.md` file → View tab shows rendered markdown → Edit tab shows raw markdown → modify → Save → View shows updated render
- Browser: change editor font size in settings → both View and Edit tabs reflect the new size
- Browser: toggle dark/light mode → View tab shiki theme switches, Edit tab CodeMirror theme switches, CSS colors are readable in both

## Integration Closure

- Upstream surfaces consumed: `useEditorFontSize()` from S01, `CodeEditor` and View/Edit tabs from S02, POST `/api/files` from S01, design tokens from `globals.css`
- New wiring introduced in this slice: `useTheme()` → shiki theme selection, `fontSize` → ReadOnlyContent container, CSS token references in `.file-viewer-code` and `.markdown-body`
- What remains before the milestone is truly usable end-to-end: nothing — this is the final slice

## Tasks

- [ ] **T01: Apply font size to View tab and add dual shiki theme support** `est:25m`
  - Why: Font size from `useEditorFontSize()` only reaches the Edit tab (CodeEditor). The View tab (`ReadOnlyContent`) ignores it. Shiki only loads `github-dark-default` — in light mode, code renders dark-themed against a light background. Both `CodeViewer` and `MarkdownViewer` hardcode the dark theme name.
  - Files: `web/components/gsd/file-content-viewer.tsx`
  - Do: (1) Import `useTheme` from `next-themes`. (2) In `ReadOnlyContent`, accept `fontSize` and `shikiTheme` props, wrap output in a div with `style={{ fontSize }}`. (3) In `getHighlighter()` singleton, load both themes: `["github-dark-default", "github-light-default"]`. (4) In `CodeViewer`, accept `shikiTheme` prop, use it in `codeToHtml()` instead of hardcoded `"github-dark-default"`. (5) In `MarkdownViewer`, accept `shikiTheme` prop, use it in `codeToHtml()`, add `shikiTheme` to the `useEffect` dependency array so code blocks re-highlight on theme change. (6) In `FileContentViewer`, call `useTheme()`, derive `shikiTheme = resolvedTheme === "light" ? "github-light-default" : "github-dark-default"`, pass `fontSize` and `shikiTheme` through `ReadOnlyContent` to child viewers. (7) In the read-only fallback path (no tabs), also wrap in a div with `style={{ fontSize }}`.
  - Verify: `npm run build:web-host` exits 0; `grep -c "github-light-default" web/components/gsd/file-content-viewer.tsx` returns ≥2; `grep -c "useTheme" web/components/gsd/file-content-viewer.tsx` returns ≥1; `grep -c "fontSize" web/components/gsd/file-content-viewer.tsx` returns ≥5
  - Done when: Build passes, both shiki themes loaded, useTheme drives theme selection, fontSize flows to View tab container

- [ ] **T02: Add light-mode CSS variants for file viewer and markdown** `est:15m`
  - Why: `.file-viewer-code` and `.markdown-body` use hardcoded dark oklch values (e.g. `.line:hover` bg `oklch(0.15 0 0)`, `.markdown-body` text `oklch(0.85 0 0)`, borders `oklch(0.22 0 0)`). In light mode these are unreadable or invisible.
  - Files: `web/app/globals.css`
  - Do: Replace hardcoded oklch values with CSS custom properties from the existing `:root`/`.dark` design token system where possible. Specifically: (1) `.file-viewer-code .line:hover` background → `var(--muted)`. (2) `.file-viewer-code .line::before` color → `var(--muted-foreground)`. (3) `.markdown-body` color → `var(--foreground)`. (4) `.markdown-body h1, h2` border-bottom → `var(--border)`. (5) `.markdown-body hr` border-top → `var(--border)`. (6) `.markdown-body blockquote` border-left → use a value that works in both modes (e.g. `var(--muted-foreground)`) and color → `var(--muted-foreground)`. (7) `.markdown-body strong` color → `var(--foreground)`. (8) `.markdown-body del` color → `var(--muted-foreground)`.
  - Verify: `npm run build:web-host` exits 0; `grep -c "var(--" web/app/globals.css | grep -v "^0$"` confirms CSS variables are used; no remaining hardcoded oklch in `.file-viewer-code` or `.markdown-body` selectors (except accent-color on checkbox which is fine).
  - Done when: Build passes, all `.file-viewer-code` and `.markdown-body` color values use CSS custom properties, both themes render readable text

- [ ] **T03: End-to-end browser verification of all editor features** `est:20m`
  - Why: This is the milestone's final acceptance gate. All prior work was verified structurally — this task exercises the real runtime in a browser.
  - Files: none (verification only)
  - Do: (1) Build and start the app: `npm run build:web-host && npm run gsd:web`. (2) Navigate to the file viewer, open a `.ts` file. (3) Verify View tab shows syntax highlighting. (4) Switch to Edit tab, verify CodeMirror loads. (5) Make an edit, verify Save button activates, click Save, switch to View, verify updated content. (6) Open a `.md` file, repeat edit→save→view round-trip. (7) Open settings, change editor font size, verify both View and Edit tabs reflect the change. (8) Toggle light/dark mode, verify shiki View tab switches theme, CodeMirror Edit tab switches theme, all text is readable. (9) Check browser console for errors. **Skill:** `frontend-design` may be useful for visual assessment.
  - Verify: All 8 checks pass in browser. `npm run build:web-host` exits 0 (final confirmation).
  - Done when: Edit→save→view works for code and markdown, font size applies to both tabs, dark/light themes render correctly in both tabs, no console errors

## Files Likely Touched

- `web/components/gsd/file-content-viewer.tsx`
- `web/app/globals.css`
