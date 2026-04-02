/**
 * Regression tests for the bug introduced by PR #666.
 *
 * Bug: PR #666 added hardcoded SAFE_COMMAND_PREFIXES and isBlockedUrl() with
 * no override mechanism. Users with non-default credential tools (sops, doppler,
 * age, etc.) or needing to fetch from internal URLs were silently broken.
 *
 * These tests import only APIs that exist on both main and this branch.
 * On main (before fix): they FAIL because the override functions don't exist.
 * On this branch (after fix): they PASS because overrides work.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  resolveConfigValue,
  clearConfigValueCache,
  SAFE_COMMAND_PREFIXES,
} from "../../packages/pi-coding-agent/src/core/resolve-config-value.ts";
import {
  isBlockedUrl,
} from "../resources/extensions/search-the-web/url-utils.ts";

describe("REGRESSION #666: hardcoded security lists with no override", () => {
  beforeEach(() => {
    clearConfigValueCache();
  });

  afterEach(() => {
    // Restore defaults — setAllowedCommandPrefixes/setFetchAllowedUrls are
    // dynamically imported so we can restore even if they exist.
    import("../../packages/pi-coding-agent/src/core/resolve-config-value.ts").then((mod) => {
      if (typeof mod.setAllowedCommandPrefixes === "function") {
        mod.setAllowedCommandPrefixes(SAFE_COMMAND_PREFIXES);
      }
      mod.clearConfigValueCache();
    });
    import("../resources/extensions/search-the-web/url-utils.ts").then((mod) => {
      if (typeof mod.setFetchAllowedUrls === "function") {
        mod.setFetchAllowedUrls([]);
      }
    });
  });

  it("non-default credential tool (sops) can be unblocked via override", async (t) => {
    const stderrChunks: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk: string | Uint8Array, ...args: unknown[]) => {
      stderrChunks.push(chunk.toString());
      return true;
    };
    t.after(() => {
      process.stderr.write = originalWrite;
    });

    // Confirm the bug: sops is not in the hardcoded allowlist, so it's blocked
    const blocked = resolveConfigValue("!sops decrypt --output-type json secrets.enc.json");
    assert.equal(blocked, undefined, "sops is blocked by the hardcoded allowlist");
    assert.ok(
      stderrChunks.some((line) => line.includes('Blocked disallowed command: "sops"')),
      "should log a block message for sops",
    );

    stderrChunks.length = 0;
    clearConfigValueCache();

    // The fix: setAllowedCommandPrefixes must exist and must unblock sops
    const mod = await import("../../packages/pi-coding-agent/src/core/resolve-config-value.ts");
    assert.equal(
      typeof mod.setAllowedCommandPrefixes,
      "function",
      "setAllowedCommandPrefixes must be exported (missing = bug #666 not fixed)",
    );

    mod.setAllowedCommandPrefixes([...SAFE_COMMAND_PREFIXES, "sops"]);
    resolveConfigValue("!sops decrypt --output-type json secrets.enc.json");

    const blockedAfterOverride = stderrChunks.some((line) =>
      line.includes("Blocked disallowed command"),
    );
    assert.equal(
      blockedAfterOverride,
      false,
      "sops must not be blocked after adding it to the allowlist",
    );
  });

  it("internal company URL can be unblocked via override", async () => {
    const internalUrl = "http://192.168.1.100/internal-docs/api-reference";

    // Confirm the bug: private IP is blocked with no way to allowlist
    assert.equal(
      isBlockedUrl(internalUrl),
      true,
      "private IP is blocked by the hardcoded SSRF blocklist",
    );

    // The fix: setFetchAllowedUrls must exist and must unblock the host
    const mod = await import("../resources/extensions/search-the-web/url-utils.ts");
    assert.equal(
      typeof mod.setFetchAllowedUrls,
      "function",
      "setFetchAllowedUrls must be exported (missing = bug #666 not fixed)",
    );

    mod.setFetchAllowedUrls(["192.168.1.100"]);

    assert.equal(
      isBlockedUrl(internalUrl),
      false,
      "private IP must not be blocked after adding it to the allowlist",
    );
  });
});
