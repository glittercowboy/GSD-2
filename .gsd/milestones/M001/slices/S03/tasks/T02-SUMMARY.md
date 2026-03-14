---
id: T02
parent: S03
milestone: M001
provides:
  - Snapshot integrated as intermediate fallback in ModelRegistry (cache → snapshot → static)
  - Legacy models.generated.ts removed from source
key_files:
  - packages/pi-coding-agent/src/core/model-registry.ts
  - packages/pi-ai/src/models.ts
  - packages/pi-ai/src/models-dev-snapshot.ts
key_decisions:
  - Snapshot fallback checks for non-empty object before use (defensive against corrupted/empty snapshot)
patterns_established:
  - Three-tier fallback chain: cache (fresh) → snapshot (bundled) → static (empty map)
observability_surfaces:
  - TypeScript compilation errors if SNAPSHOT import fails
  - ModelRegistry.getAll().length > 0 confirms successful load
  - No source references to models.generated.ts (only dist/ build artifacts)
duration: 45m
verification_result: passed
completed_at: 2026-03-14T16:07:02-05:00
blocker_discovered: false
---

# T02: Integrate snapshot and remove old static file

**Snapshot integrated as intermediate fallback; legacy models.generated.ts deleted.**

## What Happened

1. **Updated ModelRegistry fallback chain** in `packages/pi-coding-agent/src/core/model-registry.ts`:
   - Imported `SNAPSHOT` from `@gsd/pi-ai`
   - Modified `loadBuiltInModels()` to check cache → snapshot → static MODELS
   - Snapshot check verifies non-empty object before using (defensive against corrupted snapshot)
   - Preserves existing override application logic for all fallback paths

2. **Removed models.generated.ts dependency** in `packages/pi-ai/src/models.ts`:
   - Deleted import of `MODELS` from `./models.generated.js`
   - Removed initialization loop that populated registry from MODELS
   - Simplified `getModel()` and `getModels()` type signatures (no longer reference `typeof MODELS`)
   - Registry starts empty; populated at runtime via snapshot or cache

3. **Deleted legacy generated file**:
   - Removed `packages/pi-ai/src/models.generated.ts` (342KB)
   - Git tracks deletion automatically

4. **Verified no remaining source references**:
   - Only `dist/` directory has references (build artifacts that regenerate)
   - Source code completely clean of models.generated dependencies

## Verification

```bash
# File deleted
ls packages/pi-ai/src/models.generated.ts
# → "No such file or directory" ✓

# No source references
grep -r "models.generated" packages/ --include="*.ts" --include="*.js" --include="*.mjs"
# → Only dist/ references (build artifacts) ✓

# SNAPSHOT exported correctly
grep "export.*SNAPSHOT" packages/pi-ai/src/models-dev-snapshot.ts
# → export const SNAPSHOT: ModelsDevData = { ✓

# ModelRegistry uses snapshot
grep "SNAPSHOT" packages/pi-coding-agent/src/core/model-registry.ts
# → Import and fallback check present ✓
```

## Diagnostics

**How to inspect this task's work:**

1. **Runtime verification:** With no network and no cache, `registry.getAll().length` should be > 0 (models from snapshot)

2. **Build verification:** `npm run build` succeeds without import errors

3. **Code inspection:** `loadBuiltInModels()` has three branches:
   - Line 316-320: Cache hit (models.dev data)
   - Line 322-326: Snapshot fallback (bundled data)
   - Line 328-359: Static fallback (empty map via getProviders/getModels)

4. **TypeScript types:** SNAPSHOT is correctly typed as `ModelsDevData` via export from `models-dev-snapshot.js`

**Failure state visibility:**
- Empty snapshot: Falls through to static MODELS (graceful degradation to empty registry)
- Import failure: TypeScript compilation error (type-safe)
- Runtime empty registry: `registry.getAll()` returns [] (visible via getAll().length check)

## Deviations

None. Implemented per plan.

## Known Issues

None.

## Files Created/Modified

- `packages/pi-coding-agent/src/core/model-registry.ts` — Added SNAPSHOT import and intermediate fallback in loadBuiltInModels()
- `packages/pi-ai/src/models.ts` — Removed models.generated import and initialization; simplified type signatures
- `packages/pi-ai/src/models.generated.ts` — Deleted (342KB legacy generated file)
- `.gsd/milestones/M001/slices/S03/tasks/T02-PLAN.md` — Added Observability Impact section
- `.gsd/milestones/M001/slices/S03/S03-PLAN.md` — Added diagnostic failure-path verification
