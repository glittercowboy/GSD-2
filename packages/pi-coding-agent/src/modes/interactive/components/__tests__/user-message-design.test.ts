// Project/App: GSD-2
// File Purpose: Visual contract test for the user message open surface.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";

import { initTheme } from "../../theme/theme.js";
import { UserMessageComponent } from "../user-message.js";

initTheme("dark", false);

const OSC133_ZONE = /\x1b]133;[AB]\x07/;
const ENV_KEYS = ["TERM_PROGRAM", "GSD_ENABLE_OSC133_ZONES", "GSD_DISABLE_OSC133_ZONES"] as const;

function withEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>, run: () => void): void {
	const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<
		(typeof ENV_KEYS)[number],
		string | undefined
	>;
	try {
		for (const key of ENV_KEYS) {
			const value = values[key];
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
		run();
	} finally {
		for (const key of ENV_KEYS) {
			const value = saved[key];
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	}
}

describe("UserMessageComponent open surface", () => {
	test("renders a user message as a copy-clean open surface", () => {
		const component = new UserMessageComponent(
			"Can we make the transcript feel like chat?",
			undefined,
			1,
			"date-time-iso",
		);
		const joined = component
			.render(100)
			.map((line) => stripVTControlCharacters(line))
			.join("\n");

		assert.match(joined, /You/);
		assert.match(joined, /feel like chat/);
		assert.match(joined, /╭─ You/);
		assert.match(joined, /╰─/);
		assert.doesNotMatch(joined, /[│┃]/, "user content lines must not use side rail glyphs");
		// A rounded titled top rule carries the You label.
		assert.ok(
			joined.split("\n").some((line) => line.includes("You") && line.includes("─")),
			`expected a titled top rule carrying the You label:\n${joined}`,
		);
		const plain = joined.split("\n");
		const topRuleIndex = plain.findIndex((line) => line.includes("You") && line.includes("─"));
		const contentIndex = plain.findIndex((line) => line.includes("feel like chat"));
		assert.ok(contentIndex > topRuleIndex + 1, `expected a breathing row before content:\n${joined}`);
		assert.equal(plain[contentIndex + 1]?.trim(), "", `expected a breathing row after content:\n${joined}`);
		assert.equal(plain[contentIndex].length, 100, `user content row should fill the bubble background:\n${joined}`);
		assert.equal(plain[contentIndex + 1]?.length, 100, `user breathing row should fill the bubble background:\n${joined}`);
		assert.doesNotMatch(plain[contentIndex], /[│┃╭╮╰╯]/, `content line must stay copy-clean:\n${joined}`);
	});

	test("does not inject OSC 133 zones for unsupported terminals", () => {
		withEnv(
			{
				TERM_PROGRAM: "Apple_Terminal",
				GSD_ENABLE_OSC133_ZONES: undefined,
				GSD_DISABLE_OSC133_ZONES: undefined,
			},
			() => {
				const component = new UserMessageComponent("Plain terminal output");
				const joined = component.render(100).join("\n");

				assert.doesNotMatch(joined, OSC133_ZONE);
			},
		);
	});

	test("can emit OSC 133 zones when explicitly enabled", () => {
		withEnv(
			{
				TERM_PROGRAM: "Apple_Terminal",
				GSD_ENABLE_OSC133_ZONES: "1",
				GSD_DISABLE_OSC133_ZONES: undefined,
			},
			() => {
				const component = new UserMessageComponent("Shell integration zone");
				const joined = component.render(100).join("\n");

				assert.match(joined, OSC133_ZONE);
			},
		);
	});

	test("reuses rendered output until terminal integration state changes", () => {
		const component = new UserMessageComponent("Cached user output");
		let first: string[] | undefined;

		withEnv(
			{
				TERM_PROGRAM: "Apple_Terminal",
				GSD_ENABLE_OSC133_ZONES: undefined,
				GSD_DISABLE_OSC133_ZONES: undefined,
			},
			() => {
				first = component.render(100);
				assert.equal(component.render(100), first);
				assert.doesNotMatch(first.join("\n"), OSC133_ZONE);
			},
		);

		withEnv(
			{
				TERM_PROGRAM: "Apple_Terminal",
				GSD_ENABLE_OSC133_ZONES: "1",
				GSD_DISABLE_OSC133_ZONES: undefined,
			},
			() => {
				const withOsc = component.render(100);

				assert.notEqual(withOsc, first);
				assert.match(withOsc.join("\n"), OSC133_ZONE);
			},
		);
	});
});
