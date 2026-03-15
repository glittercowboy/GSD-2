# S03: Core Hierarchy + Full Query Layer + Prompt Rewiring

**Goal:** All `build*Prompt()` functions use DB queries instead of `inlineGsdRootFile` for decisions, requirements, and project data. DB opens at session start. Dual-write keeps markdown in sync after each dispatch unit.

**Demo:** Start auto-mode on a project with existing `gsd.db` → prompt builders produce scoped context (milestone-filtered decisions, slice-filtered requirements) from DB queries → after each unit completes, `handleAgentEnd` re-imports changed markdown files into DB → if DB is unavailable, all builders fall back to `inlineGsdRootFile` transparently.

## Must-Haves

- DB opens at session start (not just during migration) — existing `gsd.db` is detected and opened
- `context-store.ts` has `queryArtifact(path)` and `queryProject()` functions
- DB-aware helper functions in `auto.ts` that try DB first, fall back to `inlineGsdRootFile`
- All 9 prompt builders (excluding `buildExecuteTaskPrompt`) rewired to use scoped DB queries
- Scoped filtering: decisions filtered by milestone+scope, requirements filtered by slice ownership
- `handleAgentEnd` re-imports changed markdown files into DB after auto-commit
- Full fallback path: every DB query site degrades to `inlineGsdRootFile` when `isDbAvailable()` returns false
- No regression in existing test suite

## Proof Level

- This slice proves: integration (prompt builders produce equivalent output with DB vs markdown)
- Real runtime required: no (unit tests with in-memory DB sufficient)
- Human/UAT required: no

## Verification

- `npx tsc --noEmit` — clean compilation
- `npm run test:unit -- --test-name-pattern "context-store"` — all existing + new assertions pass
- `npm run test:unit -- --test-name-pattern "prompt-db"` — new test file for DB-aware helpers and rewiring
- `npm run test:unit` — full suite passes, no regressions
- Diagnostic check: `isDbAvailable()` returns true after `startAuto()` when `gsd.db` exists; DB open failure logs to stderr with `gsd-db: failed to open existing database:` prefix and does not block auto-mode startup

## Observability / Diagnostics

- Runtime signals: `isDbAvailable()` returns true after session start when `gsd.db` exists; stderr log if DB open fails
- Inspection surfaces: `getDbProvider()` shows active provider; `queryDecisions`/`queryRequirements`/`queryArtifact` testable independently
- Failure visibility: fallback to `inlineGsdRootFile` is silent (by design — D003); DB re-import failures in `handleAgentEnd` logged to stderr but non-fatal
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: `gsd-db.ts` (openDatabase, isDbAvailable, insertArtifact, _getAdapter), `context-store.ts` (queryDecisions, queryRequirements, formatters), `md-importer.ts` (migrateFromMarkdown for re-import)
- New wiring introduced in this slice: DB open in `startAuto()` for existing DBs, DB-aware helpers in prompt builders, dual-write hook in `handleAgentEnd`
- What remains before the milestone is truly usable end-to-end: S04 (token measurement + state derivation), S06 (structured LLM tools), S07 (full integration verification)

## Tasks

- [x] **T01: Extend context-store with artifact/project queries and open DB at session start** `est:30m`
  - Why: DB is currently only opened during migration (when gsd.db doesn't exist). If it already exists, it's never opened. This is the #1 bug identified in research. Also, context-store needs `queryArtifact` and `queryProject` for prompt builders to query hierarchy files and PROJECT.md from DB.
  - Files: `src/resources/extensions/gsd/context-store.ts`, `src/resources/extensions/gsd/auto.ts`, `src/resources/extensions/gsd/tests/context-store.test.ts`
  - Do: (1) Add `queryArtifact(path)` and `queryProject()` to context-store.ts — both guard with `isDbAvailable()` + try/catch. `queryArtifact` returns `full_content` string or null. `queryProject` queries artifact with path `PROJECT.md`. (2) Add `formatProjectForPrompt(content)` that wraps content in the same `### Label\nSource: \`path\`\n\ncontent` format. (3) In `startAuto()`, after the auto-migration block, add a new block: if `gsd.db` exists and `!isDbAvailable()`, open it via dynamic import. (4) Add unit tests for new query functions.
  - Verify: `npm run test:unit -- --test-name-pattern "context-store"` passes with new assertions; `npx tsc --noEmit` clean
  - Done when: `queryArtifact` and `queryProject` return correct data from test DB; DB opens at session start for existing DBs; all context-store tests pass

- [x] **T02: Rewire all prompt builders to use scoped DB queries with filesystem fallback** `est:45m`
  - Why: This is where token savings happen — replacing 19 `inlineGsdRootFile` calls with scoped DB queries (R008). Each builder gets filtered decisions/requirements instead of the full file.
  - Files: `src/resources/extensions/gsd/auto.ts`, `src/resources/extensions/gsd/tests/prompt-db.test.ts`
  - Do: (1) Create three DB-aware helper functions in auto.ts: `inlineDecisionsFromDb(base, milestoneId?)` — queries `queryDecisions({milestoneId, scope})`, formats with `formatDecisionsForPrompt`, wraps in `### Decisions\nSource: \`.gsd/DECISIONS.md\`\n\ncontent` format, falls back to `inlineGsdRootFile(base, "decisions.md", "Decisions")`. Similarly `inlineRequirementsFromDb(base, sliceId?)` and `inlineProjectFromDb(base)`. (2) Replace all 19 `inlineGsdRootFile` calls with the appropriate helper, passing the correct scope per the Injection Matrix: research-milestone gets `milestoneId` for decisions + all active requirements; plan-slice gets milestone+arch scope decisions + slice-filtered requirements; etc. (3) `buildExecuteTaskPrompt` is NOT touched — it doesn't use `inlineGsdRootFile`. (4) Write `prompt-db.test.ts` that creates an in-memory DB with test data, verifies DB-aware helpers return scoped content, verifies fallback produces non-null output when DB unavailable.
  - Verify: `npm run test:unit -- --test-name-pattern "prompt-db"` passes; `npx tsc --noEmit` clean; `npm run test:unit` full suite passes
  - Done when: All 19 `inlineGsdRootFile` calls replaced with DB-aware helpers; helpers produce scoped content from DB and fall back to filesystem; test file validates both paths

- [x] **T03: Wire dual-write re-import in handleAgentEnd** `est:20m`
  - Why: After each dispatch unit, the LLM may have written/modified markdown files (DECISIONS.md, REQUIREMENTS.md, summaries). The DB must re-import these to stay in sync for the next unit's prompt building (R009).
  - Files: `src/resources/extensions/gsd/auto.ts`, `src/resources/extensions/gsd/tests/prompt-db.test.ts`
  - Do: (1) In `handleAgentEnd`, after the auto-commit + doctor + rebuildState block but before hooks/dispatch, add a DB re-sync block: if `isDbAvailable()`, dynamically import `md-importer.js` and call `migrateFromMarkdown(basePath)`. Wrap in try/catch — re-import failure is non-fatal (log to stderr). (2) Add a test in `prompt-db.test.ts` that verifies re-import updates DB rows when source markdown changes.
  - Verify: `npm run test:unit -- --test-name-pattern "prompt-db"` passes; `npx tsc --noEmit` clean; `npm run test:unit` full suite — no regressions
  - Done when: `handleAgentEnd` re-imports markdown into DB after auto-commit; re-import failure doesn't block dispatch; test proves DB updates after file change

## Files Likely Touched

- `src/resources/extensions/gsd/context-store.ts`
- `src/resources/extensions/gsd/auto.ts`
- `src/resources/extensions/gsd/tests/context-store.test.ts`
- `src/resources/extensions/gsd/tests/prompt-db.test.ts`
