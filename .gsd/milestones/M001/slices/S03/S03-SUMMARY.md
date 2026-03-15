---
id: S03
parent: M001
milestone: M001
provides:
  - DB-aware prompt builder helpers (inlineDecisionsFromDb, inlineRequirementsFromDb, inlineProjectFromDb) with scoped queries and filesystem fallback
  - All 9 prompt builders rewired from inlineGsdRootFile to DB queries
  - DB open at session start for pre-existing gsd.db files
  - queryArtifact and queryProject functions in context-store.ts
  - Dual-write re-import in handleAgentEnd keeping DB in sync with markdown changes
requires:
  - slice: S01
    provides: gsd-db.ts (openDatabase, isDbAvailable, _getAdapter), context-store.ts (queryDecisions, queryRequirements, formatters)
  - slice: S02
    provides: md-importer.ts (migrateFromMarkdown for re-import), auto-migration wiring in startAuto()
affects:
  - S04
  - S06
  - S07
key_files:
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/context-store.ts
  - src/resources/extensions/gsd/tests/context-store.test.ts
  - src/resources/extensions/gsd/tests/prompt-db.test.ts
key_decisions:
  - Static import of isDbAvailable in auto.ts (lightweight module-level state check, avoids second dynamic import)
  - DB-aware helpers use dynamic import of context-store.js (consistent with D014 pattern)
  - Empty DB query results trigger filesystem fallback (treats empty DB same as unavailable DB)
  - migrateFromMarkdown re-import in handleAgentEnd is non-fatal (stderr log only)
patterns_established:
  - DB-aware inline pattern: isDbAvailable() → dynamic import context-store → query with scope → format → wrap with header/source → fallback to inlineGsdRootFile on any failure or empty result
  - Dual-write re-import pattern: isDbAvailable() guard → dynamic import md-importer → migrateFromMarkdown(basePath) → try/catch with stderr log
  - Artifact query pattern: guard with isDbAvailable() + _getAdapter() + try/catch, return null on any failure
observability_surfaces:
  - stderr log "gsd-db: failed to open existing database:" when DB open fails at session start
  - stderr log "gsd-db: re-import failed:" when handleAgentEnd re-import fails
  - isDbAvailable() returns true after startAuto() when gsd.db exists on disk
  - queryArtifact/queryProject return null when DB unavailable (silent fallback per D003)
  - grep -c inlineGsdRootFile auto.ts = 7 (1 definition + 3 fallback calls + 3 JSDoc comments, zero direct call sites in builders)
drill_down_paths:
  - .gsd/milestones/M001/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S03/tasks/T02-SUMMARY.md
  - .gsd/milestones/M001/slices/S03/tasks/T03-SUMMARY.md
duration: 30m
verification_result: passed
completed_at: 2026-03-15
---

# S03: Core Hierarchy + Full Query Layer + Prompt Rewiring

**All 9 prompt builders rewired from inlineGsdRootFile to scoped DB queries with filesystem fallback; DB opens at session start; dual-write re-import keeps DB in sync after each dispatch unit.**

## What Happened

Three tasks, executed sequentially:

**T01 (12m):** Extended context-store with `queryArtifact(path)` and `queryProject()` functions that query the artifacts table, guarded by `isDbAvailable()` + try/catch. Wired DB open in `startAuto()` for pre-existing `gsd.db` files — previously the DB was only opened during auto-migration (when no gsd.db existed), so returning to a project with an existing DB left it unopened. Added 6 test assertions.

**T02 (10m):** Created three DB-aware helper functions (`inlineDecisionsFromDb`, `inlineRequirementsFromDb`, `inlineProjectFromDb`) that query scoped data from the DB and fall back to `inlineGsdRootFile` when unavailable. Replaced all 19 `inlineGsdRootFile` call sites across 9 prompt builders with the correct scoped helper per the injection matrix: research/plan-milestone get milestone-filtered decisions + all active requirements + project; plan/research-slice get milestone decisions + slice-filtered requirements; complete-slice gets slice requirements; etc. Created `prompt-db.test.ts` with 43 assertions.

**T03 (8m):** Added `migrateFromMarkdown` call in `handleAgentEnd` after the auto-commit + doctor + rebuildState cycle. This keeps the DB in sync when dispatch units modify markdown files. Non-fatal — failure logs to stderr but doesn't block the next dispatch. Added re-import test proving DB updates when source markdown changes (8 assertions).

## Verification

- `npx tsc --noEmit` — clean compilation
- `npm run test:unit -- --test-name-pattern "context-store"` — all pass (56 assertions including 6 new)
- `npm run test:unit -- --test-name-pattern "prompt-db"` — all pass (52 assertions: 43 from T02 + 8 re-import from T03 + 1 section header)
- `npm run test:unit` — 285 pass, 0 fail, no regressions
- `grep -c "inlineGsdRootFile" auto.ts` = 7 (1 definition + 3 fallback calls + 3 JSDoc comments; zero direct usage in builders)
- Diagnostic: `isDbAvailable()` static import governs DB path; fallback is silent per D003; re-import failure logs to stderr with `gsd-db: re-import failed:` prefix

## Requirements Advanced

- R002 — Prompt builder fallback path now complete: every DB query site degrades to `inlineGsdRootFile` when `isDbAvailable()` returns false
- R005 — Decisions scoped by milestone now wired into all prompt builders that inject decisions
- R006 — Requirements filtered by slice now wired into all prompt builders that inject requirements
- R007 — Query functions for all dispatch unit types now return precisely scoped context per the injection matrix
- R008 — All 19 `inlineGsdRootFile` calls replaced with DB-aware helpers across 9 prompt builders
- R009 — Dual-write re-import in `handleAgentEnd` keeps DB in sync with markdown changes after each dispatch unit
- R016 — Scoped queries produce smaller context payloads; token reduction measurable once S04 adds measurement

## Requirements Validated

- R007 — Context store query layer for all dispatch unit types: `queryArtifact`, `queryProject`, `queryDecisions` with milestone/scope, `queryRequirements` with slice filter — all wired into prompt builders with 52 test assertions proving scoped content delivery and fallback
- R008 — Prompt builder rewiring: all 19 `inlineGsdRootFile` call sites replaced; grep confirms zero direct usage in builders; 43 test assertions prove DB-scoped content and fallback behavior
- R009 — Dual-write: `handleAgentEnd` re-imports markdown into DB after auto-commit; 8 test assertions prove DB updates when source markdown changes

## New Requirements Surfaced

- None

## Requirements Invalidated or Re-scoped

- None

## Deviations

None. All three tasks executed as planned with no blockers, no scope changes, and no deviations.

## Known Limitations

- **Scoping granularity is coarse**: Decisions are filtered by milestone ID but not by specific task relevance within a milestone. Requirements are filtered by slice ownership. Finer-grained filtering (e.g., only decisions tagged to specific capabilities) deferred to future optimization.
- **Re-import is full re-import**: `handleAgentEnd` calls `migrateFromMarkdown(basePath)` which re-imports all artifact types, not just the ones that changed. Acceptable for now since import is fast (<50ms), but could be optimized to diff-only import if needed.
- **buildExecuteTaskPrompt unchanged**: This builder doesn't use `inlineGsdRootFile` and was intentionally not touched. It gets context from different mechanisms (inline task files, forward intelligence).

## Follow-ups

- S04 should measure token counts before/after to validate R016 (≥30% reduction on planning/research units)
- S06 structured tools should use the same dual-write pattern established here (write to DB + trigger markdown sync)

## Files Created/Modified

- `src/resources/extensions/gsd/context-store.ts` — added `queryArtifact()` and `queryProject()` exports
- `src/resources/extensions/gsd/auto.ts` — added `isDbAvailable` static import, DB open block in `startAuto()`, 3 DB-aware helper functions, replaced 19 `inlineGsdRootFile` calls across 9 builders, added dual-write re-import in `handleAgentEnd`
- `src/resources/extensions/gsd/tests/context-store.test.ts` — added 6 new test assertions for artifact/project queries
- `src/resources/extensions/gsd/tests/prompt-db.test.ts` — new test file with 52 assertions for DB-aware helpers, fallback behavior, and re-import verification

## Forward Intelligence

### What the next slice should know
- `isDbAvailable()` is now a static import in auto.ts (line 65) — no dynamic import needed for the guard check. The actual query functions still use dynamic import of `context-store.js` inside the helpers.
- The three DB-aware helpers (`inlineDecisionsFromDb`, `inlineRequirementsFromDb`, `inlineProjectFromDb`) are positioned between `inlineGsdRootFile` and the first prompt builder in auto.ts (~line 2460-2520). They follow a consistent pattern: check `isDbAvailable()` → dynamic import → query → format → wrap → fallback.
- `handleAgentEnd` re-import is at line ~871. It runs after rebuildState and before post-unit hooks.

### What's fragile
- **Dynamic imports of context-store.js and md-importer.js**: These resolve relative paths at runtime. If file structure changes, the imports silently fail and fall back to filesystem. The try/catch makes debugging hard — check stderr for `gsd-db:` prefixed messages.
- **Injection matrix mapping**: The scope parameters passed to each builder (which milestone ID, which slice ID) are hardcoded based on the variables available in each builder function. If builder signatures change or new parameters are added, the scoping must be manually updated.

### Authoritative diagnostics
- `grep -c "inlineGsdRootFile" src/resources/extensions/gsd/auto.ts` — should be exactly 7. If it increases, someone added a direct call bypassing DB queries.
- `npm run test:unit -- --test-name-pattern "prompt-db"` — the definitive test suite for DB-aware prompt building. Covers scoped queries, fallback, format verification, and re-import.

### What assumptions changed
- Original plan assumed 19 `inlineGsdRootFile` calls needed replacement — this was accurate. The grep count after replacement (7 = 1 def + 3 fallback + 3 JSDoc) matched expectations exactly.
- Re-import in `handleAgentEnd` was simpler than expected — `migrateFromMarkdown` is already idempotent (INSERT OR REPLACE), so calling it on every agent end is safe without needing to track which files changed.
