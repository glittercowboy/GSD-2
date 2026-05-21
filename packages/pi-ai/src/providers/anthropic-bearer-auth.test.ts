import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Model } from "../types.js";
import { buildAnthropicClientOptions } from "./anthropic.js";

function anthropicModel(overrides: Partial<Model<"anthropic-messages">> = {}): Model<"anthropic-messages"> {
	return {
		id: "claude-sonnet-4",
		name: "Claude Sonnet 4",
		api: "anthropic-messages",
		provider: "anthropic",
		baseUrl: "https://api.anthropic.com",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200000,
		maxTokens: 8192,
		...overrides,
	};
}

describe("anthropic bearer auth for custom providers (#3874)", () => {
	it("treats Bearer Authorization headers as authToken-capable providers", () => {
		const options = buildAnthropicClientOptions(
			anthropicModel({
				provider: "custom-anthropic-compatible",
				headers: { Authorization: "Bearer upstream-token" },
			}),
			"request-token",
			false,
		);

		assert.equal(options.apiKey, null, "custom providers with Authorization headers should not send x-api-key");
		assert.equal(options.authToken, "request-token", "custom providers with Authorization headers should use authToken");
	});
});
