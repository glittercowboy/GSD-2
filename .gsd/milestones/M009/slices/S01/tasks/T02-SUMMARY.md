---
id: T02
parent: S01
milestone: M009
provides:
  - useEditorFontSize() hook with localStorage persistence, default 14, range 8–24
  - EditorSizePanel component with preset buttons and live preview
  - Wiring into command-surface gsd-prefs section
key_files:
  - web/lib/use-editor-font-size.ts
  - web/components/gsd/settings-panels.tsx
  - web/components/gsd/command-surface.tsx
key_decisions:
  - Default editor font size is 14px (vs terminal's 13px) — editors conventionally use slightly larger text
patterns_established:
  - EditorSizePanel clones TerminalSizePanel pattern exactly — same SettingsHeader, preset buttons, live preview, data-testid convention
observability_surfaces:
  - localStorage key `gsd-editor-font-size` — inspectable via `localStorage.getItem('gsd-editor-font-size')`
  - CustomEvent `editor-font-size-changed` on window for same-tab sync
  - data-testid="settings-editor-size" for UI testing
duration: 15m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T02: Add useEditorFontSize hook, EditorSizePanel, and wire into settings

**Added useEditorFontSize hook with localStorage persistence and EditorSizePanel in settings, mirroring the terminal font size pattern.**

## What Happened

Created three pieces following the exact `useTerminalFontSize` + `TerminalSizePanel` pattern:

1. **Hook** (`web/lib/use-editor-font-size.ts`): Exports `useEditorFontSize()` returning `[number, setter]`. Uses `gsd-editor-font-size` localStorage key, default 14, clamps 8–24. Includes cross-tab sync via `storage` event and same-tab sync via `editor-font-size-changed` CustomEvent.

2. **Panel** (`web/components/gsd/settings-panels.tsx`): Added `EDITOR_SIZE_PRESETS = [11, 12, 13, 14, 15, 16]` and `EditorSizePanel` component after `TerminalSizePanel`. Uses `SettingsHeader` with Type icon, subtitle "Applies to file viewer & editor", preset buttons with 14 marked as default, and a live `font-mono` preview div.

3. **Wiring** (`web/components/gsd/command-surface.tsx`): Added `EditorSizePanel` to the import and rendered `<EditorSizePanel />` after `<TerminalSizePanel />` in the `gsd-prefs` case.

## Verification

- `npm run build:web-host` exits 0 — all types, imports, and export chains valid
- localStorage mechanism verified in browser: `localStorage.setItem/getItem('gsd-editor-font-size')` reads/writes correctly
- CustomEvent sync verified: `editor-font-size-changed` event dispatches and receives `event.detail` correctly
- Clamping logic verified: values below 8 clamp to 8, above 24 clamp to 24, values in range pass through
- Component render path confirmed: `EditorSizePanel` is in the `gsd-prefs` case at line 2037 of command-surface.tsx
- Note: Full visual verification of the prefs panel requires the GSD CLI backend (not just `next dev`), but the component code structurally mirrors the working `TerminalSizePanel` which renders correctly in production

### Slice-level verification status:
- ✅ `curl -X POST http://localhost:3000/api/files?project=... -d '{"path":"test-write.txt","content":"hello","root":"project"}'` → 200 (T01)
- ✅ `curl -X POST ... -d '{"path":"../../../etc/passwd","content":"x","root":"gsd"}'` → 400 (T01)
- ✅ `curl -X POST ... -d '{"path":"nonexistent/deep/file.txt","content":"x","root":"project"}'` → 404 (T01)
- ✅ `curl -X POST ... -d '{"content":"x","root":"gsd"}'` → 400 structured error (T01)
- ✅ `npm run build:web-host` exits 0

## Diagnostics

- `localStorage.getItem('gsd-editor-font-size')` — returns persisted value or null
- `window.dispatchEvent(new CustomEvent('editor-font-size-changed', { detail: 16 }))` — triggers all hook instances to update
- `document.querySelector('[data-testid="settings-editor-size"]')` — locates the panel in DOM when rendered

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `web/lib/use-editor-font-size.ts` — new file: useEditorFontSize() hook with localStorage persistence
- `web/components/gsd/settings-panels.tsx` — added EditorSizePanel component and EDITOR_SIZE_PRESETS constant
- `web/components/gsd/command-surface.tsx` — added EditorSizePanel import and render in gsd-prefs section
