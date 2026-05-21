/**
 * Regression test for #4548 — Bug 2: Provider Manager routes Enter into the
 * OAuth login dialog for ALL providers, including externalCli providers like
 * claude-code. This produces:
 *
 *   "Failed to login to claude-code: Unknown OAuth provider: claude-code"
 *
 * The fix adds a guard in the onSetupAuth callback inside showProviderManager:
 * if the provider is not in the OAuth provider registry, show a "ready" status
 * message instead of opening the login dialog.
 *
 * This test verifies the guard through the provider manager callback behavior.
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { initTheme } from "../../packages/pi-coding-agent/src/modes/interactive/theme/theme.ts";

const { InteractiveMode } = await import("../../packages/pi-coding-agent/src/modes/interactive/interactive-mode.ts");

initTheme("dark", false);

function createProviderManagerHarness(oauthProviderIds: string[]) {
  const statusMessages: string[] = [];
  const loginProviders: string[] = [];
  let doneCount = 0;
  let component: any;
  const authStorage = {
    getOAuthProviders: () => oauthProviderIds.map((id) => ({ id })),
    hasAuth: () => false,
  };
  const mode = Object.create(InteractiveMode.prototype) as any;
  mode.ui = { requestRender() {} };
  mode.session = {
    modelRegistry: {
      authStorage,
      modelsJsonPath: "/tmp/models.json",
      getAll: () => [
        { provider: "claude-code", id: "claude-code", name: "Claude Code", api: "externalCli" },
        { provider: "openai-codex", id: "gpt-test", name: "GPT Test", api: "openai" },
      ],
      discoverModels: async () => [],
    },
  };
  mode.showStatus = (message: string) => {
    statusMessages.push(message);
  };
  mode.showLoginDialog = async (provider: string) => {
    loginProviders.push(provider);
  };
  mode.showSelector = (factory: (done: () => void) => { component: unknown }) => {
    const result = factory(() => {
      doneCount += 1;
    });
    component = result.component;
  };

  mode.showProviderManager();
  return { component, statusMessages, loginProviders, get doneCount() { return doneCount; } };
}

describe("interactive-mode.ts — provider Enter-key routing guard (#4548)", () => {
  test("externalCli providers show informational status instead of login dialog", () => {
    const harness = createProviderManagerHarness(["openai-codex"]);

    harness.component.onSetupAuth("claude-code");

    assert.equal(harness.doneCount, 1);
    assert.deepEqual(harness.loginProviders, []);
    assert.equal(harness.statusMessages.length, 1);
    assert.match(harness.statusMessages[0], /external CLI auth/i);
  });

  test("OAuth providers still route to showLoginDialog", () => {
    const harness = createProviderManagerHarness(["openai-codex"]);

    harness.component.onSetupAuth("openai-codex");

    assert.equal(harness.doneCount, 1);
    assert.deepEqual(harness.loginProviders, ["openai-codex"]);
    assert.deepEqual(harness.statusMessages, []);
  });
});
