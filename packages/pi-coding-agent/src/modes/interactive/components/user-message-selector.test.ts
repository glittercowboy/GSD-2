// GSD-2 + packages/pi-coding-agent/src/modes/interactive/components/user-message-selector.test.ts - User message selector width regression coverage.

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { visibleWidth } from "@gsd/pi-tui";
import { initTheme } from "../theme/theme.js";
import { UserMessageSelectorComponent } from "./user-message-selector.js";

before(() => {
	initTheme("dark", false);
});

describe("UserMessageSelectorComponent", () => {
	it("keeps message, metadata, and scroll rows within narrow widths", () => {
		const messages = Array.from({ length: 1000 }, (_, index) => ({
			id: String(index),
			text: index === 999 ? "a very long user message that must be clipped" : "short",
		}));
		const selector = new UserMessageSelectorComponent(messages, () => {}, () => {});

		const rendered = selector.getMessageList().render(8);

		assert.ok(rendered.length > 0);
		for (const line of rendered) {
			assert.ok(visibleWidth(line) <= 8, `expected width <= 8, got ${visibleWidth(line)} for ${JSON.stringify(line)}`);
		}
	});
});
