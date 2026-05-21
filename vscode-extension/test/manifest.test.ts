// Project/App: GSD-2
// File Purpose: VS Code extension manifest and pure helper behavior tests.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
	APPROVAL_MODES,
	describeApprovalEvent,
	nextApprovalMode,
} from "../src/approval-mode.ts";
import { buildGsdClientSpawnPlan } from "../src/gsd-client-spawn.ts";
import {
	buildAgentGitAddArgs,
	buildAgentGitDiffArgs,
	buildAgentGitStatusArgs,
} from "../src/git-args.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readPackage(): {
	contributes: {
		commands: Array<{ command: string; title: string }>;
		views: Record<string, Array<{ id: string }>>;
		configuration: {
			properties: Record<string, unknown>;
		};
	};
	scripts: Record<string, string>;
} {
	return JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
}

test("manifest contributes unique executable commands with titles", () => {
	const pkg = readPackage();
	const contributed = pkg.contributes.commands.map((entry) => entry.command);
	assert.equal(new Set(contributed).size, contributed.length);

	for (const entry of pkg.contributes.commands) {
		assert.equal(entry.command.startsWith("gsd."), true);
		assert.equal(typeof entry.title, "string");
		assert.ok(entry.title.length > 0);
	}
});

test("GSDClient spawn plan launches the configured binary in RPC mode with a controlled cwd", () => {
	const plan = buildGsdClientSpawnPlan("/opt/bin/gsd", "/tmp/project", { PATH: "/usr/bin" }, "linux");
	assert.equal(plan.command, "/opt/bin/gsd");
	assert.deepEqual(plan.args, ["--mode", "rpc"]);
	assert.deepEqual(plan.options, {
		cwd: "/tmp/project",
		stdio: ["pipe", "pipe", "pipe"],
		env: { PATH: "/usr/bin" },
		shell: false,
	});

	assert.equal(buildGsdClientSpawnPlan("gsd.cmd", "C:\\repo", {}, "win32").options.shell, true);
});

test("approval mode contributes settings and executable command behavior", () => {
	const pkg = readPackage();
	const commands = new Set(pkg.contributes.commands.map((entry) => entry.command));

	assert.ok(pkg.contributes.configuration.properties["gsd.approvalMode"]);
	assert.ok(commands.has("gsd.cycleApprovalMode"));
	assert.ok(commands.has("gsd.selectApprovalMode"));
	assert.deepEqual(APPROVAL_MODES, ["auto-approve", "ask", "plan-only"]);
	assert.equal(nextApprovalMode("auto-approve"), "ask");
	assert.equal(nextApprovalMode("ask"), "plan-only");
	assert.equal(nextApprovalMode("plan-only"), "auto-approve");

	assert.equal(
		describeApprovalEvent({ type: "tool_execution_start", toolName: "Write", toolInput: { file_path: "/tmp/project/src/app.ts" } }),
		"Write: project/src/app.ts",
	);
	assert.equal(
		describeApprovalEvent({ type: "tool_execution_start", toolName: "Bash", toolInput: { command: "npm run verify".repeat(10) } })?.startsWith("Execute: npm run verify"),
		true,
	);
	assert.equal(describeApprovalEvent({ type: "tool_execution_start", toolName: "Read" }), null);
});

test("checkpoint view is contributed in the extension manifest", () => {
	const pkg = readPackage();

	assert.ok(pkg.contributes.views.gsd.some((view) => view.id === "gsd-checkpoints"));
	assert.ok(pkg.contributes.commands.some((entry) => entry.command === "gsd.restoreCheckpoint"));
});

test("agent git helpers scope git output to tracked agent files", () => {
	const files = ["src/app.ts", "README.md"];

	assert.deepEqual(buildAgentGitAddArgs(files), ["add", "src/app.ts", "README.md"]);
	assert.deepEqual(buildAgentGitDiffArgs(files), ["diff", "--", "src/app.ts", "README.md"]);
	assert.deepEqual(buildAgentGitStatusArgs(files), ["status", "--short", "--", "src/app.ts", "README.md"]);
});
