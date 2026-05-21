import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { OAuthCredentials } from "./types.js";
import { geminiCliOAuthProvider } from "./google-gemini-cli.js";

describe("Gemini CLI OAuth — provider structure", () => {
	test("has correct id and name", () => {
		assert.equal(geminiCliOAuthProvider.id, "google-gemini-cli");
		assert.equal(geminiCliOAuthProvider.name, "Google Cloud Code Assist (Gemini CLI)");
	});

	test("uses callback server", () => {
		assert.equal(geminiCliOAuthProvider.usesCallbackServer, true);
	});

	test("has required methods", () => {
		assert.equal(typeof geminiCliOAuthProvider.login, "function");
		assert.equal(typeof geminiCliOAuthProvider.refreshToken, "function");
		assert.equal(typeof geminiCliOAuthProvider.getApiKey, "function");
	});

	test("getApiKey returns JSON with token and projectId", () => {
		const credentials: OAuthCredentials = {
			access: "test-access-token",
			refresh: "test-refresh-token",
			expires: Date.now() + 3600000,
			projectId: "test-project-456",
			email: "test@example.com",
		};
		const apiKey = geminiCliOAuthProvider.getApiKey(credentials);
		assert.equal(typeof apiKey, "string");
		const parsed = JSON.parse(apiKey);
		assert.equal(parsed.token, "test-access-token");
		assert.equal(parsed.projectId, "test-project-456");
	});

	test("refreshToken throws when projectId is missing", async () => {
		const credentials: OAuthCredentials = {
			access: "test-access-token",
			refresh: "test-refresh-token",
			expires: Date.now() + 3600000,
		};
		await assert.rejects(
			geminiCliOAuthProvider.refreshToken(credentials),
			/Google Cloud credentials missing projectId/,
		);
	});
});

describe("Gemini CLI OAuth — credential regression", () => {
	test("module imports successfully", () => {
		assert.ok(geminiCliOAuthProvider);
	});

	test("refreshToken sends the desktop OAuth client credentials to Google", async (t) => {
		const calls: RequestInit[] = [];
		const originalFetch = globalThis.fetch;
		t.after(() => {
			globalThis.fetch = originalFetch;
		});
		globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
			calls.push(init ?? {});
			return Response.json({ access_token: "new-access-token", expires_in: 3600 });
		};

		const credentials = await geminiCliOAuthProvider.refreshToken({
			access: "old-access-token",
			refresh: "refresh-token",
			expires: Date.now() + 3600000,
			projectId: "test-project-456",
		});

		assert.equal(credentials.access, "new-access-token");
		assert.equal(credentials.projectId, "test-project-456");
		assert.ok(calls[0]?.body instanceof URLSearchParams);
		const body = calls[0].body;
		assert.equal(body.get("client_id"), "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com");
		assert.equal(body.get("client_secret"), "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");
	});
});
