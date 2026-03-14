# S02: Integrate into ModelRegistry

**Goal:** Replace static MODELS import with runtime models.dev fetching in ModelRegistry, while preserving all existing override/merge logic and supporting offline fallback.

**Demo:** `pi --list-models` shows models from models.dev (via cache), local `~/.gsd/agent/models.json` overrides still apply, and CLI works offline when cache exists.

## Must-Haves

- ModelRegistry.loadBuiltInModels() uses models.dev data via getModelsDev() + mapToModelRegistry()
- Static MODELS fallback when getModelsDev() returns null (no cache, no network)
- All existing provider-level and per-model overrides continue to work unchanged
- CLI startup is not blocked on network requests

## Proof Level

- This slice proves: integration + operational
- Real runtime required: yes
- Human/UAT required: no

## Verification

- `bun test packages/pi-coding-agent/src/core/model-registry.test.ts` — Unit tests prove:
  - Cache hit → models.dev data used
  - Cache miss + network failure → static MODELS fallback
  - Local models.json overrides merge correctly with models.dev data
- `pi --list-models` — Manual smoke test shows models from cache/models.dev

## Observability / Diagnostics

- Runtime signals: None (S01 handles cache/network logging implicitly)
- Inspection surfaces: Cache file at `~/.gsd/agent/cache/models-dev.json` shows current data
- Failure visibility: Static fallback ensures CLI never bricks; cache file can be inspected

## Integration Closure

- Upstream surfaces consumed: `getModelsDev()`, `getCachedModelsDev()`, `mapToModelRegistry()` from S01
- New wiring introduced in this slice: ModelRegistry calls models.dev functions instead of static imports
- What remains before the milestone is truly usable end-to-end: S03 (bundled snapshot + cleanup of models.generated.ts)

## Tasks

- [x] **T01: Integrate models.dev into ModelRegistry** `est:2h`
  - Why: Replace static MODELS with runtime models.dev fetching while preserving override logic
  - Files: `packages/pi-coding-agent/src/core/model-registry.ts`, `packages/pi-coding-agent/src/core/model-registry.test.ts`
  - Do:
    1. Import `getModelsDev`, `getCachedModelsDev`, `mapToModelRegistry` from `@gsd/pi-ai`
    2. Modify `loadBuiltInModels()` to:
       - First try `getCachedModelsDev()` (sync) + `mapToModelRegistry()` for immediate cache use
       - If no valid cache, fall back to current `getProviders()` + `getModels()` static behavior
    3. Add async `refreshFromModelsDev()` method that:
       - Calls `getModelsDev()` to fetch/cache
       - Remaps via `mapToModelRegistry()`
       - Re-applies overrides and updates `this.models`
    4. Fire `refreshFromModelsDev()` from constructor (fire-and-forget) for background refresh
    5. Ensure all existing override logic (provider baseUrl/headers, modelOverrides) applies to models.dev data
  - Verify: Unit tests pass proving cache hit, fallback, and override scenarios work
  - Done when: `loadBuiltInModels()` uses models.dev data when available, static fallback works, all overrides apply correctly

## Files Likely Touched

- `packages/pi-coding-agent/src/core/model-registry.ts`
- `packages/pi-coding-agent/src/core/model-registry.test.ts`
