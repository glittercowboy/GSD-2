# S02: Integrate into ModelRegistry — Research

**Date:** 2026-03-14

## Summary

S02 integrates the models.dev fetching infrastructure from S01 into the ModelRegistry, replacing the static `MODELS` import with runtime fetching via `getModelsDev()` + `mapToModelRegistry()`. The slice owns R005 (preserve local models.json overrides) and supports R001 (runtime fetching).

**Primary recommendation:** Modify `ModelRegistry.loadBuiltInModels()` to call `getModelsDev()` instead of `getProviders()` + `getModels()`, then merge the fetched models with local `models.json` overrides using the existing merge logic. The integration should be non-breaking: if `getModelsDev()` returns null (no cache, no network), fall back to the current static `MODELS` behavior to avoid bricking the CLI.

Key insight: The ModelRegistry already has sophisticated merge logic for custom models and provider overrides. S02只需要 replaces the data source for "built-in" models - all the override/merge infrastructure stays the same.

## Recommendation

**What to do:** Replace `loadBuiltInModels()` to fetch from models.dev, map to `Model<Api>[]`, then apply provider/model overrides exactly as before. Add a fallback to static MODELS if fetch returns null.

**Why this approach:**
- Preserves all existing override logic (provider baseUrl/headers, per-model overrides)
- Maintains backward compatibility if models.dev is unavailable
- Minimal code changes - only one method needs modification
- Leverages S01's tested cache → fetch → fallback chain

**Integration point:** `packages/pi-coding-agent/src/core/model-registry.ts` line 299-330 (`loadBuiltInModels` method)

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Fetching models.dev API | `getModelsDev()` from S01 | Already implements cache → fetch → fallback with 12h TTL, version invalidation, 10s timeout |
| Schema transformation | `mapToModelRegistry()` from S01 | Zod-validated, tested mapper handles all field conversions |
| Provider/model overrides | `loadBuiltInModels()` + `applyModelOverride()` | Existing logic handles baseUrl, headers, cost, compat deep-merge |
| Custom model merging | `mergeCustomModels()` | Provider+ID matching, custom wins on conflicts |

## Existing Code and Patterns

- `packages/pi-coding-agent/src/core/model-registry.ts` — Current ModelRegistry implementation; `loadBuiltInModels()` is the primary integration point (lines 299-330)
- `packages/pi-ai/src/models-dev.ts` — S01's fetch/cache orchestration; `getModelsDev()` returns `ModelsDevData | null`
- `packages/pi-ai/src/models-dev-mapper.ts` — S01's `mapToModelRegistry()` transforms `ModelsDevData` to `Model<Api>[]`
- `packages/pi-ai/src/models.ts` — Current static MODELS import pattern (to be replaced)
- `packages/pi-coding-agent/src/config.ts` — `VERSION` and `getAgentDir()` used by S01's cache functions (lazy resolution via require())

**Pattern to follow:** S01's functions are designed for testability with optional parameters. Pass explicit `version` and `cachePath` in tests, use defaults in production. Never throw on network errors - `getModelsDev()` returns null on failure.

## Constraints

- **Must not block CLI startup on network** — `getModelsDev()` already handles this by checking cache first, fetching async only when expired
- **Must preserve local models.json overrides** — Existing `mergeCustomModels()` and `applyModelOverride()` logic must continue to work unchanged
- **Must work offline** — If `getModelsDev()` returns null (no cache, no network), fall back to static MODELS to avoid bricking
- **Node.js and Bun runtime compatibility** — S01's lazy `require()` for VERSION/getAgentDir avoids build-time import issues
- **TypeScript with --experimental-strip-types** — S01 uses `.ts` extensions in imports, which works with the custom ESM resolver

## Common Pitfalls

- **Importing pi-coding-agent at the top level** — S01 avoids this by using lazy `require()` inside `getDefaultCachePath()` and `getCurrentVersion()`. Don't add circular imports.
- **Forgetting to handle null return from getModelsDev()** — Network failures return null, not throw. Always check for null before mapping.
- **Breaking existing override logic** — The provider override Map and modelOverrides Map structures must stay exactly the same. Only change the data source.
- **Assuming models.dev schema matches our Model type** — S01's mapper handles the transformation. Don't try to use `ModelsDevData` directly in ModelRegistry.
- **Not testing offline fallback** — Critical path: no cache + no network must fall back to static MODELS, not crash.

## Open Risks

- **Provider ID mismatch** — models.dev provider IDs (e.g., "anthropic", "google") may not exactly match KnownProvider strings. The mapper uses substring matching (D010), which could fail for new providers. May need explicit mapping if issues surface.
- **Static MODELS becomes stale** — After integration, static MODELS is only used as a last-resort fallback. If models.dev changes schema significantly, the fallback could break. Acceptable risk since it's offline-only.
- **Testing complexity** — Unit tests need to mock `getModelsDev()` return values and verify override application. S01's testability (optional params) helps, but integration tests should prove end-to-end behavior.

## Skills Discovered

No new skills needed for this slice. S01 already provides all required infrastructure (fetch, cache, mapper). This is pure integration work.

## Sources

- S01 implementation: `.gsd/milestones/M001/slices/S01/S01-SUMMARY.md` — Proves fetch/cache/fallback chain works with 31 unit tests
- S01 forward intelligence: Notes that `getModelsDev()` handles the full chain, mapper transforms correctly, version comparison works
- ModelRegistry current implementation: `packages/pi-coding-agent/src/core/model-registry.ts` — Shows existing override/merge logic
- Decision D010: API type inference uses provider ID substring matching, defaults to 'openai-completions'
