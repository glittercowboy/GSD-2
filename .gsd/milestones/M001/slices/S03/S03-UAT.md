# S03: Build-time snapshot + cleanup — UAT

**Milestone:** M001
**Written:** 2026-03-14

## UAT Type

- UAT mode: mixed (artifact-driven + live-runtime)
- Why this mode is sufficient: Snapshot file is static artifact verifiable by inspection; fallback chain requires runtime verification via CLI

## Preconditions

- Node.js installed
- Project built (`npm run build` in root)
- Optional: network disabled for offline tests

## Smoke Test

Run `pi --list-models` with no cache and verify models appear (proves snapshot loads successfully).

## Test Cases

### 1. Snapshot generation works

1. Run `npm run generate-snapshot`
2. **Expected:** Script outputs "Fetching...", "Validating...", "Writing...", "✅ Success! (2311KB)"
3. **Expected:** `packages/pi-ai/src/models-dev-snapshot.ts` exists and is newer than 1 minute ago
4. **Expected:** File contains `export const SNAPSHOT: ModelsDevData = {`

### 2. No models.generated.ts references in source

1. Run `grep -r "models.generated" packages/ --include="*.ts" --include="*.js" --include="*.mjs" | grep -v "dist/"`
2. **Expected:** No output (no source references)

### 3. Legacy file deleted

1. Run `ls packages/pi-ai/src/models.generated.ts`
2. **Expected:** "No such file or directory" error

### 4. Snapshot loads correctly

1. Run `node -e "import('./packages/pi-ai/dist/models-dev-snapshot.js').then(m => console.log('Providers:', Object.keys(m.SNAPSHOT).length))"`
2. **Expected:** "Providers: 102" (or higher if models.dev has grown)

### 5. Offline fallback works (cache cleared, no network)

1. Delete cache: `rm -rf ~/.gsd/agent/cache/models-dev.json`
2. Disable network (airplane mode or disconnect)
3. Run `pi --list-models`
4. **Expected:** Models appear (loaded from snapshot)
5. Re-enable network

### 6. ModelRegistry fallback chain

1. Inspect `packages/pi-coding-agent/src/core/model-registry.ts`
2. Find `loadBuiltInModels()` method
3. **Expected:** Three fallback branches:
   - Cache hit (line ~316-320)
   - Snapshot fallback (line ~322-326)
   - Static fallback (line ~328+)

## Edge Cases

### Empty snapshot file

If snapshot is empty or corrupted:
1. ModelRegistry falls through to static MODELS (empty map)
2. **Expected:** `registry.getAll()` returns []
3. **Mitigation:** Re-run `npm run generate-snapshot`

### Generation script network failure

1. Disconnect network
2. Run `npm run generate-snapshot`
3. **Expected:** Exit code 1, error message about fetch failure
4. **Expected:** Snapshot file unchanged

## Failure Signals

- `pi --list-models` returns empty with no error (snapshot failed silently)
- TypeScript compilation errors importing SNAPSHOT
- `grep` finds models.generated references in source files
- Generation script exits with non-zero code

## Requirements Proved By This UAT

- R004 — Test 5 proves offline fallback works via snapshot
- R006 — Tests 2 and 3 prove legacy file removed with no references

## Not Proven By This UAT

- Cache TTL behavior (covered by S01 unit tests)
- Version-triggered cache refresh (covered by S01 unit tests)
- models.json override behavior (covered by S02 implementation)

## Notes for Tester

- Test 5 (offline fallback) requires disconnecting network — may skip in CI
- Snapshot file is large (2.3MB) — don't open in editors that struggle with large files
- Generation script takes ~5-10 seconds due to 30s timeout setting
