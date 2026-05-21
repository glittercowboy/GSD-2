import test from "node:test";
import assert from "node:assert/strict";
import type { Context, Model } from "../types.js";
import { streamOpenAICodexResponses } from "./openai-codex-responses.js";

function codexModel(): Model<"openai-codex-responses"> {
	return {
		id: "gpt-5.5",
		name: "GPT-5.5",
		api: "openai-codex-responses",
		provider: "openai-codex",
		baseUrl: "https://chatgpt.com/backend-api",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 400000,
		maxTokens: 128000,
	};
}

function fakeCodexToken(): string {
	const payload = Buffer.from(
		JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "account-123" } }),
	).toString("base64");
	return `header.${payload}.signature`;
}

test("openai codex responses uses Retry-After as the minimum 429 retry delay (#5677)", async (t) => {
	const originalFetch = globalThis.fetch;
	const originalSetTimeout = globalThis.setTimeout;
	const delays: number[] = [];
	let requests = 0;

	t.after(() => {
		globalThis.fetch = originalFetch;
		globalThis.setTimeout = originalSetTimeout;
	});

	globalThis.fetch = async () => {
		requests++;
		return new Response(JSON.stringify({ error: { code: "rate_limit_exceeded", message: "rate limited" } }), {
			status: 429,
			headers: { "Retry-After": "60" },
		});
	};

	globalThis.setTimeout = ((callback: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
		delays.push(Number(ms));
		queueMicrotask(() => callback(...args));
		return 0;
	}) as unknown as typeof setTimeout;

	const context: Context = {
		messages: [{ role: "user", content: "hello", timestamp: Date.now() }],
	};

	const stream = streamOpenAICodexResponses(codexModel(), context, { apiKey: fakeCodexToken() });
	const result = await stream.result();

	assert.equal(requests, 4);
	assert.deepEqual(delays, [60000, 60000, 60000]);
	assert.equal(result.stopReason, "error");
});
