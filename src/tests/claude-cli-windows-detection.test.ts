import test from "node:test";
import assert from "node:assert/strict";
import {
	buildClaudeSpawnInvocation as buildCliSpawnInvocation,
	getClaudeCommand as getCliCommand,
} from "../claude-cli-check.ts";
import {
	buildClaudeSpawnInvocation as buildReadinessSpawnInvocation,
	getClaudeCommand as getReadinessCommand,
} from "../resources/extensions/claude-code-cli/readiness.ts";

test("claude-cli-check selects claude.cmd and uses cmd /c on win32", () => {
	assert.equal(getCliCommand("win32"), "claude.cmd");
	assert.deepEqual(buildCliSpawnInvocation("claude.cmd", ["--version"], "win32"), {
		command: "cmd",
		args: ["/c", "claude.cmd", "--version"],
	});
});

test("readiness selects claude.cmd and uses cmd /c on win32", () => {
	assert.equal(getReadinessCommand("win32"), "claude.cmd");
	assert.deepEqual(buildReadinessSpawnInvocation("claude.cmd", ["--version"], "win32"), {
		command: "cmd",
		args: ["/c", "claude.cmd", "--version"],
	});
});

test("non-Windows probes invoke claude directly", () => {
	assert.equal(getCliCommand("darwin"), "claude");
	assert.deepEqual(buildReadinessSpawnInvocation("claude", ["auth", "status"], "darwin"), {
		command: "claude",
		args: ["auth", "status"],
	});
});
