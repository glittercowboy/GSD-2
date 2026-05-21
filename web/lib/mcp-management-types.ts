// GSD-2 — Browser-safe MCP management contracts.
// File Purpose: Shared TypeScript interfaces for app MCP connection management.

export type WebMcpTransport = "stdio" | "http" | "unsupported"
export type WebMcpSourceKind = "project-shared" | "project-local" | "global" | "discovered"

export interface WebMcpServer {
  name: string
  transport: WebMcpTransport
  sourcePath: string
  sourceKind: WebMcpSourceKind
  disabled: boolean
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  cwd?: string
  headers?: Record<string, string>
  envWarnings: string[]
  connected: boolean
  toolCount: number
  tools: string[]
}

export interface WebMcpImportableServer {
  name: string
  transport: WebMcpTransport
  sourcePath: string
  sourceTool: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  unsupportedReason?: string
  conflicts: boolean
}

export interface WebMcpDuplicate {
  name: string
  keptSourcePath: string
  shadowedSourcePath: string
}

export interface WebMcpManagementPayload {
  servers: WebMcpServer[]
  importableServers: WebMcpImportableServer[]
  duplicates: WebMcpDuplicate[]
  warnings: string[]
  localConfigPath: string
}

export interface WebMcpConnectionTestResult {
  ok: boolean
  server: string
  transport: WebMcpTransport
  toolCount: number
  tools: string[]
  warnings: string[]
  error?: string
}

export type WebMcpMutationRequest =
  | {
      action: "save"
      previousName?: string
      server: {
        name: string
        transport: Exclude<WebMcpTransport, "unsupported">
        command?: string
        args?: string[]
        env?: Record<string, string>
        url?: string
        cwd?: string
        headers?: Record<string, string>
        disabled?: boolean
      }
    }
  | { action: "enable"; name: string }
  | { action: "disable"; name: string }
  | { action: "delete"; name: string }
  | { action: "test"; name: string }
  | {
      action: "import"
      server: WebMcpImportableServer
      name?: string
    }

export type WebMcpMutationResponse =
  | { status: "ok"; data: WebMcpManagementPayload; result?: WebMcpConnectionTestResult }
  | { status: "error"; error: string }
