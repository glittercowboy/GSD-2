import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { makeStreamExhaustedErrorMessage, extractToolResults } from "../stream-adapter.ts";
import type { SDKUserMessage } from "../sdk-types.ts";

describe("stream-adapter — exhausted stream fallback (#2575)", () => {
	test("generator exhaustion becomes an error message instead of clean completion", () => {
		const message = makeStreamExhaustedErrorMessage("claude-sonnet-4-20250514", "partial answer");

		assert.equal(message.stopReason, "error");
		assert.equal(message.errorMessage, "stream_exhausted_without_result");
		assert.deepEqual(message.content, [{ type: "text", text: "partial answer" }]);
	});

	test("generator exhaustion without prior text still exposes a classifiable error", () => {
		const message = makeStreamExhaustedErrorMessage("claude-sonnet-4-20250514", "");

		assert.equal(message.stopReason, "error");
		assert.equal(message.errorMessage, "stream_exhausted_without_result");
		assert.match(String((message.content[0] as any)?.text ?? ""), /Claude Code error: stream_exhausted_without_result/);
	});
});

describe("stream-adapter — tool result extraction (#2860)", () => {
	test("extracts tool_result blocks from user message content", () => {
		const userMsg: SDKUserMessage = {
			type: "user",
			session_id: "test-session",
			parent_tool_use_id: null,
			message: {
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: "tool_abc",
						content: [{ type: "text", text: "file contents here" }],
					},
					{
						type: "tool_result",
						tool_use_id: "tool_def",
						content: "bash output line 1\nbash output line 2",
						is_error: false,
					},
				],
			},
		};

		const results = extractToolResults(userMsg);
		assert.equal(results.size, 2);

		const resultAbc = results.get("tool_abc");
		assert.ok(resultAbc);
		assert.deepEqual(resultAbc.content, [{ type: "text", text: "file contents here" }]);
		assert.equal(resultAbc.isError, false);

		const resultDef = results.get("tool_def");
		assert.ok(resultDef);
		assert.deepEqual(resultDef.content, [{ type: "text", text: "bash output line 1\nbash output line 2" }]);
		assert.equal(resultDef.isError, false);
	});

	test("handles error tool results", () => {
		const userMsg: SDKUserMessage = {
			type: "user",
			session_id: "test-session",
			parent_tool_use_id: null,
			message: {
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: "tool_err",
						content: "command not found: foobar",
						is_error: true,
					},
				],
			},
		};

		const results = extractToolResults(userMsg);
		const result = results.get("tool_err");
		assert.ok(result);
		assert.equal(result.isError, true);
		assert.deepEqual(result.content, [{ type: "text", text: "command not found: foobar" }]);
	});

	test("returns empty map for string content messages", () => {
		const userMsg: SDKUserMessage = {
			type: "user",
			session_id: "test-session",
			parent_tool_use_id: null,
			message: {
				role: "user",
				content: "plain text message",
			},
		};

		const results = extractToolResults(userMsg);
		assert.equal(results.size, 0);
	});

	test("handles tool_result with no content", () => {
		const userMsg: SDKUserMessage = {
			type: "user",
			session_id: "test-session",
			parent_tool_use_id: null,
			message: {
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: "tool_empty",
					},
				],
			},
		};

		const results = extractToolResults(userMsg);
		const result = results.get("tool_empty");
		assert.ok(result);
		assert.deepEqual(result.content, [{ type: "text", text: "(no output)" }]);
	});

	test("skips non-tool-result blocks", () => {
		const userMsg: SDKUserMessage = {
			type: "user",
			session_id: "test-session",
			parent_tool_use_id: null,
			message: {
				role: "user",
				content: [
					{ type: "text", text: "some text" },
					{
						type: "tool_result",
						tool_use_id: "tool_only",
						content: "actual result",
					},
				],
			},
		};

		const results = extractToolResults(userMsg);
		assert.equal(results.size, 1);
		assert.ok(results.has("tool_only"));
	});
});
