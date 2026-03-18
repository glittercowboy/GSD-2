# S01: Electron Shell + Design System Foundation — UAT

**Milestone:** M001-1ya5a3
**Written:** 2026-03-18

## UAT Type

- UAT mode: mixed
- Why this mode is sufficient: This slice is mostly shell chrome, layout behavior, and visual design foundation. Build/test output proves the code contract, while live runtime checks prove the window, layout persistence, and visual shell actually render.

## Preconditions

- From repo root `/Users/lexchristopherson/Developer/gsd-2`, run `npm run dev -w studio`.
- Wait for the terminal to show the renderer URL and the three boot logs: `[studio] preload loaded`, `[studio] window created`, and `GSD Studio ready`.
- Open `http://localhost:5173/` in the browser if verifying via renderer preview, or inspect the live Electron window directly.

## Smoke Test

Confirm the app opens into a dark desktop shell with three visible columns labeled Files, Conversation, and Editor, with amber accents and Inter/JetBrains Mono typography.

## Test Cases

### 1. Boot diagnostics and native shell rendering

1. Start the app with `npm run dev -w studio`.
2. Watch the terminal until the renderer URL appears.
3. Confirm the terminal prints `[studio] preload loaded`, `[studio] window created`, and `GSD Studio ready`.
4. Inspect the running shell.
5. **Expected:** The app opens as a dark Electron window with a custom title bar, `GSD STUDIO` branding, and no blank/white bootstrap screen.

### 2. Three-column layout renders correctly

1. Look at the primary workspace after launch.
2. Confirm the left rail shows Files / WORKSPACE and a file-tree placeholder.
3. Confirm the center rail shows Conversation / ACTIVE SESSION plus the design-system proof card and tool placeholder card.
4. Confirm the right rail shows Editor / PREVIEW BUFFER and the code preview placeholder.
5. **Expected:** Three distinct columns are visible at once, center is dominant, and each rail has content that matches its intended future role.

### 3. Resize persistence is wired

1. Drag the separator between the Files rail and the Conversation rail to a new position.
2. Refresh the renderer or relaunch the app.
3. Open browser devtools and inspect localStorage key `react-resizable-panels:gsd-studio-layout:files:conversation:editor`.
4. **Expected:** The stored layout values change from the defaults and survive reload, proving the panel autosave layer is active.

### 4. Composer input behaves like an app surface, not a static mock

1. Click into the composer textarea at the bottom of the center rail.
2. Type `Layout persistence check`.
3. **Expected:** The text remains in the textarea, the field uses the dark shell styling, and the Send button stays visually aligned with the composer surface.

### 5. Design system contract is visible in the live shell

1. Inspect the UI text in the title bar, panel headings, and body copy.
2. Inspect the code sample in the right rail and inline code chips in the center rail.
3. Inspect the iconography and resize handles.
4. **Expected:** UI text uses Inter, code uses JetBrains Mono, accent color is warm amber only, icons are Phosphor-style, and the shell reads like a restrained desktop tool rather than a stock component library.

## Edge Cases

### Build contract regression

1. Run `npm run build -w studio`.
2. Run `npm run test -w studio`.
3. **Expected:** Build succeeds without TypeScript/Vite failures, and the token/font smoke tests pass.

### Diagnostic noise after reload

1. Reload the renderer once after startup.
2. Check browser console output.
3. **Expected:** No new runtime JS errors appear after reload. A missing favicon 404 may still appear in dev and is currently cosmetic only.

## Failure Signals

- `npm run dev -w studio` does not print the preload/window/ready logs.
- The renderer opens to a blank page, white bootstrap shell, or missing columns.
- The localStorage layout key is absent or does not change after dragging a separator.
- The composer textarea cannot accept input.
- Fonts fall back visibly, accents are not amber, or the UI starts looking like stock shadcn/Lucide-era component chrome.
- `npm run build -w studio` or `npm run test -w studio` fails.

## Requirements Proved By This UAT

- R001 — Proves the desktop shell launches with the expected Electron/window/title-bar behavior.
- R008 — Proves the dark monochrome + warm amber design system and font/icon contract render in the real app.
- R010 — Proves the three-column resizable layout exists and persists.
- R011 — Proves the shell clears the no-AI-slop aesthetic bar at the foundation level.

## Not Proven By This UAT

- R002 — No gsd-2 RPC, subprocess management, or event streaming is wired yet.
- R003 / R004 / R009 — Message rendering, bespoke tool cards, and interactive wizard prompts are still future slices.
- R005 / R006 / R007 — The file tree, Monaco editor runtime, and preview pane are still placeholders rather than integrated systems.

## Notes for Tester

Ignore the placeholder content itself; the point of this UAT is shell quality, structure, and persistence. The only known cosmetic rough edge in dev is a missing favicon 404. If the shell feels too rounded, too colorful, or too much like a generic web UI kit, that is a real regression for this slice.
