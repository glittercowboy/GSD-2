// pi-tui Markdown list regression tests
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import { Markdown, type MarkdownTheme } from "../markdown.js";

const identity = (text: string) => text;

function nonCyanBulletTheme(): MarkdownTheme {
	return {
		heading: identity,
		link: identity,
		linkUrl: identity,
		code: identity,
		codeBlock: identity,
		codeBlockBorder: identity,
		quote: identity,
		quoteBorder: identity,
		hr: identity,
		listBullet: (text) => `\x1b[35m${text}\x1b[39m`,
		bold: identity,
		italic: identity,
		strikethrough: identity,
		underline: identity,
	};
}

describe("Markdown lists", () => {
	it("keeps nested list indentation when bullet styling is not cyan", () => {
		const md = new Markdown("- parent\n  - child", 0, 0, nonCyanBulletTheme());
		const lines = md
			.render(80)
			.map((line) => stripVTControlCharacters(line).trimEnd())
			.filter((line) => line.length > 0);

		assert.deepEqual(lines, ["- parent", "  - child"]);
	});
});
