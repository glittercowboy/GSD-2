---
phase: 14-slice-integration
plan: "06"
subsystem: ui
tags: [react, bun, typescript, inline-panel, git-api]

# Dependency graph
requires:
  - phase: 14-05
    provides: slice-integration tests verifying all four slice state cards render correctly

provides:
  - GET /api/gsd-file endpoint reads S{N}-PLAN.md, T{N}-SUMMARY.md, S{N}-UAT-RESULTS.md, or git show --stat diff
  - InlineReadPanel component — dismissible in-flow panel with title, content, isLoading, close button
  - MilestoneView view_plan/view_task/view_diff/view_uat_results wired to fetch /api/gsd-file and open InlineReadPanel

affects: [Phase 15 Tauri Shell, any consumer of MilestoneView that routes SliceActions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "source-text TDD for Bun: readFileSync on implementation file, assert patterns/exports present — avoids React hook rendering in test environment"
    - "handler returns Response | null: route only if pathname matches, null falls through to next route in server.ts"
    - "in-flow panel (not fixed/absolute): avoids z-index conflicts with existing panels by rendering below SliceAccordion in normal document flow"

key-files:
  created:
    - packages/mission-control/src/server/gsd-file-api.ts
    - packages/mission-control/src/components/milestone/InlineReadPanel.tsx
    - packages/mission-control/tests/inline-read-panel.test.ts
  modified:
    - packages/mission-control/src/server.ts
    - packages/mission-control/src/components/views/MilestoneView.tsx

key-decisions:
  - "gsd-file-api always returns 200 with { content: string } — missing file gives '(file not found)' so UI never breaks on 404"
  - "taskId derived from first T{NN} pattern in slice PLAN.md; falls back to S{NN} → T{NN} substitution (e.g. S01 → T01)"
  - "diff type uses git log -1 --format=%H then git show --stat — returns last repo commit stat, not branch-specific"
  - "InlineReadPanel is in-flow (not fixed overlay) so it doesn't conflict with existing PanelWrapper z-index"
  - "handleSliceAction made async to support await fetch() calls inside switch cases"

patterns-established:
  - "InlineReadPanel pattern: isOpen guard (return null), header with close button, scrollable pre block with font-mono text-xs"
  - "panelState useState pattern: { isOpen, title, content, isLoading } — set isLoading=true before fetch, false after"

requirements-completed: [SLICE-02, SLICE-03, SLICE-05]

# Metrics
duration: 3min
completed: 2026-03-13
---

# Phase 14 Plan 06: InlineReadPanel Gap Closure Summary

**GET /api/gsd-file endpoint + InlineReadPanel component closes SLICE-02/03/05 — view_plan, view_task, view_diff, view_uat_results now fetch and render .gsd/ file content inline**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-13T09:44:18Z
- **Completed:** 2026-03-13T09:47:24Z
- **Tasks:** 2 (TDD: RED + GREEN for each)
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- `gsd-file-api.ts` — GET /api/gsd-file handler reads plan/task/uat_results files and git diff, always returns 200 with content string
- `InlineReadPanel.tsx` — dismissible in-flow panel with title, content pre block, loading spinner, and keyboard-accessible close button
- `MilestoneView.tsx` — view_plan/view_task/view_diff/view_uat_results cases replaced: fetch /api/gsd-file, open panel; console.log stub removed
- 16 new source-text tests pass; full suite up from 680 to 696 tests, 0 failures

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: failing tests** - `dc8ccd4` (test)
2. **Task 1 GREEN: gsd-file-api.ts + server.ts** - `a405e73` (feat)
3. **Task 2 GREEN: InlineReadPanel + MilestoneView** - `3b43533` (feat)

_Note: TDD tasks have separate RED (test) and GREEN (feat) commits_

## Files Created/Modified

- `packages/mission-control/src/server/gsd-file-api.ts` — GET /api/gsd-file handler; plan/task/uat_results read via Bun.file; diff via git spawn
- `packages/mission-control/src/server.ts` — import + route block for /api/gsd-file after /api/uat-results
- `packages/mission-control/src/components/milestone/InlineReadPanel.tsx` — dismissible panel component with data-testid, font-mono content, aria-label close button
- `packages/mission-control/src/components/views/MilestoneView.tsx` — async handleSliceAction, panelState useState, InlineReadPanel rendered below SliceAccordion
- `packages/mission-control/tests/inline-read-panel.test.ts` — 16 source-text tests (8 per task)

## Decisions Made

- `gsd-file-api.ts` always returns 200 with `{ content: string }` — missing file gives "(file not found)" so the UI never receives a 404 and always has something to display
- `taskId` derivation: reads the slice's PLAN.md and finds the first `T{NN}` pattern; falls back to replacing "S" with "T" in the sliceId
- diff type uses `git log -1 --format=%H -- .` then `git show --stat` against repoRoot — returns the last commit on the current branch
- InlineReadPanel uses in-flow layout (not fixed/absolute) to avoid z-index conflicts with PanelWrapper and other existing panels
- `handleSliceAction` made `async` to support `await fetch()` calls inside the view_* switch cases

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 14 gap closure complete — all SLICE-02, SLICE-03, SLICE-05 requirements satisfied
- InlineReadPanel is fully functional; clicking any view_* button on a slice card renders the file content inline
- Ready for Phase 15 (Tauri Shell)

---
*Phase: 14-slice-integration*
*Completed: 2026-03-13*
