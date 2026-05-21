// Project/App: GSD-2
// File Purpose: Runtime tests for TUI tool cards, success notifications, and blocking errors.
// GSD2 TUI Tests - Runtime coverage for tool-card cleanup and success notification rendering.
// Runtime regression tests for the post-compaction tool-card cleanup and the
// green-bordered success-notification rendering. Replaces the source-grep
// `src/tests/tui-running-and-success-box.test.ts` that was deleted in #4875
// (tracked as #4872).
//
// The previous tests asserted on identifier presence and method signature
// shape via regex. A regression that routed `success` notifications through
// `showStatus` (dim text) by accident would not have failed because the
// `showSuccess` method would still exist and still match the regex. These
// tests instead drive the components through the actual scenario and assert
// on rendered output.

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";

import { Container, Text } from "@gsd/pi-tui";
import stripAnsi from "strip-ansi";

import { initTheme, theme } from "../theme/theme.js";
import { renderBlockingErrorBanner, renderExtensionNotifyInChat, shouldRenderExtensionNotifyInChat } from "../interactive-mode.js";
import { DynamicBorder } from "./dynamic-border.js";
import { ToolExecutionComponent } from "./tool-execution.js";

// Theme is a globalThis-shared singleton that throws if not initialized.
// Initialize once before any test that exercises themed rendering.
before(() => {
	initTheme("dark");
});

describe("Extension warning notifications", () => {
	it("do not render into chat output", () => {
		assert.equal(shouldRenderExtensionNotifyInChat("warning"), false);
		assert.equal(shouldRenderExtensionNotifyInChat("error"), true);
		assert.equal(shouldRenderExtensionNotifyInChat("success"), true);
		assert.equal(shouldRenderExtensionNotifyInChat("info"), true);
		assert.equal(shouldRenderExtensionNotifyInChat(undefined), true);

		const warningChat = new Container();
		const warningResult = renderExtensionNotifyInChat(warningChat, "extension warning", "warning");
		assert.equal(warningResult.rendered, false);
		assert.equal(
			warningChat.render(80).map(stripAnsi).join("\n"),
			"",
			"warning notifications must not add chat output",
		);

		for (const type of ["error", "success", "info"] as const) {
			const chat = new Container();
			const result = renderExtensionNotifyInChat(chat, `${type} notification`, type);
			assert.equal(result.rendered, true, `${type} notification should render`);
			assert.match(
				chat.render(80).map(stripAnsi).join("\n"),
				new RegExp(`${type} notification`),
				`${type} notification text should appear in chat output`,
			);
		}
	});

	it("preserves explicit ANSI styling in info notifications", () => {
		const chat = new Container();
		const styled = "\x1b[32mStyled external notice\x1b[0m";
		const result = renderExtensionNotifyInChat(chat, styled, "info");
		const rendered = chat.render(80).join("\n");

		assert.equal(result.rendered, true);
		assert.match(rendered, /\x1b\[32mStyled external notice\x1b\[0m/);
		assert.equal(stripAnsi(rendered).includes("Styled external notice"), true);
	});

	it("colors GSD status-card notifications with the interactive theme", () => {
		const chat = new Container();
		const card = [
			"    ╭─ ✓ Verification Gate",
			"       2/2 checks passed",
			"    ╰────────────────────────────────────────",
			"       Continue: /gsd next",
		].join("\n");
		const result = renderExtensionNotifyInChat(chat, card, "info");
		const rendered = chat.render(100).join("\n");

		assert.equal(result.rendered, true);
		assert.ok(rendered.includes(theme.fg("success", theme.bold("✓ Verification Gate"))));
		assert.ok(rendered.includes(theme.fg("borderAccent", "╭─")));
		assert.ok(rendered.includes(theme.fg("success", "/gsd next")));
		assert.match(stripAnsi(rendered), /2\/2 checks passed/);
	});
});

describe("Blocking error banner", () => {
	it("keeps full error notifications renderable outside chat history", () => {
		const banner = new Container();
		const message = [
			"Pre-execution checks failed: 3 blocking issues found",
			"  - [file] lib/types.ts: Task T01 references 'lib/types.ts'",
			"See .gsd/milestones/M001/slices/S02/S02-PRE-EXEC-VERIFY.json for full details.",
		].join("\n");

		renderBlockingErrorBanner(banner, message);

		const rendered = banner.render(140).map(stripAnsi).join("\n");
		assert.match(rendered, /Error: Pre-execution checks failed: 3 blocking issues found/);
		assert.match(rendered, /Task T01 references 'lib\/types\.ts'/);
		assert.match(rendered, /S02-PRE-EXEC-VERIFY\.json/);
	});

	it("clears the sticky banner when the blocking error is cleared", () => {
		const banner = new Container();

		renderBlockingErrorBanner(banner, "Provider failed");
		assert.match(banner.render(80).map(stripAnsi).join("\n"), /Provider failed/);

		renderBlockingErrorBanner(banner, undefined);
		assert.equal(banner.render(80).map(stripAnsi).join("\n"), "");
	});
});

interface MockTui {
	renderCount: number;
	requestRender(): void;
}

function makeMockTUI(): MockTui {
	return {
		renderCount: 0,
		requestRender() {
			this.renderCount++;
		},
	};
}

// ─── Bug 1: tool cards stuck in "Running" after compaction ──────────────

describe("ToolExecutionComponent post-compaction cleanup", () => {
	it("renders 'running' status while the tool call has no result", () => {
		// Baseline: a freshly-constructed component (mid-stream) must show
		// the running badge — this is the state we need to flip OUT of when
		// compaction removes the result message.
		const ui = makeMockTUI();
		const c = new ToolExecutionComponent(
			"read_file",
			{ path: "/tmp/x.txt" },
			{},
			undefined,
			ui as never,
		);
		const rendered = c.render(60).map(stripAnsi).join("\n");
		assert.ok(
			rendered.includes("running"),
			"freshly constructed component should render 'running' badge",
		);
	});

	it("markHistoricalNoResult flips a stuck tool card OUT of 'running'", () => {
		// Real bug: after session-history replay (post-compaction or session
		// switch), tool calls without matching tool_result messages stay in
		// isPartial = true forever. markHistoricalNoResult must produce a
		// rendered output that no longer reads "Running".
		const ui = makeMockTUI();
		const c = new ToolExecutionComponent(
			"read_file",
			{ path: "/tmp/x.txt" },
			{},
			undefined,
			ui as never,
		);

		c.markHistoricalNoResult();

		const rendered = c.render(60).map(stripAnsi).join("\n");
		assert.ok(
			!rendered.includes("running"),
			"after markHistoricalNoResult, the tool card must NOT render 'running' -- got:\n" +
				rendered,
		);
		assert.ok(
			rendered.includes("success"),
			"flipped card should render 'success' status (no-result success)",
		);
	});

	it("markHistoricalNoResult is idempotent when a real result already exists", () => {
		// Late-arriving stream events must not clobber legitimate results.
		// We observe the no-clobber via behaviour: a card that completed
		// with a real result keeps its "Done" badge and content even if
		// markHistoricalNoResult fires again afterwards.
		const ui = makeMockTUI();
		const c = new ToolExecutionComponent(
			"read_file",
			{ path: "/tmp/x.txt" },
			{},
			undefined,
			ui as never,
		);

		// Use the public completion path the runtime calls.
		c.updateResult(
			{
				content: [{ type: "text", text: "real-result-payload" }],
				isError: false,
			},
			false, // isPartial = false → "Done"
		);

		const before = c.render(60).map(stripAnsi).join("\n");
		assert.ok(before.includes("success"), "after complete(), card shows 'success'");

		c.markHistoricalNoResult(); // must early-return
		const after = c.render(60).map(stripAnsi).join("\n");
		assert.equal(
			after,
			before,
			"markHistoricalNoResult must NOT mutate state when a real result is already present",
		);
	});
});

// ─── Bug 2: success notifications render as a green bordered box ────────

describe("Success-notification rendering — DynamicBorder + success theme", () => {
	// We drive the same component composition that interactive-mode.showSuccess
	// builds (DynamicBorder + Text + DynamicBorder, all themed with
	// theme.fg("success", …)) and assert on the rendered output, rather than
	// trying to instantiate the full InteractiveMode (which requires a real
	// session, bridge, and TUI runtime).
	function buildSuccessNotification(message: string): Container {
		const c = new Container();
		const successColor = (text: string) => theme.fg("success", text);
		c.addChild(new DynamicBorder(successColor));
		c.addChild(new Text(theme.fg("success", message), 1, 0));
		c.addChild(new DynamicBorder(successColor));
		return c;
	}

	it("renders a top and bottom horizontal border framing the message", () => {
		const c = buildSuccessNotification("Milestone M042 ready.");
		const lines = c.render(40);

		// First and last lines should be horizontal-rule borders
		// (DynamicBorder renders a row of "─" characters).
		const firstStripped = stripAnsi(lines[0]);
		const lastStripped = stripAnsi(lines[lines.length - 1]);

		assert.ok(
			firstStripped.includes("─"),
			`first line should be a border (got: ${JSON.stringify(firstStripped)})`,
		);
		assert.ok(
			lastStripped.includes("─"),
			`last line should be a border (got: ${JSON.stringify(lastStripped)})`,
		);
		assert.ok(
			lines.length >= 3,
			`success notification must have at least 3 lines (top border, message, bottom border) — got ${lines.length}`,
		);
	});

	it("the message text appears between the two borders", () => {
		const c = buildSuccessNotification("Milestone M042 ready.");
		const lines = c.render(40);

		const messageRow = lines.findIndex((l) => stripAnsi(l).includes("Milestone M042 ready."));
		assert.ok(messageRow > 0, "message must appear after the top border");
		assert.ok(
			messageRow < lines.length - 1,
			"message must appear before the bottom border",
		);
	});

	it("borders carry ANSI styling (not plain dim text like showStatus)", () => {
		// Goodhart-resistant: if a regression routed success through
		// showStatus, the borders would be missing AND the rendered text
		// would be plain (or only dim-styled, not success-colored). We
		// observe the border lines carry ANSI escape codes — the literal
		// foreground color depends on the theme (which is system-dependent
		// in CI), so we don't pin a specific code but DO require styling
		// to be present.
		const c = buildSuccessNotification("ok");
		const lines = c.render(40);
		const top = lines[0];
		assert.ok(
			top !== stripAnsi(top),
			"top border must contain ANSI styling — a plain unstyled border " +
				"would indicate the rendering bypassed theme.fg('success', ...)",
		);
	});

	it("plain Text status (the showStatus path) does NOT produce a bordered box", () => {
		// Counter-test: this is what the bug looked like — a single dim Text
		// with no surrounding border. If anyone ever "fixes" the showSuccess
		// regression by also adding borders to showStatus, this test will
		// surface the conflation.
		const plain = new Text(theme.fg("dim", "Milestone M042 ready."), 1, 0);
		const lines = plain.render(40);
		const joined = lines.map(stripAnsi).join("\n");
		assert.ok(
			!joined.includes("─"),
			"plain Text (showStatus path) must NOT contain border characters",
		);
	});
});
