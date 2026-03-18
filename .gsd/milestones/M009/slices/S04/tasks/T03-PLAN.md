---
estimated_steps: 9
estimated_files: 0
---

# T03: End-to-end browser verification of all editor features

**Slice:** S04 — Final Polish & Verification
**Milestone:** M009

## Description

This is the milestone's final acceptance gate. All prior work was verified structurally via build checks — this task exercises the real runtime in a browser. It covers the four critical flows: edit→save→view round-trip (code and markdown), font size propagation, and dark/light theme switching.

The `frontend-design` skill may be useful for visual assessment of theme alignment.

## Steps

1. Build and start the app:
   ```bash
   npm run build:web-host >/dev/null && npm run gsd:web:stop:all >/dev/null 2>&1 || true && npm run gsd:web
   ```

2. Navigate to the file viewer in the browser. Open a `.ts` or `.tsx` file.

3. **Verify View tab:** Shiki syntax highlighting renders — code has colored tokens, line numbers visible.

4. **Verify Edit tab:** Switch to Edit tab — CodeMirror loads (spinner then editor), content matches View tab.

5. **Verify edit→save→view (code):** In Edit tab, make a small change (add a comment). Verify Save button activates. Click Save. Switch to View tab. Verify the change appears in the rendered view.

6. **Verify edit→save→view (markdown):** Open a `.md` file. View tab shows rendered markdown (headings, lists, code blocks). Switch to Edit tab — raw markdown in CodeMirror. Make a change. Save. Switch to View. Verify change appears.

7. **Verify font size:** Open settings (or navigate to the editor font size panel). Change font size. Return to file viewer. Verify both View tab text and Edit tab text reflect the new size.

8. **Verify dark/light theme:** Toggle from dark to light mode (or vice versa). Verify:
   - View tab shiki code switches theme (light bg with dark text, or dark bg with light text)
   - Edit tab CodeMirror switches theme
   - `.file-viewer-code` line numbers and hover highlight are readable
   - `.markdown-body` text, headings, borders, blockquotes are readable
   - No dark-on-dark or light-on-light contrast issues

9. **Check console:** Open browser DevTools console. Verify no errors related to shiki, CodeMirror, or the editor components. Warnings about hydration or optional deps are acceptable.

## Must-Haves

- [ ] Edit→save→view works for a code file (`.ts`/`.tsx`)
- [ ] Edit→save→view works for a markdown file (`.md`)
- [ ] Font size change from settings applies to both View and Edit tabs
- [ ] Dark mode renders correctly in both View and Edit tabs
- [ ] Light mode renders correctly in both View and Edit tabs
- [ ] No console errors from editor components
- [ ] `npm run build:web-host` exits 0 (final build confirmation)

## Verification

- All 7 must-haves checked off through browser interaction
- `npm run build:web-host` exits 0
- No JS errors in browser console related to editor functionality

## Inputs

- T01 output: `file-content-viewer.tsx` with dual shiki themes, `useTheme()` integration, and font size on View tab
- T02 output: `globals.css` with CSS custom property replacements for light-mode readability
- Running GSD instance via `npm run gsd:web`

## Expected Output

- All editor features verified working in browser
- If any visual issues found during verification, fix them and re-verify (fixes are in scope for this task)
- Final `npm run build:web-host` exits 0
