// GSD-2 + packages/pi-coding-agent/src/modes/interactive/components/__tests__/collapsible-message.test.ts - Collapsible message behavior tests.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import stripAnsi from "strip-ansi";
import { Text } from "@gsd/pi-tui";
import type { CustomMessage } from "../../../../core/messages.js";
import { initTheme } from "../../theme/theme.js";
import { BranchSummaryMessageComponent } from "../branch-summary-message.js";
import { CompactionSummaryMessageComponent } from "../compaction-summary-message.js";
import { CustomMessageComponent } from "../custom-message.js";
import { SkillInvocationMessageComponent } from "../skill-invocation-message.js";

initTheme("dark", false);

function plain(component: { render(width: number): string[] }): string {
	return component.render(80).map((line) => stripAnsi(line)).join("\n");
}

describe("collapsible message components", () => {
	test("passes expanded state through custom message renderers", () => {
		const message: CustomMessage = {
			role: "custom",
			customType: "demo",
			content: "fallback content",
			display: true,
			timestamp: 1,
		};
		const component = new CustomMessageComponent(message, (_message, options) => {
			return new Text(options.expanded ? "expanded custom content" : "collapsed custom content", 0, 0);
		});

		assert.match(plain(component), /collapsed custom content/);
		assert.doesNotMatch(plain(component), /expanded custom content/);

		component.setExpanded(true);
		component.invalidate();

		assert.match(plain(component), /expanded custom content/);
		assert.doesNotMatch(plain(component), /collapsed custom content/);
	});

	test("toggles compaction summaries without losing expanded state on invalidate", () => {
		const component = new CompactionSummaryMessageComponent({
			role: "compactionSummary",
			summary: "Detailed compacted context survives here.",
			tokensBefore: 1234,
			timestamp: 1,
		});

		assert.match(plain(component), /Compacted from 1,234 tokens/);
		assert.doesNotMatch(plain(component), /Detailed compacted context/);

		component.setExpanded(true);
		component.invalidate();

		assert.match(plain(component), /Detailed compacted context survives here/);
	});

	test("reuses framed compaction renders until collapsed state changes", () => {
		const component = new CompactionSummaryMessageComponent({
			role: "compactionSummary",
			summary: "Detailed compacted context survives here.",
			tokensBefore: 1234,
			timestamp: 1,
		});

		const collapsed = component.render(80);
		assert.equal(component.render(80), collapsed);

		component.setExpanded(true);
		const expanded = component.render(80);

		assert.notEqual(expanded, collapsed);
		assert.match(expanded.map((line) => stripAnsi(line)).join("\n"), /Detailed compacted context survives here/);
	});

	test("toggles skill invocations without losing expanded state on invalidate", () => {
		const component = new SkillInvocationMessageComponent({
			name: "review",
			location: "project",
			content: "Use the project review checklist.",
			userMessage: undefined,
		});

		assert.match(plain(component), /skill - review/);
		assert.doesNotMatch(plain(component), /project review checklist/);

		component.setExpanded(true);
		component.invalidate();

		assert.match(plain(component), /project review checklist/);
	});

	test("toggles branch summaries without changing the collapsed surface", () => {
		const component = new BranchSummaryMessageComponent({
			role: "branchSummary",
			summary: "Branch detail line from the previous path.",
			fromId: "branch-1",
			timestamp: 1,
		});

		assert.match(plain(component), /Branch summary/);
		assert.doesNotMatch(plain(component), /Branch detail line/);

		component.setExpanded(true);
		component.invalidate();

		assert.match(plain(component), /Branch detail line from the previous path/);
	});
});
