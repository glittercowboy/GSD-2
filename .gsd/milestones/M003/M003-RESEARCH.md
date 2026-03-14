# M003: Upstream Reconciliation and PR Preparation — Research

**Date:** 2026-03-14

## Summary

M003 must reconcile local milestone work (M001: models.dev registry with cache/fallback chain, M002: build/test hardening with production-like scenario tests) with the current upstream `origin/main` from `gsd-build/gsd-2`. The local branch is 15 commits ahead of upstream and introduces entirely new files (`models-dev.ts`, `models-dev-types.ts`, `models-dev-mapper.ts`, `models-dev-snapshot.ts`, scenario tests, generation scripts) that do not exist in upstream. The primary challenge is that upstream `main` still uses the legacy `models.generated.ts` approach while the milestone work replaces it with runtime fetching from models.dev.

The reconciliation strategy must preserve the M001/M002 behavior (cache → snapshot → fallback chain, 12h TTL, version invalidation, test coverage, live verification) while merging any upstream changes to shared files (`model-registry.ts`, `models.ts`, `index.ts`, build/test configuration). The key files to reconcile are: `packages/pi-ai/src/models.ts` (local uses simplified version without MODELS import, upstream uses `MODELS` from `models.generated.ts`), `packages/pi-ai/src/index.ts` (local exports models-dev modules and SNAPSHOT, upstream does not), `packages/pi-coding-agent/src/core/model-registry.ts` (local has cachePath parameter, async refresh, models.dev integration; upstream has simpler sync loading), and test/infrastructure files.

**Primary recommendation:** Perform a merge (not rebase) to preserve the milestone commit history explicitly, resolve conflicts by keeping the models.dev architecture while incorporating any upstream changes to unrelated code paths, verify through the established test suite (32 pi-ai tests + 9 scenario tests + live verification), and document the reconciliation in DECISIONS.md. The merge approach is safer because it preserves the intentional milestone history and makes the reconciliation explicit rather than rewriting history.

## Recommendation

**Merge strategy with conflict resolution favoring models.dev architecture:**

1. **Fetch and merge upstream:** `git fetch origin && git merge origin/main` - this will surface conflicts in a controlled way
2. **Resolve conflicts by keeping M001/M002 behavior** in these key files:
   - `packages/pi-ai/src/models.ts` — Keep local version (no `MODELS` import, simplified registry)
   - `packages/pi-ai/src/index.ts` — Keep local exports for models-dev modules and SNAPSHOT
   - `packages/pi-ai/src/models-dev.ts` — Keep entire file (does not exist upstream)
   - `packages/pi-ai/src/models-dev-types.ts` — Keep entire file (does not exist upstream)
   - `packages/pi-ai/src/models-dev-mapper.ts` — Keep entire file (does not exist upstream)
   - `packages/pi-ai/src/models-dev-snapshot.ts` — Keep entire file (does not exist upstream)
   - `packages/pi-coding-agent/src/core/model-registry.ts` — Keep local version with cachePath, async refresh, models.dev integration
   - `packages/pi-coding-agent/src/core/model-registry-scenario.test.ts` — Keep entire file (does not exist upstream)
   - `packages/pi-ai/src/models-dev-live.test.ts` — Keep entire file (does not exist upstream)
   - `scripts/generate-snapshot.mjs` — Keep entire file (does not exist upstream)
3. **Verify after merge:**
   - `npm run build -w @gsd/pi-ai` — Must succeed without errors
   - `npm test -w @gsd/pi-ai` — All 32 tests must pass
   - `node --test packages/pi-coding-agent/dist/core/model-registry-scenario.test.js` — All 9 scenario tests must pass
4. **Document reconciliation** in DECISIONS.md with merge commit hash and any intentional alignment decisions

**Why merge over rebase:** The milestone work represents a coherent architectural change (models.dev integration) that should be preserved as explicit history. Rebase would rewrite the milestone commits and potentially lose the intentional progression. Merge makes the reconciliation explicit and easier to audit during PR review.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Model data source | models.dev API with Zod validation | Already implemented in M001 with proper schema validation, caching, fallback chain |
| Build/test workflow | Node16 module resolution with .js specifiers + custom ESM resolver | M002 already fixed import paths and configured test scripts correctly |
| Test isolation | tmpdir() pattern with mkdtempSync | M002/S02 already established this pattern to avoid polluting user config |
| Cache invalidation | Version-based + TTL (12h) | M001 already implements this with isCacheValid() and version comparison |
| Offline fallback | Snapshot → static MODELS chain | M001 already implements three-tier fallback (cache → snapshot → static) |

## Existing Code and Patterns

- `packages/pi-ai/src/models-dev.ts` — Core fetch/cache/fallback orchestration, 212 lines, exports `getModelsDev()`, `getCachedModelsDev()`, `isCacheValid()`, `writeCache()`, `fetchModelsDev()`
- `packages/pi-ai/src/models-dev-types.ts` — Zod schemas for models.dev API response structure (80 lines), exported const schemas for --experimental-strip-types compatibility
- `packages/pi-ai/src/models-dev-mapper.ts` — Transforms models.dev schema to internal `Model<Api>[]` format with proper field mapping (140 lines)
- `packages/pi-ai/src/models-dev-snapshot.ts` — Bundled snapshot (2311KB, 102 providers, 3742 models) for offline-first cold start
- `packages/pi-coding-agent/src/core/model-registry.ts` — ModelRegistry class with cachePath injection, sync cache read, async background refresh, override application (828 lines)
- `packages/pi-coding-agent/src/core/model-registry-scenario.test.ts` — 9 production-like scenario tests with tmpdir isolation (417 lines)
- `packages/pi-ai/src/models-dev-live.test.ts` — Live verification test against production models.dev API with Zod validation and env var gate (68 lines)
- `scripts/generate-snapshot.mjs` — Snapshot generation script with inline Zod schemas, 30s timeout, validation (171 lines)
- `packages/pi-ai/package.json` — Test script with custom ESM resolver: `node --import ../../src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/**/*.test.ts`
- `.gsd/milestones/M001/` — Authoritative M001 intent, decisions (D001-D016), acceptance criteria, verification
- `.gsd/milestones/M002/` — Authoritative M002 intent, decisions (D017-D022), build/test repair, scenario test coverage
- `.gsd/DECISIONS.md` — Append-only register, read during planning, append during execution
- `.gsd/REQUIREMENTS.md` — Active requirements R011/R012 for M003 (reconcile with upstream, leave PR-ready)

## Constraints

- **Must preserve M001 behavior:** Cache → snapshot → fallback chain with 12h TTL, version invalidation, graceful network failure handling
- **Must preserve M002 behavior:** Build/test workflow with Node16 module resolution, production-like scenario tests with tmpdir isolation, live verification with env var gate
- **Upstream uses different architecture:** `models.generated.ts` with static MODELS object, no runtime fetching, no caching layer, no models.dev integration
- **Import path convention:** Must use `.js` extension in import specifiers (D017) for Node16 module resolution, custom ESM resolver rewrites at runtime
- **Test infrastructure:** pi-ai package requires custom ESM resolver (`resolve-ts.mjs`) for .ts extension imports in test files
- **No outward-facing GitHub action:** PR creation is explicitly out of scope for M003 (user must confirm separately)

## Common Pitfalls

- **Merge conflicts in model-registry.ts** — Upstream may have changes to the constructor or loadModels() that conflict with M001/M002 changes. **Avoid:** Automatically accepting either version. **Solution:** Manually reconcile by keeping cachePath parameter, async refresh, and models.dev integration while incorporating any upstream bug fixes or unrelated improvements.

- **Import path regressions** — Upstream may have reverted to `.ts` imports or different module resolution. **Avoid:** Letting merge auto-resolve import paths. **Solution:** After merge, grep for `.ts"` imports in test files and verify all imports use `.js` specifiers.

- **Test script overwrites** — Upstream package.json may have different test configuration. **Avoid:** Losing the custom ESM resolver import in test command. **Solution:** Verify `packages/pi-ai/package.json` test script includes `--import ../../src/resources/extensions/gsd/tests/resolve-ts.mjs`.

- **Snapshot file size in diff** — The 2311KB snapshot file will appear as entirely new in the merge. **Avoid:** Trying to split or compress it for cleaner diff. **Solution:** Accept that this is a large but necessary file; the generation script allows regeneration if needed.

- **Upstream may have added new providers to models.generated.ts** — These would be lost if we simply delete the file. **Avoid:** Silently dropping upstream provider additions. **Solution:** Check upstream's models.generated.ts for any new providers not in models.dev, verify they exist in current models.dev snapshot, document any gaps in DECISIONS.md for follow-up.

- **Build errors in pi-agent-core** — Current build shows `Model<Api> | undefined` type error in agent.ts line 105. **Avoid:** Ignoring this as pre-existing. **Solution:** Verify if this error exists on upstream main, if so it's pre-existing and not a reconciliation issue; if introduced by merge, fix by adding non-null assertion or proper undefined handling.

## Open Risks

- **Upstream changes to ModelRegistry constructor call sites** — If upstream modified how ModelRegistry is instantiated (e.g., new parameters, different auth storage setup), the merge may break those call sites. **Mitigation:** After merge, run full build across all packages and check for constructor argument errors.

- **Upstream may have changed models.generated.ts structure** — If the MODELS object structure changed significantly, our models.ts simplification may need adjustment. **Mitigation:** Verify that getProviders(), getModels(), getModel() still work correctly with any upstream changes to the static fallback path.

- **Upstream test infrastructure changes** — If upstream changed test runners, tsconfig, or ESM resolver paths, the M002 test setup may conflict. **Mitigation:** Run all tests after merge and verify test isolation still works (no pollution of ~/.gsd/agent/).

- **PR reviewability** — A merge commit with 80+ changed files including 2311KB snapshot may be difficult to review. **Mitigation:** Consider creating a reconciliation summary document in .gsd/milestones/M003/ that explains the merge strategy and key changes for reviewers.

## Skills Discovered

No specialized external skills are needed for this milestone. The work requires standard git merge/conflict resolution, TypeScript debugging, and test verification — all core GSD capabilities.

| Technology | Skill | Status |
|------------|-------|--------|
| Git merge/rebase | Core GSD | Available |
| TypeScript module resolution | Core GSD | Available |
| Test infrastructure (Node.js test runner) | Core GSD | Available |

## Sources

- M001 implementation and verification (source: `.gsd/milestones/M001/`)
- M002 hardening and test coverage (source: `.gsd/milestones/M002/`)
- Current upstream main state (source: `git show origin/main:<files>`)
- Local milestone branch state (source: `git diff origin/main..HEAD --stat`)
- Requirements contract (source: `.gsd/REQUIREMENTS.md` R011, R012)
- Decision register (source: `.gsd/DECISIONS.md` D001-D022)
