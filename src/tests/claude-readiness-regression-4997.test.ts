import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
	buildClaudeSpawnInvocation as cliSpawnInvocation,
	getClaudeCommandCandidates as cliCandidates,
	parseAuthStatus as parseCliAuthStatus,
} from "../claude-cli-check.ts";
import {
	buildClaudeSpawnInvocation as readinessSpawnInvocation,
	getClaudeCommandCandidates as readinessCandidates,
	parseAuthStatus as parseReadinessAuthStatus,
} from "../resources/extensions/claude-code-cli/readiness.ts";

describe("Claude auth detection JSON output (#4997)", () => {
	test("readiness.ts parses loggedIn JSON", () => {
		assert.equal(parseReadinessAuthStatus('{"loggedIn":true}'), true);
		assert.equal(parseReadinessAuthStatus('{"loggedIn":false}'), false);
	});

	test("claude-cli-check.ts parses loggedIn JSON", () => {
		assert.equal(parseCliAuthStatus('{"loggedIn":true}'), true);
		assert.equal(parseCliAuthStatus('{"loggedIn":false}'), false);
	});
});

describe("Claude auth detection text fallback (#4997)", () => {
	test("readiness.ts falls back to plain auth status text", () => {
		assert.equal(parseReadinessAuthStatus("Authenticated as user@example.com"), true);
		assert.equal(parseReadinessAuthStatus("Not logged in"), false);
	});

	test("claude-cli-check.ts falls back to plain auth status text", () => {
		assert.equal(parseCliAuthStatus("signed in with subscription"), true);
		assert.equal(parseCliAuthStatus("No credentials found"), false);
	});
});

describe("Claude auth detection Windows candidate planning (#4997)", () => {
	test("readiness.ts plans all Windows candidates and cmd /c spawn", () => {
		assert.deepEqual(readinessCandidates("win32"), ["claude.cmd", "claude.exe", "claude"]);
		assert.deepEqual(readinessSpawnInvocation("claude.exe", ["auth", "status", "--json"], "win32"), {
			command: "cmd",
			args: ["/c", "claude.exe", "auth", "status", "--json"],
		});
	});

	test("claude-cli-check.ts plans all Windows candidates and cmd /c spawn", () => {
		assert.deepEqual(cliCandidates("win32"), ["claude.cmd", "claude.exe", "claude"]);
		assert.deepEqual(cliSpawnInvocation("claude.cmd", ["auth", "status", "--json"], "win32"), {
			command: "cmd",
			args: ["/c", "claude.cmd", "auth", "status", "--json"],
		});
	});
});
