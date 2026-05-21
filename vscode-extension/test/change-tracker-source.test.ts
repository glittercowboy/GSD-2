// Project/App: GSD-2
// File Purpose: VS Code change-tracker helper behavior tests.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	captureCurrentSnapshots,
	captureOriginalContent,
	describeAction,
	getToolInput,
	getToolUseId,
	isFileMutationTool,
	normalizeToolName,
	resolveToolPath,
} from "../src/change-tracker-core.ts";

test("change tracker consumes RPC tool args and toolCallId fields", () => {
	assert.deepEqual(getToolInput({ type: "tool_execution_start", args: { file_path: "a.ts" } }), { file_path: "a.ts" });
	assert.deepEqual(getToolInput({ type: "tool_execution_start", toolInput: { path: "b.ts" } }), { path: "b.ts" });
	assert.deepEqual(getToolInput({ type: "tool_execution_start", input: { command: "npm test" } }), { command: "npm test" });
	assert.deepEqual(getToolInput({ type: "tool_execution_start", args: null, toolInput: "bad", input: undefined }), {});

	assert.equal(getToolUseId({ type: "tool_execution_start", toolCallId: "call-1" }), "call-1");
	assert.equal(getToolUseId({ type: "tool_execution_end", toolUseId: "use-1" }), "use-1");
});

test("change tracker recognizes lowercase core write and edit tools", () => {
	assert.equal(normalizeToolName("Write"), "write");
	assert.equal(normalizeToolName("EDIT"), "edit");
	assert.equal(isFileMutationTool("write"), true);
	assert.equal(isFileMutationTool("write_file"), true);
	assert.equal(isFileMutationTool("edit"), true);
	assert.equal(isFileMutationTool("bash"), false);
});

test("change tracker resolves relative tool paths from the workspace root", () => {
	const workspaceRoot = resolve("/tmp/project");
	assert.equal(resolveToolPath(workspaceRoot, { file_path: "src/app.ts" }), join(workspaceRoot, "src", "app.ts"));
	assert.equal(resolveToolPath(workspaceRoot, { path: "/tmp/other.ts" }), "/tmp/other.ts");
	assert.equal(resolveToolPath(workspaceRoot, {}), "");
});

test("change tracker models new files as absent snapshots", () => {
	const existing = new Map<string, string>([["/tmp/existing.ts", "before"]]);
	const fsImpl = {
		existsSync: (filePath: string) => existing.has(filePath),
		readFileSync: (filePath: string) => existing.get(filePath) ?? "",
	};

	assert.equal(captureOriginalContent("/tmp/existing.ts", fsImpl), "before");
	assert.equal(captureOriginalContent("/tmp/new.ts", fsImpl), null);
});

test("checkpoints capture current tracked file contents, not original session contents", () => {
	const root = mkdtempSync(join(tmpdir(), "gsd-vscode-change-tracker-"));
	const filePath = join(root, "tracked.ts");

	try {
		writeFileSync(filePath, "original");
		const originals = new Map([[filePath, captureOriginalContent(filePath, {
			existsSync: (path) => path === filePath,
			readFileSync: () => "original",
		})]]);

		writeFileSync(filePath, "current");
		const snapshots = captureCurrentSnapshots(originals.keys(), {
			existsSync: (path) => path === filePath,
			readFileSync: () => "current",
		});

		assert.equal(originals.get(filePath), "original");
		assert.equal(snapshots.get(filePath), "current");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("change tracker checkpoint labels describe the first action behaviorally", () => {
	assert.equal(describeAction("Write", { file_path: "/tmp/project/src/app.ts" }), "Write app.ts");
	assert.equal(describeAction("Bash", { command: "npm run verify -- --long-output" }), "$ npm run verify -- --long-output");
	assert.equal(describeAction("grep", { pattern: "source-grep" }), "Grep: source-grep");
});
