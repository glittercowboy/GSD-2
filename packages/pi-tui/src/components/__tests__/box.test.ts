// GSD-2 + packages/pi-tui/src/components/__tests__/box.test.ts - Box width-discipline regression coverage.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Component } from "../../tui.js";
import { visibleWidth } from "../../utils.js";
import { Box } from "../box.js";

describe("Box", () => {
	it("keeps rendered lines within width even when a child overflows its content budget", () => {
		const box = new Box(1, 0);
		const child: Component = {
			render: () => ["abcdefghij"],
			invalidate() {},
		};
		box.addChild(child);

		const rendered = box.render(6);

		assert.equal(rendered.length, 1);
		assert.equal(visibleWidth(rendered[0]), 6);
		assert.ok(visibleWidth(rendered[0]) <= 6);
	});
});
