---
estimated_steps: 6
estimated_files: 4
---

# T01: Add workflow action derivation, dashboard controls, sidebar quick action, and contract test

**Slice:** S05 — Start/resume workflow controls
**Milestone:** M001

## Description

Add the complete workflow controls surface for S05. This is one task because the work is small and tightly coupled: a pure derivation function (~30 lines), three additive UI surfaces (~60 lines each), and a contract test (~100 lines). No new API endpoints or store fields are needed — everything maps existing state to `sendCommand` calls.

The core logic is `deriveWorkflowAction`: a pure function that takes phase, auto state, onboarding lock, commandInFlight, and bootStatus, and returns the primary action (label + command + icon) plus optional secondary actions and disabled state. This function is the only new logic — the rest is rendering and calling `sendCommand`.

## Steps

1. **Create `web/lib/workflow-actions.ts`** with `deriveWorkflowAction` pure function.
   - Input: `{ phase, autoActive, autoPaused, onboardingLocked, commandInFlight, bootStatus, hasMilestones }`
   - Output: `{ primary: { label, command, variant } | null, secondaries: { label, command }[], disabled: boolean, disabledReason?: string }`
   - Phase→command mapping:
     - `auto.active && !auto.paused` → primary = "Stop Auto" sending `/gsd stop`
     - `auto.paused` → primary = "Resume Auto" sending `/gsd auto`
     - `!auto.active && phase === "planning"` → primary = "Plan" sending `/gsd`
     - `!auto.active && (phase === "executing" || phase === "summarizing")` → primary = "Start Auto" sending `/gsd auto`
     - `!auto.active && phase === "pre-planning" && !hasMilestones` → primary = "Initialize Project" sending `/gsd`
     - `!auto.active && other phases` → primary = "Continue" sending `/gsd`
   - Secondary actions: when auto is not active and primary isn't already `/gsd next`, include "Step" sending `/gsd next`
   - Disabled when: `commandInFlight !== null`, `bootStatus !== "ready"`, or `onboardingLocked`

2. **Add action bar to `dashboard.tsx`** between the header and metrics grid.
   - Import and call `deriveWorkflowAction` with values from store state
   - Render primary action as a button with appropriate styling (destructive variant for "Stop Auto", default for others)
   - Render secondary action buttons inline
   - Disable all buttons when `disabled` is true, show `disabledReason` as tooltip or sublabel
   - On click: call `sendCommand(buildPromptCommand(action.command, bridge))` for prompt-type commands; the command is a slash command string, so `buildPromptCommand` handles routing it as a `prompt` type
   - Show `commandInFlight` indicator (spinner or "Sending…") when a command is in-flight

3. **Add session picker to `dashboard.tsx`** below the existing Session card.
   - Show `boot.resumableSessions` list with session name/id, message count, and modified timestamp
   - Highlight the active session (`isActive`)
   - "Switch" button on non-active sessions calls `sendCommand({ type: "switch_session", sessionPath: session.path })`, then `refreshBoot({ soft: true })` on success
   - "New Session" button calls `sendCommand({ type: "new_session" })`, then `refreshBoot({ soft: true })` on success

4. **Add quick-action button to `sidebar.tsx`** below the explorer/scope section.
   - Import `deriveWorkflowAction` and call it with the same store state
   - Render a compact primary-action button (just icon + short label) matching the dashboard's primary action
   - Same disabled logic and `sendCommand` dispatch as dashboard
   - Use the sidebar's existing visual style (compact, 264px panel width)

5. **Write `src/tests/web-workflow-controls-contract.test.ts`**.
   - Import `deriveWorkflowAction` directly
   - Test all phase→action mappings:
     - planning + no auto → primary is "/gsd"
     - executing + no auto → primary is "/gsd auto"
     - auto active → primary is "/gsd stop"
     - auto paused → primary is "/gsd auto" (resume)
     - no milestones + pre-planning → primary is "/gsd"
   - Test disabled conditions:
     - commandInFlight non-null → disabled
     - bootStatus !== "ready" → disabled
     - onboardingLocked → disabled
   - Test secondary actions present when appropriate

6. **Verify**: run contract test, run `npm run build:web-host`, confirm no regressions in existing tests.

## Must-Haves

- [ ] `deriveWorkflowAction` pure function exists and correctly maps all phase/auto/lock combinations
- [ ] Dashboard action bar renders between header and metrics grid with primary + secondary actions
- [ ] Dashboard session picker shows resumable sessions with switch and new-session capabilities
- [ ] Sidebar quick-action button mirrors dashboard primary action
- [ ] All action buttons disabled during commandInFlight, before boot ready, and during onboarding lock
- [ ] Session switch calls `refreshBoot({ soft: true })` after success
- [ ] Contract test covers all phase→action mappings and disabled conditions
- [ ] `npm run build:web-host` succeeds

## Verification

- `node --test --experimental-strip-types src/tests/web-workflow-controls-contract.test.ts` — all cases pass
- `npm run build:web-host` — builds cleanly with new components
- Existing tests still pass: `node --test --experimental-strip-types src/tests/web-state-surfaces-contract.test.ts`

## Inputs

- `web/lib/gsd-workspace-store.tsx` — `sendCommand`, `buildPromptCommand`, `commandInFlight`, `refreshBoot`, boot payload types
- `web/components/gsd/dashboard.tsx` — current layout to add action bar and session picker to
- `web/components/gsd/sidebar.tsx` — current layout to add quick-action button to
- `src/resources/extensions/gsd/workspace-index.ts` — `getSuggestedNextCommands` phase→command mapping (source of truth for which commands apply to which phases)
- `src/resources/extensions/gsd/types.ts` — `Phase` type definition
- S03 Forward Intelligence — `commandInFlight` is a single string, `sendCommand` logs input terminal line and tracks in-flight state
- S05 Research — constraints on GSD commands as prompt-type (not direct RPC), `switch_session` as direct RPC command

## Observability Impact

- **New signal: `disabledReason`** — When `deriveWorkflowAction` returns `disabled: true`, the `disabledReason` field explains why (e.g., "Command in progress", "Workspace not ready", "Setup required"). This is surfaced as a tooltip/sublabel on disabled buttons, making it inspectable both visually and via contract test.
- **Existing signal preserved: terminal lines** — Every workflow action click dispatches through `sendCommand`, which already logs an input terminal line and a response terminal line. No new logging added; the existing audit trail covers workflow actions automatically.
- **Existing signal preserved: `commandInFlight`** — The action bar shows a spinner when a command is in flight, using the existing `commandInFlight` store field. A future agent can inspect `state.commandInFlight` to determine if a workflow action is pending.
- **Failure inspection:** Failed `sendCommand` calls write to `lastClientError` and emit an error terminal line. The sidebar error banner already reads `lastClientError`, so failed workflow actions are visible without additional instrumentation.

## Expected Output

- `web/lib/workflow-actions.ts` — pure derivation function, fully testable without React
- `web/components/gsd/dashboard.tsx` — extended with action bar and session picker sections
- `web/components/gsd/sidebar.tsx` — extended with quick-action button
- `src/tests/web-workflow-controls-contract.test.ts` — contract test covering derivation logic
