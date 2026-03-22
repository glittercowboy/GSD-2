import assert from "node:assert/strict";
import test from "node:test";

import { createExtensionUIContext } from "../../packages/pi-coding-agent/src/modes/interactive/controllers/extension-ui-controller.ts";
import {
	StatusActivityManager,
	type StatusActivityRenderer,
} from "../../packages/pi-coding-agent/src/modes/interactive/status-activity-manager.ts";

class FakeRenderer implements StatusActivityRenderer {
	events: Array<{ type: "start" | "update" | "stop"; message?: string }> = [];

	start(message: string): void {
		this.events.push({ type: "start", message });
	}

	update(message: string): void {
		this.events.push({ type: "update", message });
	}

	stop(): void {
		this.events.push({ type: "stop" });
	}
}

test("extension UI activity runtime wiring uses shared status activity lane", async () => {
	const renderer = new FakeRenderer();
	const manager = new StatusActivityManager(renderer, () => "Working...");
	const notifications: Array<{ message: string; type?: string }> = [];
	const statuses: Array<{ key: string; value: string | undefined }> = [];
	const widgets: Array<{ key: string; content: unknown; options?: unknown }> = [];

	const host = {
		showExtensionNotify: (message: string, type?: "info" | "warning" | "error" | "success") => {
			notifications.push({ message, type });
		},
		setExtensionStatus: (key: string, value: string | undefined) => {
			statuses.push({ key, value });
		},
		setExtensionWidget: (key: string, content: unknown, options?: unknown) => {
			widgets.push({ key, content, options });
		},
		addExtensionTerminalInputListener: () => () => {},
		statusActivity: manager,
		startStatusActivity: (options?: { message?: string }) => manager.start(options),
		runStatusActivity: <T>(operation: () => Promise<T>, options?: { message?: string }) => manager.run(operation, options),
	};

	const ui = createExtensionUIContext(host as any);

	// Non-activity surfaces still route through extension host APIs.
	ui.notify("hello", "info");
	ui.setStatus("test", "running");
	ui.setStatus("test", undefined);
	ui.setWidget("widget", ["line"], { placement: "belowEditor" });
	ui.setWidget("widget", undefined);

	assert.deepEqual(notifications, [{ message: "hello", type: "info" }]);
	assert.deepEqual(statuses, [
		{ key: "test", value: "running" },
		{ key: "test", value: undefined },
	]);
	assert.equal(widgets.length, 2);
	assert.equal(widgets[0].key, "widget");
	assert.equal(widgets[1].key, "widget");

	// startActivity + setWorkingMessage + handle lifecycle.
	renderer.events = [];
	const manual = ui.startActivity("Installing extension");
	assert.equal(manual.isActive(), true);
	manual.update("Copying files");
	ui.setWorkingMessage("Installing dependencies");
	ui.setWorkingMessage(undefined);
	manual.stop();
	assert.equal(manual.isActive(), false);

	assert.deepEqual(renderer.events, [
		{ type: "start", message: "Installing extension" },
		{ type: "update", message: "Copying files" },
		{ type: "update", message: "Installing dependencies" },
		{ type: "update", message: "Working..." },
		{ type: "stop" },
	]);

	// setWorkingMessage before any activity should queue and apply to the next activity.
	renderer.events = [];
	ui.setWorkingMessage("Queued message");
	const queued = ui.startActivity();
	queued.stop();

	assert.deepEqual(renderer.events, [
		{ type: "start", message: "Queued message" },
		{ type: "stop" },
	]);

	// runActivity should manage lifecycle automatically.
	renderer.events = [];
	const result = await ui.runActivity(async () => {
		ui.setWorkingMessage("Inside runActivity");
		return 42;
	}, "Running operation");

	assert.equal(result, 42);
	assert.deepEqual(renderer.events, [
		{ type: "start", message: "Running operation" },
		{ type: "update", message: "Inside runActivity" },
		{ type: "stop" },
	]);
});
