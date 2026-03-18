---
estimated_steps: 8
estimated_files: 1
---

# T02: Redesign projects-view from grid to expandable list

**Slice:** S01 — Projects Page Redesign
**Milestone:** M008

## Description

Rewrite the project listing section of `projects-view.tsx` from a `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` layout to a vertical `flex flex-col gap-2` list. Add an `expandedProject` state that tracks which project (by path) is currently expanded. Single-click toggles expansion; an explicit "Open" button or double-click navigates. The expanded detail section shows different content based on whether the project is active:

- **Active project:** Milestone/slice name, task progress (done/total), and cost — all read from the workspace store (`getLiveWorkspaceIndex()`, `getLiveAutoDashboard()`).
- **Non-active projects:** Milestone name, slice name, phase, and milestone tally — read from the `progress` field returned by the API (T01's work).

The fetch URL must add `?detail=true` to get progress data from the API.

Critical constraints:
- `ProjectsView` and `DevRootSettingsSection` exports MUST remain intact and functional.
- `FolderPickerDialog`, `DevRootSetup` components (~200 lines) must not be modified.
- `KIND_CONFIG` raw Tailwind accent colors must NOT be changed (S03 handles the color audit).
- Single-click must NOT navigate immediately — that's the current behavior being changed.

## Steps

1. Read `web/components/gsd/projects-view.tsx` fully to understand the current structure, especially `handleSelectProject`, the grid rendering section, and how `FolderPickerDialog`/`DevRootSetup` are composed.
2. Find the API fetch call and add `&detail=true` (or `?detail=true` as appropriate) to the URL so the response includes `progress` data.
3. Add `expandedProject` state: `const [expandedProject, setExpandedProject] = useState<string | null>(null)` — stores the path of the expanded project or null.
4. Replace the `grid grid-cols-*` container with `flex flex-col gap-2`.
5. Rewrite each project card as a list row:
   - Clickable row showing: project name (bold), kind badge (from `KIND_CONFIG`), signal chips, and a subtle chevron indicator (expanded/collapsed).
   - `onClick` toggles `expandedProject` — if already selected, set to null; otherwise set to this project's path.
   - `onDoubleClick` calls the existing navigate/select handler.
6. Below each row, conditionally render the expanded detail section when `expandedProject === project.path`:
   - If `activeProjectCwd === project.path` (active project): import and use `getLiveWorkspaceIndex()` and `getLiveAutoDashboard()` from `gsd-workspace-store.tsx`. Show current milestone name, active slice name, task counts (iterate `milestones[].slices[].tasks[].done`), and `formatCost(dashboard.totalCost)`.
   - Else (non-active): read from `project.progress` (the `ProjectProgressInfo` from T01). Show `activeMilestone`, `activeSlice`, `phase`, and `milestonesCompleted / milestonesTotal`.
   - Include an "Open" button that calls the existing project selection/navigation handler.
7. Verify both named exports (`ProjectsView`, `DevRootSettingsSection`) are still exported and not renamed.
8. Run `npm run build:web-host` to confirm the build passes.

## Must-Haves

- [ ] Grid layout replaced with vertical list (`flex flex-col`)
- [ ] `expandedProject` state toggles detail section on click
- [ ] Active project detail reads from workspace store (not API progress)
- [ ] Non-active project detail reads from API `progress` field
- [ ] Navigation requires explicit "Open" button or double-click (single click only expands)
- [ ] `ProjectsView` export preserved — used by `app-shell.tsx`
- [ ] `DevRootSettingsSection` export preserved — used by `command-surface.tsx`
- [ ] `FolderPickerDialog` and `DevRootSetup` untouched
- [ ] `KIND_CONFIG` colors untouched (S03 scope)
- [ ] `npm run build:web-host` exits 0

## Verification

- `npm run build:web-host` exits 0
- `rg "grid grid-cols" web/components/gsd/projects-view.tsx` returns empty
- `rg "export.*ProjectsView|export.*DevRootSettingsSection" web/components/gsd/projects-view.tsx` shows both exports
- `rg "expandedProject" web/components/gsd/projects-view.tsx` shows the new state
- Visual (UAT): projects render as list, click expands detail, double-click navigates

## Inputs

- `web/components/gsd/projects-view.tsx` — current 647-line component with grid layout
- T01 output: `ProjectProgressInfo` type on `ProjectMetadata.progress`, `?detail=true` API param
- `web/lib/gsd-workspace-store.tsx` — exports: `getLiveWorkspaceIndex()`, `getLiveAutoDashboard()`, `formatCost()`, `getCurrentSlice()`, `getCurrentScopeLabel()`, `WorkspaceIndex`
- `web/lib/project-store-manager.tsx` — exports: `useProjectStoreManager()`, provides `activeProjectCwd`
- Consumer imports to preserve:
  - `web/components/gsd/app-shell.tsx` imports `ProjectsView`
  - `web/components/gsd/command-surface.tsx` imports `DevRootSettingsSection`

## Expected Output

- `web/components/gsd/projects-view.tsx` — redesigned from grid to expandable list with detail panels, both exports preserved, build passes

## Observability Impact

- **New state:** `expandedProject` (string | null) in `ProjectsView` — tracks which project path is expanded. Inspectable via React DevTools.
- **API change:** Fetch URL now includes `?detail=true`, so `/api/projects` returns `progress` field on each project. Visible in Network tab.
- **Active project detail:** Reads from `getLiveWorkspaceIndex()` and `getLiveAutoDashboard()` — same live state as dashboard. No new observability surface needed.
- **Non-active project detail:** Reads from `project.progress` (API response). `null` progress → detail shows "No progress data" message (not an error).
- **Interaction model change:** Single-click no longer navigates — only expands. Double-click or "Open" button navigates. This is a behavioral change from the current instant-navigate pattern.
- **Failure visibility:** Projects with `progress: null` render gracefully in the detail panel.
