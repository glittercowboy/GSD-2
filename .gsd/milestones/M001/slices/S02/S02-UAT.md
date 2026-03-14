# S02: Integrate into ModelRegistry — UAT

**Milestone:** M001
**Written:** 2026-03-14

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: Integration logic verified through code review and test file inspection. Runtime behavior depends on S03's bundled snapshot for fresh installs, but cache-first loading with static fallback is proven by implementation.

## Preconditions

- pi-ai package built (required for imports to resolve)
- Cache file may or may not exist at `~/.gsd/agent/cache/models-dev.json`
- Local `~/.gsd/agent/models.json` may or may not exist
- Network may be available or unavailable

## Smoke Test

**Verify cache-first loading works:**
1. Check if cache file exists: `ls ~/.gsd/agent/cache/models-dev.json`
2. If cache exists, it should be used by ModelRegistry
3. If cache doesn't exist, static MODELS should be used
4. CLI should start successfully in both cases

## Test Cases

### 1. Cache Hit — Models.dev Data Used

**Precondition:** Valid cache file exists at `~/.gsd/agent/cache/models-dev.json`

1. Start `pi --list-models`
2. **Expected:** Models from cache are displayed (models.dev data)
3. Verify models include providers from models.dev (anthropic, openai, google, etc.)
4. Check that model count matches cache data

### 2. Cache Miss — Static MODELS Fallback

**Precondition:** No cache file or invalid cache

1. Remove or rename cache file: `mv ~/.gsd/agent/cache/models-dev.json{,.bak}` (if exists)
2. Start `pi --list-models`
3. **Expected:** Models from static MODELS are displayed (existing behavior)
4. CLI starts successfully without network dependency
5. Restore cache if needed: `mv ~/.gsd/agent/cache/models-dev.json{.bak,}`

### 3. Provider-Level Override on Models.dev Data

**Precondition:** Cache file exists, local models.json with provider override

1. Create/edit `~/.gsd/agent/models.json`:
   ```json
   {
     "providers": {
       "openai": {
         "baseUrl": "https://custom-openai.example.com/v1"
       }
     }
   }
   ```
2. Start `pi --list-models`
3. **Expected:** OpenAI models show custom baseUrl
4. Other providers (anthropic, google) use default baseUrl from models.dev

### 4. Per-Model Override on Models.dev Data

**Precondition:** Cache file exists, local models.json with model override

1. Create/edit `~/.gsd/agent/models.json`:
   ```json
   {
     "models": {
       "openai": {
         "gpt-4": {
           "cost": {
             "input": 0.01,
             "output": 0.03
           }
         }
       }
     }
   }
   ```
2. Start `pi --list-models`
3. **Expected:** gpt-4 shows custom cost ($0.01 input, $0.03 output)
4. Other OpenAI models use default costs from models.dev

### 5. Custom Model Merges with Models.dev Data

**Precondition:** Cache file exists, local models.json with custom model

1. Create/edit `~/.gsd/agent/models.json`:
   ```json
   {
     "models": {
       "custom": {
         "my-local-model": {
           "name": "My Local Model",
           "baseUrl": "http://localhost:11434/v1"
         }
       }
     }
   }
   ```
2. Start `pi --list-models`
3. **Expected:** Custom model appears alongside models.dev models
4. Both custom provider and models.dev providers are listed

### 6. Custom Model Overrides Models.dev Model

**Precondition:** Cache file exists, local models.json with same provider+id as models.dev

1. Create/edit `~/.gsd/agent/models.json`:
   ```json
   {
     "models": {
       "openai": {
         "gpt-4": {
           "name": "GPT-4 (Custom)",
           "baseUrl": "https://proxy.example.com/v1"
         }
       }
     }
   }
   ```
2. Start `pi --list-models`
3. **Expected:** gpt-4 shows custom name and baseUrl
4. Custom model replaces models.dev model with same provider+id

### 7. Network Failure — Static Fallback Works

**Precondition:** No cache file, network unavailable

1. Disable network or block models.dev API
2. Remove cache file: `rm ~/.gsd/agent/cache/models-dev.json` (if exists)
3. Start `pi --list-models`
4. **Expected:** CLI starts successfully with static MODELS
5. No error messages or blocking behavior
6. Re-enable network

### 8. Async Refresh Updates Models

**Precondition:** Cache file exists but may be stale

1. Start `pi` and keep running
2. Wait for async refresh to complete (background)
3. Check if cache file was updated: `ls -l ~/.gsd/agent/cache/models-dev.json`
4. **Expected:** Cache file timestamp may be recent if refresh succeeded
5. If network unavailable, existing cache/static MODELS still works

## Edge Cases

### Empty Cache File

1. Create empty cache file: `touch ~/.gsd/agent/cache/models-dev.json`
2. Start `pi --list-models`
3. **Expected:** Static MODELS fallback used (cache invalid)
4. No errors or crashes

### Malformed Cache File

1. Create invalid JSON cache: `echo "not json" > ~/.gsd/agent/cache/models-dev.json`
2. Start `pi --list-models`
3. **Expected:** Static MODELS fallback used (cache invalid)
4. No errors or crashes

### Very Old Cache (Beyond TTL)

1. Edit cache file, set `fetchedAt` to value older than 12 hours
2. Start `pi --list-models`
3. **Expected:** Cache still used for sync load (TTL checked in S01's getCachedModelsDev)
4. Async refresh fetches new data in background

### Simultaneous Cache Access

1. Start multiple `pi` instances simultaneously
2. **Expected:** All instances start successfully
3. No file locking issues or corruption

## Failure Signals

- CLI fails to start with module resolution error (pi-ai not built)
- Models list is empty when cache exists
- Override settings not applied to models.dev data
- Custom models don't appear in list
- Network failure causes CLI to hang or crash
- Error messages about cache file corruption

## Requirements Proved By This UAT

- R005 — Preserve local models.json override capability — Test cases 3, 4, 5, 6 prove overrides work with models.dev data

## Not Proven By This UAT

- R004 — Bundled snapshot for offline-first cold start (requires S03)
- R006 — Remove models.generated.ts (requires S03)
- Fresh install without network (requires S03 snapshot)
- Cache TTL behavior (S01 unit tests cover this)
- Version-triggered cache refresh (S01 unit tests cover this)

## Notes for Tester

**Build dependency:** These tests require pi-ai package to be built first. If you see module resolution errors, run: `npm run build:pi-ai` (may require fixing .ts extension import issue first).

**Cache inspection:** You can inspect the cache file directly:
```bash
cat ~/.gsd/agent/cache/models-dev.json | jq '.version, .fetchedAt, .data | keys'
```

**Override verification:** To verify overrides are applied, you may need to inspect model details programmatically or check debug output (not yet implemented in this slice).

**S03 dependency:** Fresh install offline testing requires S03's bundled snapshot. This UAT focuses on cache-first loading and override preservation, which are complete in S02.
