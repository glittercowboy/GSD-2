// Project/App: GSD-2
// File Purpose: Compact tool-call summary regression tests.

import assert from "node:assert/strict";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import { formatToolCallSummary } from "./tool-call-summary.js";

describe("formatToolCallSummary", () => {
	it("summarizes read targets with shared home path shortening and line ranges", () => {
		const filePath = path.join(os.homedir(), "project/src/index.ts");

		assert.equal(
			formatToolCallSummary("read", { path: filePath, offset: 10, limit: 5 }),
			"[read: ~/project/src/index.ts:10-14]",
		);
	});

	it("normalizes Windows separators in shortened paths", () => {
		const filePath = `${os.homedir()}\\project\\src\\index.ts`;

		assert.equal(formatToolCallSummary("read", { path: filePath }), "[read: ~/project/src/index.ts]");
	});

	it("normalizes multiline bash commands before truncating them", () => {
		assert.equal(
			formatToolCallSummary("bash", { command: "npm test\nnpm run build\t-- --verbose" }),
			"[bash: npm test npm run build -- --verbose]",
		);
	});

	it("keeps custom tool summaries bounded", () => {
		assert.equal(
			formatToolCallSummary("custom_tool", { alpha: "x".repeat(80) }),
			'[custom_tool: {"alpha":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx...]',
		);
	});
});
