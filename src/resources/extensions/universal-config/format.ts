/**
 * Universal Config Discovery — output formatting
 *
 * Formats DiscoveryResult into human-readable and LLM-readable output.
 */

import type { DiscoveryResult, DiscoveredItem, ToolDiscoveryResult } from "./types.js";

/**
 * Format discovery result as a compact text report for the LLM tool response.
 */
export function formatDiscoveryForTool(result: DiscoveryResult): string {
  const lines: string[] = [];
  const { summary } = result;

  lines.push(`Universal Config Discovery — ${summary.toolsWithConfig}/${summary.toolsScanned} tools with config (${result.durationMs}ms)`);
  lines.push("");

  if (summary.totalItems === 0) {
    lines.push("No configuration found from any AI coding tool.");
    lines.push("");
    lines.push("Scanned for: Claude Code, Cursor, Windsurf, Gemini CLI, Codex, Cline, GitHub Copilot, VS Code");
    return lines.join("\n");
  }

  lines.push(`Found: ${summary.mcpServers} MCP server(s), ${summary.rules} rule(s), ${summary.contextFiles} context file(s), ${summary.settings} settings file(s), ${summary.claudeSkills} Claude skill(s), ${summary.claudePlugins} Claude plugin(s)`);
  lines.push("");

  for (const toolResult of result.tools) {
    if (toolResult.items.length === 0) continue;
    lines.push(`## ${toolResult.tool.name}`);

    const byType = groupByType(toolResult.items);

    if (byType["mcp-server"]?.length) {
      lines.push(`  MCP Servers (${byType["mcp-server"].length}):`);
      for (const item of byType["mcp-server"]) {
        if (item.type !== "mcp-server") continue;
        const transport = item.transport ?? (item.url ? "http" : item.command ? "stdio" : "unknown");
        const detail = item.command
          ? `${item.command}${item.args?.length ? ` ${item.args.join(" ")}` : ""}`
          : item.url ?? "no endpoint";
        lines.push(`    - ${item.name} [${transport}] ${detail} (${item.source.level})`);
      }
    }

    if (byType.rule?.length) {
      lines.push(`  Rules (${byType.rule.length}):`);
      for (const item of byType.rule) {
        if (item.type !== "rule") continue;
        const meta: string[] = [];
        if (item.alwaysApply) meta.push("always");
        if (item.globs?.length) meta.push(`globs: ${item.globs.join(", ")}`);
        const suffix = meta.length ? ` [${meta.join(", ")}]` : "";
        const preview = item.content.slice(0, 80).replace(/\n/g, " ").trim();
        lines.push(`    - ${item.name}${suffix}: ${preview}${item.content.length > 80 ? "..." : ""}`);
      }
    }

    if (byType["context-file"]?.length) {
      lines.push(`  Context Files (${byType["context-file"].length}):`);
      for (const item of byType["context-file"]) {
        if (item.type !== "context-file") continue;
        const size = item.content.length;
        lines.push(`    - ${item.name} (${size} chars, ${item.source.level}) ${item.source.path}`);
      }
    }

    if (byType.settings?.length) {
      lines.push(`  Settings (${byType.settings.length}):`);
      for (const item of byType.settings) {
        if (item.type !== "settings") continue;
        lines.push(`    - ${item.source.path} (${item.source.level})`);
      }
    }

    if (byType["claude-skill"]?.length) {
      lines.push(`  Claude Skills (${byType["claude-skill"].length}):`);
      for (const item of byType["claude-skill"]) {
        if (item.type !== "claude-skill") continue;
        lines.push(`    - ${item.name} (${item.source.level}) ${item.path}`);
      }
    }

    if (byType["claude-plugin"]?.length) {
      lines.push(`  Claude Plugins (${byType["claude-plugin"].length}):`);
      for (const item of byType["claude-plugin"]) {
        if (item.type !== "claude-plugin") continue;
        const label = item.packageName ? `${item.name} [${item.packageName}]` : item.name;
        lines.push(`    - ${label} (${item.source.level}) ${item.path}`);
      }
    }

    lines.push("");
  }

  if (result.warnings.length > 0) {
    lines.push("Warnings:");
    for (const w of result.warnings) {
      lines.push(`  - ${w}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format discovery result as a structured summary for /configs command output.
 */
export function formatDiscoveryForCommand(result: DiscoveryResult): string[] {
  const lines: string[] = [];
  const { summary } = result;

  lines.push(`--- Universal Config Discovery ---`);
  lines.push(`${summary.toolsWithConfig} of ${summary.toolsScanned} tools have configuration`);
  lines.push(`${summary.totalItems} total items discovered in ${result.durationMs}ms`);
  lines.push("");

  if (summary.totalItems === 0) {
    lines.push("No configuration found.");
    return lines;
  }

  lines.push(`  MCP Servers: ${summary.mcpServers}`);
  lines.push(`  Rules:       ${summary.rules}`);
  lines.push(`  Context:     ${summary.contextFiles}`);
  lines.push(`  Settings:    ${summary.settings}`);
  lines.push(`  Claude skills: ${summary.claudeSkills}`);
  lines.push(`  Claude plugins: ${summary.claudePlugins}`);
  lines.push("");

  for (const toolResult of result.tools) {
    if (toolResult.items.length === 0) continue;

    const counts = countByType(toolResult.items);
    const parts: string[] = [];
    if (counts["mcp-server"]) parts.push(`${counts["mcp-server"]} MCP`);
    if (counts.rule) parts.push(`${counts.rule} rules`);
    if (counts["context-file"]) parts.push(`${counts["context-file"]} context`);
    if (counts.settings) parts.push(`${counts.settings} settings`);
    if (counts["claude-skill"]) parts.push(`${counts["claude-skill"]} Claude skills`);
    if (counts["claude-plugin"]) parts.push(`${counts["claude-plugin"]} Claude plugins`);

    lines.push(`  ${toolResult.tool.name}: ${parts.join(", ")}`);

    // Show MCP server names
    const servers = toolResult.items.filter((i) => i.type === "mcp-server");
    for (const server of servers) {
      if (server.type !== "mcp-server") continue;
      lines.push(`    MCP: ${server.name} (${server.source.level})`);
    }

    const claudeSkills = toolResult.items.filter((i) => i.type === "claude-skill");
    for (const skill of claudeSkills) {
      if (skill.type !== "claude-skill") continue;
      lines.push(`    Skill: ${skill.name} (${skill.source.level})`);
    }

    const claudePlugins = toolResult.items.filter((i) => i.type === "claude-plugin");
    for (const plugin of claudePlugins) {
      if (plugin.type !== "claude-plugin") continue;
      lines.push(`    Plugin: ${plugin.name} (${plugin.source.level})`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push(`${result.warnings.length} warning(s) — run discover_configs tool for details`);
  }

  return lines;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByType(items: DiscoveredItem[]): Record<string, DiscoveredItem[]> {
  const groups: Record<string, DiscoveredItem[]> = {};
  for (const item of items) {
    (groups[item.type] ??= []).push(item);
  }
  return groups;
}

function countByType(items: DiscoveredItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
  }
  return counts;
}
