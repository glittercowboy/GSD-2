// GSD Extension — Interactive Routing Bypass Tests

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { resolvePreferredModelConfig } from "../auto-model-selection.ts";

function withRoutingPrefs<T>(fn: () => T): T {
  const originalCwd = process.cwd();
  const originalGsdHome = process.env.GSD_HOME;
  const tempProject = mkdtempSync(join(tmpdir(), "gsd-interactive-routing-"));
  const tempGsdHome = mkdtempSync(join(tmpdir(), "gsd-interactive-routing-home-"));

  try {
    mkdirSync(join(tempProject, ".gsd"), { recursive: true });
    writeFileSync(
      join(tempProject, ".gsd", "PREFERENCES.md"),
      [
        "---",
        "dynamic_routing:",
        "  enabled: true",
        "  tier_models:",
        "    light: gpt-4o-mini",
        "    standard: claude-sonnet-4-6",
        "    heavy: claude-opus-4-6",
        "---",
      ].join("\n"),
      "utf-8",
    );
    process.env.GSD_HOME = tempGsdHome;
    process.chdir(tempProject);
    return fn();
  } finally {
    process.chdir(originalCwd);
    if (originalGsdHome === undefined) delete process.env.GSD_HOME;
    else process.env.GSD_HOME = originalGsdHome;
    rmSync(tempProject, { recursive: true, force: true });
    rmSync(tempGsdHome, { recursive: true, force: true });
  }
}

describe("interactive routing bypass (#3962)", () => {
  test("interactive dispatch does not synthesize dynamic routing config", () => {
    withRoutingPrefs(() => {
      const result = resolvePreferredModelConfig(
        "execute-task",
        { provider: "anthropic", id: "claude-sonnet-4-6" },
        false,
      );

      assert.equal(result, undefined);
    });
  });

  test("auto-mode dispatch still synthesizes dynamic routing config", () => {
    withRoutingPrefs(() => {
      const result = resolvePreferredModelConfig(
        "execute-task",
        { provider: "anthropic", id: "claude-sonnet-4-6" },
        true,
      );

      assert.ok(result);
      assert.equal(result!.primary, "claude-opus-4-6");
      assert.equal(result!.source, "synthesized");
    });
  });
});
