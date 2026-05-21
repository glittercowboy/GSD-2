// Regression test for #5102: disabling thinking on one reasoning-capable
// model must not silently persist "off" as the global default.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { Agent } from "@gsd/pi-agent-core";
import { getModel } from "@gsd/pi-ai";
import { AgentSession } from "./agent-session.js";
import { AuthStorage } from "./auth-storage.js";
import { ModelRegistry } from "./model-registry.js";
import { DefaultResourceLoader } from "./resource-loader.js";
import { SessionManager } from "./session-manager.js";
import { SettingsManager } from "./settings-manager.js";

let testDir: string;

async function createSession(): Promise<{ session: AgentSession; settingsManager: SettingsManager }> {
	const agentDir = join(testDir, "agent-home");
	const authStorage = AuthStorage.inMemory({});
	const modelRegistry = new ModelRegistry(authStorage, join(agentDir, "models.json"));
	const settingsManager = SettingsManager.inMemory({ defaultThinkingLevel: "high" });
	const resourceLoader = new DefaultResourceLoader({
		cwd: testDir,
		agentDir,
		settingsManager,
		noExtensions: true,
		noPromptTemplates: true,
		noThemes: true,
	});
	await resourceLoader.reload();

	const session = new AgentSession({
		agent: new Agent({
			initialState: {
				model: getModel("zai", "glm-5.1" as any),
				thinkingLevel: "high",
			},
		}),
		sessionManager: SessionManager.inMemory(testDir),
		settingsManager,
		cwd: testDir,
		resourceLoader,
		modelRegistry,
	});

	return { session, settingsManager };
}

describe("AgentSession thinking level persistence", () => {
	beforeEach(() => {
		testDir = mkdtempSync(join(tmpdir(), "agent-session-thinking-level-"));
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	it("does not persist off as the global default for reasoning-capable models", async () => {
		const { session, settingsManager } = await createSession();

		session.setThinkingLevel("off");

		assert.equal(session.thinkingLevel, "off");
		assert.equal(settingsManager.getDefaultThinkingLevel(), "high");
	});

	it("still persists non-off thinking levels as the global default", async () => {
		const { session, settingsManager } = await createSession();

		session.setThinkingLevel("low");

		assert.equal(session.thinkingLevel, "low");
		assert.equal(settingsManager.getDefaultThinkingLevel(), "low");
	});
});
