---
estimated_steps: 5
estimated_files: 3
---

# T02: Integrate snapshot and remove old static file

**Slice:** S03 — Build-time snapshot + cleanup
**Milestone:** M001

## Description

Complete the migration by integrating the snapshot into ModelRegistry's fallback chain and removing the old static models.generated.ts file. This ensures fresh installs work offline and eliminates the legacy generated code.

## Steps

1. Update ModelRegistry's `loadBuiltInModels()` in `packages/pi-coding-agent/src/core/model-registry.ts`:
   - Import SNAPSHOT from `@gsd/pi-ai`
   - Change fallback chain from: cache → static MODELS
   - To: cache → snapshot → static MODELS
   - Cache hit: return models.dev data with overrides (existing)
   - Cache miss, snapshot available: return `mapToModelRegistry(SNAPSHOT)` with overrides
   - Snapshot unavailable: fall back to static MODELS (existing)

2. Remove models.generated.ts import from `packages/pi-ai/src/models.ts`:
   - Remove `import { MODELS } from "./models.generated.js";`
   - Initialize modelRegistry as empty Map
   - Keep getProviders(), getModels(), getModel() functions working (they'll return empty if called before snapshot loads)
   - Note: These functions are only used as final fallback in ModelRegistry

3. Delete `packages/pi-ai/src/models.generated.ts`:
   - Remove the 342KB generated file
   - Git will track the deletion

4. Verify no remaining references:
   - Run `grep -r "models.generated" packages/`
   - Should return no matches
   - If matches found, update those files

5. Run tests:
   - Run pi-ai tests to verify snapshot integration
   - Run pi-coding-agent tests if build infrastructure allows

## Must-Haves

- [ ] ModelRegistry uses snapshot as intermediate fallback
- [ ] models.generated.ts deleted from filesystem
- [ ] models.ts no longer imports models.generated
- [ ] No references to models.generated anywhere in packages/

## Verification

- `grep -r "models.generated" packages/ --include="*.ts" --include="*.js" --include="*.mjs"` returns no matches in source (dist/ references are build artifacts that will regenerate)
- `ls packages/pi-ai/src/models.generated.ts` fails with "No such file"
- ModelRegistry code review confirms cache → snapshot → static chain
- Unit tests pass (if build infrastructure available)

## Observability Impact

**What changes:** ModelRegistry's fallback chain now includes snapshot as intermediate layer between cache and static MODELS.

**Failure state visibility:**
- If SNAPSHOT import fails: TypeScript compilation error (type-safe import from @gsd/pi-ai)
- If SNAPSHOT is empty: Falls through to static MODELS fallback (existing behavior preserved)
- If cache miss + snapshot miss + static MODELS empty: Registry returns empty models array (graceful degradation)

**How to inspect:**
1. Check ModelRegistry load: `registry.getAll().length` should be > 0 after construction
2. Verify fallback chain in code: `loadBuiltInModels()` has three branches (cache → snapshot → static)
3. Runtime verification: With no network and no cache, `pi --list-models` shows models from snapshot
4. Build verification: `npm run build` succeeds without models.generated.ts import errors

**Diagnostic surfaces:**
- No new runtime logs added (fallback is silent/transparent)
- TypeScript types ensure SNAPSHOT is correctly typed as ModelsDevData
- File deletion is git-tracked (visible in diff)

## Inputs

- `packages/pi-ai/src/models-dev-snapshot.ts` — SNAPSHOT export from T01
- `packages/pi-coding-agent/src/core/model-registry.ts` — Current fallback chain
- `packages/pi-ai/src/models.ts` — Current MODELS import
- `packages/pi-ai/src/models.generated.ts` — File to delete

## Expected Output

- `packages/pi-coding-agent/src/core/model-registry.ts` — Updated with snapshot fallback
- `packages/pi-ai/src/models.ts` — Updated without models.generated import
- `packages/pi-ai/src/models.generated.ts` — Deleted
