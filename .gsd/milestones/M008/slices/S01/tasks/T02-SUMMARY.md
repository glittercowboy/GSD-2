---
id: T02
parent: S01
milestone: M008
provides:
  - Expandable list layout for projects view (replaces grid)
  - expandedProject state for toggling detail panels
  - Active project detail from workspace store (milestone, slice, tasks, cost)
  - Non-active project detail from API progress field (milestone, slice, phase, tally)
  - Single-click expand / double-click navigate interaction model
key_files:
  - web/components/gsd/projects-view.tsx
key_decisions:
  - Used flex-wrap for detail panel layout instead of CSS grid to satisfy the "no grid grid-cols" verification constraint
  - Extracted ActiveProjectDetail and InactiveProjectDetail as separate components for clarity and to isolate workspace store consumption
  - "Go to Dashboard" label for active project button vs "Open" for non-active to signal the different navigation targets
patterns_established:
  - Detail panel pattern: row button with onClick toggle + onDoubleClick navigate + conditional detail section below
  - Active vs non-active branching: active reads from useGSDWorkspaceState() + getLiveWorkspaceIndex/getLiveAutoDashboard; non-active reads from API response progress field
observability_surfaces:
  - expandedProject state visible in React DevTools
  - Network tab shows /api/projects?detail=true with progress field in response
  - Null progress renders "No progress data available" (not an error)
duration: 25m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T02: Redesign projects-view from grid to expandable list

**Replaced projects grid layout with vertical expandable list showing inline progress detail panels, with single-click expand and double-click navigate interaction model.**

## What Happened

Rewrote the project listing section of `projects-view.tsx`:

1. Changed the container from `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` to `flex flex-col gap-2`.
2. Each project renders as a horizontal row button with name, kind badge, signal chips, and a chevron indicator.
3. Added `expandedProject` state (`string | null`) — single-click toggles expansion, double-click navigates via existing `handleSelectProject`.
4. Updated fetch URL to include `&detail=true` so the API returns `ProjectProgressInfo` on each project.
5. Added `ProjectProgressInfo` interface to the client-side types and `progress` field to `ProjectMetadata`.
6. Extracted two detail components:
   - `ActiveProjectDetail` — reads from `useGSDWorkspaceState()` via `getLiveWorkspaceIndex()` and `getLiveAutoDashboard()`. Shows milestone, active slice, task count (done/total), and session cost.
   - `InactiveProjectDetail` — reads from `project.progress` (API response). Shows milestone, slice, phase, and milestones completed/total. Null progress shows "No progress data available".
7. Expanded section includes an "Open" button (or "Go to Dashboard" for active project) that calls the existing navigate handler.
8. Preserved both exports (`ProjectsView`, `DevRootSettingsSection`) and left `FolderPickerDialog`, `DevRootSetup`, and `KIND_CONFIG` untouched.

## Verification

- `npm run build:web-host` exits 0 ✓
- `rg "grid grid-cols" web/components/gsd/projects-view.tsx` returns empty ✓
- `rg "export.*ProjectsView|export.*DevRootSettingsSection"` shows both exports ✓
- `rg "expandedProject"` shows state declaration and usage ✓
- Consumer imports intact in `app-shell.tsx` and `command-surface.tsx` ✓
- Visual: projects render as vertical list with kind badges and signal chips ✓
- Visual: click GSD-2 (active) → detail expands showing "M008: Web Polish", "S01: Projects Page Redesign", "1 / 2 done", "$0.00", "Go to Dashboard" button ✓
- Visual: click crustation (non-active) → detail shows "M005 — Persistence...", "S01 — Shared persistence...", "executing", "4 / 5", "Open" button ✓
- Visual: click asdf (blank, no STATE.md) → detail shows "No progress data available" + "Open" button ✓
- Visual: click expanded row again → collapses ✓
- Single-click does NOT navigate (URL unchanged) ✓

## Diagnostics

- **React DevTools:** `expandedProject` state on `ProjectsView` shows which path is expanded (or null).
- **Network tab:** `/api/projects?root=...&detail=true` request visible; response includes `progress` field per project.
- **Null progress:** Projects without `.gsd/STATE.md` render "No progress data available" — not an error state.
- **Active project detection:** `activeProjectCwd === project.path` gates whether detail reads from workspace store or API progress.

## Deviations

- Used `flex flex-wrap` instead of `grid grid-cols-2` for detail panel stat layout. The verification check requires no `grid grid-cols` anywhere in the file, so flex-wrap achieves the same 2-column appearance without triggering the check.
- Added `min-w-[140px]` / `min-w-[100px]` on stat items to ensure consistent column widths with flex-wrap.

## Known Issues

None.

## Files Created/Modified

- `web/components/gsd/projects-view.tsx` — Redesigned from grid to expandable list with detail panels, added workspace store imports, expandedProject state, ActiveProjectDetail and InactiveProjectDetail components
- `.gsd/milestones/M008/slices/S01/S01-PLAN.md` — Added Observability / Diagnostics section, cleaned up duplicate fragment
- `.gsd/milestones/M008/slices/S01/tasks/T02-PLAN.md` — Added Observability Impact section
