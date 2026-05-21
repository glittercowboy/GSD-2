// GSD-2 + packages/pi-coding-agent/src/modes/interactive/components/interactive-key-handling.test.ts - Interactive component key handling regressions.

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
	EditorKeybindingsManager,
	setEditorKeybindings,
	setKittyProtocolActive,
	TUI,
	type EditorTheme,
	type Terminal,
} from "@gsd/pi-tui";
import { KeybindingsManager } from "../../../core/keybindings.js";
import { initTheme } from "../theme/theme.js";
import { CustomEditor } from "./custom-editor.js";
import { ExtensionInputComponent } from "./extension-input.js";
import { ExtensionSelectorComponent } from "./extension-selector.js";

function makeTerminal(): Terminal {
	return {
		isTTY: true,
		columns: 80,
		rows: 24,
		kittyProtocolActive: false,
		start() {},
		stop() {},
		drainInput: async () => {},
		write() {},
		moveBy() {},
		hideCursor() {},
		showCursor() {},
		clearLine() {},
		clearFromCursor() {},
		clearScreen() {},
		setTitle() {},
	};
}

const editorTheme: EditorTheme = {
	borderColor: (text) => text,
	selectList: {
		selectedPrefix: (text) => text,
		selectedText: (text) => text,
		description: (text) => text,
		scrollInfo: (text) => text,
		noMatch: (text) => text,
	},
};

describe("interactive component key handling", () => {
	beforeEach(() => {
		initTheme("dark", false);
		setEditorKeybindings(new EditorKeybindingsManager());
		setKittyProtocolActive(false);
	});

	afterEach(() => {
		setEditorKeybindings(new EditorKeybindingsManager());
		setKittyProtocolActive(false);
	});

	it("extension input follows a remapped confirm key instead of raw newline", () => {
		setEditorKeybindings(new EditorKeybindingsManager({ selectConfirm: "ctrl+s" }));
		let submitted: string | undefined;
		const input = new ExtensionInputComponent("Title", undefined, (value) => {
			submitted = value;
		}, () => {});

		input.handleInput("o");
		input.handleInput("k");
		input.handleInput("\n");

		assert.equal(submitted, undefined);

		input.handleInput("\x13");

		assert.equal(submitted, "ok");
	});

	it("extension selector follows a remapped confirm key instead of raw newline", () => {
		setEditorKeybindings(new EditorKeybindingsManager({ selectConfirm: "ctrl+s" }));
		let selected: string | undefined;
		const selector = new ExtensionSelectorComponent("Pick", ["alpha", "beta"], (option) => {
			selected = option;
		}, () => {});

		selector.handleInput("\n");

		assert.equal(selected, undefined);

		selector.handleInput("\x13");

		assert.equal(selected, "alpha");
	});

	it("extension selector keeps vi-style navigation through semantic key matching", () => {
		let selected: string | undefined;
		const selector = new ExtensionSelectorComponent("Pick", ["alpha", "beta", "gamma"], (option) => {
			selected = option;
		}, () => {});

		selector.handleInput("j");
		selector.handleInput("j");
		selector.handleInput("k");
		selector.handleInput("\r");

		assert.equal(selected, "beta");
	});

	it("custom editor treats the legacy alt-enter sequence as newline outside kitty mode", () => {
		const editor = new CustomEditor(new TUI(makeTerminal()), editorTheme, KeybindingsManager.inMemory());
		let followUp = false;
		editor.onAction("followUp", () => {
			followUp = true;
		});

		editor.handleInput("\x1b\r");

		assert.equal(followUp, false);
		assert.equal(editor.getText(), "\n");
	});
});
