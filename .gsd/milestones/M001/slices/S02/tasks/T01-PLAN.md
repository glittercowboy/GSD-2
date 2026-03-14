---
estimated_steps: 5
estimated_files: 2
---

# T01: Integrate models.dev into ModelRegistry

**Slice:** S02 — Integrate into ModelRegistry
**Milestone:** M001

## Description

Replace the static MODELS import in ModelRegistry with runtime models.dev fetching. The integration must:
1. Use cached models.dev data when available (sync read)
2. Fall back to static MODELS when no cache exists
3. Fire off async refresh in background to keep cache fresh
4. Preserve all existing provider-level and per-model override logic

## Steps

1. **Add imports from S01**
   - Import `getModelsDev`, `getCachedModelsDev`, `mapToModelRegistry` from `@gsd/pi-ai`
   - These are the S01 functions that handle fetch/cache/fallback

2. **Modify `loadBuiltInModels()` for sync cache-first approach**
   - Call `getCachedModelsDev()` (sync) to check for cached data
   - If cache exists: use `mapToModelRegistry(cache.data)` to get models
   - If no cache: fall back to current `getProviders()` + `getModels()` static behavior
   - All existing override logic (provider baseUrl/headers, modelOverrides) applies to whichever source is used

3. **Add async `refreshFromModelsDev()` method**
   - Calls `getModelsDev()` async (handles fetch with timeout, cache write, fallback)
   - Maps result via `mapToModelRegistry()`
   - Re-applies all overrides using existing `loadBuiltInModels()` override logic
   - Updates `this.models` with merged result
   - Returns Promise<void> (fire-and-forget from constructor)

4. **Wire async refresh into constructor**
   - After sync `loadModels()` completes, call `this.refreshFromModelsDev()` without awaiting
   - This ensures models are available immediately (from cache or static) while refreshing in background

5. **Write unit tests proving integration**
   - Test: cache hit → models.dev data used with overrides applied
   - Test: cache miss + network failure → static MODELS fallback with overrides
   - Test: refresh updates models while preserving overrides
   - Test: local models.json custom models merge with models.dev models

## Must-Haves

- [ ] `loadBuiltInModels()` uses cached models.dev data when available
- [ ] Static MODELS fallback when `getCachedModelsDev()` returns null
- [ ] `refreshFromModelsDev()` method exists and updates models async
- [ ] All existing override tests still pass
- [ ] New tests prove models.dev integration works

## Verification

- `bun test packages/pi-coding-agent/src/core/model-registry.test.ts` — All tests pass
- Manual: `pi --list-models` shows models (from cache if available, static otherwise)

## Observability Impact

- Signals added/changed: None in this slice (S01 handles cache/network diagnostics)
- How a future agent inspects this: Check `~/.gsd/agent/cache/models-dev.json` for current cached data
- Failure state exposed: Static fallback ensures CLI always works; check cache file to diagnose data issues

## Inputs

- `packages/pi-ai/src/models-dev.ts` — `getModelsDev()`, `getCachedModelsDev()` functions
- `packages/pi-ai/src/models-dev-mapper.ts` — `mapToModelRegistry()` function
- `packages/pi-coding-agent/src/core/model-registry.ts` — Current implementation with override logic
- S01 summary — Proves fetch/cache/fallback chain works with 31 unit tests

## Expected Output

- `packages/pi-coding-agent/src/core/model-registry.ts` — Updated to use models.dev data with cache-first + static fallback
- `packages/pi-coding-agent/src/core/model-registry.test.ts` — New tests proving integration works
