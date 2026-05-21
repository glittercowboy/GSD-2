// GSD-2 + packages/pi-tui/src/__tests__/utils.test.ts - ANSI-aware utility regression coverage.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { alignRight, padRight, visibleWidth } from "../utils.js";

describe("TUI text utilities", () => {
	it("padRight truncates and pads to exact visible width", () => {
		const padded = padRight("\x1b[31mabcdef\x1b[39m", 4);

		assert.equal(visibleWidth(padded), 4);
		assert.equal(padRight("ok", 4), "ok  ");
	});

	it("alignRight keeps output inside the requested visible width", () => {
		const aligned = alignRight("\x1b[31mleft\x1b[39m", "\x1b[32mright\x1b[39m", 12);

		assert.equal(visibleWidth(aligned), 12);
		assert.equal(visibleWidth(alignRight("left", "right", 6)), 6);
	});
});
