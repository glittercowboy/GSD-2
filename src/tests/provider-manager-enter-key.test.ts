import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import { ProviderManagerComponent } from "../../packages/pi-coding-agent/src/modes/interactive/components/provider-manager.ts";
import { initTheme } from "../../packages/pi-coding-agent/src/modes/interactive/theme/theme.ts";

initTheme("dark", false);

function createProviderManager(onSetupAuth: (provider: string) => void) {
	return new ProviderManagerComponent(
		{ requestRender: () => {} } as any,
		{ hasAuth: () => false } as any,
		{
			modelsJsonPath: undefined,
			getAll: () => [{ provider: "anthropic", api: "anthropic-messages" }],
		} as any,
		() => {},
		() => {},
		onSetupAuth,
	);
}

describe("provider manager Enter key handler (#3579)", () => {
	test("Enter initiates auth setup for the selected provider", () => {
		let selectedProvider: string | undefined;
		const manager = createProviderManager((provider) => {
			selectedProvider = provider;
		});

		manager.handleInput("\r");

		assert.equal(selectedProvider, "anthropic");
	});

	test("setup auth hint is rendered", () => {
		const manager = createProviderManager(() => {});
		const text = manager.render(100).map((line) => stripVTControlCharacters(line)).join("\n");

		assert.match(text, /enter/);
		assert.match(text, /setup auth/);
	});
});
