# M002: Model Registry Hardening and Real-Scenario Verification — Research

**Date:** 2026-03-14

## Summary

The M001 implementation established a functional models.dev fetch/cache/snapshot/override flow, but the verification path has significant gaps that undermine trust. The current test suite operates primarily at the contract level with mocked data, while the actual startup path involves complex filesystem interactions, cache state management, and live network calls that remain unproven under realistic conditions.

Three critical issues block trustworthy verification: (1) **Build failures** in `@gsd/pi-ai` prevent the package from compiling due to `.ts` extension imports in test files and a nullability bug in `models-dev.ts` line 179 where `cache.data` is accessed after a validity check that doesn't narrow TypeScript's type; (2) **Test infrastructure gaps** mean the existing tests prove the mapper and cache functions work in isolation, but don't exercise the actual `ModelRegistry` constructor startup path with production-like filesystem states; (3) **No live verification** exists against the real models.dev API, so upstream compatibility is unknown until runtime.

The primary recommendation is to sequence work as: **first repair the build** (fix test import extensions and the cache nullability issue), **then add production-like scenario tests** that use temporary home directories to prove cache-hit, cache-miss, stale-cache, version-mismatch, and override scenarios through the real startup path, **finally add live models.dev verification** as an explicit part of the main suite with clear diagnostics for network-dependent failures.

## Recommendation

Focus M002 execution on three sequential workstreams:

1. **Build/Test Infrastructure Repair (R007)**: Fix the immediate compilation errors in `@gsd/pi-ai` so the registry path can be built and tested through standard workflows. This includes removing `.ts` extensions from test imports (the Node16 module resolution with `allowImportingTsExtensions: false` requires `.js` specifiers even for `.ts` sources), fixing the `cache.data` nullability issue in `models-dev.ts`, and ensuring the test resolver properly handles the registry test files.

2. **Production-Like Scenario Testing (R008)**: Add integration tests that exercise the real `ModelRegistry` constructor startup path using temporary directories (`tmpdir()`) with controlled filesystem states: no cache (fresh install), valid cache (cache hit), expired cache (TTL exceeded), version-mismatched cache (version change trigger), stale cache with network failure (offline fallback), and models.json overrides applied correctly. These tests should prove the actual startup behavior, not just the individual cache/fetch functions.

3. **Live models.dev Verification (R009)**: Add at least one test that fetches from the real models.dev API and validates the response structure, field presence, and mapper compatibility. This test should be explicitly marked as network-dependent, have a longer timeout (30s), and fail loudly with clear diagnostics if the upstream API changes in breaking ways.

Code quality improvements (R010) should emerge from the review findings during this work — specifically addressing the `require()` calls for VERSION/getAgentDir in `models-dev.ts` which work but create brittle build-time vs runtime coupling, and ensuring consistent error handling and diagnostics throughout the registry path.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Temporary directory management for tests | Node.js `tmpdir()` + `mkdtempSync()` | Already used in `models-dev.test.ts`; provides clean isolation without manual cleanup |
| Cache file path resolution | `getDefaultCachePath()` with fallback logic | Handles both runtime and test environments; avoids hardcoding paths |
| TypeScript test execution | Custom ESM resolver (`resolve-ts.mjs` + `resolve-ts-hooks.mjs`) | Project already has this infrastructure; just needs proper configuration |
| Zod schema validation | Existing `ModelsDevData` schema in `models-dev-types.ts` | Single source of truth for models.dev API structure; already validated |
| Model registry override logic | `applyModelOverride()` helper in `model-registry.ts` | Deep-merges nested objects (cost, compat) correctly; don't duplicate |

## Existing Code and Patterns

- `packages/pi-coding-agent/src/core/model-registry.ts` — Actual startup path; constructor calls `loadModels()` synchronously then `refreshFromModelsDev()` fire-and-forget; applies overrides via `applyOverridesToModels()` helper; lines 316-360 show the cache→snapshot→static fallback chain
- `packages/pi-coding-agent/src/core/model-registry.test.ts` — Existing integration tests use `homedir()`-based paths (not temporary directories), which means tests mutate the actual `~/.gsd/agent/` directory; tests prove override application but don't cover all lifecycle scenarios
- `packages/pi-ai/src/models-dev.ts` — Cache orchestration with `getCachedModelsDev()`, `isCacheValid()`, `writeCache()`, `fetchModelsDev()`, and `getModelsDev()`; has TypeScript nullability bug at line 179 where `cache.data` is accessed after `isCacheValid()` check that doesn't narrow the type
- `packages/pi-ai/src/models-dev.test.ts` — Unit tests for cache functions using temporary directories correctly; proves cache hit/miss/TTL/version-check behavior but doesn't test the ModelRegistry integration
- `packages/pi-ai/src/models-dev-mapper.test.ts` — Mapper tests with sample data; uses `.ts` import extensions which fail TypeScript compilation with current tsconfig
- `packages/pi-ai/src/models-dev-snapshot.ts` — Bundled snapshot generated from live models.dev data; used as intermediate fallback when cache miss occurs
- `src/resources/extensions/gsd/tests/resolve-ts.mjs` and `resolve-ts-hooks.mjs` — Custom ESM resolver that rewrites `.js` imports to `.ts` for test execution; works but test files still need to use `.js` specifiers to satisfy TypeScript compiler

## Constraints

- **Node.js version**: Requires Node >=20.6.0 (from root `package.json` engines field)
- **TypeScript configuration**: `allowImportingTsExtensions: false` in `@gsd/pi-ai/tsconfig.json` means test files must use `.js` import specifiers even though sources are `.ts`
- **Module resolution**: Node16 module resolution with ES2024 target requires explicit `.js` extensions in imports
- **Circular dependency avoidance**: `models-dev.ts` uses `require()` for `VERSION` and `getAgentDir` to avoid requiring `@gsd/pi-coding-agent` at import time (which would fail before the package is built)
- **Fallback chain preservation**: Any changes must preserve the cache → snapshot → static fallback order established in M001
- **User override preservation**: `models.json` overrides must be re-applied after async refresh completes (current implementation does this via `loadOverridesFromModelsJson()` helper)

## Common Pitfalls

- **Test pollution from homedir() usage** — The current `model-registry.test.ts` uses `getAgentDir()` which resolves to the actual `~/.gsd/agent/` directory, meaning tests mutate the user's real cache and config files. Always use `tmpdir()` + `mkdtempSync()` for test isolation and clean up with `rmSync()` in `after()` hooks.

- **TypeScript nullability after type guards** — The `isCacheValid()` function doesn't narrow TypeScript's type for the `cache` parameter, so accessing `cache.data` after the check still produces a "possibly null" error. Either restructure the check (e.g., `if (cache && isCacheValid(...))`) or add a type assertion.

- **Async refresh timing in tests** — The constructor's `refreshFromModelsDev()` is fire-and-forget async, so tests that verify post-refresh state must `await` a delay or provide a test hook to wait for completion. The existing test at line 331 uses `await new Promise(resolve => setTimeout(resolve, 100))` which is fragile.

- **Import specifier mismatches** — Test files using `.ts` extensions in imports will fail TypeScript compilation even though the runtime resolver rewrites them. Always use `.js` in import specifiers for Node16 module resolution with this tsconfig.

- **Cache directory creation race conditions** — The `writeCache()` function calls `mkdirSync(dirname(path), { recursive: true })` which is safe, but tests that clear and recreate cache files should ensure the directory exists before writing to avoid ENOENT errors.

## Open Risks

- **models.dev API stability** — Live verification tests may fail if models.dev changes their API structure, adds/removes required fields, or has downtime. The test should validate schema compatibility and fail with clear diagnostics showing what changed.

- **Network flakiness in CI** — Live tests will introduce network-dependent failures in CI unless explicitly tagged/skippable. The user explicitly chose to accept this tradeoff (R009), but the test should have a longer timeout (30s) and clear error messages distinguishing network failures from assertion failures.

- **Build infrastructure scope creep** — Fixing the registry path build may expose broader workspace package resolution issues (e.g., `@gsd/pi-agent-core`, `@gsd/pi-tui` dependencies in `pi-coding-agent`). Stay scoped to registry-path-only fixes unless a blocker requires broader changes.

- **Test execution time** — Production-like scenario tests with filesystem setup and live network calls will be slower than unit tests. The test runner should support parallelization and the live test should be clearly identified for potential future parallel execution.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Node.js test infrastructure | Built-in `node:test` module | Available — already used in existing tests |
| TypeScript ESM resolution | Custom resolver hooks | Available — `resolve-ts.mjs` + `resolve-ts-hooks.mjs` exist |
| models.dev API | Direct API integration | No skill found — direct integration is appropriate |
| Zod schema validation | Runtime type validation | Available — already used via `ModelsDevData` schema |

No professional agent skills are needed for this work — it's all standard Node.js/TypeScript test infrastructure and the models.dev integration already exists.

## Sources

- M001 implementation and decisions (source: `.gsd/milestones/M001/` artifacts and `.gsd/DECISIONS.md`)
- Model registry startup path analysis (source: `packages/pi-coding-agent/src/core/model-registry.ts`)
- Cache/fetch orchestration code (source: `packages/pi-ai/src/models-dev.ts`)
- Existing test patterns (source: `packages/pi-ai/src/models-dev.test.ts`, `packages/pi-coding-agent/src/core/model-registry.test.ts`)
- Build configuration and constraints (source: `packages/pi-ai/tsconfig.json`, `packages/pi-coding-agent/package.json`)
- Custom test resolver implementation (source: `src/resources/extensions/gsd/tests/resolve-ts.mjs`, `resolve-ts-hooks.mjs`)

## Candidate Requirements (Advisory Only)

These are surfaced from research findings but are **not automatically in scope** — they require explicit user confirmation to become binding:

- **C001 — Test isolation from user environment** — All registry-path tests should use temporary directories (`tmpdir()`) instead of `homedir()` to avoid mutating the user's actual `~/.gsd/agent/` configuration and cache during test execution. This prevents test pollution and makes tests repeatable.

- **C002 — Deterministic async test completion** — Tests that depend on the async `refreshFromModelsDev()` should use an explicit synchronization mechanism (e.g., a test hook or promise-based API) rather than `setTimeout()` delays, ensuring tests don't flake due to timing variations.

- **C003 — Live test diagnostics** — The live models.dev verification test should include detailed diagnostics on failure: the raw API response (or error), schema validation errors if any, and a clear message indicating whether the failure was network-related or a breaking API change.

- **C004 — Test categorization** — Registry-path tests should be clearly categorized (unit vs integration vs live) so they can be run selectively (e.g., `npm run test:registry:unit` vs `npm run test:registry:live`) and CI can apply appropriate timeouts and retry policies.
