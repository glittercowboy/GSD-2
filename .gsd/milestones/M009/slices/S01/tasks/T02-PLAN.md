---
estimated_steps: 6
estimated_files: 3
---

# T02: Add useEditorFontSize hook, EditorSizePanel, and wire into settings

**Slice:** S01 — File Write API & Editor Font Size
**Milestone:** M009

## Description

Add an editor font size preference that persists in localStorage, following the exact pattern proven by `useTerminalFontSize` + `TerminalSizePanel`. Three pieces: (1) the hook in a new file, (2) the settings panel component, (3) wiring into the settings section of command-surface.

## Steps

1. Create `web/lib/use-editor-font-size.ts` by adapting the pattern from `web/lib/use-terminal-font-size.ts`:
   - `"use client"` directive at top
   - `STORAGE_KEY = "gsd-editor-font-size"`
   - `DEFAULT_SIZE = 14` (not 13 — editor default is 14)
   - `CHANGE_EVENT = "editor-font-size-changed"`
   - Export `useEditorFontSize(): [number, (size: number) => void]`
   - Same implementation: `useState` with lazy initializer reading localStorage, `useCallback` setter that clamps 8–24, two `useEffect` hooks for cross-tab (`storage` event) and same-tab (`CustomEvent`) sync
   - Include the same JSDoc observability comment pattern showing how to inspect: `localStorage.getItem('gsd-editor-font-size')`

2. In `web/components/gsd/settings-panels.tsx`:
   - Add import: `import { useEditorFontSize } from "@/lib/use-editor-font-size"`
   - Add constant after `TERMINAL_SIZE_PRESETS` (around line 843): `const EDITOR_SIZE_PRESETS = [11, 12, 13, 14, 15, 16] as const`
   - Add `EditorSizePanel` component after `TerminalSizePanel` (after line ~900). Clone the TerminalSizePanel structure exactly but with:
     - `data-testid="settings-editor-size"`
     - Title: `"Editor Text Size"`
     - Subtitle: `"Applies to file viewer & editor"`
     - Use `useEditorFontSize()` instead of `useTerminalFontSize()`
     - Use `EDITOR_SIZE_PRESETS` instead of `TERMINAL_SIZE_PRESETS`
     - Default marker on `14` instead of `13`
     - Same live preview div with `font-mono` and dynamic font size style
   - Export the component

3. In `web/components/gsd/command-surface.tsx`:
   - Add `EditorSizePanel` to the import on line 62: `import { PrefsPanel, ModelRoutingPanel, BudgetPanel, RemoteQuestionsPanel, TerminalSizePanel, EditorSizePanel } from "./settings-panels"`
   - Add `<EditorSizePanel />` after `<TerminalSizePanel />` in the `gsd-prefs` case (around line 2036)

4. Run `npm run build:web-host` to verify no type errors.

5. Start the server and verify in browser: open settings → scroll to "Editor Text Size" → presets visible → clicking a preset updates preview → refresh page → preference persisted.

6. Verify the hook works correctly: in browser devtools, `localStorage.getItem('gsd-editor-font-size')` returns the selected value after clicking a preset.

## Must-Haves

- [ ] `useEditorFontSize()` hook exists with localStorage persistence, default 14, range 8–24
- [ ] `EditorSizePanel` renders in settings with preset buttons and live preview
- [ ] Panel is wired into command-surface `gsd-prefs` section
- [ ] Font size persists across page refresh
- [ ] `npm run build:web-host` exits 0

## Verification

- `npm run build:web-host` exits 0
- In browser settings panel: "Editor Text Size" section visible below "Terminal Text Size"
- Clicking preset buttons updates the live preview font size
- Refreshing the page preserves the selected font size
- `localStorage.getItem('gsd-editor-font-size')` reflects the chosen value

## Inputs

- `web/lib/use-terminal-font-size.ts` — reference pattern to clone (storage key, events, range clamping)
- `web/components/gsd/settings-panels.tsx` — `TerminalSizePanel` component to clone (preset buttons, preview, layout)
- `web/components/gsd/command-surface.tsx` — import line and `gsd-prefs` section to add the new panel

## Expected Output

- `web/lib/use-editor-font-size.ts` — new file exporting `useEditorFontSize()` hook
- `web/components/gsd/settings-panels.tsx` — new `EditorSizePanel` component exported
- `web/components/gsd/command-surface.tsx` — `EditorSizePanel` imported and rendered in settings

## Observability Impact

- **New localStorage key:** `gsd-editor-font-size` — inspectable via `localStorage.getItem('gsd-editor-font-size')` in browser devtools. Returns the numeric font size (e.g. `"14"`) or `null` if never set.
- **New CustomEvent:** `editor-font-size-changed` — fires on `window` when the font size changes within the same tab. `event.detail` contains the numeric value.
- **New test ID:** `data-testid="settings-editor-size"` — scopes the EditorSizePanel for targeted UI testing and accessibility inspection.
- **Failure visibility:** If the hook fails to read/write localStorage (e.g. storage quota, private browsing), it silently falls back to the default (14px). No error surfaces — this matches the terminal font size pattern.
