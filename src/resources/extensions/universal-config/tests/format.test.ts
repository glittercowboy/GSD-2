/**
 * Tests for output formatting.
 * Runs with: node --experimental-strip-types --test
 */

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { formatDiscoveryForTool, formatDiscoveryForCommand } from "../format.ts";
import type { DiscoveryResult } from "../types.ts";

const emptyResult: DiscoveryResult = {
  tools: [],
  allItems: [],
  summary: {
    mcpServers: 0,
    rules: 0,
    contextFiles: 0,
    settings: 0,
    claudeSkills: 0,
    claudePlugins: 0,
    totalItems: 0,
    toolsScanned: 8,
    toolsWithConfig: 0,
  },
  warnings: [],
  durationMs: 42,
};

const populatedResult: DiscoveryResult = {
  tools: [
    {
      tool: { id: "cursor", name: "Cursor", userDir: ".cursor", projectDir: ".cursor" },
      items: [
        {
          type: "mcp-server",
          name: "test-mcp",
          command: "node",
          args: ["server.js"],
          transport: "stdio",
          source: { tool: "cursor", toolName: "Cursor", path: "/project/.cursor/mcp.json", level: "project" },
        },
        {
          type: "claude-skill",
          name: "cursor-mdc-editor",
          path: "/home/user/.claude/skills/cursor-mdc-editor",
          source: { tool: "claude", toolName: "Claude Code", path: "/home/user/.claude/skills/cursor-mdc-editor/SKILL.md", level: "user" },
        },
        {
          type: "claude-plugin",
          name: "context-mode",
          packageName: "context-mode",
          path: "/home/user/.claude/plugins/marketplaces/context-mode",
          source: { tool: "claude", toolName: "Claude Code", path: "/home/user/.claude/plugins/marketplaces/context-mode/package.json", level: "user" },
        },
      ],
      warnings: [],
    },
    {
      tool: { id: "github-copilot", name: "GitHub Copilot", userDir: null, projectDir: ".github" },
      items: [
        {
          type: "context-file",
          name: "copilot-instructions.md",
          content: "Be helpful.",
          source: { tool: "github-copilot", toolName: "GitHub Copilot", path: "/project/.github/copilot-instructions.md", level: "project" },
        },
      ],
      warnings: [],
    },
  ],
  allItems: [],
  summary: {
    mcpServers: 1,
    rules: 1,
    contextFiles: 1,
    settings: 0,
    claudeSkills: 1,
    claudePlugins: 1,
    totalItems: 5,
    toolsScanned: 8,
    toolsWithConfig: 2,
  },
  warnings: [],
  durationMs: 15,
};
populatedResult.allItems = populatedResult.tools.flatMap((t) => t.items);

describe("formatDiscoveryForTool", () => {
  test("formats empty result", () => {
    const text = formatDiscoveryForTool(emptyResult);
    assert.ok(text.includes("0/8 tools with config"));
    assert.ok(text.includes("No configuration found"));
  });

  test("formats populated result with sections", () => {
    const text = formatDiscoveryForTool(populatedResult);
    assert.ok(text.includes("2/8 tools with config"));
    assert.ok(text.includes("1 MCP server(s)"));
    assert.ok(text.includes("1 Claude skill(s)"));
    assert.ok(text.includes("1 Claude plugin(s)"));
    assert.ok(text.includes("Cursor"));
    assert.ok(text.includes("test-mcp"));
    assert.ok(text.includes("GitHub Copilot"));
    assert.ok(text.includes("copilot-instructions.md"));
    assert.ok(text.includes("cursor-mdc-editor"));
    assert.ok(text.includes("context-mode"));
  });
});

describe("formatDiscoveryForCommand", () => {
  test("formats empty result", () => {
    const lines = formatDiscoveryForCommand(emptyResult);
    const text = lines.join("\n");
    assert.ok(text.includes("0 of 8"));
    assert.ok(text.includes("No configuration found"));
  });

  test("formats populated result as summary", () => {
    const lines = formatDiscoveryForCommand(populatedResult);
    const text = lines.join("\n");
    assert.ok(text.includes("2 of 8"));
    assert.ok(text.includes("Cursor"));
    assert.ok(text.includes("MCP: test-mcp"));
    assert.ok(text.includes("Skill: cursor-mdc-editor"));
    assert.ok(text.includes("Plugin: context-mode"));
  });
});
