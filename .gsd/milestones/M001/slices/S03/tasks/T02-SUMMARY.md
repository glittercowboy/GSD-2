---
id: T02
parent: S03
milestone: M001
provides:
  - Three DB-aware inline helper functions (inlineDecisionsFromDb, inlineRequirementsFromDb, inlineProjectFromDb) in auto.ts
  - All 9 prompt builders rewired from inlineGsdRootFile to scoped DB queries with filesystem fallback
key_files:
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/tests/prompt-db.test.ts
key_decisions:
  - DB-aware helpers use dynamic import of context-store.js (consistent with D014 pattern)
  - Empty DB query results trigger filesystem fallback (treats empty DB same as unavailable DB)
patterns_established:
  - DB-aware inline pattern: check isDbAvailable() → dynamic import context-store → query with scope → format → wrap with header/source → fallback to inlineGsdRootFile on any failure or empty result
observability_surfaces:
  - No new stderr logging (fallback is silent per D003)
  - isDbAvailable() governs whether DB path is attempted
  - grep -c inlineGsdRootFile auto.ts = 7 (1 definition + 3 fallback calls + 3 JSDoc comments, zero direct call sites in builders)
duration: 10m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T02: Rewire all prompt builders to use scoped DB queries with filesystem fallback

**Replaced all 19 `inlineGsdRootFile` call sites across 9 prompt builders with DB-scoped helpers that query filtered decisions/requirements/project from the DB and fall back to filesystem loading.**

## What Happened

1. Created three DB-aware helper functions in `auto.ts` between `inlineGsdRootFile` and the prompt builders:
   - `inlineDecisionsFromDb(base, milestoneId?, scope?)` — queries `queryDecisions()` with milestone/scope filters, formats with `formatDecisionsForPrompt()`, wraps in `### Decisions\nSource:` header
   - `inlineRequirementsFromDb(base, sliceId?)` — queries `queryRequirements()` with slice filter, formats, wraps in `### Requirements\nSource:` header
   - `inlineProjectFromDb(base)` — queries `queryProject()`, wraps in `### Project\nSource:` header
   - All three: if `isDbAvailable()` is false, query returns empty, or any error occurs → fall back to `inlineGsdRootFile()`

2. Replaced all 19 `inlineGsdRootFile` call sites with the correct scoped helper per the Injection Matrix:
   - `buildResearchMilestonePrompt`: decisions(mid), requirements(all), project
   - `buildPlanMilestonePrompt`: decisions(mid), requirements(all), project
   - `buildResearchSlicePrompt`: decisions(mid), requirements(sid)
   - `buildPlanSlicePrompt`: decisions(mid), requirements(sid)
   - `buildCompleteSlicePrompt`: requirements(sid)
   - `buildCompleteMilestonePrompt`: decisions(mid), requirements(all), project
   - `buildReplanSlicePrompt`: decisions(mid)
   - `buildRunUatPrompt`: project
   - `buildReassessRoadmapPrompt`: decisions(mid), requirements(all), project

3. `buildExecuteTaskPrompt` was NOT touched (it doesn't use `inlineGsdRootFile`). Template inlines (`inlineTemplate`) were NOT affected.

4. Created `prompt-db.test.ts` with 43 assertions covering:
   - DB-scoped decisions return filtered content (by milestone)
   - DB-scoped requirements return filtered content (by slice)
   - DB project content retrieval
   - Fallback behavior when DB unavailable (returns empty/null → triggers filesystem path)
   - Scoped filtering reduces content vs unscoped (token savings verified)
   - Wrapper format matches expected `### Label\nSource: \`path\`\n\ncontent` pattern

## Verification

- `npx tsc --noEmit` — clean, no errors
- `npm run test:unit -- --test-name-pattern "prompt-db"` — 43 passed, 0 failed
- `npm run test:unit` — 285 passed, 0 failed, no regressions
- `grep -c "inlineGsdRootFile" src/resources/extensions/gsd/auto.ts` — returns 7 (1 function definition + 3 fallback calls inside helpers + 3 JSDoc comments). Zero call sites in any prompt builder.

### Slice-level verification status (T02 of 3):
- ✅ `npx tsc --noEmit` — clean
- ✅ `npm run test:unit -- --test-name-pattern "context-store"` — all pass
- ✅ `npm run test:unit -- --test-name-pattern "prompt-db"` — 43 passed
- ✅ `npm run test:unit` — 285 passed, full suite clean
- ✅ Diagnostic check: `isDbAvailable()` governs DB path; fallback is silent

## Diagnostics

- `isDbAvailable()` returns true → helpers attempt DB queries; false → direct filesystem fallback
- Scoped queries: `queryDecisions({milestoneId: 'M001'})` returns only M001-related decisions; `queryRequirements({sliceId: 'S01'})` returns only S01 primary/supporting requirements
- Fallback is silent by design (D003) — no stderr logs when falling back to filesystem
- `grep -c "inlineGsdRootFile"` in auto.ts verifies zero direct usage in builders

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/auto.ts` — added 3 DB-aware helper functions, replaced 19 `inlineGsdRootFile` call sites across 9 prompt builders
- `src/resources/extensions/gsd/tests/prompt-db.test.ts` — new test file with 43 assertions for DB-aware helpers and fallback behavior
- `.gsd/milestones/M001/slices/S03/tasks/T02-PLAN.md` — pre-flight: added Observability Impact section
- `.gsd/milestones/M001/slices/S03/S03-PLAN.md` — marked T02 as [x]
- `.gsd/STATE.md` — updated next action to T03
