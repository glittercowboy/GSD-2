# S01: Engine Abstraction Layer — Research

**Date:** 2026-03-21
**Depth:** Light research — straightforward interface extraction with a proven reference implementation on `feat/declarative-workflow-engine-v2`

## Summary

S01 introduces four new files (`engine-types.ts`, `workflow-engine.ts`, `execution-policy.ts`, `engine-resolver.ts`) and adds `activeEngineId` to `AutoSession`. All four files are pure type contracts with no runtime behavior beyond the resolver's factory function. The prior PR #1554 (`feat/declarative-workflow-engine-v2`) has working implementations of all four files that are well-designed — `engine-types.ts` is correctly constrained as a leaf node (no GSD imports), and the interfaces map cleanly to the existing `LoopDeps` injection points (`deriveState`, `resolveDispatch`).

The prior PR's resolver imports `DevWorkflowEngine`, `DevExecutionPolicy`, `CustomWorkflowEngine`, and `CustomExecutionPolicy` — implementations that don't exist yet on main. S01's resolver must import only what exists: it should export the `ResolvedEngine` type and `resolveEngine()` function but stub the routing to only handle `"dev"` (throwing for unknown IDs), leaving custom engine routing for S04.

**Target requirement:** R001 — `WorkflowEngine` and `ExecutionPolicy` interfaces define the contract; engine resolver routes sessions by engine ID.

## Recommendation

Port the four files from the prior PR with these adjustments:

1. **`engine-types.ts`** — take as-is from the PR. It's a leaf node with no imports from GSD modules. All types (`EngineState`, `EngineDispatchAction`, `StepContract`, `DisplayMetadata`, `CompletedStep`, `ReconcileResult`, `RecoveryAction`, `CloseoutResult`) are well-designed.

2. **`workflow-engine.ts`** — take as-is. Interface with four methods: `deriveState()`, `resolveDispatch()`, `reconcile()`, `getDisplayMetadata()`. Only imports from `engine-types.ts`.

3. **`execution-policy.ts`** — take as-is. Interface with five methods: `prepareWorkspace()`, `selectModel()`, `verify()`, `recover()`, `closeout()`. Only imports from `engine-types.ts`.

4. **`engine-resolver.ts`** — **modify** from the PR: remove `DevWorkflowEngine`/`DevExecutionPolicy`/`CustomWorkflowEngine`/`CustomExecutionPolicy` imports (those classes don't exist yet). Export `ResolvedEngine` interface and `resolveEngine()` function that throws `"No engines registered — S02 provides DevWorkflowEngine"` for any input. This establishes the routing contract without forward-depending on unbuilt classes.

5. **`AutoSession.activeEngineId`** — add `activeEngineId: string | null = null` property to session, include in `reset()` and `toJSON()`. Identical to the PR's diff.

Do **not** port `loop-deps-groups.ts` — that's an S02 concern (restructuring LoopDeps around the engine interfaces). S01 is strictly the type contracts and resolver skeleton.

## Implementation Landscape

### Key Files

- `src/resources/extensions/gsd/engine-types.ts` — **NEW**. Leaf node. All engine-polymorphic types: `EngineState`, `EngineDispatchAction`, `StepContract`, `DisplayMetadata`, `CompletedStep`, `ReconcileResult`, `RecoveryAction`, `CloseoutResult`. Zero imports from GSD modules (only `node:` allowed).
- `src/resources/extensions/gsd/workflow-engine.ts` — **NEW**. `WorkflowEngine` interface with `engineId`, `deriveState()`, `resolveDispatch()`, `reconcile()`, `getDisplayMetadata()`. Imports only from `engine-types.ts`.
- `src/resources/extensions/gsd/execution-policy.ts` — **NEW**. `ExecutionPolicy` interface with `prepareWorkspace()`, `selectModel()`, `verify()`, `recover()`, `closeout()`. Imports only from `engine-types.ts`.
- `src/resources/extensions/gsd/engine-resolver.ts` — **NEW**. `ResolvedEngine` type and `resolveEngine(session)` factory. S01 version stubs routing (no implementations exist yet). S02 will wire `DevWorkflowEngine`/`DevExecutionPolicy` and S04 wires custom engines.
- `src/resources/extensions/gsd/auto/session.ts` — **MODIFY**. Add `activeEngineId: string | null = null` property, include in `reset()` and `toJSON()`.
- `src/resources/extensions/gsd/tests/engine-interfaces-contract.test.ts` — **NEW**. Contract tests using source-level assertions (same pattern as `auto-session-encapsulation.test.ts`). Dynamic imports verify module resolution; regex on source verifies interface shapes.

### Build Order

1. **`engine-types.ts`** first — it's the leaf node everything imports from. Verify it imports nothing from GSD.
2. **`workflow-engine.ts`** + **`execution-policy.ts`** next (parallel — no dependencies between them). Both import only from `engine-types.ts`.
3. **`engine-resolver.ts`** — imports from `workflow-engine.ts` and `execution-policy.ts`. S01 version exports types + a stub `resolveEngine()` that throws (no implementations to instantiate yet).
4. **`AutoSession.activeEngineId`** — add the property to `session.ts`. Small, isolated change.
5. **Contract tests** last — verify all four modules are importable, interface shapes match expectations, and `activeEngineId` exists on `AutoSession`.

### Verification Approach

1. **Import smoke tests** — dynamic `import()` of all four new modules confirms they parse cleanly under `--experimental-strip-types` with no circular dependencies.
2. **Source-level shape assertions** — regex-based tests (pattern from `auto-session-encapsulation.test.ts`) verify:
   - `EngineState` has fields: `phase`, `currentMilestoneId`, `activeSliceId`, `activeTaskId`, `isComplete`, `raw`
   - `EngineState.raw` is typed `unknown` (leaf node constraint)
   - `EngineDispatchAction` has `dispatch`, `stop`, `skip` variants
   - `WorkflowEngine` has methods: `deriveState`, `resolveDispatch`, `reconcile`, `getDisplayMetadata`
   - `WorkflowEngine` has `engineId` property
   - `ExecutionPolicy` has methods: `prepareWorkspace`, `selectModel`, `verify`, `recover`, `closeout`
   - `engine-types.ts` has zero imports from `../` or `./` GSD paths (leaf node guard)
3. **Runtime assertions** — `AutoSession.activeEngineId` defaults to `null`, appears in `reset()` and `toJSON()`.
4. **Resolver test** — `resolveEngine({ activeEngineId: null })` throws (no engines registered in S01); type export `ResolvedEngine` is importable.
5. **Run command**: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/engine-interfaces-contract.test.ts`

## Constraints

- **Leaf node rule**: `engine-types.ts` must have zero imports from any GSD module (`types.ts`, `auto-dispatch.ts`, etc.) to prevent circular dependencies. The prior PR enforces this correctly — `EngineState.raw` is typed `unknown` rather than `GSDState`.
- **`--experimental-strip-types`**: interfaces are erased at runtime. Tests must use source-level regex assertions (not `instanceof` or type reflection). This is already the established pattern.
- **No forward dependencies**: S01's `engine-resolver.ts` cannot import implementation classes that don't exist yet. The stub must throw or return a sentinel.
- **AutoSession maintenance rule**: all mutable auto-mode state must be a class property on `AutoSession`, not a module-level variable. Existing encapsulation test (`auto-session-encapsulation.test.ts`) enforces this.

## Common Pitfalls

- **Resolver importing non-existent implementations** — the prior PR's `engine-resolver.ts` imports `DevWorkflowEngine`, `DevExecutionPolicy`, `CustomWorkflowEngine`, `CustomExecutionPolicy`. If ported verbatim, it will fail to import. S01 must stub the resolver body or use lazy imports guarded behind the engine ID check.
- **Missing `activeEngineId` in `reset()`** — if the property is added but not cleared in `reset()`, stale engine IDs survive across `stopAuto()`/`startAuto()` cycles. The prior PR correctly includes it in `reset()`.
