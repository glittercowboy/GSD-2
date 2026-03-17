# Quick Task: Resizable milestone sidebar + rename tab title

**Date:** 2026-03-17
**Branch:** gsd/quick/2-1-make-the-milestone-sidebar-be-resizabl

## What Changed
- Added drag-to-resize handle on the left edge of the milestone sidebar (col-resize cursor, 180–480px range), following the same pattern as the terminal panel resize
- Changed browser tab title suffix from "GSD 2" to "GSD"
- Removed redundant `border-l` from MilestoneExplorer since the drag handle provides visual separation

## Files Modified
- `web/components/gsd/app-shell.tsx` — sidebar width state, drag handler, drag handle element, title fix
- `web/components/gsd/sidebar.tsx` — accept `width` prop, use inline style instead of fixed `w-64`

## Verification
- `next build` passes clean with no type errors
- Diff reviewed for correctness
