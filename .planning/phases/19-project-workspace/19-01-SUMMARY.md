---
phase: 19-project-workspace
plan: 01
subsystem: testing
tags: [bun:test, tdd, workspace, project-management, react, server-api]

# Dependency graph
requires:
  - phase: 18-builder-mode
    provides: builderMode prop system and existing test infrastructure (748 tests)
provides:
  - "Failing RED test stubs for workspace-api (getWorkspacePath, createProject, workspace_path setting)"
  - "Failing RED test stubs for project-archiving (archiveProject, restoreProject, getArchivedProjects)"
  - "Failing RED test stubs for ProjectHomeScreen, ProjectCard, ProjectCardMenu"
  - "Failing RED test stubs for ProjectTabBar (visibility, amber dot)"
affects: [19-02, 19-03, 19-04, 19-05]

# Tech tracking
tech-stack:
  added: []
  patterns: [tdd-wave-0-stubs, module-not-found-red, renderToString-ui-assertions]

key-files:
  created:
    - packages/mission-control/tests/workspace-api.test.ts
    - packages/mission-control/tests/project-archiving.test.ts
    - packages/mission-control/tests/project-home-screen.test.tsx
    - packages/mission-control/tests/project-tab-bar.test.tsx
  modified: []

key-decisions:
  - "workspace-api.test.ts uses _setWorkspaceFilePath test helper (mirrors _setRecentFilePath pattern from recent-projects.ts)"
  - "project-archiving.test.ts imports archiveProject/restoreProject/getArchivedProjects from existing recent-projects.ts (not yet exported = RED via named export error)"
  - "project-home-screen.test.tsx uses renderToString from react-dom/server for HTML assertions (Phase 11.1 decision: RTL not installed)"
  - "project-tab-bar.test.tsx uses inline OpenProject type rather than importing from a non-existent types file"
  - "All 4 test files fail with module-not-found or export-not-found errors — classic Nyquist Wave 0 RED state"

patterns-established:
  - "Wave 0 test stubs: import from src/ that does not exist yet — module-not-found is correct RED signal"
  - "RecentProject fixture extended inline with Phase 19 fields (archived, activeMilestone, progressPercent, lastActivity)"

requirements-completed: [WORKSPACE-01, WORKSPACE-02, WORKSPACE-03, WORKSPACE-04, WORKSPACE-05]

# Metrics
duration: 8min
completed: 2026-03-14
---

# Phase 19 Plan 01: Project Workspace Test Stubs Summary

**Four Nyquist Wave 0 RED test stubs for workspace-api, project-archiving, ProjectHomeScreen, and ProjectTabBar — 11 test cases, all fail with module/export errors, 747 previously-passing tests unaffected**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-14T14:31:00Z
- **Completed:** 2026-03-14T14:39:00Z
- **Tasks:** 3 (2 TDD stub creation + 1 verification)
- **Files modified:** 4 created

## Accomplishments

- Created `workspace-api.test.ts` with 4 RED stubs covering getWorkspacePath (linux/Windows), workspace_path setting, and createProject with git init
- Created `project-archiving.test.ts` with 3 RED stubs covering archiveProject, getArchivedProjects, and restoreProject
- Created `project-home-screen.test.tsx` with 4 RED stubs covering Developer/Builder empty states, ProjectCard rendering, and ProjectCardMenu
- Created `project-tab-bar.test.tsx` with 4 RED stubs covering tab visibility (0/1/2+ projects) and amber dot for isProcessing
- Confirmed 747 previously-passing tests still pass — no regressions from stub additions

## Task Commits

Each task was committed atomically:

1. **Task 1: workspace-api and project-archiving test stubs** - `04ec5a5` (test)
2. **Task 2: project-home-screen and project-tab-bar test stubs** - `fc2d571` (test)
3. **Task 3: Verify full suite still passes** - verification only, no commit needed

## Files Created/Modified

- `packages/mission-control/tests/workspace-api.test.ts` - 4 RED stubs for WORKSPACE-01 (getWorkspacePath, createProject, workspace_path)
- `packages/mission-control/tests/project-archiving.test.ts` - 3 RED stubs for WORKSPACE-05 (archiveProject, getArchivedProjects, restoreProject)
- `packages/mission-control/tests/project-home-screen.test.tsx` - 4 RED stubs for WORKSPACE-02/03 (ProjectHomeScreen, ProjectCard, ProjectCardMenu)
- `packages/mission-control/tests/project-tab-bar.test.tsx` - 4 RED stubs for WORKSPACE-04 (visibility, amber dot)

## Decisions Made

- `workspace-api.test.ts` uses `_setWorkspaceFilePath` test override pattern mirroring `_setRecentFilePath` from `recent-projects.ts` — consistent test isolation approach
- `project-archiving.test.ts` imports `archiveProject`/`restoreProject`/`getArchivedProjects` from existing `recent-projects.ts` since archiving is logically part of that module — RED via named export not found
- `project-home-screen.test.tsx` and `project-tab-bar.test.tsx` use `renderToString` from `react-dom/server` for HTML assertions, following Phase 11.1-03 decision (RTL not installed, direct renderToString strategy)
- `OpenProject` type defined inline in `project-tab-bar.test.tsx` — no types file exists yet, avoids second import failure

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing failures in the full suite (pipeline-perf latency and server timeout) are unrelated to this plan and were present before execution.

## Next Phase Readiness

- All 4 test stub files are in place as Nyquist Wave 0 artifacts
- Implementation plans (19-02 through 19-05) can now target these test files to drive to GREEN
- `workspace-api.ts` needs `getWorkspacePath`, `createProject`, `_setWorkspaceFilePath` exports
- `recent-projects.ts` needs `archiveProject`, `restoreProject`, `getArchivedProjects` exports
- `src/components/workspace/ProjectHomeScreen.tsx`, `ProjectCard.tsx`, `ProjectCardMenu.tsx`, `ProjectTabBar.tsx` all need creating

---
*Phase: 19-project-workspace*
*Completed: 2026-03-14*
