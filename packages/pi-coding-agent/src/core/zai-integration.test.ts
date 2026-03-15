import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getEnvApiKey } from "@gsd/pi-ai";
import { SNAPSHOT } from "@gsd/pi-ai";

describe("ZAI Integration", () => {
	it("resolves ZAI_API_KEY from environment using models.dev fallback", () => {
		// Mock the environment
		const originalEnv = process.env.ZAI_API_KEY;
		process.env.ZAI_API_KEY = "test-zai-key-123";

		try {
			// This tests if the ZAI_API_KEY environment variable is correctly mapped via the 'env' list
			// from the models.dev provider data for 'zai'.
			const key = getEnvApiKey("zai");
			assert.equal(key, "test-zai-key-123", "Should resolve ZAI_API_KEY correctly");
		} finally {
			// Restore the environment
			if (originalEnv === undefined) {
				delete process.env.ZAI_API_KEY;
			} else {
				process.env.ZAI_API_KEY = originalEnv;
			}
		}
	});

	it("contains zai models in the models.dev snapshot", () => {
		const zaiProvider = SNAPSHOT["zai"];
		assert.ok(zaiProvider, "ZAI provider should exist in models.dev snapshot");
		assert.ok(Object.keys(zaiProvider.models).length > 0, "ZAI provider should have models");

		const envVars = zaiProvider.env;
		assert.ok(envVars && envVars.includes("ZHIPU_API_KEY"), "ZAI provider should contain ZHIPU_API_KEY in its env mapping");
	});
});
