/**
 * MCP Status — `/gsd mcp` command handler.
 *
 * Shows configured MCP servers, their connection status, and available tools.
 *
 * Subcommands:
 *   /gsd mcp             — Overview of all servers (alias: /gsd mcp status)
 *   /gsd mcp status      — Same as bare /gsd mcp
 *   /gsd mcp check <srv> — Detailed status for a specific server
 *   /gsd mcp test <srv>  — Test handshake + tools/list for a server
 *   /gsd mcp enable <srv> / disable <srv> — Toggle local server exposure
 *   /gsd mcp import <srv> [as <name>] — Copy a discovered server into local config
 *   /gsd mcp init [dir]  — Write project-local GSD workflow MCP config
 */

import type { ExtensionCommandContext } from "@gsd/pi-coding-agent";

import { resolve } from "node:path";

import { ensureProjectWorkflowMcpConfig } from "./mcp-project-config.js";
import {
  deleteProjectLocalMcpServer,
  readMcpManagementStatus,
  setProjectLocalMcpServerDisabled,
  testMcpServerConnection,
  upsertProjectLocalMcpServer,
  type ManagedMcpConnectionTestResult,
  type ManagedMcpTransport,
} from "../mcp-client/manager.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface McpServerStatus {
  name: string;
  transport: ManagedMcpTransport;
  connected: boolean;
  toolCount: number;
  error: string | undefined;
  disabled?: boolean;
  sourcePath?: string;
  envWarnings?: string[];
}

export interface McpServerDetail extends McpServerStatus {
  tools: string[];
}

export function hasHostMcpTool(systemPrompt: string, serverName: string): boolean {
  const marker = `mcp__${serverName}__`;
  return systemPrompt.includes(marker);
}

export function formatMcpInitResult(
  status: "created" | "updated" | "unchanged",
  configPath: string,
  targetPath: string,
): string {
  const summary =
    status === "created"
      ? "Created project MCP config."
      : status === "updated"
        ? "Updated project MCP config."
        : "Project MCP config is already up to date.";

  return [
    summary,
    "",
    `Project: ${targetPath}`,
    `Config:   ${configPath}`,
    "",
    "Claude Code can now load the GSD workflow MCP server from this folder.",
  ].join("\n");
}

// ─── Formatters (exported for testing) ──────────────────────────────────────

export function formatMcpStatusReport(servers: McpServerStatus[]): string {
  if (servers.length === 0) {
    return [
      "No MCP servers configured.",
      "",
      "Add servers to .mcp.json, .gsd/mcp.json, or $GSD_HOME/mcp.json (default: ~/.gsd/mcp.json) to enable MCP integrations.",
      "Tip: run /gsd mcp init . to write the local GSD workflow MCP config.",
      "See: https://modelcontextprotocol.io/quickstart",
    ].join("\n");
  }

  const lines: string[] = [`MCP Server Status — ${servers.length} server(s)\n`];

  for (const s of servers) {
    const icon = s.disabled ? "⊘" : s.error ? "✗" : s.connected ? "✓" : "○";
    const status = s.disabled
      ? "disabled"
      : s.error
      ? `error: ${s.error}`
      : s.connected
        ? `connected — ${s.toolCount} tools`
        : "disconnected";
    const warningText = s.envWarnings?.length ? ` — ${s.envWarnings.length} warning(s)` : "";
    lines.push(`  ${icon} ${s.name} (${s.transport}) — ${status}${warningText}`);
  }

  lines.push("");
  lines.push("Use /gsd mcp check <server> for details on a specific server.");
  lines.push("Use /gsd mcp test <server> to verify handshake and tool discovery.");
  lines.push("Use mcp_discover to connect and list tools for a server.");

  return lines.join("\n");
}

export function formatMcpServerDetail(server: McpServerDetail): string {
  const lines: string[] = [`MCP Server: ${server.name}\n`];

  lines.push(`  Transport: ${server.transport}`);
  if (server.sourcePath) lines.push(`  Source:    ${server.sourcePath}`);

  if (server.disabled) {
    lines.push(`  Status:    disabled`);
  } else if (server.error) {
    lines.push(`  Status:    error`);
    lines.push(`  Error:     ${server.error}`);
  } else if (server.connected) {
    lines.push(`  Status:    connected`);
    lines.push(`  Tools:     ${server.toolCount}`);
    if (server.tools.length > 0) {
      lines.push("");
      lines.push("  Available tools:");
      for (const tool of server.tools) {
        lines.push(`    - ${tool}`);
      }
    }
  } else {
    lines.push(`  Status:    disconnected`);
    lines.push("");
    lines.push(`  Run mcp_discover("${server.name}") to connect and list tools.`);
  }

  if (server.envWarnings?.length) {
    lines.push("");
    lines.push("  Warnings:");
    for (const warning of server.envWarnings) {
      lines.push(`    - ${warning}`);
    }
  }

  return lines.join("\n");
}

export function formatMcpConnectionTestResult(result: ManagedMcpConnectionTestResult): string {
  if (result.ok) {
    return [
      `MCP test passed for ${result.server}.`,
      "",
      `Transport: ${result.transport}`,
      `Tools:     ${result.toolCount}`,
      ...(result.tools.length > 0 ? ["", "Available tools:", ...result.tools.map((tool) => `  - ${tool}`)] : []),
    ].join("\n");
  }

  return [
    `MCP test failed for ${result.server}.`,
    "",
    `Transport: ${result.transport}`,
    `Error:     ${result.error ?? "Unknown error"}`,
    ...(result.warnings.length > 0 ? ["", "Warnings:", ...result.warnings.map((warning) => `  - ${warning}`)] : []),
  ].join("\n");
}

// ─── Command handler ────────────────────────────────────────────────────────

/**
 * Handle `/gsd mcp [status|check <server>]`.
 */
export async function handleMcpStatus(
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const trimmed = args.trim();
  const lowered = trimmed.toLowerCase();
  const management = readMcpManagementStatus({ includeDisabled: true });
  const configs = management.servers;
  const systemPrompt = ctx.getSystemPrompt();

  // /gsd mcp init [dir]
  if (!lowered || lowered === "status") {
    // handled below
  } else if (lowered === "init" || lowered.startsWith("init ")) {
    const rawPath = trimmed.slice("init".length).trim();
    const targetPath = resolve(rawPath || ".");
    try {
      const result = ensureProjectWorkflowMcpConfig(targetPath);
      ctx.ui.notify(formatMcpInitResult(result.status, result.configPath, targetPath), "info");
    } catch (err) {
      ctx.ui.notify(
        `Failed to prepare MCP config for ${targetPath}: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    }
    return;
  }

  // /gsd mcp test <server>
  if (lowered.startsWith("test ")) {
    const serverName = trimmed.slice("test ".length).trim();
    const result = await testMcpServerConnection(serverName);
    ctx.ui.notify(formatMcpConnectionTestResult(result), result.ok ? "info" : "warning");
    return;
  }

  // /gsd mcp disable <server>
  if (lowered.startsWith("disable ")) {
    const serverName = trimmed.slice("disable ".length).trim();
    try {
      const updated = setProjectLocalMcpServerDisabled(serverName, true);
      ctx.ui.notify(`Disabled MCP server "${updated.name}" in ${updated.sourcePath}.`, "info");
    } catch (err) {
      ctx.ui.notify(err instanceof Error ? err.message : String(err), "warning");
    }
    return;
  }

  // /gsd mcp enable <server>
  if (lowered.startsWith("enable ")) {
    const serverName = trimmed.slice("enable ".length).trim();
    try {
      const updated = setProjectLocalMcpServerDisabled(serverName, false);
      ctx.ui.notify(`Enabled MCP server "${updated.name}" in ${updated.sourcePath}.`, "info");
    } catch (err) {
      ctx.ui.notify(err instanceof Error ? err.message : String(err), "warning");
    }
    return;
  }

  // /gsd mcp delete <server> --confirm
  if (lowered.startsWith("delete ")) {
    const raw = trimmed.slice("delete ".length).trim();
    const confirmed = /\s--confirm$/.test(raw) || raw === "--confirm";
    const serverName = raw.replace(/\s--confirm$/, "").trim();
    if (!confirmed || !serverName) {
      ctx.ui.notify(`Usage: /gsd mcp delete <server> --confirm`, "warning");
      return;
    }
    try {
      deleteProjectLocalMcpServer(serverName);
      ctx.ui.notify(`Deleted local MCP server "${serverName}".`, "info");
    } catch (err) {
      ctx.ui.notify(err instanceof Error ? err.message : String(err), "warning");
    }
    return;
  }

  // /gsd mcp import <server> [as <name>]
  if (lowered.startsWith("import ")) {
    const raw = trimmed.slice("import ".length).trim();
    const match = raw.match(/^(.*?)\s+as\s+(.+)$/i);
    const sourceName = (match?.[1] ?? raw).trim();
    const nextName = (match?.[2] ?? sourceName).trim();
    const source = configs.find((config) => config.name === sourceName);
    if (!source) {
      const available = configs.map((config) => config.name).join(", ") || "(none)";
      ctx.ui.notify(`Unknown MCP server: "${sourceName}"\n\nAvailable: ${available}`, "warning");
      return;
    }
    if (source.transport === "unsupported") {
      ctx.ui.notify(`Cannot import "${sourceName}" because transport is unsupported.`, "warning");
      return;
    }
    try {
      const saved = upsertProjectLocalMcpServer({
        name: nextName,
        transport: source.transport,
        command: source.command,
        args: source.args,
        env: source.env,
        cwd: source.cwd,
        url: source.url,
        headers: source.headers,
        oauth: source.oauth,
        disabled: source.disabled,
        importedFrom: {
          name: source.name,
          sourcePath: source.sourcePath,
          sourceTool: source.sourceKind,
        },
      });
      ctx.ui.notify(`Imported MCP server "${source.name}" as "${saved.name}" into ${saved.sourcePath}.`, "info");
    } catch (err) {
      ctx.ui.notify(err instanceof Error ? err.message : String(err), "warning");
    }
    return;
  }

  // /gsd mcp check <server>
  if (lowered.startsWith("check ")) {
    const serverName = trimmed.slice("check ".length).trim();
    const config = configs.find((c) => c.name === serverName);
    if (!config) {
      const available = configs.map((c) => c.name).join(", ") || "(none)";
      ctx.ui.notify(
        `Unknown MCP server: "${serverName}"\n\nAvailable: ${available}`,
        "warning",
      );
      return;
    }

    // Try to get connection/tool info from the mcp-client module if available
    let connected = false;
    let toolNames: string[] = [];
    let error: string | undefined;
    try {
      const mcpClient = await import("../mcp-client/index.js");
      // Access the module's connection state if exported; fall back gracefully
      const mod = mcpClient as Record<string, unknown>;
      if (typeof mod.getConnectionStatus === "function") {
        const status = (mod.getConnectionStatus as (name: string) => { connected: boolean; tools: string[]; error?: string })(serverName);
        connected = status.connected;
        toolNames = status.tools;
        error = status.error;
      }
    } catch {
      // mcp-client may not expose status helpers — that's fine
    }
    if (!connected && !error && hasHostMcpTool(systemPrompt, serverName)) connected = true;

    ctx.ui.notify(
      formatMcpServerDetail({
        name: config.name,
        transport: config.transport,
        connected,
        toolCount: toolNames.length,
        tools: toolNames,
        error,
        disabled: config.disabled,
        sourcePath: config.sourcePath,
        envWarnings: config.envWarnings,
      }),
      "info",
    );
    return;
  }

  // /gsd mcp or /gsd mcp status
  if (!lowered || lowered === "status") {
    // Build status for each server
    const statuses: McpServerStatus[] = [];

    for (const config of configs) {
      let connected = false;
      let toolCount = 0;
      let error: string | undefined;

      try {
        const mcpClient = await import("../mcp-client/index.js");
        const mod = mcpClient as Record<string, unknown>;
        if (typeof mod.getConnectionStatus === "function") {
          const status = (mod.getConnectionStatus as (name: string) => { connected: boolean; tools: string[]; error?: string })(config.name);
          connected = status.connected;
          toolCount = status.tools.length;
          error = status.error;
        }
      } catch {
        // Fall back to unknown state
      }
      if (!connected && !error && hasHostMcpTool(systemPrompt, config.name)) connected = true;

      statuses.push({
        name: config.name,
        transport: config.transport,
        connected,
        toolCount,
        error,
        disabled: config.disabled,
        sourcePath: config.sourcePath,
        envWarnings: config.envWarnings,
      });
    }

    const warningLines = [
      ...management.warnings,
      ...management.duplicates.map((dup) => `Duplicate "${dup.name}" from ${dup.shadowedSourcePath} is shadowed by ${dup.keptSourcePath}.`),
    ];
    const report = warningLines.length > 0
      ? `${formatMcpStatusReport(statuses)}\n\nConfig warnings:\n${warningLines.map((line) => `  - ${line}`).join("\n")}`
      : formatMcpStatusReport(statuses);
    ctx.ui.notify(report, "info");
    return;
  }

  // Unknown subcommand
  ctx.ui.notify(
    "Usage: /gsd mcp [status|check <server>|test <server>|enable <server>|disable <server>|delete <server> --confirm|import <server> [as <name>]|init [dir]]\n\n" +
    "  status           Show all MCP server statuses (default)\n" +
    "  check <server>   Detailed status for a specific server\n" +
    "  test <server>    Verify MCP handshake and tools/list\n" +
    "  enable <server>  Enable a local GSD-managed server\n" +
    "  disable <server> Disable a local GSD-managed server\n" +
    "  delete <server> --confirm  Delete a local GSD-managed server\n" +
    "  import <server> [as <name>] Copy a discovered server to .gsd/mcp.json\n" +
    "  init [dir]       Write .mcp.json for the local GSD workflow MCP server",
    "warning",
  );
}
