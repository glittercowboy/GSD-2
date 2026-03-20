---
estimated_steps: 5
estimated_files: 2
---

# T02: Implement expandIteration() and "expanded" status in graph.ts

**Slice:** S06 — Iteration with Durable Graph Expansion
**Milestone:** M001

## Description

Core expansion logic. Adds the `"expanded"` status value to `GraphStep`, the optional `parentStepId` field for instance lineage, and the pure `expandIteration()` function that materializes matched items into concrete step instances. Also updates `getNextPendingStep()` to skip expanded steps and ensures YAML serialization handles the new fields.

This task is a pure data-layer change — no engine wiring. T03 connects it to `resolveDispatch()`.

## Steps

1. **Extend `GraphStep` type** in `graph.ts`:
   - Add `"expanded"` to the status union: `status: "pending" | "active" | "complete" | "expanded"`
   - Add optional `parentStepId?: string` field

2. **Update YAML serialization** in `graph.ts`:
   - In `writeGraph()` → `yamlData.steps` mapping: serialize `parent_step_id` only when `parentStepId` is defined (omit if absent, same pattern as `depends_on`)
   - In `readGraph()` → step mapping: read `parent_step_id` from YAML into `parentStepId`
   - Update the `YamlStep` internal interface to include optional `parent_step_id?: string`

3. **Update `getNextPendingStep()`** to skip expanded steps. Currently the function checks `step.status !== "pending"` and continues — "expanded" steps will already be skipped by this check since they're not "pending". Verify this is the case by reading the code. No code change needed if the logic is `if (step.status !== "pending") continue;`.

4. **Implement `expandIteration()`** as an exported pure function:
   ```typescript
   export function expandIteration(
     graph: WorkflowGraph,
     stepId: string,
     items: string[],
     promptTemplate: string,
   ): WorkflowGraph
   ```
   Logic:
   - Find the parent step by `stepId`. Throw if not found or if status isn't "pending".
   - Create instance steps: for each item at index `i`, create a `GraphStep` with:
     - `id`: `${stepId}--${String(i + 1).padStart(3, "0")}` (e.g., `draft-chapter--001`)
     - `title`: `${parentStep.title}: ${item}`
     - `status`: `"pending"`
     - `prompt`: `promptTemplate.replace(/\{\{item\}\}/g, item)`
     - `dependsOn`: copy of parent step's `dependsOn`
     - `parentStepId`: `stepId`
   - Mark parent step status as `"expanded"`.
   - Insert instances into the steps array immediately after the parent step's position.
   - Rewrite any step whose `dependsOn` includes `stepId` to replace that entry with all instance IDs.
   - Return a new `WorkflowGraph` (immutable — no mutation of input).

5. **Write unit tests** in a new file `src/resources/extensions/gsd/tests/iteration-expansion.test.ts`:
   - `"expandIteration creates correct number of instances"` — 3 items → 3 instances with correct IDs
   - `"expandIteration instance IDs are deterministic and zero-padded"` — verify `--001`, `--002`, `--003` format
   - `"expandIteration marks parent step as expanded"` — parent status is "expanded"
   - `"expandIteration rewrites downstream dependsOn"` — step depending on parent now depends on all instance IDs
   - `"expandIteration copies parent dependsOn to instances"` — if parent depends on step-A, instances also depend on step-A
   - `"expandIteration instance prompts replace {{item}} placeholder"` — prompt template `"Write about {{item}}"` + item `"Chapter 1"` → `"Write about Chapter 1"`
   - `"getNextPendingStep skips expanded steps"` — graph with expanded parent + pending instances → returns first instance
   - `"writeGraph/readGraph roundtrip preserves parentStepId and expanded status"` — write graph with instances, read back, verify parentStepId and status
   - `"expandIteration throws on missing stepId"` — stepId not in graph → throw
   - `"expandIteration throws on non-pending step"` — step already "complete" → throw

## Must-Haves

- [ ] `GraphStep.status` union includes `"expanded"`
- [ ] `GraphStep.parentStepId` is optional string, serialized as `parent_step_id` in YAML
- [ ] `expandIteration()` is exported, pure, and deterministic
- [ ] Instance IDs follow `<parentId>--<zeroPad3>` format
- [ ] Downstream `dependsOn` rewritten from parent ID to all instance IDs
- [ ] `getNextPendingStep()` never returns an expanded step
- [ ] YAML roundtrip preserves new fields
- [ ] Existing 11 engine integration tests pass (zero regressions)

## Verification

- `node --experimental-strip-types --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/iteration-expansion.test.ts` — all 10 unit tests pass
- `node --experimental-strip-types --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/custom-engine-integration.test.ts` — 11/11 pass (zero regressions)
- `npx tsc --noEmit --project tsconfig.extensions.json` — zero type errors

## Observability Impact

- Signals added/changed: `GraphStep.status` gains `"expanded"` value; `GraphStep.parentStepId` links instances to their parent for tracing
- How a future agent inspects this: `cat <runDir>/GRAPH.yaml` — expanded parent shows `status: expanded`, instances show `parent_step_id: <parentId>`
- Failure state exposed: `expandIteration()` throws on missing stepId or non-pending step with descriptive error messages

## Inputs

- `src/resources/extensions/gsd/graph.ts` — current file with `GraphStep.status: "pending" | "active" | "complete"`, no parentStepId, no expandIteration
- T01 output: `IterateConfig` type exported from `definition-loader.ts` (not directly consumed by this task, but T03 will bridge them)

## Expected Output

- `src/resources/extensions/gsd/graph.ts` — `expandIteration()` exported, `GraphStep` extended with "expanded" status + `parentStepId`, YAML serialization updated (~60 lines added)
- `src/resources/extensions/gsd/tests/iteration-expansion.test.ts` — new file with ~10 unit tests (~200 lines)
