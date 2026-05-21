// Project/App: GSD-2
// File Purpose: Keyboard input parsing regression tests.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isKeyRelease, Key, matchesKey } from "../keys.js";

describe("keyboard input helpers", () => {
	it("detects Kitty release events without treating repeat events as releases", () => {
		assert.equal(isKeyRelease("\x1b[13;1:3u"), true);
		assert.equal(isKeyRelease("\x1b[13;1:2u"), false);
	});

	it("ignores Kitty-looking markers inside bracketed paste content", () => {
		assert.equal(isKeyRelease("\x1b[200~:3u\x1b[201~"), false);
	});

	it("continues matching repeated Kitty key events as the underlying key", () => {
		assert.equal(matchesKey("\x1b[13;1:2u", Key.enter), true);
	});
});
