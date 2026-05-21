// GSD-2 + Subagent launch module regression tests.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, afterEach } from "node:test";

import { SessionManager } from "@gsd/pi-coding-agent";
import subagentExtension from "../index.js";
import type { AgentConfig } from "../agents.js";
import {
	SUBAGENT_CHILD_ENV_VAR,
	SUBAGENT_CHILD_ENV_VALUE,
	buildSubagentProcessEnv,
	createSubagentLaunchPlan,
	isSubagentChildProcess,
	resolveSubagentSessionArgs,
} from "../launch.js";

function makeAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
	return {
		name: "test-agent",
		description: "A test agent",
		systemPrompt: "",
		source: "project",
		filePath: "test-agent.md",
		tools: ["read", "write"],
		...overrides,
	};
}

function makeAssistantMessage() {
	return {
		role: "assistant",
		content: [{ type: "text", text: "ok" }],
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			total: 2,
			cost: { total: 0 },
		},
	} as any;
}

describe("subagent launch module", () => {
	let dir: string | undefined;

	afterEach(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
		dir = undefined;
	});

	it("builds fresh child process args with child environment", () => {
		const agent = makeAgent({ model: "local-model" });
		const plan = createSubagentLaunchPlan({
			agent,
			task: "inspect the API",
			tmpPromptPath: "/tmp/prompt.md",
			defaultCwd: "/repo",
		});

		assert.ok(plan.args.includes("--no-session"));
		assert.equal(plan.args.includes("--session"), false);
		assert.equal(plan.env[SUBAGENT_CHILD_ENV_VAR], SUBAGENT_CHILD_ENV_VALUE);
		assert.equal(plan.cwd, "/repo");
		assert.deepEqual(plan.session, { mode: "fresh" });
		assert.deepEqual(plan.args.slice(plan.args.indexOf("--tools"), plan.args.indexOf("--tools") + 2), ["--tools", "read,write"]);
	});

	it("creates a real branched session for forked context", () => {
		dir = mkdtempSync(join(tmpdir(), "gsd-subagent-launch-"));
		const manager = SessionManager.create(dir, dir);
		manager.appendMessage({ role: "user", content: [{ type: "text", text: "hello" }] } as any);
		manager.appendMessage(makeAssistantMessage());

		const session = resolveSubagentSessionArgs("fork", manager);

		assert.equal(session.mode, "fork");
		assert.ok(session.sessionFile);
		assert.notEqual(session.sessionFile, manager.getSessionFile());
		assert.equal(session.sessionDir, dir);
	});

	it("fails forked context loudly without a persisted parent session", () => {
		const manager = SessionManager.inMemory("/repo");
		assert.throws(
			() => resolveSubagentSessionArgs("fork", manager),
			/persisted parent session file/,
		);
	});

	it("marks child env and suppresses recursive tool registration", () => {
		const env = buildSubagentProcessEnv({});
		assert.equal(isSubagentChildProcess(env), true);

		const previous = process.env[SUBAGENT_CHILD_ENV_VAR];
		process.env[SUBAGENT_CHILD_ENV_VAR] = SUBAGENT_CHILD_ENV_VALUE;
		const calls: string[] = [];
		try {
			subagentExtension({
				on: () => calls.push("on"),
				registerCommand: () => calls.push("command"),
				registerTool: () => calls.push("tool"),
			} as any);
		} finally {
			if (previous === undefined) delete process.env[SUBAGENT_CHILD_ENV_VAR];
			else process.env[SUBAGENT_CHILD_ENV_VAR] = previous;
		}

		assert.deepEqual(calls, []);
	});
});
