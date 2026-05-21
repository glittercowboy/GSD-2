import test from "node:test";
import assert from "node:assert/strict";
import type { Context, Model } from "../types.js";
import { streamGoogleGeminiCli } from "./google-gemini-cli.js";

function antigravityModel(id: string): Model<"google-gemini-cli"> {
	return {
		id,
		name: id,
		api: "google-gemini-cli",
		provider: "google-antigravity",
		baseUrl: "https://antigravity.example.test",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200000,
		maxTokens: 32000,
	};
}

test("antigravity 404 names Antigravity instead of Cloud Code Assist (#4606)", async (t) => {
	const originalFetch = globalThis.fetch;
	const originalSetTimeout = globalThis.setTimeout;

	t.after(() => {
		globalThis.fetch = originalFetch;
		globalThis.setTimeout = originalSetTimeout;
	});

	globalThis.fetch = async () =>
		new Response(JSON.stringify({ error: { message: "model not found" } }), { status: 404 });
	globalThis.setTimeout = ((callback: (...args: unknown[]) => void, _ms?: number, ...args: unknown[]) => {
		queueMicrotask(() => callback(...args));
		return 0;
	}) as unknown as typeof setTimeout;

	const context: Context = {
		messages: [{ role: "user", content: "hello", timestamp: Date.now() }],
	};

	const stream = streamGoogleGeminiCli(antigravityModel("removed-antigravity-model"), context, {
		apiKey: JSON.stringify({ token: "token", projectId: "project" }),
	});
	const result = await stream.result();

	assert.equal(result.stopReason, "error");
	assert.match(result.errorMessage ?? "", /Antigravity API error \(404\)/);
	assert.doesNotMatch(result.errorMessage ?? "", /Cloud Code Assist API error/);
});
