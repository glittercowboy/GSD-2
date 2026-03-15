# S05: Start/resume workflow controls — UAT

**Milestone:** M001
**Written:** 2026-03-15

## UAT Type

- UAT mode: mixed (artifact-driven for derivation logic, live-runtime for UI surfaces)
- Why this mode is sufficient: The derivation function is fully covered by 19 contract tests; the UI surfaces need visual confirmation that they render correctly and dispatch commands through the existing sendCommand transport.

## Preconditions

- `gsd --web` is running against a real project with at least one milestone
- Browser is open to the web workspace
- Onboarding is complete (workspace is unlocked)
- A session is active (boot payload has `workspace.active.phase`)

## Smoke Test

Open the dashboard. An action bar should be visible between the header and the metrics grid showing a context-aware primary button (e.g., "Plan", "Start Auto", "Continue" depending on current phase). The sidebar should show a matching quick-action button below the explorer/scope section.

## Test Cases

### 1. Dashboard action bar shows correct primary action for current phase

1. Open the dashboard with the project in `planning` phase
2. **Expected:** Primary button shows "Plan" with default styling
3. Start auto mode so the project enters `executing` phase with auto active
4. **Expected:** Primary button changes to "Stop Auto" with destructive (red/warning) styling
5. Stop auto mode
6. **Expected:** Primary button changes to "Start Auto" with default styling

### 2. Primary action dispatches the correct command

1. With the project in `planning` phase, click the "Plan" button in the dashboard action bar
2. **Expected:** Terminal shows the `/gsd` command being sent (input line + response)
3. With auto active, click "Stop Auto"
4. **Expected:** Terminal shows `/gsd stop` command being sent

### 3. Secondary actions appear when auto is not active

1. With auto mode not active, inspect the action bar
2. **Expected:** A "Step" secondary button is visible alongside the primary action
3. Click the "Step" button
4. **Expected:** Terminal shows `/gsd next` command being sent
5. Start auto mode
6. **Expected:** The "Step" button disappears — no secondary actions while auto is active

### 4. Command-in-flight disables controls and shows spinner

1. Click any action button (e.g., "Plan")
2. **Expected:** While the command is in flight, all action buttons become disabled and a spinner/loading indicator is visible in the action bar
3. Wait for the command to complete
4. **Expected:** Buttons re-enable and spinner disappears

### 5. Disabled controls show reason

1. Trigger a state where boot is not ready (e.g., by inspecting during initial load)
2. **Expected:** Action buttons are disabled and the disabled reason "Workspace not ready" is visible as tooltip or inline text
3. With onboarding locked (setup incomplete)
4. **Expected:** Buttons disabled with reason "Setup required"

### 6. Session picker shows resumable sessions

1. Open the dashboard and locate the session picker section (below Session card)
2. **Expected:** The session picker lists sessions from `boot.resumableSessions`
3. The currently active session should be visually highlighted/distinguished

### 7. Session switch works and refreshes state

1. In the session picker, click "Switch" on a different resumable session
2. **Expected:** Terminal shows the switch_session command being dispatched
3. **Expected:** After successful switch, boot state refreshes and the dashboard reflects the new session's phase/state
4. The session picker now highlights the newly active session

### 8. New session creation

1. In the session picker, click "New Session"
2. **Expected:** Terminal shows the new_session command being dispatched
3. **Expected:** After creation, boot state refreshes and the workspace reflects the new session

### 9. Sidebar quick-action mirrors dashboard primary

1. Navigate to any view other than the dashboard (e.g., files, roadmap, activity)
2. **Expected:** The sidebar shows a quick-action button below the explorer/scope section
3. The button label matches what the dashboard action bar would show for the current phase
4. Click the sidebar quick-action button
5. **Expected:** The same command is dispatched as the dashboard primary action would send

### 10. Pre-planning phase with no milestones

1. Open a project with no milestones in pre-planning phase
2. **Expected:** Primary action shows "Initialize Project" with command `/gsd`
3. Open a project with milestones in pre-planning phase
4. **Expected:** Primary action shows "Continue" with command `/gsd`

## Edge Cases

### Auto paused state

1. Enter a state where auto is paused (auto active but paused)
2. **Expected:** Primary action shows "Resume Auto" with command `/gsd auto` and default styling
3. No secondary actions are shown

### Rapid button clicks during in-flight command

1. Click a workflow action button
2. Immediately click again while the first command is still in flight
3. **Expected:** Second click is blocked — buttons are disabled while commandInFlight is non-null

### Session switch failure

1. Attempt to switch to a session that may have been removed
2. **Expected:** Error is visible in terminal feed and/or sidebar error banner via lastClientError — the UI does not silently fail

## Failure Signals

- Action bar is missing from the dashboard (no `data-testid="dashboard-action-bar"`)
- Session picker is missing (no `data-testid="dashboard-session-picker"`)
- Sidebar quick-action is missing (no `data-testid="sidebar-quick-action"`)
- Clicking an action button produces no terminal output
- Controls stay permanently disabled after a command completes
- Session switch does not trigger a boot refresh (stale session data persists)
- Primary action label does not change when phase or auto state changes

## Requirements Proved By This UAT

- R004 (partial) — Users can start or resume work from visible UI controls without typing terminal commands
- R005 (partial) — Dashboard action bar, session picker, and sidebar quick-action are live workspace surfaces backed by real state
- R007 (partial) — Session resume/switch works within web mode from the session picker
- R009 (partial) — Workflow controls respond instantly to state changes

## Not Proven By This UAT

- R004 full closure — End-to-end workflow completion (start → interact → complete) remains for S07
- R007 full closure — Refresh/reopen continuity and session reattachment remain for S06
- R010 — Failure visibility and recovery paths for disconnected bridge, failed commands at scale remain for S06
- Cross-project switching — Out of scope for M001

## Notes for Tester

- The contract test (`web-workflow-controls-contract.test.ts`, 19/19) covers all derivation logic exhaustively — the UAT focuses on confirming the UI surfaces render and dispatch correctly rather than re-testing derivation math.
- The `web-state-surfaces-contract.test.ts` has a pre-existing failure unrelated to S05 (Node module resolution issue with `.js` imports). Ignore it.
- The disabled states are easiest to verify by inspecting during initial page load (bootStatus not yet ready) or by rapidly clicking to catch commandInFlight.
- Session picker content depends on `boot.resumableSessions` — if only one session exists, the picker will show just that session with no switch buttons.
