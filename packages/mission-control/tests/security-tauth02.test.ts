/**
 * Holistic security tests for T-AUTH-02 threat category.
 *
 * Covers behaviour B64:
 *   T-AUTH-02 (B64) — Token refresh mutex: prevents concurrent refresh for the
 *                     same credential (race condition that can double-use tokens).
 *
 * These tests exercise the withRefreshLock helper directly — no server required.
 */

import { describe, it, expect } from "bun:test";

// ---------------------------------------------------------------------------
// T-AUTH-02 — Token Refresh Serialization (B64)
// ---------------------------------------------------------------------------

describe("T-AUTH-02 — Token Refresh Serialization", () => {
  // 15s timeout: auth-api module initialization (AuthStorage.create) may take time on first import
  it("B64: withRefreshLock serializes concurrent token refresh for the same credential", async () => {
    const { withRefreshLock } = await import("../src/server/auth-api");

    const key = "test-credential-b64-concurrent";
    const order: number[] = [];

    // Simulate two concurrent refresh calls.
    // First call takes 50ms, second call arrives while first is running.
    const first = withRefreshLock(key, async () => {
      await new Promise<void>(r => setTimeout(r, 50));
      order.push(1);
      return "token-1";
    });

    const second = withRefreshLock(key, async () => {
      order.push(2);
      return "token-2";
    });

    const [result1, result2] = await Promise.all([first, second]);

    // Both calls must complete and return their own values
    expect(result1).toBe("token-1");
    expect(result2).toBe("token-2");

    // The second refresh must not START until after the first completes.
    // order = [1, 2] proves serialization (second ran after first).
    expect(order).toEqual([1, 2]);
  }, 15_000);

  it("B64: withRefreshLock releases the lock even when the refresh function throws", async () => {
    const { withRefreshLock } = await import("../src/server/auth-api");

    const key = "error-credential-b64-throws";

    // First call throws
    await expect(withRefreshLock(key, async () => {
      throw new Error("refresh failed");
    })).rejects.toThrow("refresh failed");

    // Second call must NOT be blocked (lock was released by finally block)
    const result = await withRefreshLock(key, async () => "recovered-token");
    expect(result).toBe("recovered-token");
  }, 15_000);
});
