import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { discoverAgents } from "../agents.js";

describe("agent thinking frontmatter", () => {
	let dir: string | undefined;

	afterEach(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
		dir = undefined;
	});

	it("loads OpenCode-compatible variant as the named agent thinking policy", () => {
		dir = mkdtempSync(join(tmpdir(), "gsd-agent-thinking-"));
		const agentsDir = join(dir, ".gsd", "agents");
		mkdirSync(agentsDir, { recursive: true });
		writeFileSync(join(agentsDir, "research.md"), [
			"---",
			"name: research",
			"description: Research agent",
			"model: openai/gpt-5.6-terra",
			"variant: high",
			"---",
			"Research carefully.",
		].join("\n"));

		const result = discoverAgents(dir, "project");
		assert.equal(result.agents.length, 1);
		assert.equal(result.agents[0]?.thinking, "high");
	});

	it("prefers explicit native thinking when both spellings are present", () => {
		dir = mkdtempSync(join(tmpdir(), "gsd-agent-thinking-"));
		const agentsDir = join(dir, ".gsd", "agents");
		mkdirSync(agentsDir, { recursive: true });
		writeFileSync(join(agentsDir, "analysis.md"), [
			"---",
			"name: analysis",
			"description: Analysis agent",
			"variant: low",
			"thinking: xhigh",
			"---",
			"Analyze carefully.",
		].join("\n"));

		assert.equal(discoverAgents(dir, "project").agents[0]?.thinking, "xhigh");
	});
});
