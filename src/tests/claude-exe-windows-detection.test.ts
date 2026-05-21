import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { getClaudeCommandCandidates as cliCandidates } from "../claude-cli-check.ts";
import { getClaudeCommandCandidates as readinessCandidates } from "../resources/extensions/claude-code-cli/readiness.ts";

describe("readiness.ts Windows claude.exe candidate (#4548)", () => {
	test("probes claude.cmd, claude.exe, and bare claude on win32", () => {
		assert.deepEqual(readinessCandidates("win32"), ["claude.cmd", "claude.exe", "claude"]);
	});

	test("probes only bare claude outside win32", () => {
		assert.deepEqual(readinessCandidates("linux"), ["claude"]);
	});
});

describe("claude-cli-check.ts Windows claude.exe candidate (#4548)", () => {
	test("probes claude.cmd, claude.exe, and bare claude on win32", () => {
		assert.deepEqual(cliCandidates("win32"), ["claude.cmd", "claude.exe", "claude"]);
	});

	test("probes only bare claude outside win32", () => {
		assert.deepEqual(cliCandidates("darwin"), ["claude"]);
	});
});
