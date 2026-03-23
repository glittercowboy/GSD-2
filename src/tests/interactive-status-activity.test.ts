import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = join(import.meta.dirname, "..", "..");

const extensionUiController = readFileSync(
	join(root, "packages/pi-coding-agent/src/modes/interactive/controllers/extension-ui-controller.ts"),
	"utf-8",
);
const chatController = readFileSync(
	join(root, "packages/pi-coding-agent/src/modes/interactive/controllers/chat-controller.ts"),
	"utf-8",
);
const interactiveMode = readFileSync(
	join(root, "packages/pi-coding-agent/src/modes/interactive/interactive-mode.ts"),
	"utf-8",
);
const rpcMode = readFileSync(
	join(root, "packages/pi-coding-agent/src/modes/rpc/rpc-mode.ts"),
	"utf-8",
);

describe("activity integration", () => {
	it("extension UI context exposes activity.start/run hooks", () => {
		assert.ok(extensionUiController.includes("activity: {"));
		assert.ok(extensionUiController.includes("start: (options) => host.startActivity(options)"));
		assert.ok(extensionUiController.includes("run: (operation, options) => host.runActivity(operation, options)"));
	});

	it("agent lifecycle uses startActivity/stop handles in chat controller", () => {
		assert.ok(chatController.includes("host.agentStatusActivity = host.startActivity({"));
		assert.ok(chatController.includes("host.agentStatusActivity?.stop()"));
	});

	it("interactive mode routes extension commands through promptWithStatusActivity", () => {
		assert.ok(interactiveMode.includes("private async promptWithStatusActivity(text: string, options?: PromptOptions): Promise<void>"));
		assert.ok(interactiveMode.includes("await this.promptWithStatusActivity(userInput);"));
		assert.ok(interactiveMode.includes("await this.promptWithStatusActivity(text, { streamingBehavior: \"followUp\" });"));
	});

	it("RPC mode emits real activity lifecycle events", () => {
		assert.ok(rpcMode.includes("method: \"activity_start\""));
		assert.ok(rpcMode.includes("method: \"activity_update\""));
		assert.ok(rpcMode.includes("method: \"activity_stop\""));
		assert.ok(rpcMode.includes("method: \"activity_result\""));
	});
});
