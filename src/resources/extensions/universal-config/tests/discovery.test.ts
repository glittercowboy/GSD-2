/**
 * Tests for the discovery orchestrator.
 * Runs with: node --experimental-strip-types --test
 */

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverAllConfigs } from "../discovery.ts";

function mkdirp(path: string) {
  mkdirSync(path, { recursive: true });
}

function writeJson(path: string, data: unknown) {
  mkdirp(join(path, ".."));
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

function writeText(path: string, content: string) {
  mkdirp(join(path, ".."));
  writeFileSync(path, content, "utf8");
}

function makeTempDirs() {
  const base = join(tmpdir(), `ucd-disc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const testRoot = join(base, "project");
  const testHome = join(base, "home");
  mkdirp(testRoot);
  mkdirp(testHome);
  return { testRoot, testHome, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

describe("discoverAllConfigs", () => {
  test("returns empty result for clean directories", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      const result = await discoverAllConfigs(testRoot, testHome);
      assert.equal(result.summary.totalItems, 0);
      assert.equal(result.summary.toolsScanned, 8);
      assert.equal(result.summary.toolsWithConfig, 0);
      assert.equal(result.summary.claudeSkills, 0);
      assert.equal(result.summary.claudePlugins, 0);
      assert.ok(result.durationMs >= 0);
    } finally {
      cleanup();
    }
  });

  test("discovers config from multiple tools", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      writeJson(join(testHome, ".claude.json"), {
        mcpServers: { "claude-mcp": { command: "node", args: ["server.js"] } },
      });
      writeText(join(testHome, ".claude/skills/test-skill/SKILL.md"), "# Test skill");
      writeJson(join(testHome, ".claude/plugins/test-plugin/package.json"), { name: "test-plugin" });
      writeText(join(testRoot, ".cursorrules"), "Use semicolons.");
      writeText(join(testRoot, ".github/copilot-instructions.md"), "Be helpful.");

      const result = await discoverAllConfigs(testRoot, testHome);
      assert.equal(result.summary.toolsWithConfig, 3);
      assert.equal(result.summary.mcpServers, 1);
      assert.equal(result.summary.rules, 1);
      assert.equal(result.summary.contextFiles, 1);
      assert.equal(result.summary.claudeSkills, 1);
      assert.equal(result.summary.claudePlugins, 1);
      assert.equal(result.allItems.length, 5);
    } finally {
      cleanup();
    }
  });

  test("handles nonexistent paths gracefully", async () => {
    const result = await discoverAllConfigs("/nonexistent/path", "/nonexistent/home");
    assert.equal(result.summary.totalItems, 0);
    assert.ok(result.warnings.length >= 0);
  });

  test("groups items by tool", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      writeJson(join(testRoot, ".cursor/mcp.json"), {
        mcpServers: { s1: { command: "a" }, s2: { command: "b" } },
      });

      const result = await discoverAllConfigs(testRoot, testHome);
      const cursorResult = result.tools.find((t) => t.tool.id === "cursor");
      assert.ok(cursorResult);
      assert.equal(cursorResult!.items.length, 2);
    } finally {
      cleanup();
    }
  });

  test("summary counts are accurate", async () => {
    const { testRoot, testHome, cleanup } = makeTempDirs();
    try {
      writeJson(join(testRoot, ".cursor/mcp.json"), { mcpServers: { s1: { command: "a" } } });
      writeText(join(testRoot, ".cursorrules"), "Rule 1");
      writeText(join(testRoot, ".clinerules"), "Rule 2");
      writeText(join(testRoot, ".github/copilot-instructions.md"), "Instructions");
      writeJson(join(testRoot, ".vscode/settings.json"), { "editor.tabSize": 2 });

      const result = await discoverAllConfigs(testRoot, testHome);
      assert.equal(result.summary.mcpServers, 1);
      assert.equal(result.summary.rules, 2);
      assert.equal(result.summary.contextFiles, 1);
      assert.equal(result.summary.settings, 1);
      assert.equal(result.summary.claudeSkills, 0);
      assert.equal(result.summary.claudePlugins, 0);
      assert.equal(result.summary.totalItems, 5);
    } finally {
      cleanup();
    }
  });
});
