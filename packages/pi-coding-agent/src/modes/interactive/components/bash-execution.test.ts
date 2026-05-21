// GSD-2 + packages/pi-coding-agent/src/modes/interactive/components/bash-execution.test.ts - Bash execution renderer regression coverage.

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { type Container, type TUI } from "@gsd/pi-tui";
import stripAnsi from "strip-ansi";
import { initTheme } from "../theme/theme.js";
import { BashExecutionComponent } from "./bash-execution.js";

before(() => {
	initTheme("dark", false);
});

function makeMockTui(width: number): TUI {
	return {
		terminal: { columns: width },
		requestRender() {},
	} as TUI;
}

describe("BashExecutionComponent", () => {
	it("wraps collapsed inline output to the render width, not the construction width", () => {
		const component = new BashExecutionComponent("echo long", makeMockTui(80));
		component.appendOutput("abcdefghijklmnopqrstuvwxyz1234567890");
		component.setComplete(0, false);

		const contentContainer = (component as unknown as { contentContainer: Container }).contentContainer;
		const narrowLines = contentContainer.render(20).map((line) => stripAnsi(line));

		assert.ok(
			narrowLines.every((line) => line.length <= 20),
			`collapsed inline output must reflow to width 20:\n${narrowLines.join("\n")}`,
		);
	});
});
