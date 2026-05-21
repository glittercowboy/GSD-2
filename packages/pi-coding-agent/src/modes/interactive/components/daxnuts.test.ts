// GSD-2 + packages/pi-coding-agent/src/modes/interactive/components/daxnuts.test.ts - Daxnuts component color-mode regression coverage.

import { afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import type { TUI } from "@gsd/pi-tui";
import { initTheme } from "../theme/theme.js";
import { DaxnutsComponent } from "./daxnuts.js";

const ENV_KEYS = ["COLORTERM", "WT_SESSION", "TERM_PROGRAM", "TERM"] as const;
let savedEnv: Record<(typeof ENV_KEYS)[number], string | undefined>;

function saveEnv(): void {
	savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<
		(typeof ENV_KEYS)[number],
		string | undefined
	>;
}

function restoreEnv(): void {
	for (const key of ENV_KEYS) {
		const value = savedEnv[key];
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

describe("DaxnutsComponent", () => {
	beforeEach(() => {
		saveEnv();
		mock.timers.enable({ apis: ["setInterval"] });
	});

	afterEach(() => {
		mock.timers.reset();
		restoreEnv();
		initTheme("dark", false);
	});

	it("uses xterm-256 color sequences in limited-color terminals", () => {
		delete process.env.COLORTERM;
		delete process.env.WT_SESSION;
		process.env.TERM_PROGRAM = "Apple_Terminal";
		process.env.TERM = "xterm-256color";
		initTheme("dark", false);

		const component = new DaxnutsComponent({ requestRender() {} } as TUI);
		try {
			(component as unknown as { tick: number }).tick = 25;
			const output = component.render(80).join("\n");

			assert.doesNotMatch(
				output,
				/\x1b\[(?:38|48);2;/,
				"limited-color terminals must not receive 24-bit truecolor SGR sequences",
			);
			assert.match(
				output,
				/\x1b\[(?:38|48);5;/,
				"limited-color terminals should receive xterm-256 SGR sequences",
			);
		} finally {
			component.dispose();
		}
	});
});
