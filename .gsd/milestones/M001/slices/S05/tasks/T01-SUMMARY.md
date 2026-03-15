---
id: T01
parent: S05
milestone: M001
provides:
  - Pure workflow action derivation function (deriveWorkflowAction)
  - Dashboard action bar with primary + secondary workflow buttons
  - Dashboard session picker with switch and new-session controls
  - Sidebar quick-action button mirroring dashboard primary action
  - Contract test covering all phase/auto/disabled combinations
key_files:
  - web/lib/workflow-actions.ts
  - web/components/gsd/dashboard.tsx
  - web/components/gsd/sidebar.tsx
  - src/tests/web-workflow-controls-contract.test.ts
key_decisions:
  - deriveWorkflowAction kept as a plain TypeScript module with no React dependency for testability
  - Disabled priority order: commandInFlight > bootStatus > onboardingLocked (most transient condition wins)
  - Session switch uses direct RPC ({ type: "switch_session" }), new session uses direct RPC ({ type: "new_session" }), workflow commands use buildPromptCommand for prompt-type routing
patterns_established:
  - Pure derivation function pattern for UI state that depends on multiple store fields — extract to a testable module, test without React, consume in multiple components
observability_surfaces:
  - disabledReason field surfaces why workflow controls are disabled (inspectable in tests and as UI tooltip)
  - commandInFlight spinner gives visual feedback that a command was received
  - Terminal audit trail via existing sendCommand logging (input + response lines)
  - Failed commands surface via lastClientError and error terminal lines
duration: 20m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: Add workflow action derivation, dashboard controls, sidebar quick action, and contract test

**Added pure `deriveWorkflowAction` function, dashboard action bar with session picker, and sidebar quick-action button — all backed by existing store state and `sendCommand` transport.**

## What Happened

Created `web/lib/workflow-actions.ts` with a pure `deriveWorkflowAction` function that maps `(phase, auto state, onboarding lock, commandInFlight, bootStatus, hasMilestones)` to a primary action (label + command + variant), secondary actions, and disabled state with reason. The function covers all 14 Phase values through explicit matches for planning/executing/summarizing/pre-planning and a catch-all "Continue" for the rest.

Extended `dashboard.tsx` with:
1. An action bar between the header and metrics grid showing the primary action button (with destructive styling for "Stop Auto"), secondary action buttons (e.g., "Step"), a loading spinner during `commandInFlight`, and the disabled reason as text/tooltip.
2. A session picker below the Session card showing `boot.resumableSessions` with active session highlighting, "Switch" buttons that call `switch_session` RPC + `refreshBoot({ soft: true })`, and a "New Session" button that calls `new_session` RPC + `refreshBoot`.

Extended `sidebar.tsx` with a compact quick-action button below the explorer/scope section that mirrors the dashboard's primary action, using the same `deriveWorkflowAction` derivation and `sendCommand` dispatch.

## Verification

- `node --test --experimental-strip-types src/tests/web-workflow-controls-contract.test.ts` — 19/19 tests pass covering all phase→action mappings, secondary actions, disabled conditions with reason strings, and disabled priority ordering
- `npm run build:web-host` — builds cleanly with all new components
- `node --test --experimental-strip-types src/tests/web-state-surfaces-contract.test.ts` — pre-existing failure (module resolution for `files.js`), not caused by this task (verified by testing before and after changes)

## Diagnostics

- Inspect `deriveWorkflowAction` output for any state combination by importing the function and calling it with a state snapshot — no React or DOM needed
- Dashboard action bar has `data-testid="dashboard-action-bar"`, session picker has `data-testid="dashboard-session-picker"`, sidebar button has `data-testid="sidebar-quick-action"` — all queryable in browser tests
- commandInFlight state visible as a spinner in both the dashboard action bar and sidebar button
- disabledReason visible as tooltip text on disabled buttons and as inline text in the action bar

## Deviations

None.

## Known Issues

- `web-state-surfaces-contract.test.ts` has a pre-existing failure due to Node module resolution of `.js` extension imports in `workspace-index.ts`. Not related to this task.

## Files Created/Modified

- `web/lib/workflow-actions.ts` — new pure derivation function for workflow actions
- `web/components/gsd/dashboard.tsx` — added action bar, session picker, workflow action imports
- `web/components/gsd/sidebar.tsx` — added quick-action button below explorer section
- `src/tests/web-workflow-controls-contract.test.ts` — new contract test with 19 cases
- `.gsd/milestones/M001/slices/S05/S05-PLAN.md` — added Observability/Diagnostics section and failure-path verification
- `.gsd/milestones/M001/slices/S05/tasks/T01-PLAN.md` — added Observability Impact section
