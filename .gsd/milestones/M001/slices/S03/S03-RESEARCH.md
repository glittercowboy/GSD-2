# S03: Core Hierarchy + Full Query Layer + Prompt Rewiring — Research

**Date:** 2026-03-15
**Status:** Research complete

## Summary

S03 rewires all `build*Prompt()` functions in `auto.ts` to use DB queries from `context-store.ts` instead of raw `inlineGsdRootFile()` calls for decisions, requirements, and project data. The current codebase has 19 `inlineGsdRootFile` calls across 10 prompt builders, each loading the full markdown file (~50KB total across DECISIONS.md, REQUIREMENTS.md, PROJECT.md). The DB query layer already provides `queryDecisions(milestoneId?, scope?)` and `queryRequirements(sliceId?, status?)` with format functions — the core wiring is straightforward.

The main complexity is threefold: (1) the DB must be opened at session start (currently only opened during migration), (2) hierarchy artifacts (roadmaps, plans, summaries, contexts) in the `artifacts` table need query functions added to `context-store.ts`, and (3) dual-write must re-sync the DB after the LLM writes markdown files in `handleAgentEnd`. The fallback path (DB unavailable → existing markdown loading) is clean because every DB call already guards with `isDbAvailable()`.

## Recommendation

**Incremental rewiring with DB-first + filesystem fallback per call site.** Don't do a big-bang replacement. Instead:

1. **Open DB at session start** — add a DB open call in `startAuto()` that runs regardless of migration (detect existing `gsd.db` and open it). ~10 LOC.
2. **Extend context-store.ts** — add `queryArtifact(path)`, `queryProject()`, `formatProjectForPrompt()` functions. ~40 LOC.
3. **Create helper functions** in `auto.ts` — `inlineDecisionsFromDb(milestoneId?)`, `inlineRequirementsFromDb(sliceId?)`, `inlineProjectFromDb()` that try DB first, fall back to `inlineGsdRootFile`. These replace the 19 raw calls. ~60 LOC.
4. **Rewire each prompt builder** — replace `inlineGsdRootFile(base, "decisions.md", ...)` with the DB-aware helper. Each builder gets scoped queries (milestone-filtered decisions, slice-filtered requirements). ~100 LOC across all builders.
5. **Dual-write in handleAgentEnd** — after auto-commit, re-import changed files into DB. ~30 LOC.
6. **Tests** — unit tests for new context-store functions, integration test that prompt output with DB matches expected structure.

Total estimated effort: ~300 LOC of new/modified code across 3 files. No schema changes needed — v2 schema is sufficient.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Decision filtering | `queryDecisions(milestoneId?, scope?)` in context-store.ts | Already tested (47 assertions), handles superseded exclusion, returns typed Decision[] |
| Requirement filtering | `queryRequirements(sliceId?, status?)` in context-store.ts | Already tested, handles superseded rows, slice ownership matching via LIKE |
| Prompt-injectable formatting | `formatDecisionsForPrompt()`, `formatRequirementsForPrompt()` | Produces identical markdown table/section format as raw file loading |
| DB availability check | `isDbAvailable()` in gsd-db.ts | Guards all DB access; false before open, false after close, false when no provider |
| Markdown import | `migrateFromMarkdown()` in md-importer.ts | Already imports all artifact types with idempotent upserts |
| File loading fallback | `inlineGsdRootFile()` in auto.ts | Existing function stays as fallback when DB unavailable |

## Existing Code and Patterns

- `src/resources/extensions/gsd/auto.ts` (3943 lines) — 10 prompt builders at lines 2621–3140, `inlineGsdRootFile` helper at line 2610, `inlineFile`/`inlineFileOptional` at lines 2553–2575. The `handleAgentEnd` at line 881 is the integration point for dual-write (after auto-commit, before next dispatch).
- `src/resources/extensions/gsd/context-store.ts` (163 lines) — `queryDecisions`, `queryRequirements`, `formatDecisionsForPrompt`, `formatRequirementsForPrompt`. All guard with `isDbAvailable()` + try/catch. This is where `queryArtifact` and `queryProject` need to be added.
- `src/resources/extensions/gsd/gsd-db.ts` (587 lines) — `openDatabase`, `closeDatabase`, `isDbAvailable`, `insertArtifact`. Has `_getAdapter()` for raw SQL but no `getArtifact` query function. The artifacts table has `path TEXT PRIMARY KEY, artifact_type TEXT, milestone_id TEXT, slice_id TEXT, task_id TEXT, full_content TEXT`.
- `src/resources/extensions/gsd/md-importer.ts` (526 lines) — `migrateFromMarkdown` orchestrator. Already called in `startAuto()` migration block. Can be reused for dual-write re-sync.
- `src/resources/extensions/gsd/prompt-loader.ts` — `loadPrompt()` does template variable substitution, `inlineTemplate()` wraps static instruction templates. **Not affected by S03** — templates are static text, not queryable data.
- `src/resources/extensions/gsd/files.ts` — `loadFile()` for filesystem reads, `parseSummary`, `parseContinue`, `parseRoadmap` for structured parsing. Stays relevant as fallback and for hierarchy file parsing in `buildExecuteTaskPrompt`.

## Injection Matrix (Current → Target)

Each prompt builder currently loads these data files via `inlineGsdRootFile`. S03 replaces with scoped DB queries:

| Prompt Builder | decisions.md | requirements.md | project.md | DB Query Scope |
|---|---|---|---|---|
| buildResearchMilestonePrompt | ✅ full | ✅ full | ✅ full | decisions: milestone+global scope; requirements: all active; project: full |
| buildPlanMilestonePrompt | ✅ full | ✅ full | ✅ full | decisions: milestone+global; requirements: all active; project: full |
| buildResearchSlicePrompt | ✅ full | ✅ full | — | decisions: milestone+arch scope; requirements: slice-filtered |
| buildPlanSlicePrompt | ✅ full | ✅ full | — | decisions: milestone+arch scope; requirements: slice-filtered |
| buildExecuteTaskPrompt | — | — | — | (no root files — uses task plan, slice excerpt, carry-forward) |
| buildCompleteSlicePrompt | — | ✅ full | — | requirements: slice-filtered |
| buildCompleteMilestonePrompt | ✅ full | ✅ full | ✅ full | decisions: milestone; requirements: all active; project: full |
| buildReplanSlicePrompt | ✅ full | — | — | decisions: milestone+arch scope |
| buildRunUatPrompt | — | — | ✅ full | project: full |
| buildReassessRoadmapPrompt | ✅ full | ✅ full | ✅ full | decisions: milestone+global; requirements: all active; project: full |

**Token savings come from:**
- Decisions (13KB full) → filtered to milestone scope (typically 3-8 decisions, ~2-4KB)
- Requirements (32KB full) → filtered to slice ownership (typically 2-5 requirements, ~2-5KB)
- Hierarchy files (roadmaps, plans, summaries) stay full — loaded from DB `full_content` blobs or filesystem fallback

## Constraints

- **Named parameters must use colon-prefix** (`:id`, `:scope`) — required for `node:sqlite` compatibility (D010, S01 forward intelligence).
- **`DbAdapter` null-prototype normalization** — all row access must go through the adapter's `normalizeRow` spread. Direct property checks like `instanceof Object` will fail on unnormalized rows.
- **`buildExecuteTaskPrompt` is not a rewire candidate for root files** — it doesn't use `inlineGsdRootFile` at all. It loads task-specific files (task plan, slice plan excerpt, continue file, prior summaries) via `loadFile()` and parsers. These could optionally read from DB artifacts table but the savings are minimal and the complexity is high.
- **Template inlines (`inlineTemplate`) must not be affected** — these load static instruction templates from `templates/` directory, not data. They stay as-is.
- **DB must be opened before any prompt builder runs** — currently only opened during migration. Need to open at session start unconditionally.
- **Dynamic import pattern must be preserved** — `auto.ts` uses `await import("./gsd-db.js")` to avoid top-level dependency (D014). The DB open at session start should follow the same pattern.
- **`handleAgentEnd` is the only safe dual-write hook** — it runs after auto-commit, before next dispatch. The 500ms settle delay is already there. Re-importing changed files here keeps DB in sync.

## Common Pitfalls

- **Forgetting the fallback path** — Every DB query call in a prompt builder must have a fallback to the existing `inlineGsdRootFile` call. If `isDbAvailable()` returns false, the builder must still work. Test both paths.
- **Breaking the `inlinedContext` format** — Prompt builders assemble `inlined: string[]` and join with `---` separators. DB-sourced content must produce the same `### Label\nSource: \`path\`\n\ncontent` format or the template variable substitution in `loadPrompt()` will break.
- **Over-filtering on first dispatch** — The very first research-milestone dispatch runs before any decisions or requirements exist for that milestone. DB queries returning empty results must not produce empty sections that confuse the LLM — use the "global scope" fallback to include all active decisions when milestone-specific filtering returns nothing.
- **Re-import timing in dual-write** — `handleAgentEnd` must re-import *after* the auto-commit (which stages the LLM's file writes) but *before* the next `dispatchNextUnit()`. The current code flow already has this ordering: auto-commit → doctor → rebuildState → artifact verification → hooks → dispatch. Insert DB re-sync after auto-commit.
- **Hierarchy artifacts as full_content blobs** — The `artifacts` table stores roadmaps/plans/summaries as raw markdown blobs. Don't try to parse them into structured fields — that's S06 territory. For S03, just serve the blob as-is for `inlineFile` equivalents.
- **Missing DB open for existing projects** — If `gsd.db` already exists (migration happened on a previous run), the current code in `startAuto()` skips the migration block entirely. The DB is never opened. This is the #1 bug waiting to happen.

## Open Risks

- **Prompt output equivalence testing is hard** — There's no existing test that compares prompt builder output before/after. The prompt builders are deeply integrated into `auto.ts` with many dependencies (`resolveSliceFile`, `parseRoadmap`, etc.). A full integration test would need to set up a realistic `.gsd/` tree with DB and verify output matches. Consider snapshot-based testing.
- **Stale DB after manual edits** — If a user manually edits DECISIONS.md or REQUIREMENTS.md between dispatch units, the DB won't reflect those changes until the next `handleAgentEnd` cycle. This is acceptable for auto-mode (no manual edits expected) but worth documenting.
- **`migrateFromMarkdown` performance on large projects** — Re-importing all files in `handleAgentEnd` after every unit could be slow on projects with 50+ artifacts. Consider selective re-import (only re-import files modified since last import, using mtime or git diff).

## Architecture Decision: Dual-Write Direction

The LLM writes markdown files → `handleAgentEnd` re-imports them into DB. This is the correct direction because:

1. The LLM's output format is markdown (prompt templates expect markdown output)
2. The existing auto-commit flow stages markdown files to git
3. Re-import is idempotent (INSERT OR REPLACE) and fast (<5ms for typical file sets)
4. The filesystem remains the rollback safety net (delete `gsd.db` → rebuild from markdown)

The alternative (LLM writes to DB → generate markdown) is S06 territory (structured LLM tools).

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| SQLite | martinholovsky/claude-skills-generator@sqlite-database-expert | available (554 installs) — general SQLite expertise, not directly needed for this narrow DB query work |
| better-sqlite3 | — | none found |
| node:sqlite | — | none found |

No skills are directly relevant to this slice's work. The DB layer and query patterns are already established by S01/S02.

## Sources

- S01 Summary: Provider chain, DbAdapter interface, query/format function signatures, colon-prefix parameter convention
- S02 Summary: Schema v2 with artifacts table, migrateFromMarkdown orchestrator, auto-migration hookup in startAuto()
- `auto.ts` source: 19 `inlineGsdRootFile` calls, 10 prompt builders, `handleAgentEnd` flow at line 881
- `context-store.ts` source: existing queryDecisions/queryRequirements with format functions
- `gsd-db.ts` source: openDatabase/closeDatabase/isDbAvailable/insertArtifact — no artifact query functions
