---
estimated_steps: 5
estimated_files: 2
---

# T03: Wire expansion into resolveDispatch() and prove with integration test

**Slice:** S06 — Iteration with Durable Graph Expansion
**Milestone:** M001

## Description

Final task — wires the iterate config (T01) and expansion logic (T02) into `CustomWorkflowEngine.resolveDispatch()` so that when the next pending step has an `iterate` config in DEFINITION.yaml, the engine reads the source artifact, applies the regex, expands instances into GRAPH.yaml, and dispatches the first instance. Also updates `getDisplayMetadata()` to count only non-expanded steps for progress. Proven by a full integration test (3-step fan-out workflow) and a determinism proof (byte-identical GRAPH.yaml from identical input).

## Steps

1. **Modify `resolveDispatch()` in `custom-workflow-engine.ts`**: After the existing `const nextStep = getNextPendingStep(graph)` and before the dispatch return, add iterate expansion logic:
   - The method already reads DEFINITION.yaml and builds a `definition` object. Find the step definition matching `nextStep.id`.
   - Check if that step definition has an `iterate` field (now typed as `IterateConfig` from T01).
   - If yes and `nextStep.status === "pending"` (not yet expanded):
     a. **Idempotency guard**: Check if any step in the graph already has `parentStepId === nextStep.id`. If so, skip expansion (already done — re-read graph and re-query).
     b. Read the source artifact: `readFileSync(join(this.runDir, iterate.source), "utf-8")`. If file doesn't exist, return `{ action: "stop", reason: "Iterate source artifact not found: <path>" }`.
     c. Apply the regex pattern with global flag: `const regex = new RegExp(iterate.pattern, "gm"); let match; const items = []; while ((match = regex.exec(content)) !== null) { items.push(match[1] ?? match[0]); }`.
     d. If `items.length === 0`, return `{ action: "stop", reason: "Iterate pattern matched no items from <source>" }`.
     e. Call `expandIteration(graph, nextStep.id, items, nextStep.prompt)`. Import from `graph.ts`.
     f. `writeGraph(this.runDir, expandedGraph)`.
     g. Re-read graph: `const freshGraph = readGraph(this.runDir); const firstInstance = getNextPendingStep(freshGraph);`. Continue dispatch with `firstInstance`.
   - The `iterate` field on the step definition object needs to be included in the step mapping. Currently `resolveDispatch()` builds a minimal `WorkflowDefinition` from YAML — add `iterate` to the step mapping: `iterate: (s.iterate != null && typeof s.iterate === "object") ? s.iterate as IterateConfig : undefined`. Import `IterateConfig` from `definition-loader.ts`.

2. **Update `getDisplayMetadata()` in `custom-workflow-engine.ts`**: When counting steps for progress, exclude steps with `status === "expanded"` from the total. Change the total calculation:
   ```typescript
   const nonExpanded = rawState._graph?.steps.filter((s) => s.status !== "expanded") ?? [];
   const total = nonExpanded.length;
   const completed = nonExpanded.filter((s) => s.status === "complete").length;
   ```

3. **Add integration test** in `iteration-expansion.test.ts` (append to file created in T02): Full 3-step workflow test:
   - Write a DEFINITION.yaml with steps: `outline` (produces `outline.md`), `draft-chapter` (iterate: `{ source: "outline.md", pattern: "^## (.+)" }`, depends_on: `[outline]`), `review` (depends_on: `[draft-chapter]`).
   - Write a GRAPH.yaml via `graphFromDefinition()`.
   - Create engine: `new CustomWorkflowEngine(runDir)`.
   - Dispatch cycle: deriveState → resolveDispatch → reconcile for `outline`. Write `outline.md` with `## Chapter 1\n\n## Chapter 2\n\n## Chapter 3`.
   - Next dispatch triggers expansion: resolveDispatch should return first instance `draft-chapter--001`.
   - Verify GRAPH.yaml now has: outline (complete), draft-chapter (expanded), draft-chapter--001 (pending/active), --002 (pending), --003 (pending), review (pending with dependsOn on all 3 instances).
   - Complete all 3 instances via reconcile loop.
   - Final dispatch: review step should now be dispatchable (all instance deps complete).
   - Complete review. Verify all 5 dispatched steps.

4. **Add determinism proof test**: Expand the same artifact twice in separate run directories. Serialize both GRAPH.yaml files. Assert byte equality (after normalizing `created_at` timestamps which differ by test execution time — or use a fixed timestamp in the test setup).

5. **Add edge case tests**:
   - `"resolveDispatch: iterate with empty matches returns stop"` — source artifact has no matching lines → `{ action: "stop" }`.
   - `"resolveDispatch: iterate idempotency — double dispatch doesn't double-expand"` — call resolveDispatch twice without reconciling → instances exist from first call, second call skips expansion and returns first pending instance.

## Must-Haves

- [ ] `resolveDispatch()` triggers expansion lazily when iterate config detected on next pending step
- [ ] Source artifact read from run directory using `iterate.source` path
- [ ] Regex applied with global+multiline flags, capture group 1 extracted (fallback to group 0)
- [ ] Empty matches return `{ action: "stop" }` with descriptive reason
- [ ] Idempotency: existing instances for a parent skip re-expansion
- [ ] `getDisplayMetadata()` excludes expanded steps from total count
- [ ] Integration test proves 5-dispatch fan-out workflow
- [ ] Determinism proof: identical GRAPH.yaml from identical input
- [ ] All 4 slice-level verification commands pass

## Verification

- `node --experimental-strip-types --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/definition-loader.test.ts` — all pass
- `node --experimental-strip-types --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/iteration-expansion.test.ts` — all pass (unit + integration + determinism)
- `node --experimental-strip-types --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/custom-engine-integration.test.ts` — 11/11 pass (zero regressions)
- `npx tsc --noEmit --project tsconfig.extensions.json` — zero type errors

## Observability Impact

- Signals added/changed: `resolveDispatch()` now logs expansion via the stop action on empty matches; expanded GRAPH.yaml on disk shows full instance set
- How a future agent inspects this: Read GRAPH.yaml after expansion to see instance IDs, parent references, rewritten dependencies. Engine dispatch returns instance step IDs in the `step.unitId` field.
- Failure state exposed: Missing source artifact → stop with path in reason. No matches → stop with pattern + source in reason.

## Inputs

- `src/resources/extensions/gsd/graph.ts` — T02 output: `expandIteration()`, `"expanded"` status, `parentStepId` field
- `src/resources/extensions/gsd/definition-loader.ts` — T01 output: `IterateConfig` type, typed `StepDefinition.iterate`
- `src/resources/extensions/gsd/custom-workflow-engine.ts` — current file with `resolveDispatch()` and `getDisplayMetadata()`
- `src/resources/extensions/gsd/tests/iteration-expansion.test.ts` — T02 output: unit tests (append integration tests here)

## Expected Output

- `src/resources/extensions/gsd/custom-workflow-engine.ts` — `resolveDispatch()` gains iterate expansion logic (~40 lines added), `getDisplayMetadata()` updated for expanded steps (~5 lines changed). New imports: `expandIteration` from graph.ts, `IterateConfig` from definition-loader.ts.
- `src/resources/extensions/gsd/tests/iteration-expansion.test.ts` — integration test, determinism proof, edge case tests appended (~200 lines added)
