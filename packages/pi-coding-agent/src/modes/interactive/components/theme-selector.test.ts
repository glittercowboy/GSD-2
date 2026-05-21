// GSD-2 + packages/pi-coding-agent/src/modes/interactive/components/theme-selector.test.ts - Theme selector live-preview regression coverage.

import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { initTheme, setTheme } from "../theme/theme.js";
import { ThemeSelectorComponent } from "./theme-selector.js";

initTheme("dark", false);

describe("ThemeSelectorComponent", () => {
	afterEach(() => {
		setTheme("dark", false);
	});

	it("renders its SelectList with the active theme after live preview changes", () => {
		setTheme("dark", false);
		const selector = new ThemeSelectorComponent("dark", () => {}, () => {}, () => {});
		const before = selector.getSelectList().render(80).join("\n");

		setTheme("light", false);
		selector.invalidate();
		const after = selector.getSelectList().render(80).join("\n");

		assert.notEqual(after, before);
		assert.match(after, /\x1b\[/, "rendered SelectList should still include themed ANSI styling");
	});
});
