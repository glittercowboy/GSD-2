---
id: S05
parent: M001
milestone: M001
provides:
  - Pure deriveWorkflowAction function mapping phase/auto/onboarding/boot state to primary + secondary actions
  - Dashboard action bar with context-aware primary button, secondary actions, command-in-flight spinner, and disabled reason
  - Dashboard session picker with resumable session list, switch, and new-session controls
  - Sidebar quick-action button mirroring the dashboard primary action from any view
  - Contract test covering 19 cases across all phase/auto/disabled combinations
requires:
  - slice: S03
    provides: sendCommand, buildPromptCommand, commandInFlight, live terminal/prompt execution surface
  - slice: S04
    provides: boot.workspace.active.phase, boot.auto, boot.resumableSessions, boot.onboarding.locked, bootStatus, refreshBoot
affects:
  - S06
  - S07
key_files:
  - web/lib/workflow-actions.ts
  - web/components/gsd/dashboard.tsx
  - web/components/gsd/sidebar.tsx
  - src/tests/web-workflow-controls-contract.test.ts
key_decisions:
  - D018 — Pure derivation function pattern for workflow controls, no React dependency, consumed by multiple UI surfaces
  - Disabled priority order: commandInFlight > bootStatus > onboardingLocked (most transient wins)
  - Session switch uses direct RPC payloads; workflow commands use buildPromptCommand for prompt-type routing
patterns_established:
  - Pure derivation function pattern — extract UI state logic that depends on multiple store fields to a testable module, test without React, consume in multiple components
observability_surfaces:
  - disabledReason field surfaces why controls are disabled (inspectable in tests and as UI tooltip)
  - commandInFlight spinner gives visual feedback that a command was received
  - Terminal audit trail via existing sendCommand logging (input + response lines)
  - Failed commands surface via lastClientError and error terminal lines
drill_down_paths:
  - .gsd/milestones/M001/slices/S05/tasks/T01-SUMMARY.md
duration: 20m
verification_result: passed
completed_at: 2026-03-15
---

# S05: Start/resume workflow controls

**Added context-aware workflow action bar, session picker, and sidebar quick-action button — all derived from real store state through the existing sendCommand transport.**

## What Happened

Created `web/lib/workflow-actions.ts` with a pure `deriveWorkflowAction` function that maps workspace state (phase, auto active/paused, onboarding lock, commandInFlight, bootStatus, hasMilestones) to a primary action (label + command + variant), secondary actions, and disabled state with reason string. The function covers all Phase values through explicit matches for planning/executing/summarizing/pre-planning and a catch-all "Continue" for the rest. Auto-active maps to "Stop Auto" (destructive), auto-paused to "Resume Auto", and non-auto phases to their natural GSD commands.

Extended `dashboard.tsx` with two new sections: (1) an action bar between the header and metrics grid showing the primary action button with destructive styling for Stop, secondary action buttons (Step), a loading spinner during commandInFlight, and the disabledReason as tooltip/text; (2) a session picker below the Session card showing resumableSessions with active session highlighting, Switch buttons calling `switch_session` RPC + `refreshBoot({ soft: true })`, and a New Session button calling `new_session` RPC + `refreshBoot`.

Extended `sidebar.tsx` with a compact quick-action button below the explorer/scope section that mirrors the dashboard's primary action using the same derivation function and sendCommand dispatch.

All actions route through the existing `sendCommand` transport — no new API endpoints were added.

## Verification

- `node --test --experimental-strip-types src/tests/web-workflow-controls-contract.test.ts` — 19/19 tests pass covering phase→action mappings, secondary actions, disabled conditions with reason strings, and disabled priority ordering
- `npm run build:web-host` — builds cleanly with all new components, standalone host staged successfully

## Requirements Advanced

- R004 — Start/resume workflow controls are now wired to real GSD commands via sendCommand, advancing the "primary GSD workflow runs end-to-end in browser" requirement. Full closure remains with S07.
- R005 — Dashboard action bar, session picker, and sidebar quick-action are live workspace surfaces backed by real store state, not mock data.
- R007 — Session picker enables resume/switch within web mode. Full continuity across refresh/reopen closes in S06.
- R009 — Action derivation is synchronous; controls respond instantly to store changes with no additional network round-trips.

## Requirements Validated

- None newly validated (S05 advances but does not fully close any requirement on its own).

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

- None.

## Deviations

None.

## Known Limitations

- Session switch relies on `refreshBoot({ soft: true })` to update stale state — if boot refresh fails silently, the UI may show stale session context until the next full boot cycle.
- `web-state-surfaces-contract.test.ts` has a pre-existing failure due to Node module resolution of `.js` extension imports in `workspace-index.ts` — not caused by this slice.

## Follow-ups

- S06 should add failure visibility for session switch failures and boot refresh errors so they are never silent.
- S07 should exercise the full start → interact → complete workflow using these controls against a real project.

## Files Created/Modified

- `web/lib/workflow-actions.ts` — new pure derivation function for workflow actions
- `web/components/gsd/dashboard.tsx` — added action bar + session picker sections
- `web/components/gsd/sidebar.tsx` — added quick-action button below explorer section
- `src/tests/web-workflow-controls-contract.test.ts` — new contract test with 19 cases

## Forward Intelligence

### What the next slice should know
- All workflow actions route through `sendCommand`/`buildPromptCommand` — there are no dedicated workflow endpoints. S06 failure visibility should hook into the existing `lastClientError` + terminal error line pattern.
- `deriveWorkflowAction` is a pure function with no side effects — it can be called from any component or test without React context.
- Session switch calls `refreshBoot({ soft: true })` after success, but there is no retry or error surface for that refresh yet.

### What's fragile
- The `refreshBoot` call after session switch has no error handling beyond what the store already provides — if it fails, the UI silently shows stale data until the next SSE snapshot or manual refresh.
- The `commandInFlight` guard prevents double-sends but relies on the command response arriving — a hung command could leave controls permanently disabled until the user refreshes.

### Authoritative diagnostics
- `data-testid="dashboard-action-bar"`, `data-testid="dashboard-session-picker"`, `data-testid="sidebar-quick-action"` — all queryable in browser tests for verifying presence and state.
- `deriveWorkflowAction` can be imported and called directly to inspect derived state for any input combination without DOM.

### What assumptions changed
- No assumptions changed — the slice plan accurately predicted that no new API endpoints were needed and that `sendCommand` would be sufficient for all workflow actions.
