/**
 * Universal Config Discovery — shared types
 *
 * Normalized schema for discovered configuration items from all supported
 * AI coding tools: Claude Code, Cursor, Windsurf, Gemini CLI, Codex,
 * Cline, GitHub Copilot, VS Code.
 */

// ── Source metadata ───────────────────────────────────────────────────────────

export type ConfigLevel = "user" | "project";

export interface ConfigSource {
  /** Which tool this config came from */
  tool: ToolId;
  /** Display name of the tool */
  toolName: string;
  /** Absolute path to the config file */
  path: string;
  /** User-level (~/) or project-level (./) */
  level: ConfigLevel;
}

// ── Tool identifiers ──────────────────────────────────────────────────────────

export type ToolId =
  | "claude"
  | "cursor"
  | "windsurf"
  | "gemini"
  | "codex"
  | "cline"
  | "github-copilot"
  | "vscode";

export interface ToolInfo {
  id: ToolId;
  name: string;
  /** User-level config base directory relative to $HOME (null = no user config) */
  userDir: string | null;
  /** Project-level config directory name relative to project root (null = no project config) */
  projectDir: string | null;
}

// ── Discovered config items ───────────────────────────────────────────────────

export interface DiscoveredMCPServer {
  type: "mcp-server";
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  transport?: "stdio" | "sse" | "http";
  source: ConfigSource;
}

export interface DiscoveredRule {
  type: "rule";
  name: string;
  content: string;
  /** Glob patterns this rule applies to */
  globs?: string[];
  /** Whether the rule applies to all files */
  alwaysApply?: boolean;
  description?: string;
  source: ConfigSource;
}

export interface DiscoveredContextFile {
  type: "context-file";
  name: string;
  content: string;
  source: ConfigSource;
}

export interface DiscoveredSettings {
  type: "settings";
  data: Record<string, unknown>;
  source: ConfigSource;
}

export interface DiscoveredClaudeSkill {
  type: "claude-skill";
  name: string;
  path: string;
  source: ConfigSource;
}

export interface DiscoveredClaudePlugin {
  type: "claude-plugin";
  name: string;
  path: string;
  packageName?: string;
  source: ConfigSource;
}

export type DiscoveredItem =
  | DiscoveredMCPServer
  | DiscoveredRule
  | DiscoveredContextFile
  | DiscoveredSettings
  | DiscoveredClaudeSkill
  | DiscoveredClaudePlugin;

// ── Discovery result ──────────────────────────────────────────────────────────

export interface ToolDiscoveryResult {
  tool: ToolInfo;
  items: DiscoveredItem[];
  warnings: string[];
}

export interface DiscoveryResult {
  /** All discovered items grouped by tool */
  tools: ToolDiscoveryResult[];
  /** Flat list of all discovered items */
  allItems: DiscoveredItem[];
  /** Summary counts by category */
  summary: {
    mcpServers: number;
    rules: number;
    contextFiles: number;
    settings: number;
    claudeSkills: number;
    claudePlugins: number;
    totalItems: number;
    toolsScanned: number;
    toolsWithConfig: number;
  };
  /** Warnings from scanners */
  warnings: string[];
  /** Duration in milliseconds */
  durationMs: number;
}
