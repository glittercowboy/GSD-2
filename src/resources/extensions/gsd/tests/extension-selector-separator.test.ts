import { describe, expect, it, vi, beforeAll } from "vitest";
import { initTheme } from "../../../../../packages/pi-coding-agent/src/modes/interactive/theme/theme.js";
import { SEPARATOR_PREFIX, ExtensionSelectorComponent } from "../../../../../packages/pi-coding-agent/src/modes/interactive/components/extension-selector.js";

beforeAll(() => {
	initTheme("default", false);
});

describe("SEPARATOR_PREFIX", () => {
	it("is the expected three-dash prefix", () => {
		expect(SEPARATOR_PREFIX).toBe("───");
	});
});

describe("ExtensionSelectorComponent separator handling", () => {
	const options = [
		`${SEPARATOR_PREFIX} anthropic (2) ${SEPARATOR_PREFIX}`,
		"claude-opus-4-6 · anthropic",
		"claude-sonnet-4-5 · anthropic",
		`${SEPARATOR_PREFIX} openai (1) ${SEPARATOR_PREFIX}`,
		"gpt-4o · openai",
		"(keep current)",
		"(clear)",
	];

	it("initialises selectedIndex on first non-separator item", () => {
		const onSelect = vi.fn();
		const sel = new ExtensionSelectorComponent("Test", options, onSelect, vi.fn());
		sel.handleInput("\n");
		expect(onSelect).toHaveBeenCalledWith("claude-opus-4-6 · anthropic");
	});

	it("skips separators when navigating down", () => {
		const onSelect = vi.fn();
		const sel = new ExtensionSelectorComponent("Test", options, onSelect, vi.fn());
		sel.handleInput("\x1b[B"); // -> claude-sonnet-4-5
		sel.handleInput("\x1b[B"); // -> skip separator -> gpt-4o
		sel.handleInput("\n");
		expect(onSelect).toHaveBeenCalledWith("gpt-4o · openai");
	});

	it("skips separators when navigating up from below separator", () => {
		const onSelect = vi.fn();
		const sel = new ExtensionSelectorComponent("Test", options, onSelect, vi.fn());
		sel.handleInput("\x1b[B"); // -> claude-sonnet-4-5
		sel.handleInput("\x1b[B"); // -> skip separator -> gpt-4o
		sel.handleInput("\x1b[A"); // -> skip separator -> claude-sonnet-4-5
		sel.handleInput("\n");
		expect(onSelect).toHaveBeenCalledWith("claude-sonnet-4-5 · anthropic");
	});

	it("does not fire onSelect for separator on Enter", () => {
		const onSelect = vi.fn();
		const opts = [
			`${SEPARATOR_PREFIX} group ${SEPARATOR_PREFIX}`,
			"item-a",
		];
		const sel = new ExtensionSelectorComponent("Test", opts, onSelect, vi.fn());
		sel.handleInput("\n");
		expect(onSelect).toHaveBeenCalledWith("item-a");
	});

	it("works with no separators (backward compatible)", () => {
		const onSelect = vi.fn();
		const plain = ["alpha", "beta", "gamma"];
		const sel = new ExtensionSelectorComponent("Test", plain, onSelect, vi.fn());
		sel.handleInput("\n");
		expect(onSelect).toHaveBeenCalledWith("alpha");
		onSelect.mockClear();
		sel.handleInput("\x1b[B");
		sel.handleInput("\n");
		expect(onSelect).toHaveBeenCalledWith("beta");
	});
});
