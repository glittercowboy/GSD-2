// Project/App: GSD-2
// File Purpose: Tests Google Gemini CLI compatible provider behavior.

import test from "node:test";
import assert from "node:assert/strict";
import type { Context, Model } from "../types.js";
import { streamGoogleGeminiCli } from "./google-gemini-cli.js";

function antigravityModel(id = "gemini-3-pro-preview"): Model<"google-gemini-cli"> {
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

test("Antigravity requests use the supported default User-Agent version", async (t) => {
	const originalFetch = globalThis.fetch;
	const originalVersion = process.env.PI_AI_ANTIGRAVITY_VERSION;
	let headers: Headers | undefined;

	t.after(() => {
		globalThis.fetch = originalFetch;
		if (originalVersion === undefined) {
			delete process.env.PI_AI_ANTIGRAVITY_VERSION;
		} else {
			process.env.PI_AI_ANTIGRAVITY_VERSION = originalVersion;
		}
	});

	delete process.env.PI_AI_ANTIGRAVITY_VERSION;
	globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
		headers = new Headers(init?.headers);
		return new Response(
			`data: ${JSON.stringify({
				response: {
					candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }],
				},
			})}\n\n`,
			{ headers: { "Content-Type": "text/event-stream" } },
		);
	};

	const context: Context = {
		messages: [{ role: "user", content: "hello", timestamp: Date.now() }],
	};
	const stream = streamGoogleGeminiCli(antigravityModel(), context, {
		apiKey: JSON.stringify({ token: "access-token", projectId: "test-project" }),
	});
	const result = await stream.result();

	assert.equal(result.stopReason, "stop");
	assert.equal(headers?.get("User-Agent"), "antigravity/1.23.0 darwin/arm64");
});

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
