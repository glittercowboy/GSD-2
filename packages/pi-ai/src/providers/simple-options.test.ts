import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildBaseOptions, defaultMaxTokens } from "./simple-options.js";
import type { Api, Model } from "../types.js";

function makeModel(overrides: Partial<Model<Api>> = {}): Model<Api> {
	return {
		id: "test-model",
		name: "Test Model",
		api: "bedrock-converse-stream",
		provider: "amazon-bedrock",
		baseUrl: "",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 16384,
		maxTokens: 16384,
		...overrides,
	};
}

describe("defaultMaxTokens", () => {
	test("leaves prompt room when a non-Anthropic model declares output equal to context", () => {
		const model = makeModel({
			id: "qwen.qwen3-32b-v1:0",
			contextWindow: 16384,
			maxTokens: 16384,
		});

		assert.equal(defaultMaxTokens(model), 8192);
	});

	test("preserves smaller declared output windows", () => {
		const model = makeModel({
			contextWindow: 32000,
			maxTokens: 8192,
		});

		assert.equal(defaultMaxTokens(model), 8192);
	});

	test("keeps the native Anthropic 32k ceiling within the context cap", () => {
		const model = makeModel({
			api: "anthropic-messages",
			provider: "anthropic",
			contextWindow: 200000,
			maxTokens: 64000,
		});

		assert.equal(defaultMaxTokens(model), 32000);
	});

	test("honors explicit maxTokens", () => {
		const model = makeModel();
		const options = buildBaseOptions(model, { maxTokens: 12000 });

		assert.equal(options.maxTokens, 12000);
	});
});
