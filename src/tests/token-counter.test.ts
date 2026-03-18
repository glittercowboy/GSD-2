import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	countTokens,
	countTokensSync,
	initTokenCounter,
	isAccurateCountingAvailable,
} from "../resources/extensions/gsd/token-counter.ts";

describe("token-counter", () => {
	it("countTokensSync returns heuristic estimate before init", () => {
		const count = countTokensSync("hello world");
		assert.equal(count, Math.ceil("hello world".length / 4));
	});

	it("initTokenCounter initializes the encoder", async () => {
		const result = await initTokenCounter();
		assert.equal(typeof result, "boolean");
	});

	it("countTokens returns a positive number for non-empty text", async () => {
		const count = await countTokens("The quick brown fox jumps over the lazy dog.");
		assert.ok(count > 0, "should return positive token count");
	});

	it("countTokens returns 0 for empty string", async () => {
		const count = await countTokens("");
		assert.equal(count, 0);
	});

	it("isAccurateCountingAvailable reflects encoder state", () => {
		const available = isAccurateCountingAvailable();
		assert.equal(typeof available, "boolean");
	});

	it("countTokensSync gives accurate count after init", async () => {
		await initTokenCounter();
		if (isAccurateCountingAvailable()) {
			const syncCount = countTokensSync("hello world");
			const asyncCount = await countTokens("hello world");
			assert.equal(syncCount, asyncCount, "sync and async should match after init");
		}
	});

	it("token count is more accurate than chars/4 for code", async () => {
		await initTokenCounter();
		if (isAccurateCountingAvailable()) {
			const code = 'function add(a: number, b: number): number { return a + b; }';
			const tokens = await countTokens(code);
			const heuristic = Math.ceil(code.length / 4);
			assert.ok(tokens !== heuristic, "tiktoken count should differ from simple heuristic for code");
		}
	});
});
