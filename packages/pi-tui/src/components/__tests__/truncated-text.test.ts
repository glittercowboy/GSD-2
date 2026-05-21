// GSD-2 + packages/pi-tui/src/components/__tests__/truncated-text.test.ts - TruncatedText width-discipline regression coverage.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { visibleWidth } from "../../utils.js";
import { TruncatedText } from "../truncated-text.js";

describe("TruncatedText", () => {
	it("keeps horizontal padding from overflowing narrow widths", () => {
		const rendered = new TruncatedText("abcdef", 1, 0).render(2);

		assert.equal(rendered.length, 1);
		assert.equal(visibleWidth(rendered[0]), 2);
		assert.ok(visibleWidth(rendered[0]) <= 2);
	});
});
