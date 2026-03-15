---
id: S05
parent: M001
milestone: M001
provides:
  - copyWorktreeDb function for isolating gsd.db into worktrees on creation
  - reconcileWorktreeDb function for merging worktree DB rows back to main via ATTACH DATABASE
  - Wiring of DB copy into createWorktree lifecycle
  - Wiring of DB reconciliation into both deterministic and LLM merge paths
requires:
  - slice: S01
    provides: openDatabase, initSchema, typed insert/query wrappers, _getAdapter
  - slice: S02
    provides: migrateFromMarkdown as fallback when no DB exists
affects:
  - S07
key_files:
  - src/resources/extensions/gsd/gsd-db.ts
  - src/resources/extensions/gsd/worktree-manager.ts
  - src/resources/extensions/gsd/worktree-command.ts
  - src/resources/extensions/gsd/tests/worktree-db.test.ts
key_decisions:
  - D017: createWorktree changed from sync to async for dynamic import support
  - INSERT OR REPLACE with explicit column list (excluding seq) for cross-DB merge without AUTOINCREMENT PK conflicts
  - Conflict detection compares content columns not full row hash
  - ATTACH/DETACH lifecycle uses try/finally for guaranteed cleanup
  - Dynamic import try/catch for gsd-db.js at both call sites preserving D003 graceful degradation
patterns_established:
  - Cross-DB merge via ATTACH DATABASE with ATTACH outside transaction, INSERT OR REPLACE inside transaction, DETACH in finally block
  - Non-fatal file operations that log to stderr and return status codes rather than throwing
  - Dynamic import of optional gsd-db dependency in worktree lifecycle
observability_surfaces:
  - stderr reconciliation report with per-table counts and conflict count
  - stderr conflict details for each divergent row
  - stderr error messages for copy and reconciliation failures
  - Merge notification includes db reconciliation stats in deterministic path
drill_down_paths:
  - .gsd/milestones/M001/slices/S05/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S05/tasks/T02-SUMMARY.md
duration: 27m
verification_result: passed
completed_at: 2025-03-15
---

# S05: Worktree Isolation + Merge Reconciliation

**Implemented gsd.db copy on worktree creation and row-level merge reconciliation via ATTACH DATABASE with conflict detection, wired into the full worktree lifecycle**

## What Happened

T01 added two core functions to `gsd-db.ts`: `copyWorktreeDb` copies the main `.gsd/gsd.db` to a new worktree (skipping WAL/SHM files, non-fatal on failure), and `reconcileWorktreeDb` ATTACHes the worktree DB, detects conflicts by comparing content columns across all three tables (decisions, requirements, artifacts), then runs INSERT OR REPLACE inside a manual transaction. DETACH is guaranteed via try/finally. Conflict detection reports divergent rows to stderr. A 37-assertion test suite covers copy, merge, conflict detection, edge cases (missing files, paths with spaces), and post-reconciliation DB usability.

T02 wired these functions into the worktree lifecycle. `createWorktree()` in `worktree-manager.ts` was made async (D017) to support `await import("./gsd-db.js")` — the DB is copied after `git worktree add` succeeds. In `worktree-command.ts`, `reconcileWorktreeDb()` runs in two locations: after deterministic merge (with results shown in the success notification) and before LLM fallback dispatch (DB reconciliation is independent of code conflict resolution). Both sites use dynamic import in try/catch, preserving D003 graceful degradation — DB failures never block worktree operations.

## Verification

- `npx tsc --noEmit` — 0 errors
- `npm run test:unit -- --test-name-pattern "worktree-db"` — 36 passed, 0 failed (37 assertions)
- `npm run test:unit` — 288 passed, 0 failed (full suite, no regressions)
- `grep` confirms `copyWorktreeDb` called in `createWorktree` (2 matches: import + call)
- `grep` confirms `reconcileWorktreeDb` called in both merge paths (4 matches: 2 imports + 2 calls)

## Requirements Advanced

- R012 — gsd.db copied to worktree `.gsd/` on creation via `copyWorktreeDb`, wired into `createWorktree()`
- R013 — Row-level reconciliation via `reconcileWorktreeDb` with INSERT OR REPLACE for all 3 tables, conflict detection for divergent modifications, wired into both deterministic and LLM merge paths

## Requirements Validated

- R012 — Worktree DB isolation proven by 37-assertion test suite: copy creates queryable DB, WAL/SHM skipped, copy failure non-fatal, wired into lifecycle
- R013 — Merge reconciliation proven by test suite: new rows merged, existing rows updated (worktree-wins), conflicts detected and reported, ATTACH/DETACH lifecycle correct, missing DB handled gracefully, wired into both merge paths

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- `createWorktree` changed from sync to async — required for dynamic import pattern (D003/D014). This was discovered during implementation, not anticipated in the plan. Impact was minimal: one call site in worktree-command.ts (already async) and 5 `await` additions across 2 test files.

## Known Limitations

- Reconciliation uses worktree-wins strategy (INSERT OR REPLACE) — if main and worktree both modified the same row, the worktree version wins with a conflict reported to stderr. No interactive resolution.
- Conflict reports go to stderr only — no structured return path for UI presentation beyond the deterministic merge notification.

## Follow-ups

- none

## Files Created/Modified

- `src/resources/extensions/gsd/gsd-db.ts` — Added `copyWorktreeDb` and `reconcileWorktreeDb` exports
- `src/resources/extensions/gsd/worktree-manager.ts` — Made `createWorktree` async, added DB copy after worktree creation
- `src/resources/extensions/gsd/worktree-command.ts` — Added DB reconciliation in deterministic and LLM merge paths
- `src/resources/extensions/gsd/tests/worktree-db.test.ts` — New test file with 37 assertions
- `src/resources/extensions/gsd/tests/worktree-manager.test.ts` — Updated 3 `createWorktree` calls to await
- `src/resources/extensions/gsd/tests/worktree-integration.test.ts` — Updated 2 `createWorktree` calls to await

## Forward Intelligence

### What the next slice should know
- DB operations in the worktree lifecycle are entirely non-fatal — they log to stderr and return, never throw. This means S07 integration tests should check stderr output to verify DB operations ran, not just that worktree commands succeeded.
- `reconcileWorktreeDb` returns a structured result object with per-table counts and conflict list — downstream code can inspect this programmatically.

### What's fragile
- The dynamic import path `"./gsd-db.js"` is used in both `worktree-manager.ts` and `worktree-command.ts` — if the compiled output path changes (e.g., different build config), these imports will silently fail and DB operations will be skipped without any test catching it (they'd just hit the catch block).

### Authoritative diagnostics
- `npm run test:unit -- --test-name-pattern "worktree-db"` — exercises all copy and reconciliation logic in isolation, trustworthy because it creates real SQLite DBs and runs actual ATTACH/DETACH operations
- `stderr` output during merge — the reconciliation report line is the definitive signal that DB merge ran

### What assumptions changed
- Originally assumed `createWorktree` could stay synchronous — dynamic import requires async. Impact was minimal since the only call site was already in an async context.
