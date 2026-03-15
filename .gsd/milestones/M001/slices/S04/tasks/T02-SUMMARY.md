---
id: T02
parent: S04
milestone: M001
provides:
  - Dashboard view wired to real boot.auto, workspace index, and terminalLines
  - DualTerminal left pane reads real auto-mode state from store
  - DualTerminal right pane delegates to S03 Terminal component
key_files:
  - web/components/gsd/dashboard.tsx
  - web/components/gsd/dual-terminal.tsx
key_decisions:
  - Dashboard model-usage panel replaced with Session info card showing model/cost/tokens since per-model breakdown data isn't available from boot.auto
  - Right pane label changed from "Commands" to "Live Terminal" to reflect it now hosts the full Terminal component
patterns_established:
  - Dashboard metric cards consume formatDuration/formatCost/formatTokens from workspace store for consistent formatting
  - Dashboard current-slice tasks use getTaskStatus from workspace-status.ts (same shared helpers as Roadmap)
  - DualTerminal AutoTerminal pane derives all state from boot.auto + terminalLines — no local simulation state
observability_surfaces:
  - Dashboard metrics match boot.auto values — verifiable via curl /api/boot | jq '.auto'
  - Dashboard tasks derive from getCurrentSlice(workspace).tasks — empty state renders when no active slice
  - DualTerminal left pane shows real auto status/cost/tokens — no simulated intervals
duration: ~12min
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T02: Wire Dashboard and DualTerminal views to real store data

**Replaced all hardcoded mock arrays and simulation code in Dashboard and DualTerminal with real store data from boot.auto, workspace index, and terminalLines.**

## What Happened

Dashboard was rewritten to consume `useGSDWorkspaceState()`. Metric cards now show real elapsed/cost/tokens from `boot.auto` using the shared format helpers. The progress card derives from current-slice task completion. The current-slice section renders tasks from `getCurrentSlice(workspace)?.tasks` with status derived via `getTaskStatus` from the shared helpers. The old `modelUsage` array was replaced with a Session info card showing model/cost/tokens from the real bridge state. Recent activity shows the last 6 real `terminalLines`. The header shows the real scope label and branch.

DualTerminal was rewritten to remove all simulation. The `AutoModeState` interface, two `setInterval` effects for phase cycling and cost ticking, the `GSD_LOGO` constant, and the entire `CommandTerminal` component were deleted. The left pane (`AutoTerminal`) reads directly from `boot.auto` for active/paused state, elapsed, cost, tokens, and current unit. It renders real `terminalLines` with proper type-based coloring. The right pane now imports and renders the S03 `Terminal` component instead of a fake command interface.

Both views handle inactive/empty state cleanly — zeros for metrics, empty-state messages for tasks and activity.

## Verification

- `npm run build:web-host` compiles with zero errors
- `grep -rn 'const recentActivity\|const currentSliceTasks\|const modelUsage\|AutoModeState.*idle.*working\|setInterval' web/components/gsd/dashboard.tsx web/components/gsd/dual-terminal.tsx` returns empty
- Slice-level grep: only `files-view.tsx` still has mock data (`gsdFiles`), which is expected — it's a later task
- `web-bridge-contract.test.ts` — 4/4 pass
- `web-onboarding-contract.test.ts` — 6/6 pass
- `web-live-interaction-contract.test.ts` — 10/10 pass
- `web-state-surfaces-contract.test.ts` — does not exist yet (created in a later task)

## Diagnostics

- Dashboard metrics reflect `boot.auto` values — inspect via `curl /api/boot | jq '.auto'`
- Dashboard tasks derive from workspace index — inspect via `curl /api/boot | jq '.workspace.active'` and `.workspace.milestones[].slices[].tasks`
- Dashboard recent activity shows same `terminalLines` as Terminal and Activity views
- DualTerminal left pane shows auto status directly from store — no local simulation to debug
- Both views render empty/inactive states when boot is null or auto is inactive

## Deviations

- The old `modelUsage` card showed per-model/per-phase token breakdown. Since `boot.auto` only provides aggregate `totalCost` and `totalTokens`, the panel was replaced with a simpler Session card showing model label, total cost, and total tokens. This is more honest — the data shape doesn't support per-model breakdown.

## Known Issues

None.

## Files Created/Modified

- `web/components/gsd/dashboard.tsx` — rewired to store data, all mock arrays removed, metric cards use formatters, tasks from getCurrentSlice, activity from terminalLines
- `web/components/gsd/dual-terminal.tsx` — left pane reads real auto state, right pane delegates to Terminal, all simulation code and CommandTerminal removed
- `.gsd/milestones/M001/slices/S04/tasks/T02-PLAN.md` — added Observability Impact section
