// GSD2 TUI Tests - Chat frame card visual contract coverage.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import stripAnsi from "strip-ansi";
import { renderChatFrame } from "../transcript-design.js";
import { initTheme } from "../../theme/theme.js";

initTheme("dark", false);

// renderChatFrame renders compaction notices and skill invocations as a
// copy-clean "open" surface (ADR-019): a titled top rule, body lines with
// no border column, and a closing rule. The compaction tone uses the purple
// `customMessageLabel` color so it stays visually distinct from conversation
// turns.

describe("renderChatFrame — compaction tone", () => {
	test("renders a titled rule and copy-clean body lines", () => {
		const lines = renderChatFrame(
			["Compacted from 1,224,262 tokens (ctrl+o to expand)"],
			60,
			{
				label: "compaction",
				tone: "compaction",
				timestampFormat: "date-time-iso",
				showTimestamp: false,
			},
		);

		// Structure: titled top rule, body line(s), closing rule.
		assert.ok(lines.length >= 3, `expected at least 3 frame lines, got ${lines.length}`);

		const plain = lines.map((line) => stripAnsi(line));

		// Top rule carries the label inline and is all rule/title characters.
		assert.ok(
			plain[0].includes("compaction"),
			`expected top rule to contain "compaction", got ${JSON.stringify(plain[0])}`,
		);
		assert.ok(!plain[0].includes("•"), `header should not render a bullet prefix, got ${JSON.stringify(plain[0])}`);
		// Closing rule is a solid horizontal bar.
		assert.match(plain[plain.length - 1], /^─+$/, "last line should be the solid closing rule");

		// Body lines are copy-clean — no border column, no leading glyph — so
		// a terminal selection copies only the content.
		for (const body of plain.slice(1, -1)) {
			assert.ok(!body.startsWith("│"), `body line must not start with │: ${JSON.stringify(body)}`);
			assert.ok(!body.startsWith("┃"), `body line must not start with ┃: ${JSON.stringify(body)}`);
		}
		assert.ok(
			plain.slice(1, -1).some((body) => body.includes("Compacted from 1,224,262 tokens")),
			"a body line should include the original content",
		);
	});

	test("does not render a right-aligned timestamp when showTimestamp is false", () => {
		const lines = renderChatFrame(["body"], 60, {
			label: "compaction",
			tone: "compaction",
			timestamp: Date.now(),
			timestampFormat: "date-time-iso",
			showTimestamp: false,
		});

		// No four-digit year should appear anywhere in the frame.
		const joined = lines.map((line) => stripAnsi(line)).join("\n");
		assert.ok(
			!/\b20\d{2}\b/.test(joined),
			`timestamp should be suppressed when showTimestamp=false, got ${JSON.stringify(joined)}`,
		);
	});

	test("emits ANSI color codes distinct from the assistant tone", () => {
		const assistantFrame = renderChatFrame(["body"], 60, {
			label: "claude",
			tone: "assistant",
			timestampFormat: "date-time-iso",
			showTimestamp: false,
		}).join("\n");

		const compactionFrame = renderChatFrame(["body"], 60, {
			label: "compaction",
			tone: "compaction",
			timestampFormat: "date-time-iso",
			showTimestamp: false,
		}).join("\n");

		// Different tones map to different border/label colors.
		assert.ok(
			assistantFrame !== compactionFrame,
			"compaction tone must produce a different styled output than assistant tone",
		);
	});
});
