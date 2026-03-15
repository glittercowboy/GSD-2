# S05: Start/resume workflow controls — Research

**Date:** 2026-03-14

## Summary

S05 adds actionable workflow controls to the browser UI so users can start new work, resume interrupted work, continue an active session, and manage auto-mode — all through visible buttons and action surfaces instead of typing hidden terminal commands.

The foundation is solid: the terminal already sends arbitrary `WorkspaceBridgeCommand` payloads via `sendCommand → /api/session/command → bridge.sendInput`, the RPC command surface supports `prompt`, `follow_up`, `steer`, `abort`, `new_session`, and `switch_session`, and GSD's workflow triggers (`/gsd auto`, `/gsd`, `/gsd next`, `/gsd stop`) are slash commands handled by the agent when sent as `prompt` type commands. The boot payload already carries `resumableSessions` with id, path, name, messageCount, isActive, and timestamps. The workspace index carries `active.phase` which determines what actions are available (planning → `/gsd`, executing/summarizing → `/gsd auto`, etc.).

What's missing: **zero clickable workflow controls exist anywhere in the skin.** The dashboard, roadmap, sidebar, and dual-terminal are purely read-only displays. There are no "Start Work," "Resume," "Continue," or "Stop" buttons. The only way to trigger GSD commands is typing in the terminal input. S05's job is to add intentional UI actions that map to the right GSD commands and session operations based on current state.

## Recommendation

Add workflow controls to three surfaces, using the existing `sendCommand` action as the transport:

1. **Dashboard — primary action bar.** Add a context-aware action section below the header that shows the right primary action based on `boot.workspace.active.phase` and `boot.auto`:
   - Auto-mode inactive + work available → "Start Work" (sends `prompt` with `/gsd auto`) or "Step" (sends `/gsd next`)
   - Auto-mode active → "Stop" (sends `/gsd stop`)
   - Auto-mode paused → "Resume" (sends `/gsd auto`)
   - No milestones → "Initialize Project" (sends `/gsd`)
   - Phase-specific labels from `describeNextUnit` are not available client-side, but phase-based labeling is (planning → "Plan Next Slice", executing → "Execute Next Task", etc.)

2. **Dashboard — session picker.** Add a sessions section showing `boot.resumableSessions` with ability to switch (`switch_session` command) or start new (`new_session` command). Shows active session highlighted.

3. **Sidebar — quick action button.** Add a small primary-action button below the explorer section that mirrors the dashboard's primary action (start/resume/stop) for one-click access from any view.

The approach reuses the existing command transport entirely — no new API endpoints needed. Controls just construct the right `WorkspaceBridgeCommand` and call `sendCommand`.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Sending commands to the bridge | `sendCommand` in `GSDWorkspaceStore` | Already handles commandInFlight tracking, terminal lines, error surfacing, and response parsing |
| Building prompt commands | `buildPromptCommand` in the store | Handles prompt vs follow_up switching based on session state |
| Phase/scope labeling | `getCurrentScopeLabel`, `getCurrentSlice` in the store | Already formats the active scope for display |
| Session labels | `getSessionLabelFromBridge` | Renders session names/IDs consistently |
| Status derivation | `getMilestoneStatus`, `getSliceStatus`, `getTaskStatus` in `workspace-status.ts` | Already used by sidebar and roadmap |
| Duration/cost/token formatting | `formatDuration`, `formatCost`, `formatTokens` | Handle edge cases |
| Boot payload refresh | `refreshBoot({ soft: true })` | Refreshes workspace state after session switches without re-seeding terminal |

## Existing Code and Patterns

- `web/components/gsd/terminal.tsx` — **the pattern for command dispatch.** Uses `useGSDWorkspaceActions().sendCommand` with `buildPromptCommand`, handles input modes, disables during `commandInFlight`, shows command-in-flight indicators. Workflow buttons should follow the same `sendCommand → commandInFlight → response terminal line` flow.
- `web/lib/gsd-workspace-store.tsx` — `sendCommand` is the single gateway. It sets `commandInFlight`, logs an input terminal line, POSTs to `/api/session/command`, logs the response, and clears `commandInFlight`. All state needed for action availability is already on `WorkspaceStoreState`: `boot.workspace.active.phase`, `boot.auto.active`, `boot.auto.paused`, `boot.resumableSessions`, `boot.bridge.sessionState`.
- `web/components/gsd/sidebar.tsx` — already renders milestones/slices from real data and has nav items with `onViewChange`. The quick-action button should go below the explorer section, using the same pattern.
- `web/components/gsd/dashboard.tsx` — already reads all the state needed (auto, workspace, bridge). The action bar goes naturally between the header and the metrics grid.
- `packages/pi-coding-agent/src/modes/rpc/rpc-types.ts` — `RpcCommand` type defines the complete command surface. Key commands for S05: `prompt` (for GSD slash commands), `switch_session`, `new_session`.
- `src/resources/extensions/gsd/workspace-index.ts` — `getSuggestedNextCommands` maps phase to suggested commands. This logic must be replicated client-side since the function runs server-side and is not exposed via the boot payload.

## Constraints

- **D002 — preserve the exact existing skin.** Action controls are additive to the existing layout. Dashboard header, metrics grid, session card, and activity section stay intact. Action bar slots in as a new section, not a replacement.
- **R008 — no mock/live mixing.** All action labels and availability must derive from real store state, not hardcoded scenarios.
- **Command transport is fire-and-forget for prompts.** Sending `/gsd auto` as a `prompt` command returns `{ success: true }` immediately — the actual GSD workflow starts asynchronously. The UI should show the command was accepted, not wait for workflow completion.
- **`commandInFlight` is a single string.** Only one command can be in-flight at a time. Action buttons must be disabled while any command is in-flight (same as terminal input).
- **Phase is available but `describeNextUnit` is not.** The boot payload has `workspace.active.phase` but not the rich `describeNextUnit` output from `auto.ts`. Phase-based action labeling is possible and sufficient; exact unit descriptions would require a new server endpoint. Stay with phase-based labels for S05.
- **`switch_session` is an RPC-level command.** Unlike `/gsd auto` (which is a slash command sent via `prompt`), session switching uses `{ type: "switch_session", sessionPath: "..." }` directly. The session path comes from `boot.resumableSessions[n].path`.
- **Onboarding lock must be respected.** The `sendCommand` → `/api/session/command` route already gates on onboarding lock and returns `onboarding_locked` responses. Action buttons should also visually disable when `boot.onboarding.locked` is true.
- **`boot.auto` is zeros when auto-mode isn't active.** This is correct behavior — the dashboard already handles this. Action availability derives from `auto.active` and `auto.paused`, not from cost/token values.

## Common Pitfalls

- **Sending GSD commands as raw RPC commands instead of prompts** — `/gsd auto`, `/gsd stop`, `/gsd next` are not RPC command types. They must be sent as `{ type: "prompt", message: "/gsd auto" }`. The bridge's `sendInput` forwards them to the RPC subprocess's stdin, and the agent's command system handles them.
- **Trying to detect auto-mode start/stop reactively** — After sending `/gsd auto`, the auto-mode state change is reflected in `boot.auto` only after `refreshBoot`. The SSE stream may emit events (agent_start, tool_execution_start) but there's no explicit "auto_started" event. The soft-refresh polling already in the store handles this. Don't add custom polling.
- **Showing stale session list after switch** — After `switch_session` succeeds, the `resumableSessions` list in `boot` is stale. `refreshBoot({ soft: true })` should be called after a successful session switch to update the session list and workspace state.
- **Over-engineering action state** — The action bar is essentially a phase→command mapping. Don't build a state machine for it. Derive the primary action directly from `boot.workspace.active.phase` + `boot.auto.active` + `boot.auto.paused` on every render.
- **Disabling controls for wrong reasons** — Only disable when `commandInFlight` is non-null, `bootStatus !== "ready"`, or `boot.onboarding.locked`. Don't disable based on session streaming state — the user should be able to stop auto-mode even while streaming.

## Open Risks

- **Session switch may disrupt streaming.** If the user switches sessions while the agent is streaming, the behavior is undefined from the UI perspective. The RPC layer may handle it, but the UI should probably warn or prevent switching during active streaming. This needs to be tested.
- **`/gsd auto` inside web-mode bridge subprocess.** The GSD extension's `startAuto` runs in the extension context of the RPC subprocess, not in the web host. It should work since the bridge subprocess is a full GSD RPC session, but the auto-mode dashboard data path (`getAutoDashboardData`) is injectable and currently returns zeros. After `/gsd auto` is triggered, the dashboard may not reflect auto-mode state until the bridge exposes it. This is an existing gap from S01/S04 — S05 should document it clearly but not block on fixing it.
- **Concurrent action attempts.** The `commandInFlight` guard prevents concurrent commands, but rapid clicking could still feel janky. Consider optimistic UI for the primary action (immediately show "stopping…" before the response).

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Next.js App Router | `wshobson/agents@nextjs-app-router-patterns` | available (8.4K installs) |
| React state management | `wshobson/agents@react-state-management` | available (4.1K installs) |
| Frontend design | bundled `frontend-design` | installed (not relevant — D002 says preserve exact skin) |

No skills are directly relevant enough to recommend installing. The work is integration-focused — mapping existing state to new button controls using the existing command transport.

## Sources

- All findings from direct codebase exploration — no external sources needed.
- Key files examined: `gsd-workspace-store.tsx` (1745 lines — full store surface), `terminal.tsx` (command dispatch pattern), `dashboard.tsx` (current read-only layout), `sidebar.tsx` (explorer + nav), `roadmap.tsx` (read-only display), `dual-terminal.tsx` (auto pane), `app-shell.tsx` (view routing), `bridge-service.ts` (boot payload, command forwarding), `rpc-types.ts` (full RPC command surface), `auto.ts` (`startAuto`, `stopAuto`, `describeNextUnit`, phase→action mapping), `commands.ts` (`/gsd` slash command routing), `workspace-index.ts` (`getSuggestedNextCommands`, phase-based suggestions), `workspace-status.ts` (status helpers), `types.ts` (Phase type).

## Requirements Targeted

| Requirement | Role | How S05 advances it |
|---|---|---|
| R004 — Primary GSD workflow runs end-to-end in-browser | supporting | Users can now start/resume/stop work from UI controls instead of typing hidden commands |
| R005 — Existing skin becomes a live workspace | supporting | Dashboard and sidebar gain actionable workflow controls backed by real state |
| R007 — Session continuity supports resume inside web mode | supporting | Session picker enables switching to/resuming previous sessions from the UI |
| R009 — Web mode feels snappy and fast | supporting | Action buttons provide direct one-click workflow entry without requiring terminal knowledge |
