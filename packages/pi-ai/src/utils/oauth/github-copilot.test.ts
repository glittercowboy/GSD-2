import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Api, Model } from "../../types.js";
import type { OAuthCredentials } from "./types.js";
import {
	getGitHubCopilotBaseUrl,
	githubCopilotOAuthProvider,
	loginGitHubCopilot,
	normalizeDomain,
} from "./github-copilot.js";

function createModel(overrides: Partial<Model<Api>> = {}): Model<Api> {
	return {
		id: "test-model",
		name: "Test Model",
		api: "openai-completions",
		provider: "test-provider",
		baseUrl: "https://example.com",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 8192,
		...overrides,
	} as Model<Api>;
}

function makeCredentials(
	overrides: Partial<OAuthCredentials & { modelLimits?: Record<string, { contextWindow: number; maxTokens: number }> }> = {},
) {
	return {
		access: "copilot-token",
		refresh: "refresh-token",
		expires: Date.now() + 60_000,
		...overrides,
	};
}

describe("GitHub Copilot OAuth — normalizeDomain", () => {
	test("returns null for empty input", () => {
		assert.equal(normalizeDomain(""), null);
		assert.equal(normalizeDomain("   "), null);
	});

	test("returns null for invalid domain", () => {
		assert.equal(normalizeDomain("not a domain!@#"), null);
	});

	test("extracts hostname from full URL", () => {
		assert.equal(normalizeDomain("https://github.com"), "github.com");
		assert.equal(normalizeDomain("https://company.ghe.com"), "company.ghe.com");
		assert.equal(normalizeDomain("http://example.com/path"), "example.com");
	});

	test("returns domain as-is when no protocol", () => {
		assert.equal(normalizeDomain("github.com"), "github.com");
		assert.equal(normalizeDomain("company.ghe.com"), "company.ghe.com");
	});

	test("trims whitespace", () => {
		assert.equal(normalizeDomain("  github.com  "), "github.com");
	});
});

describe("GitHub Copilot OAuth — getBaseUrlFromToken", () => {
	test("extracts API URL from token with proxy-ep", () => {
		const token = "tid=123;exp=1234567890;proxy-ep=proxy.individual.githubcopilot.com;other=value";
		const baseUrl = getGitHubCopilotBaseUrl(token);
		assert.equal(baseUrl, "https://api.individual.githubcopilot.com");
	});

	test("extracts API URL from enterprise proxy-ep", () => {
		const token = "tid=123;exp=1234567890;proxy-ep=proxy.company.ghe.com;other=value";
		const baseUrl = getGitHubCopilotBaseUrl(token);
		assert.equal(baseUrl, "https://api.company.ghe.com");
	});

	test("falls back to default when no token provided", () => {
		const baseUrl = getGitHubCopilotBaseUrl();
		assert.equal(baseUrl, "https://api.individual.githubcopilot.com");
	});

	test("falls back to default when token has no proxy-ep", () => {
		const token = "tid=123;exp=1234567890;other=value";
		const baseUrl = getGitHubCopilotBaseUrl(token);
		assert.equal(baseUrl, "https://api.individual.githubcopilot.com");
	});

	test("uses enterprise domain when provided", () => {
		const baseUrl = getGitHubCopilotBaseUrl(undefined, "company.ghe.com");
		assert.equal(baseUrl, "https://copilot-api.company.ghe.com");
	});

	test("prioritizes token proxy-ep over enterprise domain", () => {
		const token = "tid=123;exp=1234567890;proxy-ep=proxy.individual.githubcopilot.com;other=value";
		const baseUrl = getGitHubCopilotBaseUrl(token, "company.ghe.com");
		assert.equal(baseUrl, "https://api.individual.githubcopilot.com");
	});
});

describe("GitHub Copilot OAuth — provider structure", () => {
	test("has correct id and name", () => {
		assert.equal(githubCopilotOAuthProvider.id, "github-copilot");
		assert.equal(githubCopilotOAuthProvider.name, "GitHub Copilot");
	});

	test("has required methods", () => {
		assert.equal(typeof githubCopilotOAuthProvider.login, "function");
		assert.equal(typeof githubCopilotOAuthProvider.refreshToken, "function");
		assert.equal(typeof githubCopilotOAuthProvider.getApiKey, "function");
		assert.equal(typeof githubCopilotOAuthProvider.modifyModels, "function");
	});

	test("getApiKey returns access token", () => {
		const credentials: OAuthCredentials = {
			access: "test-access-token",
			refresh: "test-refresh-token",
			expires: Date.now() + 3600000,
		};
		const apiKey = githubCopilotOAuthProvider.getApiKey(credentials);
		assert.equal(apiKey, "test-access-token");
	});

	test("modifyModels preserves non-Copilot models", () => {
		if (!githubCopilotOAuthProvider.modifyModels) return;
		const models = [createModel({ id: "gpt-4", provider: "openai" })];
		const credentials: OAuthCredentials = {
			access: "test-token",
			refresh: "test-refresh",
			expires: Date.now() + 3600000,
		};
		const result = githubCopilotOAuthProvider.modifyModels(models, credentials);
		assert.deepEqual(result, models);
	});

	test("modifyModels updates Copilot model baseUrl when token has proxy-ep", () => {
		if (!githubCopilotOAuthProvider.modifyModels) return;
		const models = [
			createModel({
				id: "claude-3.5-sonnet",
				provider: "github-copilot",
				baseUrl: "https://api.default.com",
			}),
		];
		const credentials: OAuthCredentials = {
			access: "tid=123;exp=1234567890;proxy-ep=proxy.individual.githubcopilot.com;",
			refresh: "test-refresh",
			expires: Date.now() + 3600000,
		};
		const result = githubCopilotOAuthProvider.modifyModels(models, credentials);
		assert.equal(result[0].baseUrl, "https://api.individual.githubcopilot.com");
	});

	test("modifyModels applies model limits when available", () => {
		if (!githubCopilotOAuthProvider.modifyModels) return;
		const models = [
			createModel({
				id: "claude-3.5-sonnet",
				provider: "github-copilot",
				baseUrl: "https://api.default.com",
			}),
		];
		const credentials = {
			access: "test-token",
			refresh: "test-refresh",
			expires: Date.now() + 3600000,
			modelLimits: {
				"claude-3.5-sonnet": { contextWindow: 123456, maxTokens: 4096 },
			},
		};
		const result = githubCopilotOAuthProvider.modifyModels(models, credentials);
		assert.equal(result[0].contextWindow, 123456);
		assert.equal(result[0].maxTokens, 4096);
	});
});

describe("GitHub Copilot OAuth — credential regression", () => {
	test("module imports successfully", () => {
		assert.ok(githubCopilotOAuthProvider);
	});

	test("device login sends the public OAuth client id without a client secret", async (t) => {
		const calls: Array<{ url: string; init: RequestInit }> = [];
		const originalFetch = globalThis.fetch;
		t.after(() => {
			globalThis.fetch = originalFetch;
		});

		globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
			const url = String(input);
			calls.push({ url, init: init ?? {} });

			if (url.endsWith("/login/device/code")) {
				return Response.json({
					device_code: "device-code",
					user_code: "ABCD-EFGH",
					verification_uri: "https://github.com/login/device",
					interval: 1,
					expires_in: 600,
				});
			}

			if (url.endsWith("/login/oauth/access_token")) {
				return Response.json({ access_token: "github-access-token" });
			}

			if (url.endsWith("/copilot_internal/v2/token")) {
				return Response.json({
					token: "tid=123;exp=1234567890;proxy-ep=proxy.individual.githubcopilot.com;",
					expires_at: Math.floor(Date.now() / 1000) + 3600,
				});
			}

			if (url.endsWith("/models")) {
				return Response.json({ data: [] });
			}

			if (url.includes("/models/") && url.endsWith("/policy")) {
				return Response.json({ ok: true });
			}

			throw new Error(`Unexpected fetch: ${url}`);
		};

		const credentials = await loginGitHubCopilot({
			onPrompt: async () => "",
			onAuth: () => {},
		});

		assert.equal(credentials.access, "tid=123;exp=1234567890;proxy-ep=proxy.individual.githubcopilot.com;");
		const deviceCodeCall = calls.find((call) => call.url.endsWith("/login/device/code"));
		assert.ok(deviceCodeCall, "device-code request should be sent");
		const requestBody = deviceCodeCall.init.body;
		assert.equal(typeof requestBody, "string");
		const body = JSON.parse(requestBody as string) as Record<string, unknown>;
		assert.equal(body.client_id, "Iv1.b507a08c87ecfe98");
		assert.equal("client_secret" in body, false, "GitHub device flow must not send a client secret");
	});
});

test("githubCopilotOAuthProvider.modifyModels filters unavailable copilot models (#3849)", () => {
	const models = [
		createModel({ provider: "github-copilot", id: "gpt-5", name: "gpt-5", baseUrl: "github-copilot:" }),
		createModel({ provider: "github-copilot", id: "claude-sonnet-4", name: "claude-sonnet-4", baseUrl: "github-copilot:" }),
		createModel({ provider: "openai", id: "gpt-4.1", name: "gpt-4.1", baseUrl: "openai:" }),
	];

	assert.ok(githubCopilotOAuthProvider.modifyModels, "github copilot provider should expose modifyModels");
	const modified = githubCopilotOAuthProvider.modifyModels(
		models,
		makeCredentials({
			modelLimits: {
				"gpt-5": { contextWindow: 256000, maxTokens: 32000 },
			},
		}),
	);

	assert.deepEqual(
		modified.map((model) => `${model.provider}/${model.id}`),
		["github-copilot/gpt-5", "openai/gpt-4.1"],
	);

	const copilotModel = modified.find((model) => model.provider === "github-copilot" && model.id === "gpt-5");
	assert.ok(copilotModel, "available copilot model should remain");
	assert.equal(copilotModel.contextWindow, 256000);
	assert.equal(copilotModel.maxTokens, 32000);
	assert.match(copilotModel.baseUrl, /githubcopilot\.com/);
});

test("githubCopilotOAuthProvider.modifyModels keeps all copilot models when limits are unavailable", () => {
	const models = [
		createModel({ provider: "github-copilot", id: "gpt-5", name: "gpt-5", baseUrl: "github-copilot:" }),
		createModel({ provider: "github-copilot", id: "claude-sonnet-4", name: "claude-sonnet-4", baseUrl: "github-copilot:" }),
	];

	assert.ok(githubCopilotOAuthProvider.modifyModels, "github copilot provider should expose modifyModels");
	const modified = githubCopilotOAuthProvider.modifyModels(models, makeCredentials());

	assert.equal(modified.length, 2, "lack of limits should not hide every copilot model");
	assert.ok(modified.every((model) => model.provider === "github-copilot"));
	assert.ok(modified.every((model) => model.baseUrl.includes("githubcopilot.com")));
});
