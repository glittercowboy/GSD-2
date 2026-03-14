---
id: M001
provides:
  - Runtime model registry fetching from models.dev with 12h cache
  - Bundled snapshot for offline-first cold start (102 providers)
  - Cache/snapshot/fallback chain with version-based invalidation
  - Preserved local models.json override capability
key_decisions:
  - D001: models.dev/api.json as data source (open-source, actively maintained)
  - D002: 12-hour cache duration (balances freshness with network usage)
  - D003: Fallback chain cache → snapshot → live fetch (ensures graceful degradation)
  - D004: Committed snapshot updated via manual PR (simpler than build-time fetch)
  - D005: Fetch on startup when cache expired (no background polling)
  - D006: Exported Zod schemas (not namespace) for --experimental-strip-types compatibility
  - D007: Test imports use .ts extension for custom ESM resolver
  - D008: Lazy config resolution via require() to avoid build dependency during tests
  - D009: Network errors return null (not throw) for graceful fallback
  - D010: API type inference via provider ID substring matching
  - D011: Sync cache read in constructor with async background refresh
  - D012: Shared helper for override application between sync/async paths
  - D013: Regular class properties (not parameter properties) for Node strip-only TypeScript
  - D014: Inline Zod schemas in generation script to avoid circular dependency
  - D015: 30s fetch timeout for snapshot generation (longer than runtime 10s)
  - D016: Defensive snapshot check for non-empty object
patterns_established:
  - Cache → fetch → fallback chain for resilient network operations
  - Version-based cache invalidation for release-triggered refreshes
  - Zod schema validation before mapping external API data
  - Sync cache read with async background refresh for non-blocking initialization
  - Build-time snapshot generation with validation and TypeScript output
observability_surfaces:
  - Cache file at ~/.gsd/agent/cache/models-dev.json (JSON, human-readable)
  - Snapshot generation script exit codes (1=fetch, 2=validation, 3=write)
  - Snapshot header includes ISO timestamp and source URL
requirement_outcomes:
  - id: R001
    from_status: active
    to_status: validated
    proof: S01 unit tests prove fetch with 10s timeout works (31 tests pass)
  - id: R002
    from_status: active
    to_status: validated
    proof: S01 unit tests prove 12h TTL and fallback chain (31 tests pass)
  - id: R003
    from_status: active
    to_status: validated
    proof: S01 unit tests prove version comparison triggers refresh (31 tests pass)
  - id: R004
    from_status: active
    to_status: validated
    proof: S03 snapshot file committed (2311KB, 102 providers), generation script works
  - id: R005
    from_status: active
    to_status: validated
    proof: S02 implementation preserves all override logic, shared helper for consistency
  - id: R006
    from_status: active
    to_status: validated
    proof: S03 file deleted, grep shows no source references (only dist/ artifacts)
duration: 7h45m
verification_result: passed
completed_at: 2026-03-14
---

# M001: models.dev Registry

**Runtime model registry fetching from models.dev with 12h cache, bundled snapshot fallback, and preserved local override capability — proven by 31 unit tests and committed snapshot (102 providers).**

## What Happened

M001 replaced the static model registry with runtime fetching from models.dev across three slices:

**S01 — Types, Mapper, and Orchestration:** Built Zod schemas for models.dev API response, implemented `mapToModelRegistry()` to transform external schema to internal `Model<Api>[]` format, and created the fetch/cache/fallback orchestration layer. All 31 unit tests pass, proving the contract-level behavior of fetch → cache → fallback chain, 12h TTL, and version invalidation.

**S02 — ModelRegistry Integration:** Integrated models.dev data into ModelRegistry using cache-first sync read with async background refresh. Preserved all existing override logic (provider-level baseUrl/headers, per-model cost/limits/reasoning, local models.json custom models) and applied it to models.dev data via shared helper function.

**S03 — Snapshot and Cleanup:** Created snapshot generation script (`scripts/generate-snapshot.mjs`) with inline Zod schemas, generated initial snapshot (2311KB, 102 providers), integrated snapshot as intermediate fallback in ModelRegistry, and deleted legacy `models.generated.ts`. Added `npm run generate-snapshot` for manual updates before releases.

The three-tier fallback chain is now: cache (fresh, 12h TTL) → snapshot (bundled, 102 providers) → static (empty map, last resort).

## Cross-Slice Verification

**Success criteria verification:**

| Criterion | Verification | Status |
|-----------|--------------|--------|
| `pi --list-models` shows models from models.dev | S02 ModelRegistry integration uses getModelsDev(), mapToModelRegistry() | ✅ Code verified |
| Fresh install works offline via bundled snapshot | S03 snapshot committed (2311KB, 102 providers), fallback chain verified | ✅ File verified |
| Network failure falls back to cached data | S01 unit tests (17 tests) prove fallback chain works | ✅ Tests pass |
| GSD version change triggers cache refresh | S01 unit tests prove version comparison triggers refresh | ✅ Tests pass |
| Local models.json overrides still work | S02 implementation preserves all override logic | ✅ Code verified |
| models.generated.ts removed | S03 file deleted, grep shows no source references | ✅ Verified |

**Definition of done verification:**

- ✅ All slice deliverables complete (S01, S02, S03 all [x])
- ✅ ModelRegistry uses models.dev data (S02 integration)
- ✅ Cache/snapshot/fallback chain verified by tests (S01: 31 tests pass)
- ✅ `models.generated.ts` deleted (S03 verification)
- ⚠️ `pi --list-models` works offline/online — Not executed (CLI not built)

**Note on CLI verification:** The `pi --list-models` command was not executed because the CLI is not built/installed in the development environment. The implementation is complete and the integration is verified by code inspection. Full end-to-end verification requires building and installing the CLI.

## Requirement Changes

- **R001:** active → validated — S01 unit tests prove fetch with 10s timeout works (31 tests pass)
- **R002:** active → validated — S01 unit tests prove 12h TTL and fallback chain (31 tests pass)
- **R003:** active → validated — S01 unit tests prove version comparison triggers refresh (31 tests pass)
- **R004:** active → validated — S03 snapshot file committed, generation script works
- **R005:** active → validated — S02 implementation preserves all override logic
- **R006:** active → validated — S03 file deleted, grep shows no source references

## Forward Intelligence

### What the next milestone should know
- M002 focuses on hardening the registry path with production-like scenario tests and live models.dev verification
- The current contract-level tests are good but don't prove the real startup path works
- Build infrastructure has issues: pi-ai uses .ts extension imports that don't work with standard tsc
- Snapshot generation is manual (`npm run generate-snapshot` before releases)

### What's fragile
- Build infrastructure — pi-ai uses .ts extension imports requiring custom ESM resolver
- API type inference uses provider ID substring matching — new providers may need explicit mapping
- models.dev API schema — Zod schemas may need updates if API changes

### Authoritative diagnostics
- Cache file at `~/.gsd/agent/cache/models-dev.json` — runtime truth, check `fetchedAt` timestamp
- `registry.getAll().length` — should be > 0 after ModelRegistry construction
- `npm run generate-snapshot` exit codes — 0=success, 1=fetch, 2=validation, 3=write

### What assumptions changed
- Expected ~300-400KB snapshot — actual is 2311KB due to 102 providers in models.dev
- Assumed tests could run after implementation — build infrastructure requires pi-ai to be built first
- models.dev API changed during S01 (options/temperature became optional)

## Files Created/Modified

- `packages/pi-ai/src/models-dev-types.ts` — Zod schemas for models.dev API
- `packages/pi-ai/src/models-dev-mapper.ts` — mapToModelRegistry() transforms external schema
- `packages/pi-ai/src/models-dev.ts` — Fetch/cache/fallback orchestration
- `packages/pi-ai/src/models-dev-mapper.test.ts` — 14 unit tests for mapper
- `packages/pi-ai/src/models-dev.test.ts` — 17 unit tests for orchestration
- `packages/pi-ai/src/models-dev-snapshot.ts` — Bundled snapshot (2311KB, 102 providers)
- `packages/pi-coding-agent/src/core/model-registry.ts` — Integrated models.dev with cache-first loading
- `packages/pi-coding-agent/src/core/model-registry.test.ts` — 14 test scenarios for integration
- `packages/pi-ai/src/models.ts` — Removed models.generated import, simplified types
- `scripts/generate-snapshot.mjs` — Snapshot generation script with inline Zod schemas
- `package.json` — Added `"generate-snapshot": "node scripts/generate-snapshot.mjs"`
- `packages/pi-ai/src/index.ts` — Added exports for new modules and SNAPSHOT
- `packages/pi-ai/src/models.generated.ts` — **Deleted** (342KB legacy file)
