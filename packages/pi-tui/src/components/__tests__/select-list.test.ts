// pi-tui SelectList component regression tests
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SelectList, type SelectItem, type SelectListTheme } from "../select-list.js";

const identityTheme: SelectListTheme = {
	selectedPrefix: (text) => text,
	selectedText: (text) => text,
	description: (text) => text,
	scrollInfo: (text) => text,
	noMatch: (text) => text,
};

describe("SelectList", () => {
	it("ignores navigation and confirm while a filter has no matches", () => {
		const list = new SelectList(
			[
				{ value: "alpha", label: "Alpha" },
				{ value: "beta", label: "Beta" },
			],
			5,
			identityTheme,
		);
		const selectionChanges: SelectItem[] = [];
		const selectedItems: SelectItem[] = [];
		let cancelCount = 0;

		list.onSelectionChange = (item) => selectionChanges.push(item);
		list.onSelect = (item) => selectedItems.push(item);
		list.onCancel = () => cancelCount++;

		list.setFilter("missing");

		assert.equal(list.getSelectedItem(), null);
		assert.deepEqual(list.render(80), ["  No matching commands"]);

		list.handleInput("\x1b[A");
		list.handleInput("\x1b[B");
		list.handleInput("\r");

		assert.equal(list.getSelectedItem(), null);
		assert.equal(
			selectionChanges.length,
			0,
			"empty filtered lists must not emit undefined selection changes",
		);
		assert.equal(
			selectedItems.length,
			0,
			"confirming an empty filtered list must not select an undefined item",
		);

		list.handleInput("\x1b");

		assert.equal(cancelCount, 1, "cancel should still work when no items match");

		list.setFilter("be");
		assert.equal(list.getSelectedItem()?.value, "beta");

		list.handleInput("\r");

		assert.deepEqual(
			selectedItems.map((item) => item.value),
			["beta"],
			"returning from an empty result should leave the list selectable",
		);
	});
});
