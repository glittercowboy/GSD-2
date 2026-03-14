# Issue #125: Provider Fallback When Multiple Providers Configured
# Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

## Overview

Add cross-provider fallback so that when a provider hits rate/quota limits, the system
automatically switches to another provider that serves an equivalent model (or a
user-configured fallback chain of different models).

## Current State

The codebase already supports:
- **Multi-credential per provider** — round-robin or session-sticky selection
- **Per-credential backoff tracking** — rate_limit (30s), quota_exhausted (30min), server_error (20s)
- **Credential rotation on error** — `markUsageLimitReached()` backs off one key and returns
  whether another key exists for the same provider
- **Retry with exponential backoff** — 3 retries, 2s/4s/8s delays
- **Error classification** — quota_exhausted, rate_limit, server_error, unknown

The gap: fallback only works within a single provider (multiple API keys). There is no
mechanism to fall back to a *different provider* serving the same or equivalent model.

---

## Architecture

### Phase 1: Fallback Chain Configuration & Storage

**Goal:** Let users define ordered fallback chains that map a primary model to backup
model+provider combos.

#### 1.1 — Settings Schema (`settings-manager.ts`)

Add a new top-level setting:

```typescript
interface FallbackChainEntry {
  provider: string;       // e.g. "zai", "alibaba", "openai"
  model: string;          // e.g. "glm-5", "claude-opus-4-6"
  priority: number;       // lower = higher priority (1 = primary)
}

interface FallbackSettings {
  enabled: boolean;                          // default: false
  chains: Record<string, FallbackChainEntry[]>;  // keyed by chain name
  // Example:
  // "coding": [
  //   { provider: "zai", model: "glm-5", priority: 1 },
  //   { provider: "alibaba", model: "glm-5", priority: 2 },
  //   { provider: "openai", model: "gpt-4.1", priority: 3 }
  // ]
}
```

**Files to modify:**
- `packages/pi-coding-agent/src/core/settings-manager.ts` — add `getFallbackSettings()`,
  `setFallbackChain()`, `removeFallbackChain()`, getter/setter for `fallback.enabled`

#### 1.2 — Settings File Location

Stored in the existing `~/.pi/agent/settings.json` under a new `fallback` key.

#### 1.3 — CLI Configuration Commands

Add subcommands to the existing settings CLI:
- `pi settings fallback enable/disable`
- `pi settings fallback add-chain <name> --provider <p> --model <m> --priority <n>`
- `pi settings fallback remove-chain <name>`
- `pi settings fallback list`

**Files to modify:**
- `packages/pi-coding-agent/src/cli/commands/settings.ts` (or equivalent CLI entry point)

---

### Phase 2: Provider-Level Backoff Tracking

**Goal:** Track backoff state at the provider level (not just credential level) so the
fallback system knows when an entire provider is unavailable.

#### 2.1 — Extend AuthStorage (`auth-storage.ts`)

Add a provider-level backoff map alongside the existing credential-level one:

```typescript
private providerBackoff: Map<string, number> = new Map();
// Map<provider, backoffExpiresAt>
```

**New methods:**
```typescript
markProviderExhausted(provider: string, errorType: UsageLimitErrorType): void
isProviderAvailable(provider: string): boolean
getProviderBackoffRemaining(provider: string): number  // ms until available, 0 if available
```

**Logic:** When `markUsageLimitReached()` returns `false` (all credentials for a provider
are backed off), also mark the provider itself as backed off with the longest remaining
credential backoff duration.

**Files to modify:**
- `packages/pi-coding-agent/src/core/auth-storage.ts`

---

### Phase 3: Fallback Resolution Engine

**Goal:** Given a current model+provider that just failed, find the next available
fallback from the configured chain.

#### 3.1 — FallbackResolver (`fallback-resolver.ts` — new file)

```typescript
// packages/pi-coding-agent/src/core/fallback-resolver.ts

export interface FallbackResult {
  model: Model<Api>;
  reason: string;  // "quota_exhausted on zai, falling back to alibaba"
}

export class FallbackResolver {
  constructor(
    private settings: SettingsManager,
    private authStorage: AuthStorage,
    private modelRegistry: ModelRegistry,
  ) {}

  /**
   * Find the next available fallback for the current model.
   * Returns null if no fallback is configured or available.
   */
  async findFallback(
    currentModel: Model<Api>,
    errorType: UsageLimitErrorType,
  ): Promise<FallbackResult | null> {
    // 1. Check if fallback is enabled
    // 2. Find chain(s) containing currentModel's provider+model
    // 3. Sort by priority
    // 4. Skip entries where provider is backed off
    // 5. Skip entries without valid API keys
    // 6. Return first available, or null
  }

  /**
   * Find the chain a model belongs to.
   */
  findChainForModel(provider: string, modelId: string): FallbackChainEntry[] | null

  /**
   * Get the highest-priority available model from a chain.
   * Used on session start to pick the best available model.
   */
  async getBestAvailable(chainName: string): Promise<FallbackResult | null>
}
```

#### 3.2 — Model Equivalence

For same-model cross-provider fallback (Phase 1 of the feature), the chain entries
explicitly name the provider+model pairs. No automatic equivalence detection needed —
the user defines what's equivalent.

---

### Phase 4: Integrate Fallback into Retry Flow

**Goal:** When credential rotation fails (all keys for a provider exhausted), try the
fallback chain before giving up or doing exponential backoff.

#### 4.1 — Modify `_handleRetryableError()` (`agent-session.ts`)

Current flow:
```
1. Classify error
2. Try credential rotation within provider → if success, retry immediately
3. If quota_exhausted and all backed off → give up
4. Exponential backoff retry
```

New flow:
```
1. Classify error
2. Try credential rotation within provider → if success, retry immediately
3. ** Try provider fallback via FallbackResolver **
   a. If fallback found → swap model on agent, retry immediately
   b. Emit event: "fallback_provider_switch" with old/new provider info
4. If quota_exhausted and no fallback → give up
5. Exponential backoff retry
```

**Key changes in agent-session.ts (~lines 2317-2370):**

```typescript
// After credential rotation fails:
if (!hasAlternate) {
  const fallbackResult = await this.fallbackResolver?.findFallback(
    this.agent.model,
    errorType,
  );

  if (fallbackResult) {
    // Swap to fallback model
    this.agent.setModel(fallbackResult.model);
    this._removeLastError();
    this._emitEvent("auto_retry_start", {
      attempt: this._retryAttempt + 1,
      delayMs: 0,
      reason: fallbackResult.reason,
    });
    await this.agent.continue();
    return true;
  }
}
```

#### 4.2 — Agent Model Swapping

The agent needs a method to swap its model mid-conversation:

```typescript
// agent.ts or agent-loop.ts
setModel(model: Model<Api>): void {
  this.config.model = model;
  // Re-resolve API key for new provider
}
```

**Important:** The API key must also be re-resolved since we're switching providers.
The `getApiKey` callback in `AgentOptions` already takes a provider string, so this
should work naturally.

**Files to modify:**
- `packages/pi-coding-agent/src/core/agent-session.ts`
- `packages/pi-ai/src/agent.ts` or `packages/pi-ai/src/agent-loop.ts`

---

### Phase 5: Provider Restoration (Auto-Upgrade)

**Goal:** When a higher-priority provider's backoff expires, switch back to it.

#### 5.1 — Pre-Request Priority Check

Before each LLM request, check if a higher-priority provider in the chain has become
available again:

```typescript
// In agent-loop.ts streamAssistantResponse(), before calling streamFn:
if (this.fallbackResolver) {
  const bestAvailable = await this.fallbackResolver.getBestAvailable(currentChain);
  if (bestAvailable && bestAvailable.model.provider !== currentModel.provider) {
    // Upgrade back to higher-priority provider
    this.setModel(bestAvailable.model);
    this._emitEvent("fallback_provider_restored", { ... });
  }
}
```

#### 5.2 — Quota Reset Awareness (Future Enhancement)

For now, rely on backoff expiry times. A future enhancement could:
- Parse rate limit headers for reset timestamps
- Store per-provider quota windows (5-hour, daily, weekly, monthly)
- Predict when quota will restore based on usage patterns

This is complex and should be a separate issue.

---

### Phase 6: User-Facing Events & UI

**Goal:** Surface fallback activity to the user so they know what's happening.

#### 6.1 — New Events

```typescript
type FallbackEvent =
  | { type: "fallback_provider_switch"; from: string; to: string; reason: string }
  | { type: "fallback_provider_restored"; provider: string; reason: string }
  | { type: "fallback_chain_exhausted"; chain: string; reason: string }
```

#### 6.2 — TUI Integration

Display a brief notification in the TUI when fallback occurs:
- `⚡ Switched from zai/glm-5 → alibaba/glm-5 (rate limit)`
- `✓ Restored to zai/glm-5 (quota available)`
- `⚠ All providers in chain "coding" exhausted`

**Files to modify:**
- `packages/pi-tui/src/` — event handler for new fallback events
- Status bar or notification area in the TUI

---

## Implementation Order

| Step | Phase | Effort | Dependencies |
|------|-------|--------|-------------|
| 1    | Phase 1.1-1.2: Settings schema | Small | None |
| 2    | Phase 2: Provider-level backoff | Small | None |
| 3    | Phase 3: FallbackResolver | Medium | Steps 1, 2 |
| 4    | Phase 4: Retry integration | Medium | Step 3 |
| 5    | Phase 5.1: Auto-restoration | Small | Step 4 |
| 6    | Phase 1.3: CLI commands | Small | Step 1 |
| 7    | Phase 6: Events & UI | Small | Step 4 |

Steps 1 and 2 can be done in parallel. Steps 6 and 7 can be done in parallel.

---

## Key Design Decisions

### 1. Explicit chains vs automatic model equivalence
**Decision:** Explicit user-configured chains.
**Why:** Automatic equivalence is unreliable — models with the same name from different
providers may have different capabilities, limits, or pricing. Users should explicitly
opt in to which models they consider interchangeable.

### 2. Where fallback sits in the retry flow
**Decision:** After credential rotation, before exponential backoff.
**Why:** Provider fallback is a better recovery than waiting and retrying the same
exhausted provider. If the fallback also fails, exponential backoff still kicks in.

### 3. Model swap vs new agent
**Decision:** Swap model on existing agent mid-conversation.
**Why:** Creating a new agent would lose conversation context. The agent's `streamFn`
already accepts model as a parameter, and `getApiKey` resolves per-provider, so
swapping is straightforward.

### 4. Restoration strategy
**Decision:** Check before each request (lazy check on backoff expiry).
**Why:** No background timers needed. The cost of one `isProviderAvailable()` check
per request is negligible. More sophisticated quota tracking can be added later.

### 5. Scope of fallback
**Decision:** Per-session, not per-agent-type (initially).
**Why:** The issue mentions per-agent-type toggle, but the simpler initial implementation
is a global fallback chain that applies to any session using a model in the chain.
Per-agent-type scoping can be added by extending the chain config with an `agentTypes`
filter.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Model swap mid-conversation changes behavior | Medium | Log the swap, let user disable fallback |
| Different providers have different tool/feature support | High | Validate fallback model supports same API features before swapping |
| Credential resolution race conditions | Low | Use existing file-lock mechanism in auth-storage |
| Chain misconfiguration (nonexistent model) | Low | Validate chain entries on save, warn on invalid |
| Backoff timing mismatch with actual quota reset | Medium | Conservative backoff defaults; Phase 5.2 for future improvement |

---

## Testing Strategy

1. **Unit tests for FallbackResolver** — mock auth-storage and model-registry, test chain
   resolution, priority ordering, backoff skipping
2. **Unit tests for extended auth-storage** — provider-level backoff tracking
3. **Integration test for retry flow** — simulate rate limit → credential fallback →
   provider fallback → restoration
4. **E2E test** — configure a chain, hit rate limit on provider A, verify automatic
   switch to provider B
5. **Settings tests** — validate chain CRUD operations, persistence, invalid input handling

---

## Files Summary

| File | Action | Changes |
|------|--------|---------|
| `packages/pi-coding-agent/src/core/settings-manager.ts` | Modify | Add FallbackSettings types, getters/setters |
| `packages/pi-coding-agent/src/core/auth-storage.ts` | Modify | Add provider-level backoff tracking |
| `packages/pi-coding-agent/src/core/fallback-resolver.ts` | **New** | FallbackResolver class |
| `packages/pi-coding-agent/src/core/agent-session.ts` | Modify | Integrate fallback into retry flow |
| `packages/pi-ai/src/agent.ts` | Modify | Add `setModel()` method |
| `packages/pi-coding-agent/src/cli/commands/settings.ts` | Modify | Add fallback CLI subcommands |
| `packages/pi-tui/src/` | Modify | Fallback event display |
