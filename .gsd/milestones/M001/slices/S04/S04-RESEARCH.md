# S04: Current-project state surfaces — Research

**Date:** 2026-03-14

## Summary

The four main content views (Dashboard, Roadmap, Files, Activity) and the DualTerminal (Power Mode) are each 100% hardcoded mock data. The sidebar and status bar are already wired to real store state — they prove the pattern. The workspace store already carries most of what the views need: `boot.workspace` has the full milestone/slice/task tree with done-status and active scope; `terminalLines` carry timestamped typed activity events from real SSE; `liveTranscript`, `streamingAssistantText`, and `activeToolExecution` give live agent state. The main gaps are: (1) `boot.auto` always returns zeros because no real auto-dashboard data source is wired to the bridge, and (2) there is no file-read API — the Files view can't show real `.gsd/` file content without a new endpoint.

The Roadmap view is the easiest win — the sidebar already consumes the same `boot.workspace.milestones` data with status derivation helpers (`getMilestoneStatus`, `getSliceStatus`, `getTaskStatus`). Activity maps directly to `terminalLines`. Dashboard can derive current-slice progress and session metrics from the workspace index and bridge state. Files needs a lightweight server endpoint to list and read `.gsd/` directory contents.

The boundary map calls for "Real workspace store/view models for dashboard, roadmap, files, and activity" plus a "mock-data removal invariant for core views." R005 (skin → live workspace) and R008 (no mock/live mixing) are both primary owners here. The visual design must be preserved per D002 — we replace data sources, not layouts.

## Recommendation

Wire each view to real store state in order of dependency depth:

1. **Roadmap** — replace the static `roadmapData` with `boot.workspace.milestones`. Reuse the sidebar's status helpers. The visual shape (milestone cards with slice rows, progress bars, risk badges) stays the same but renders real data. Risk badges need a data source — the roadmap parser doesn't extract risk level, but the slice `done`/in-progress/pending status is available.

2. **Activity** — replace the static `activityLog` with `terminalLines` from the store. The existing `ActivityEvent` shape maps cleanly to `WorkspaceTerminalLine` — the `type` field discriminates icons, and `timestamp` is already formatted. The timeline visual stays intact.

3. **Dashboard** — replace metric cards and tables with data from `boot.workspace`, `boot.auto`, `boot.bridge`, and `terminalLines`. Current-slice tasks derive from `getCurrentSlice(workspace)?.tasks`. "Recent activity" becomes the last N terminal lines. Model/session info comes from `boot.bridge.sessionState`. Auto metrics (elapsed, cost, tokens) come from `boot.auto` — currently zeros when auto-mode isn't active, which is correct display behavior.

4. **Files** — add a lightweight `/api/files` route that lists the `.gsd/` directory tree and reads individual file content on demand. Wire the view to fetch on mount and on file selection. Scope reads to `.gsd/` for security.

5. **DualTerminal** — the left "auto" pane replaces its hardcoded simulation with real `boot.auto` state and `terminalLines`. The right "command" pane is already redundant with the S03 Terminal component — wire it to the same store.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Milestone/slice/task status derivation | `getMilestoneStatus`, `getSliceStatus`, `getTaskStatus` in `sidebar.tsx` | Already proven correct against real workspace data; avoids duplicate logic |
| Current scope/branch/session labels | `getCurrentScopeLabel`, `getCurrentBranch`, `getSessionLabelFromBridge`, `getModelLabel` in `gsd-workspace-store.tsx` | These are the authoritative label formatters used by the status bar and shell chrome |
| Duration/cost/token formatting | `formatDuration`, `formatCost`, `formatTokens` in `gsd-workspace-store.tsx` | Already handle edge cases (zero, NaN, overflow) |
| Workspace index parsing | `indexWorkspace` in `src/resources/extensions/gsd/workspace-index.ts` via bridge child process | The boot payload already carries the result; don't re-parse on the client |
| Terminal line generation | `summarizeEvent`, `createTerminalLine`, `withTerminalLine` in store | Events are already classified and timestamped by the store's SSE handler |

## Existing Code and Patterns

- `web/components/gsd/sidebar.tsx` — **the pattern to follow.** Already consumes `boot.workspace.milestones`, derives status with helpers, renders expandable milestone/slice/task tree from real data. The content views should follow the same `useGSDWorkspaceState()` → derive → render pattern.
- `web/components/gsd/status-bar.tsx` — already reads `boot.auto`, `boot.bridge`, workspace scope, and formats with the store's utility functions. Dashboard metrics should use the same sources.
- `web/lib/gsd-workspace-store.tsx` — the store carries all state. Key fields for S04: `boot.workspace.milestones`, `boot.workspace.active`, `boot.auto`, `boot.bridge.sessionState`, `terminalLines`, `liveTranscript`, `streamingAssistantText`, `activeToolExecution`, `statusTexts`, `widgetContents`.
- `web/components/gsd/terminal.tsx` — S03 already built a working terminal with streaming text, transcript blocks, tool badge, steer toggle, and abort. The DualTerminal's right pane should delegate to this component.
- `src/web/bridge-service.ts` — `collectBootPayload()` assembles workspace, auto, bridge, and onboarding state. The workspace index is cached with TTL. `getAutoDashboardData` is injectable but defaults to zeros.
- `web/app/api/boot/route.ts` — returns `collectBootPayload()`. The Files view might need a separate endpoint rather than bloating boot.

## Constraints

- **D002 — preserve the exact existing skin.** Visual layouts, spacing, icons, color tokens, and component structure stay the same. Only data sources change.
- **R008 — no mock/live mixing.** After S04, every static array and hardcoded string in the four views must be replaced with store-driven data. No fallback to mock values.
- **Auto dashboard data is currently zeros.** `fallbackAutoDashboardData()` returns `{ active: false, elapsed: 0, totalCost: 0, totalTokens: 0, ... }`. The bridge's `getAutoDashboardData` dep is injectable but nothing injects real data yet. Dashboard and status bar will show zeros for elapsed/cost/tokens when auto-mode isn't running — this is correct behavior, not a bug.
- **No file-read API exists.** The bridge has no endpoint to read arbitrary project files. A new route is needed, scoped to `.gsd/` directory only.
- **The roadmap parser does not extract risk level.** `parseRoadmap()` returns `{ slices: [{ id, title, done }] }` — no `risk` field. The Roadmap view currently shows risk badges from mock data. Two options: (a) extend the parser to extract `risk:level` from roadmap markdown, or (b) drop risk badges until the parser supports them. Extending the parser is the right call since the roadmap format already encodes risk in the slice line.
- **Workspace index is cached with TTL in the bridge.** Boot doesn't re-index on every request. Views that need fresh workspace data after agent actions should either call `refreshBoot({ soft: true })` or accept the cache window.
- **`liveTranscript` grows unboundedly per session.** S03 noted this. Activity and Dashboard views consuming transcript should handle long arrays (truncation or virtualized list).

## Common Pitfalls

- **Rendering empty state as broken state** — When auto-mode isn't running, metrics are zeros. When no milestones exist, the roadmap is empty. These are valid states, not errors. Each view needs an intentional empty state that doesn't look like a loading failure.
- **Duplicating status derivation logic** — The sidebar already has `getMilestoneStatus`, `getSliceStatus`, `getTaskStatus`. The Roadmap view needs the same logic. Extract these to a shared module or import from the sidebar rather than copy-pasting.
- **Boot payload changing shape mid-session** — `boot` is updated by `refreshBoot` and by `recordBridgeStatus` (which patches the bridge snapshot). Views must handle the boot payload being `null` during initial load and potentially changing structure after a soft refresh.
- **File API security scope** — A file-read endpoint must be restricted to `.gsd/` files within the project cwd. Path traversal (e.g. `../../etc/passwd`) must be rejected.
- **Terminal lines as activity source** — `terminalLines` has a max of 250 entries (the `MAX_TERMINAL_LINES` constant). For long sessions this means old activity scrolls off. This is acceptable for S04 — deeper historical analytics is deferred to R021.

## Open Risks

- **Risk badge data gap.** The `parseRoadmap` function in `files.ts` doesn't extract the `risk:level` annotation from slice lines. Extending the parser is straightforward but touches a shared parser used by the GSD extension and auto-mode. Changes must not break the guided-flow or state-derivation paths that also call `parseRoadmap`.
- **Auto-dashboard data accuracy.** The bridge always returns zeros for auto-mode metrics. If a real auto-mode session is running, the dashboard will show zeros unless S04 either wires a real data source or accepts the gap for now. The status bar already shows these zeros — the dashboard will match.
- **File content rendering.** The mock Files view renders `.md` content as `<pre>` text. Real `.gsd/` files can be large (roadmaps, summaries). Long file content needs scroll handling and possibly syntax highlighting for markdown. Basic `<pre>` rendering is sufficient for S04.
- **Store re-renders.** All four views reading from `useGSDWorkspaceState()` will re-render on every store patch (including every SSE event during streaming). Views that only need boot-time data should memoize their derived values or use selective state selectors. The current store uses `useSyncExternalStore` without selectors — every subscriber gets every update.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Next.js App Router | `wshobson/agents@nextjs-app-router-patterns` | available (8.4K installs) |
| React state management | `wshobson/agents@react-state-management` | available (4.1K installs) |
| SwiftUI | bundled `swiftui` | installed (not relevant) |
| Frontend design | bundled `frontend-design` | installed (not relevant — D002 says preserve exact skin) |

No skills are directly relevant enough to recommend installing. The work is integration-focused (wiring existing store state to existing component layouts), not framework-pattern-focused.

## Sources

- All findings from direct codebase exploration — no external sources needed.
- Key files examined: `dashboard.tsx`, `roadmap.tsx`, `files-view.tsx`, `activity-view.tsx`, `dual-terminal.tsx`, `sidebar.tsx`, `status-bar.tsx`, `gsd-workspace-store.tsx`, `bridge-service.ts`, `workspace-index.ts`, `app-shell.tsx`, `boot/route.ts`, `session/events/route.ts`.
