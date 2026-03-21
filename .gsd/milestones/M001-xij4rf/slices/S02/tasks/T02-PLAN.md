---
estimated_steps: 5
estimated_files: 7
skills_used:
  - test
---

# T02: Add matchedRule to DispatchAction and flowId to IterationContext, wire LoopDeps

**Slice:** S02 — Event Journal
**Milestone:** M001-xij4rf

## Description

Add the type-level plumbing that enables journal emission with rule provenance and flow grouping. The `matchedRule` field on `DispatchAction` connects journal events to rule names (R010). The `flowId` on `IterationContext` groups events per iteration (R008). The `emitJournalEvent` on `LoopDeps` is the integration seam — loop.ts and phases.ts call through deps, never importing journal.ts directly.

## Steps

1. **Modify `src/resources/extensions/gsd/auto-dispatch.ts`**: Add `matchedRule?: string` to the `action: "dispatch"` variant and the `action: "stop"` variant of `DispatchAction`. This is additive — all existing code that destructures these types is unaffected because the field is optional. CAUTION: `src/resources/extensions/gsd/tests/token-profile.test.ts` reads `auto-dispatch.ts` as a string — check that test after making changes to ensure structural assertions still pass (run `node --test src/resources/extensions/gsd/tests/token-profile.test.ts`).

2. **Modify `src/resources/extensions/gsd/rule-registry.ts`**: In `evaluateDispatch()`, when a rule matches and returns a non-null result, set `result.matchedRule = rule.name` before returning. On the fallback stop action (no match), set `matchedRule: "<no-match>"`. Also update the `resolveDispatch()` fallback path in `auto-dispatch.ts` to attach `matchedRule: rule.name` in the inline loop and `matchedRule: "<no-match>"` on the fallback stop.

3. **Modify `src/resources/extensions/gsd/auto/types.ts`**: Add `flowId: string` to `IterationContext`. Also add `nextSeq: () => number` to `IterationContext` — this is a closure that returns auto-incrementing sequence numbers starting from 1, reset per iteration. This approach keeps seq management co-located with flowId and avoids threading a counter through every function signature.

4. **Modify `src/resources/extensions/gsd/auto/loop-deps.ts`**: Import `JournalEntry` type from `../journal.js`. Add `emitJournalEvent: (entry: JournalEntry) => void` to the `LoopDeps` interface. Note: the basePath is baked into the closure by auto.ts — callers pass only the entry.

5. **Modify `src/resources/extensions/gsd/auto.ts`**: In `buildLoopDeps()`, import `emitJournalEvent as _emitJournalEvent` from `./journal.js`. Wire it as: `emitJournalEvent: (entry) => _emitJournalEvent(s.basePath, entry)` where `s` is the session object accessible in `buildLoopDeps`'s closure scope. Verify `s.basePath` is accessible — check how `lockBase` is wired (it's `() => lockBase()` which uses the module-level session, confirming the same pattern works).

6. **Add test to `src/resources/extensions/gsd/tests/rule-registry.test.ts`**: New test `"evaluateDispatch result includes matchedRule"` — create a registry with one dispatch rule, evaluate a matching context, assert `result.matchedRule === rule.name`. Also test the no-match case: assert `result.matchedRule === "<no-match>"` on the stop fallback.

7. **Run existing tests**: `node --test src/resources/extensions/gsd/tests/rule-registry.test.ts`, `node --test src/resources/extensions/gsd/tests/triage-dispatch.test.ts`, `node --test src/resources/extensions/gsd/tests/dispatch-guard.test.ts`, `node --test src/resources/extensions/gsd/tests/token-profile.test.ts`.

## Must-Haves

- [ ] `DispatchAction` `dispatch` variant has `matchedRule?: string`
- [ ] `DispatchAction` `stop` variant has `matchedRule?: string`
- [ ] `evaluateDispatch()` attaches `matchedRule` = rule name on match, `"<no-match>"` on fallback
- [ ] `IterationContext` has `flowId: string` and `nextSeq: () => number`
- [ ] `LoopDeps` has `emitJournalEvent: (entry: JournalEntry) => void`
- [ ] `buildLoopDeps()` in auto.ts wires `emitJournalEvent` from journal.ts
- [ ] All existing dispatch/hook tests pass with zero regression

## Verification

- `node --test src/resources/extensions/gsd/tests/rule-registry.test.ts` — all tests pass including new matchedRule test
- `node --test src/resources/extensions/gsd/tests/triage-dispatch.test.ts` — no regression
- `node --test src/resources/extensions/gsd/tests/dispatch-guard.test.ts` — no regression
- `node --test src/resources/extensions/gsd/tests/token-profile.test.ts` — no regression on structural assertions

## Inputs

- `src/resources/extensions/gsd/journal.ts` — `JournalEntry` type and `emitJournalEvent` function (from T01)
- `src/resources/extensions/gsd/auto-dispatch.ts` — `DispatchAction` type to modify
- `src/resources/extensions/gsd/rule-registry.ts` — `RuleRegistry.evaluateDispatch()` to enrich
- `src/resources/extensions/gsd/auto/types.ts` — `IterationContext` to extend
- `src/resources/extensions/gsd/auto/loop-deps.ts` — `LoopDeps` interface to extend
- `src/resources/extensions/gsd/auto.ts` — `buildLoopDeps()` to wire

## Expected Output

- `src/resources/extensions/gsd/auto-dispatch.ts` — `matchedRule` added to `DispatchAction` variants
- `src/resources/extensions/gsd/rule-registry.ts` — `evaluateDispatch()` attaches `matchedRule`
- `src/resources/extensions/gsd/auto/types.ts` — `flowId` and `nextSeq` on `IterationContext`
- `src/resources/extensions/gsd/auto/loop-deps.ts` — `emitJournalEvent` on `LoopDeps`
- `src/resources/extensions/gsd/auto.ts` — wiring in `buildLoopDeps()`
- `src/resources/extensions/gsd/tests/rule-registry.test.ts` — new matchedRule test
