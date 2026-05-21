#!/usr/bin/env node
// Visual harness for ADR-019 — renders every migrated TUI surface with the
// real renderers so you can see (and copy-test) the copy-clean "open" style.
//
// Run after building both packages:
//   cd packages/pi-tui && npx tsc -p tsconfig.json && cd ../..
//   npx tsc -p packages/pi-coding-agent/tsconfig.json
//   node scripts/tui-open-surface-demo.mjs
//
// Then SELECT body lines of any block and paste them — they copy clean.

import { style } from "../packages/pi-tui/dist/index.js";
import { initTheme } from "../packages/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import {
	renderAssistantRail,
	renderUserRail,
	renderToolLineCard,
	renderTranscriptCard,
	renderCommandCard,
	renderChatFrame,
} from "../packages/pi-coding-agent/dist/modes/interactive/components/transcript-design.js";

initTheme("dark", false);

// Render at the full terminal width (falls back to 100 when not a TTY).
const W = process.stdout.columns || 100;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;

const section = (label) => {
	console.log();
	console.log(dim(`── ${label} ${"─".repeat(Math.max(0, W - label.length - 4))}`));
	console.log();
};
const print = (lines) => {
	for (const line of lines) console.log(line);
};

console.log();
console.log(cyan("ADR-019 — every TUI surface on the copy-clean open style"));
console.log(dim("Select body lines of any block and paste them to compare."));

// ── Before/after contrast ──────────────────────────────────────────────
section("BEFORE: the old bordered card (for contrast)");
print(
	style()
		.border("rounded")
		.paddingX(1)
		.title("read", cyan)
		.titleRight("src/style.ts", green)
		.borderColor(dim)
		.render(["export type TerminalBorderStyle =", '  "none" | "rule" | "open";'], W),
);
console.log(dim('↑ a copied body line carries "│ " and " │"'));

// ── Conversation turns ─────────────────────────────────────────────────
section("user message");
print(renderUserRail(["How do I run the tests?"], W, { label: "You", meta: "14:32" }));

section("assistant message");
print(
	renderAssistantRail(
		["Run `npm test` from the repo root —", "it builds the workspace, then runs the suite."],
		W,
		{ label: "GSD", meta: "opus-4.7" },
	),
);

// ── Tool calls ─────────────────────────────────────────────────────────
section("tool call — collapsed (read)");
print(renderToolLineCard("read", "src/transcript-design.ts", W, { status: "success", tone: "success" }));

section("tool call — collapsed, output hidden (grep)");
print(renderToolLineCard("grep", "openSurface", W, { status: "3 matches", tone: "success", hidden: true }));

section("tool call — error (edit)");
print(renderToolLineCard("edit", "src/missing.ts", W, { status: "failed · no such file", tone: "error" }));

section("tool call — expanded output");
print(
	renderTranscriptCard(
		[
			"export function openSurface(",
			"  lines: string[], width: number, opts,",
			"): string[] { /* ... */ }",
		],
		W,
		{ title: "read", right: "src/transcript-design.ts", tone: "success", footerLeft: "42 lines", footerRight: "ctrl+o collapse" },
	),
);

// ── Bash ───────────────────────────────────────────────────────────────
section("bash command — success");
print(renderCommandCard("npm test", W, { status: "success", tone: "success" }));

section("bash command — running");
print(renderCommandCard("npm run build", W, { status: "running", tone: "running", progress: "▓▓▓▓░░░░" }));

// ── System frames ──────────────────────────────────────────────────────
section("compaction notice");
print(
	renderChatFrame(["Compacted from 1,224,262 tokens (ctrl+o to expand)"], W, {
		label: "compaction",
		tone: "compaction",
		timestampFormat: "date-time-iso",
		showTimestamp: false,
	}),
);

section("skill invocation");
print(
	renderChatFrame(["(ctrl+o to expand)"], W, {
		label: "skill - tui-design",
		tone: "skill",
		timestampFormat: "date-time-iso",
		showTimestamp: false,
	}),
);

console.log();
console.log(dim("Every block above: select the body lines, paste — clean text."));
console.log(dim("Collapsed tool/command cards are a single titled rule line."));
console.log();
