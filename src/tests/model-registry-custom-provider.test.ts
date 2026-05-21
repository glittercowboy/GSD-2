/**
 * Regression test for #3531: models.json custom providers must be registered
 * in registeredProviders so isProviderRequestReady() returns true.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ModelRegistry } from "../../packages/pi-coding-agent/src/core/model-registry.ts";

function createAuthStorage(): any {
  return {
    setFallbackResolver: () => {},
    onCredentialChange: () => {},
    getOAuthProviders: () => [],
    get: () => undefined,
    hasAuth: () => false,
    getApiKey: async () => undefined,
  };
}

test("parseModels registers custom providers in registeredProviders (#3531)", () => {
  const dir = mkdtempSync(join(tmpdir(), "gsd-model-registry-"));
  const modelsJsonPath = join(dir, "models.json");
  writeFileSync(
    modelsJsonPath,
    JSON.stringify({
      providers: {
        "custom-provider": {
          api: "openai-responses",
          baseUrl: "https://example.invalid/v1",
          apiKey: "test-key",
          models: [{ id: "custom-model" }],
        },
      },
    }),
  );

  const registry = new ModelRegistry(createAuthStorage(), modelsJsonPath);

  assert.equal(registry.isProviderRequestReady("custom-provider"), true);
  assert.equal(registry.find("custom-provider", "custom-model")?.baseUrl, "https://example.invalid/v1");
});
