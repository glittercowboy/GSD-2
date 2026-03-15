---
estimated_steps: 5
estimated_files: 2
---

# T02: Rewire all prompt builders to use scoped DB queries with filesystem fallback

**Slice:** S03 — Core Hierarchy + Full Query Layer + Prompt Rewiring
**Milestone:** M001

## Description

Replace all 19 `inlineGsdRootFile` calls across 9 prompt builders with DB-aware helper functions that query scoped context from the DB and fall back to filesystem loading when the DB is unavailable. This is where the actual token savings materialize — each builder gets only the decisions/requirements relevant to its scope instead of the entire file.

## Steps

1. Create `inlineDecisionsFromDb(base: string, milestoneId?: string, scope?: string): Promise<string | null>` in `auto.ts`. Implementation: if `isDbAvailable()`, query `queryDecisions({milestoneId, scope})`. If results non-empty, format with `formatDecisionsForPrompt()`, wrap in `### Decisions\nSource: \`.gsd/DECISIONS.md\`\n\n` prefix. If DB unavailable or results empty, fall back to `inlineGsdRootFile(base, "decisions.md", "Decisions")`. Dynamic import `context-store.js` to avoid top-level dependency.

2. Create `inlineRequirementsFromDb(base: string, sliceId?: string): Promise<string | null>` in `auto.ts`. Same pattern — query `queryRequirements({sliceId})`, format, wrap, fall back.

3. Create `inlineProjectFromDb(base: string): Promise<string | null>` in `auto.ts`. Query `queryProject()` from context-store, wrap in `### Project\nSource: \`.gsd/PROJECT.md\`\n\n` format, fall back to `inlineGsdRootFile(base, "project.md", "Project")`.

4. Replace all 19 `inlineGsdRootFile` calls with the correct DB-aware helper per the Injection Matrix:
   - `buildResearchMilestonePrompt`: decisions(milestoneId), requirements(all active), project
   - `buildPlanMilestonePrompt`: decisions(milestoneId), requirements(all active), project
   - `buildResearchSlicePrompt`: decisions(milestoneId), requirements(sliceId=sid)
   - `buildPlanSlicePrompt`: decisions(milestoneId), requirements(sliceId=sid)
   - `buildCompleteSlicePrompt`: requirements(sliceId=sid)
   - `buildCompleteMilestonePrompt`: decisions(milestoneId), requirements(all active), project
   - `buildReplanSlicePrompt`: decisions(milestoneId)
   - `buildRunUatPrompt`: project
   - `buildReassessRoadmapPrompt`: decisions(milestoneId), requirements(all active), project

5. Write `prompt-db.test.ts` with tests: (a) DB-aware helpers return scoped content when DB has data, (b) helpers fall back to non-null output when DB unavailable (mocking `isDbAvailable` to false), (c) scoped filtering actually reduces content (insert 10 decisions for 3 milestones, query for 1 milestone, verify count < 10).

## Must-Haves

- [ ] Three DB-aware helper functions created with fallback logic
- [ ] All 19 `inlineGsdRootFile` calls replaced (zero remaining for decisions/requirements/project)
- [ ] Each builder passes correct scope parameters per Injection Matrix
- [ ] Fallback path works — builders produce valid prompts when DB unavailable
- [ ] `buildExecuteTaskPrompt` is NOT modified (it doesn't use `inlineGsdRootFile`)
- [ ] Template inlines (`inlineTemplate`) are NOT affected

## Verification

- `npm run test:unit -- --test-name-pattern "prompt-db"` — new test file passes
- `npx tsc --noEmit` — clean compilation
- `npm run test:unit` — full suite passes, no regressions
- `grep -c "inlineGsdRootFile" src/resources/extensions/gsd/auto.ts` — only the function definition remains, zero call sites

## Observability Impact

- **Signals changed**: Prompt builders now first attempt DB queries via `isDbAvailable()` + dynamic import of `context-store.js`. When DB is available, builders inject scoped (filtered) decisions/requirements/project content. When DB is unavailable, silent fallback to `inlineGsdRootFile` (per D003 — no stderr log for fallback, by design).
- **How a future agent inspects this task**: Call `isDbAvailable()` to verify DB state. Compare prompt output size with DB-scoped vs filesystem-loaded content. `grep -c "inlineGsdRootFile"` in auto.ts should show only the function definition (zero call sites).
- **Failure state visibility**: If DB queries return empty results (e.g., no decisions imported yet), helpers fall back to filesystem — same output as pre-DB behavior. No new error surfaces; failures degrade to pre-existing behavior.

## Inputs

- `src/resources/extensions/gsd/context-store.ts` — `queryDecisions`, `queryRequirements`, `queryProject`, `formatDecisionsForPrompt`, `formatRequirementsForPrompt` from S01/T01
- `src/resources/extensions/gsd/gsd-db.ts` — `isDbAvailable()` for fallback detection
- S03 Research Injection Matrix — exact scope parameters per builder

## Expected Output

- `src/resources/extensions/gsd/auto.ts` — 3 new helper functions, 19 call sites rewired
- `src/resources/extensions/gsd/tests/prompt-db.test.ts` — new test file validating DB-aware helpers and fallback
