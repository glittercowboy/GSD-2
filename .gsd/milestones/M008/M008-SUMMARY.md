---
id: M008
provides:
  - Projects page redesigned from grid to styled expandable list with progress detail
  - Browser update banner with async npm install trigger via /api/update
  - Dark mode as default theme (no user preference = dark)
  - All ~235 raw Tailwind accent colors migrated to semantic CSS tokens across 24 components
  - Remote questions settings panel (Slack/Discord/Telegram) with /api/remote-questions CRUD
  - Dynamic oklch progress bar coloring (red→yellow→green by completion %)
  - Terminal text size preference with localStorage persistence, scoped to chat + expert terminals
key_decisions:
  - D080: Dark mode default instead of system preference
  - D081: Mechanical migration of all raw Tailwind accent classes to semantic CSS tokens, verified by grep
  - D082: Async child process for browser update trigger (spawn, not execSync)
  - D083: Styled list with expandable detail instead of grid for projects page
  - D084: Terminal text size applies to chat + expert terminals, explicitly excludes footer
  - D085/D086: Module-level singleton for update state tracking across HTTP requests
patterns_established:
  - "Mechanical color token substitution: emerald-*/green-* → success, amber-*/orange-* → warning, red-* → destructive, sky-*/blue-* → info"
  - "oklch hue interpolation for semantic color encoding (reusable for any percentage→color mapping)"
  - "Module-level singleton for async child process state tracking across HTTP request boundaries"
  - "localStorage + custom event pattern for cross-component preference sync"
  - "Detail panel pattern: row button with onClick toggle + onDoubleClick navigate + conditional detail section"
  - "On-demand expensive data via query param (?detail=true) rather than always including it"
  - "Standalone API route with replicated constants for extension data access (Turbopack constraint)"
observability_surfaces:
  - "GET /api/update — version info + update lifecycle state (idle/running/success/error)"
  - "GET /api/projects?detail=true — project list with progress field per project"
  - "GET /api/remote-questions — channel config + env var status"
  - "rg 'emerald-|amber-|red-[0-9]|sky-|orange-|green-[0-9]|blue-[0-9]' web/components/ — zero output confirms no accent color regression"
  - "localStorage 'gsd-terminal-font-size' — persisted terminal font size"
  - "Progress bar div inline style backgroundColor: oklch(0.65 0.16 H) — encodes completion %"
requirement_outcomes:
  - id: R114
    from_status: active
    to_status: validated
    proof: "defaultTheme=\"dark\" in layout.tsx, enableSystem removed. grep confirms 1 match for dark default, 0 for enableSystem."
  - id: R115
    from_status: active
    to_status: validated
    proof: "rg scan of web/components/ for raw Tailwind accent colors returns 0 hits. ~235 instances migrated across 24 files. npm run build:web-host exits 0."
  - id: R116
    from_status: active
    to_status: validated
    proof: "getProgressColor() implements oklch hue interpolation 25→85→145. Inline backgroundColor replaces static bg-foreground on progress bar div. Build passes."
  - id: R117
    from_status: active
    to_status: validated
    proof: "GET/POST /api/update route compiled in build. UpdateBanner imported and rendered in app-shell.tsx. Browser banner renders with version diff, Update button, polling, and status feedback."
  - id: R118
    from_status: active
    to_status: validated
    proof: "GET/POST/DELETE /api/remote-questions route compiled in build. RemoteQuestionsPanel rendered in gsd-prefs command surface. Channel type validation, channel ID regex, timeout/poll clamping all implemented."
  - id: R119
    from_status: active
    to_status: validated
    proof: "Projects view uses flex flex-col layout. expandedProject state with single-click expand / double-click navigate. ActiveProjectDetail and InactiveProjectDetail components. Zero grid grid-cols matches in projects-view.tsx."
  - id: R120
    from_status: active
    to_status: validated
    proof: "useTerminalFontSize() hook persists in localStorage. TerminalSizePanel with presets 11–16. ShellTerminal accepts fontSize prop via DualTerminal. Footer terminal has no fontSize prop (confirmed by grep). Build passes."
duration: ~2h
verification_result: passed
completed_at: 2026-03-18
---

# M008: Web Polish

**Seven UI/UX improvements shipped: projects page redesign with expandable progress detail, browser update banner with async install, dark mode default, full semantic color token migration across 24 components, remote questions settings panel, dynamic progress bar coloring, and terminal text size preference.**

## What Happened

Five independent slices delivered seven user-facing improvements to the GSD web workspace.

**S01 (Projects Page Redesign)** replaced the grid-based projects view with a styled vertical list. Each project renders as a row with name, kind badge, and signal chips. Single-click expands inline detail; double-click navigates. Two detail components handle the branching — `ActiveProjectDetail` reads from the workspace store (milestone, slice, tasks, cost), while `InactiveProjectDetail` reads from a new `readProjectProgress()` filesystem function that parses STATE.md. The API gained a `?detail=true` query param to gate the expensive progress reads.

**S02 (Browser Update UI)** added a complete update lifecycle to the browser. `update-service.ts` checks the npm registry directly (inline fetch, avoiding Turbopack import issues), and `triggerUpdate()` spawns `npm install -g` as a detached child process tracked by a module-level singleton. The `/api/update` route exposes GET (version check + state) and POST (trigger with 202/409 semantics). `UpdateBanner` renders conditionally in app-shell — orange when available, spinner during install, emerald on success, red with retry on error. Polling at 3s intervals tracks progress.

**S03 (Theme Defaults & Color Audit)** made dark mode the unconditional default by changing `defaultTheme="dark"` and removing `enableSystem` from the ThemeProvider. Then systematically migrated ~235 raw Tailwind accent color instances across 24 component files to semantic CSS tokens: `emerald-*/green-*` → `success`, `amber-*/orange-*` → `warning`, `red-*` → `destructive`, `sky-*/blue-*` → `info`. Opacity modifiers preserved. String literal color names (type union keys) left untouched. Final grep scan: zero raw accent colors remain.

**S04 (Remote Questions Settings)** created a `RemoteQuestionsPanel` in the settings surface with channel type select, channel ID input with per-channel regex validation, timeout and poll interval controls, save/disconnect lifecycle, and env var status badge. The `/api/remote-questions` route provides GET/POST/DELETE with YAML frontmatter parsing of `~/.gsd/preferences.md`. Channel ID patterns and env key constants are replicated locally due to the Turbopack import constraint.

**S05 (Progress Bar & Terminal Size)** added `getProgressColor()` — an oklch hue interpolation from red (H=25) through yellow (H=85) to green (H=145) at fixed L=0.65 C=0.16. The progress bar's static `bg-foreground` was replaced with a dynamic inline `backgroundColor`. Terminal text size got `useTerminalFontSize()` hook with localStorage persistence and cross-component sync via custom events, `TerminalSizePanel` with preset buttons (11–16), and a `fontSize` prop threaded through `ShellTerminal` and `DualTerminal`. The footer terminal is explicitly excluded — no `fontSize` prop passed.

## Cross-Slice Verification

| Success Criterion | Evidence | Result |
|---|---|---|
| `npm run build:web-host` exits 0 | Build completed, route manifest includes `/api/update`, `/api/remote-questions`, all component imports resolve | ✅ |
| Projects view renders as styled list with expandable detail | `flex flex-col gap-2` layout, `expandedProject` state, `ActiveProjectDetail`/`InactiveProjectDetail` components, zero `grid grid-cols` matches | ✅ |
| Browser banner appears when new version available | `UpdateBanner` imported in app-shell, `/api/update` GET returns version info, POST triggers async install | ✅ |
| Dark mode default with no stored preference | `defaultTheme="dark"` confirmed (count=1), `enableSystem` absent (count=0) | ✅ |
| Zero raw Tailwind accent classes for semantic states | `rg "emerald-\|amber-\|red-[0-9]\|sky-\|orange-\|green-[0-9]\|blue-[0-9]" web/components/` returns 0 hits | ✅ |
| Progress bar transitions red→green by completion % | `getProgressColor()` with oklch hue interpolation, inline `backgroundColor` on progress bar div | ✅ |
| Remote questions config reads/writes preferences | `/api/remote-questions` GET/POST/DELETE with YAML parse, `RemoteQuestionsPanel` in gsd-prefs surface | ✅ |
| Terminal font size persists and applies to correct terminals | `useTerminalFontSize` hook, `fontSize` prop on ShellTerminal via DualTerminal, footer `<ShellTerminal className="h-full" />` has no fontSize prop | ✅ |

All 8 success criteria met. All 5 slices delivered and verified individually.

## Requirement Changes

- R114: active → validated — `defaultTheme="dark"` in layout.tsx, `enableSystem` removed. No stored preference = dark mode.
- R115: active → validated — Zero raw Tailwind accent colors in web/components/ (grep verified). ~235 instances migrated across 24 files. Build clean.
- R116: active → validated — `getProgressColor()` implements oklch hue interpolation. Dynamic `backgroundColor` replaces static `bg-foreground`.
- R117: active → validated — `/api/update` GET+POST route, `UpdateBanner` in app-shell, async `npm install -g` via spawn, polling progress.
- R118: active → validated — `/api/remote-questions` CRUD route, `RemoteQuestionsPanel` with channel type/ID/timeout/poll controls, env var status badge.
- R119: active → validated — Vertical list layout, expandable detail with progress info, single-click expand / double-click navigate.
- R120: active → validated — `useTerminalFontSize()` hook, `TerminalSizePanel` presets, fontSize prop on ShellTerminal/DualTerminal, footer excluded.

## Forward Intelligence

### What the next milestone should know
- All semantic color tokens (`success`, `warning`, `destructive`, `info`) are defined in `web/app/globals.css` under `:root` (light) and `.dark` blocks using oklch color space. New components must use these tokens — the substitution pattern `emerald-*/green-* → success` etc. is now the project standard.
- The `?detail=true` pattern on `/api/projects` is a reusable model for gating expensive data behind opt-in query params.
- The settings panel infrastructure in `settings-panels.tsx` now has 6 panels (PrefsPanel, ModelRoutingPanel, BudgetPanel, RemoteQuestionsPanel, TerminalSizePanel, plus chat-related). Adding new settings should follow the same `SettingsHeader` + `useSettingsData()` + API fetch pattern.
- The update banner is positioned between `</header>` and the error banner div in `app-shell.tsx` WorkspaceChrome. New banners should coordinate relative to these.

### What's fragile
- `readProjectProgress()` parsing depends on STATE.md format conventions (lines starting with `**Active Milestone:**`, `**Active Slice:**`, `**Phase:**`, and `✅`/`🔄` emoji). Format changes would silently return null fields.
- Module-level singleton state in `update-service.ts` resets on Next.js hot-reload during dev. Fine for production.
- CHANNEL_ID_PATTERNS replicated in the remote-questions API route — if upstream changes validation patterns, manual sync needed.
- The oklch progress bar uses fixed L=0.65 C=0.16 — would need theme-aware adjustment if future themes use dramatically different brightness ranges.
- xterm dynamic font size update relies on `termRef.current.options.fontSize` + `fitAddon.fit()` — xterm.js API changes would break silently.

### Authoritative diagnostics
- `rg "emerald-|amber-|red-[0-9]|sky-|orange-|green-[0-9]|blue-[0-9]" web/components/` — zero output confirms no accent color regression
- `GET /api/update` — single endpoint for all version info + update lifecycle state
- `GET /api/remote-questions` — structured JSON with config and env var status
- `GET /api/projects?detail=true` — progress field per project is the ground truth
- `localStorage.getItem('gsd-terminal-font-size')` — persisted terminal font size

### What assumptions changed
- Original plan estimated ~420 raw accent color instances; actual count was ~235 (plan double-counted some patterns). Migration completed in 3 tasks across 24 files.
- Original plan assumed importing `checkForUpdates()` from `update-check.ts` for the update banner — actual implementation used inline npm registry fetch because `checkForUpdates` has transitive deps that break Turbopack.
- Non-active project detail confirmed viable via synchronous `readFileSync` of STATE.md — fast enough for typical dev root sizes, no caching needed.

## Files Created/Modified

- `src/web/project-discovery-service.ts` — `ProjectProgressInfo` interface, `readProjectProgress()` function, `includeProgress` param
- `src/web/update-service.ts` — `checkForUpdate()`, `triggerUpdate()`, `getUpdateStatus()`, module-level singleton
- `src/web/settings-service.ts` — `remoteQuestions` field mapping in child script
- `web/app/api/projects/route.ts` — `?detail=true` query param for progress data
- `web/app/api/update/route.ts` — GET/POST API route, 202/409 semantics
- `web/app/api/remote-questions/route.ts` — GET/POST/DELETE for channel config CRUD
- `web/app/layout.tsx` — `defaultTheme="dark"`, removed `enableSystem`
- `web/lib/use-terminal-font-size.ts` — localStorage-persisted terminal font size hook
- `web/lib/settings-types.ts` — `remoteQuestions` optional field on `SettingsPreferencesData`
- `web/components/gsd/projects-view.tsx` — Redesigned to expandable list with progress detail
- `web/components/gsd/update-banner.tsx` — Update banner with fetch, trigger, poll, status feedback
- `web/components/gsd/app-shell.tsx` — UpdateBanner import + render, accent color migration
- `web/components/gsd/settings-panels.tsx` — RemoteQuestionsPanel, TerminalSizePanel, accent color migration
- `web/components/gsd/command-surface.tsx` — RemoteQuestionsPanel + TerminalSizePanel wiring, accent color migration
- `web/components/gsd/dashboard.tsx` — `getProgressColor()` oklch interpolation, dynamic progress bar
- `web/components/gsd/shell-terminal.tsx` — `fontSize` prop, dynamic font size update effect
- `web/components/gsd/dual-terminal.tsx` — `useTerminalFontSize` hook, fontSize passthrough
- `web/components/gsd/chat-mode.tsx` — `useTerminalFontSize` hook, font size on chat content
- `web/components/gsd/visualizer-view.tsx` — 53 accent color migrations
- `web/components/gsd/remaining-command-panels.tsx` — 25 accent color migrations
- `web/components/gsd/knowledge-captures-panel.tsx` — 18 accent color migrations
- `web/components/gsd/diagnostics-panels.tsx` — 25 accent color migrations
- `web/components/gsd/scope-badge.tsx` — accent color migration
- `web/components/gsd/activity-view.tsx` — accent color migration
- `web/components/gsd/status-bar.tsx` — accent color migration
- `web/components/gsd/sidebar.tsx` — accent color migration
- `web/components/gsd/roadmap.tsx` — accent color migration
- `web/components/gsd/terminal.tsx` — accent color migration
- `web/components/gsd/file-content-viewer.tsx` — accent color migration
- `web/components/ui/toast.tsx` — accent color migration
- `web/components/gsd/onboarding/step-ready.tsx` — accent color migration
- `web/components/gsd/onboarding/step-optional.tsx` — accent color migration
- `web/components/gsd/onboarding/step-authenticate.tsx` — accent color migration
- `web/components/gsd/onboarding/step-dev-root.tsx` — accent color migration
- `web/components/gsd/onboarding/step-provider.tsx` — accent color migration
