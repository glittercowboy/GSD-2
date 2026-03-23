import assert from "node:assert/strict";
import test from "node:test";

import { ActivityManager } from "../../packages/pi-coding-agent/src/core/activity-manager.ts";
import { createExtensionUIContext } from "../../packages/pi-coding-agent/src/modes/interactive/controllers/extension-ui-controller.ts";

test("extension UI activity runtime wiring uses shared activity manager lanes", async () => {
	const manager = new ActivityManager();
	const notifications: Array<{ message: string; type?: string }> = [];
	const statuses: Array<{ key: string; value: string | undefined }> = [];
	const widgets: Array<{ key: string; content: unknown; options?: unknown }> = [];
	const activityEvents: Array<{ type: string; lane?: string; message?: string; progress?: number }> = [];

	manager.subscribe((event) => {
		activityEvents.push({
			type: event.type,
			lane: event.lane,
			message: event.activity?.message,
			progress: event.activity?.progress,
		});
	});

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
		startActivity: (options: { owner: string; lane: string; key?: string; message?: string; progress?: number }) =>
			manager.start(options as any),
		runActivity: <T>(
			operation: () => Promise<T>,
			options: { owner: string; lane: string; key?: string; message?: string; progress?: number },
		) => manager.run(operation, options as any),
	};

	const ui = createExtensionUIContext(host as any);

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

	activityEvents.length = 0;
	const manual = ui.activity.start({
		owner: "test.extension.install",
		lane: "status",
		message: "Installing extension",
	});
	assert.equal(manual.isActive(), true);
	manual.setMessage("Copying files");
	manual.setProgress(50);
	manual.stop();
	assert.equal(manual.isActive(), false);

	assert.equal(activityEvents[0]?.type, "start");
	assert.equal(activityEvents[0]?.lane, "status");
	assert.equal(activityEvents[0]?.message, "Installing extension");
	assert.ok(activityEvents.some((event) => event.type === "update" && event.message === "Copying files"));
	assert.ok(activityEvents.some((event) => event.type === "update" && event.progress === 50));
	assert.equal(activityEvents.at(-1)?.type, "stop");

	activityEvents.length = 0;
	const result = await ui.activity.run(async () => {
		return 42;
	}, { owner: "test.extension.run", lane: "status", message: "Running operation" });

	assert.equal(result, 42);
	assert.equal(activityEvents[0]?.type, "start");
	assert.equal(activityEvents[0]?.message, "Running operation");
	assert.ok(activityEvents.some((event) => event.type === "result"));
	assert.equal(activityEvents.at(-1)?.type, "stop");
});
