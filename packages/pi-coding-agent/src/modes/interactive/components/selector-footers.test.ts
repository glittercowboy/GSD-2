// GSD-2 + packages/pi-coding-agent/src/modes/interactive/components/selector-footers.test.ts - Selector footer consistency coverage.

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { Component } from "@gsd/pi-tui";
import { stripVTControlCharacters } from "node:util";
import { AuthStorage } from "../../../core/auth-storage.js";
import { initTheme } from "../theme/theme.js";
import { OAuthSelectorComponent } from "./oauth-selector.js";
import { ShowImagesSelectorComponent } from "./show-images-selector.js";
import { ThemeSelectorComponent } from "./theme-selector.js";
import { ThinkingSelectorComponent } from "./thinking-selector.js";
import { renderCursor } from "./tree-render-utils.js";
import { UserMessageSelectorComponent } from "./user-message-selector.js";

before(() => {
	initTheme("dark", false);
});

function plain(component: Component): string {
	return component.render(80).map((line) => stripVTControlCharacters(line)).join("\n");
}

function plainLines(component: Component): string[] {
	return component.render(80).map((line) => stripVTControlCharacters(line));
}

function assertSelectorFooter(output: string): void {
	assert.match(output, /navigate/);
	assert.match(output, /select/);
	assert.match(output, /cancel/);
}

describe("selector footers", () => {
	it("renders the standard selector footer on simple interactive selectors", () => {
		const selectors: Component[] = [
			new ThemeSelectorComponent("dark", () => {}, () => {}, () => {}),
			new ThinkingSelectorComponent("medium", ["off", "medium", "high"], () => {}, () => {}),
			new ShowImagesSelectorComponent(true, () => {}, () => {}),
			new OAuthSelectorComponent("login", AuthStorage.inMemory(), () => {}, () => {}),
			new UserMessageSelectorComponent([{ id: "1", text: "hello" }], () => {}, () => {}),
		];

		for (const selector of selectors) {
			assertSelectorFooter(plain(selector));
		}
	});

	it("uses the shared selector cursor on simple row selectors", () => {
		const cursor = stripVTControlCharacters(renderCursor(true));
		const selectors: Component[] = [
			new OAuthSelectorComponent("login", AuthStorage.inMemory(), () => {}, () => {}),
			new UserMessageSelectorComponent([{ id: "1", text: "hello" }], () => {}, () => {}),
		];

		for (const selector of selectors) {
			assert.ok(
				plainLines(selector).some((line) => line.startsWith(cursor)),
				`expected selected row to start with ${JSON.stringify(cursor)}`,
			);
		}
	});
});
