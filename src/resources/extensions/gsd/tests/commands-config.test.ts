import test from "node:test";
import assert from "node:assert/strict";
import { getStoredToolKey } from "../commands-config.ts";

test("stored tool key lookup skips empty api_key entries", () => {
  const auth = {
    getCredentialsForProvider(providerId: string) {
      assert.equal(providerId, "tavily");
      return [
        { type: "api_key", key: "" },
        { type: "oauth", accessToken: "oauth-token" },
        { type: "api_key", key: "tool-key" },
      ];
    },
  };

  assert.equal(getStoredToolKey(auth as any, "tavily"), "tool-key");
});

test("stored tool key lookup returns undefined when only shadowing credentials exist", () => {
  const auth = {
    getCredentialsForProvider() {
      return [
        { type: "api_key", key: "" },
        { type: "oauth", accessToken: "oauth-token" },
      ];
    },
  };

  assert.equal(getStoredToolKey(auth as any, "brave"), undefined);
});
