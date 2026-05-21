// GSD-2 - Behavior coverage for tool target metadata.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createEditTool } from "./edit.js";
import { createFindTool } from "./find.js";
import { createGrepTool } from "./grep.js";
import { createLsTool } from "./ls.js";
import { createReadTool } from "./read.js";
import { createWriteTool } from "./write.js";

test("read metadata records resolved path without changing output text", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "gsd-read-target-"));
	try {
		const filePath = join(cwd, "fixture.txt");
		writeFileSync(filePath, "one\ntwo\nthree\n", "utf8");

		const result = await createReadTool(cwd).execute("read-1", {
			path: "fixture.txt",
			offset: 2,
			limit: 1,
		});

		assert.equal(result.details?.target?.resolvedPath, filePath);
		assert.deepEqual(result.details?.target?.range, { start: 2, end: 2 });
		assert.equal(result.content[0]?.type, "text");
		assert.match(result.content[0]?.text ?? "", /^two/);
		assert.equal((result.content[0]?.text ?? "").includes(filePath), false);

		const zeroOffsetResult = await createReadTool(cwd).execute("read-zero-offset", {
			path: "fixture.txt",
			offset: 0,
			limit: 1,
		});

		assert.deepEqual(zeroOffsetResult.details?.target?.range, { start: 1, end: 1 });
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("write metadata records resolved path without changing output text", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "gsd-write-target-"));
	try {
		const filePath = join(cwd, "out.txt");
		const result = await createWriteTool(cwd).execute("write-1", {
			path: "out.txt",
			content: "hello",
		});

		assert.equal(result.details?.target?.resolvedPath, filePath);
		assert.equal(result.content[0]?.type, "text");
		assert.equal(result.content[0]?.text, "Successfully wrote 5 bytes to out.txt");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("edit metadata records first changed line and resolved path", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "gsd-edit-target-"));
	try {
		const filePath = join(cwd, "edit.txt");
		writeFileSync(filePath, "alpha\nbeta\ngamma\n", "utf8");

		const result = await createEditTool(cwd).execute("edit-1", {
			path: "edit.txt",
			oldText: "beta",
			newText: "delta",
		});

		assert.equal(result.details?.target?.resolvedPath, filePath);
		assert.equal(result.details?.target?.line, 2);
		assert.equal(result.details?.firstChangedLine, 2);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("list and find metadata record resolved targets", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "gsd-search-target-"));
	try {
		const srcPath = join(cwd, "src");
		const filePath = join(srcPath, "needle.txt");
		mkdirSync(srcPath);
		writeFileSync(filePath, "needle\n", "utf8");

		const lsResult = await createLsTool(cwd).execute("ls-1", { path: "src" });
		assert.equal(lsResult.details?.target?.resolvedPath, srcPath);

		const findResult = await createFindTool(cwd, {
			operations: {
				exists: () => true,
				glob: async () => [filePath],
			},
		}).execute("find-1", { path: "src", pattern: "needle" });
		assert.equal(findResult.details?.target?.resolvedPath, srcPath);
		assert.equal(findResult.details?.target?.pattern, "needle");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("grep metadata records resolved search target", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "gsd-grep-target-"));
	try {
		const srcPath = join(cwd, "src");
		mkdirSync(srcPath);
		writeFileSync(join(srcPath, "needle.txt"), "needle\n", "utf8");

		const result = await createGrepTool(cwd).execute("grep-1", {
			path: "src",
			pattern: "needle",
			literal: true,
		});

		assert.equal(result.details?.target?.resolvedPath, srcPath);
		assert.equal(result.details?.target?.pattern, "needle");
		assert.equal(result.content[0]?.type, "text");
		assert.match(result.content[0]?.text ?? "", /needle\.txt:1: needle/);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
