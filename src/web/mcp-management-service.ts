// GSD-2 — Web MCP management service.
// File Purpose: Bridges app API routes to the shared MCP management module.

import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { resolveBridgeRuntimeConfig } from "./bridge-service.ts"
import { buildSubprocessPrefixArgs, resolveSubprocessModule } from "./ts-subprocess-flags.ts"
import type {
  WebMcpManagementPayload,
  WebMcpMutationRequest,
  WebMcpMutationResponse,
} from "../../web/lib/mcp-management-types.ts"

const MCP_MANAGEMENT_MAX_BUFFER = 4 * 1024 * 1024

function resolveTsLoaderPath(packageRoot: string): string {
  return join(packageRoot, "src", "resources", "extensions", "gsd", "tests", "resolve-ts.mjs")
}

export async function collectMcpManagementData(projectCwdOverride?: string): Promise<WebMcpManagementPayload> {
  const result = await runMcpManagementSubprocess({ action: "list" }, projectCwdOverride)
  if ("status" in result && result.status === "error") {
    throw new Error(result.error)
  }
  return result as WebMcpManagementPayload
}

export async function mutateMcpManagement(
  request: WebMcpMutationRequest,
  projectCwdOverride?: string,
): Promise<WebMcpMutationResponse> {
  return runMcpManagementSubprocess(request, projectCwdOverride) as Promise<WebMcpMutationResponse>
}

async function runMcpManagementSubprocess(
  action: WebMcpMutationRequest | { action: "list" },
  projectCwdOverride?: string,
): Promise<WebMcpManagementPayload | WebMcpMutationResponse> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { packageRoot, projectCwd } = config
  const resolveTsLoader = resolveTsLoaderPath(packageRoot)
  const managerResolution = resolveSubprocessModule(packageRoot, "resources/extensions/mcp-client/manager.ts")
  const discoveryResolution = resolveSubprocessModule(packageRoot, "resources/extensions/universal-config/discovery.ts")

  const requiredPaths = managerResolution.useCompiledJs
    ? [managerResolution.modulePath, discoveryResolution.modulePath]
    : [resolveTsLoader, managerResolution.modulePath, discoveryResolution.modulePath]
  for (const requiredPath of requiredPaths) {
    if (!existsSync(requiredPath)) {
      throw new Error(`MCP management provider not found; missing=${requiredPath}`)
    }
  }

  const script = [
    'const { pathToFileURL } = await import("node:url");',
    'const manager = await import(pathToFileURL(process.env.GSD_MCP_MANAGER_MODULE).href);',
    'const discovery = await import(pathToFileURL(process.env.GSD_MCP_DISCOVERY_MODULE).href);',
    'const projectDir = process.env.GSD_MCP_PROJECT_CWD;',
    'const action = JSON.parse(process.env.GSD_MCP_ACTION);',
    'function toWebServer(server) {',
    '  return {',
    '    name: server.name, transport: server.transport, sourcePath: server.sourcePath, sourceKind: server.sourceKind,',
    '    disabled: server.disabled, command: server.command, args: server.args, env: server.env, url: server.url, cwd: server.cwd, headers: server.headers,',
    '    envWarnings: server.envWarnings ?? [], connected: false, toolCount: 0, tools: [],',
    '  };',
    '}',
    'function importableTransport(item) {',
    '  if (typeof item.command === "string") return "stdio";',
    '  if (typeof item.url === "string" && item.transport !== "sse") return "http";',
    '  return "unsupported";',
    '}',
    'async function buildPayload() {',
    '  const status = manager.readMcpManagementStatus({ projectDir, includeDisabled: true, refresh: true });',
    '  const existingNames = new Set(status.servers.map((server) => server.name));',
    '  const discovered = await discovery.discoverAllConfigs(projectDir);',
    '  const importableServers = discovered.allItems',
    '    .filter((item) => item.type === "mcp-server")',
    '    .map((item) => {',
    '      const transport = importableTransport(item);',
    '      return {',
    '        name: item.name, transport, sourcePath: item.source.path, sourceTool: item.source.toolName,',
    '        command: item.command, args: item.args, env: item.env, url: item.url, headers: item.headers,',
    '        unsupportedReason: transport === "unsupported" ? "Unsupported transport" : undefined,',
    '        conflicts: existingNames.has(item.name),',
    '      };',
    '    });',
    '  return {',
    '    servers: status.servers.map(toWebServer),',
    '    importableServers,',
    '    duplicates: status.duplicates,',
    '    warnings: status.warnings,',
    '    localConfigPath: status.localConfigPath,',
    '  };',
    '}',
    'async function run() {',
    '  if (action.action === "list") return buildPayload();',
    '  if (action.action === "save") {',
    '    manager.upsertProjectLocalMcpServer(action.server, { projectDir, previousName: action.previousName });',
    '    return { status: "ok", data: await buildPayload() };',
    '  }',
    '  if (action.action === "enable" || action.action === "disable") {',
    '    manager.setProjectLocalMcpServerDisabled(action.name, action.action === "disable", { projectDir });',
    '    return { status: "ok", data: await buildPayload() };',
    '  }',
    '  if (action.action === "delete") {',
    '    manager.deleteProjectLocalMcpServer(action.name, { projectDir });',
    '    return { status: "ok", data: await buildPayload() };',
    '  }',
    '  if (action.action === "test") {',
    '    const result = await manager.testMcpServerConnection(action.name, { projectDir });',
    '    return { status: "ok", data: await buildPayload(), result };',
    '  }',
    '  if (action.action === "import") {',
    '    if (action.server.transport === "unsupported") throw new Error(`Cannot import unsupported MCP transport for ${action.server.name}.`);',
    '    manager.upsertProjectLocalMcpServer({',
    '      name: action.name || action.server.name, transport: action.server.transport,',
    '      command: action.server.command, args: action.server.args, env: action.server.env, url: action.server.url, headers: action.server.headers,',
    '      importedFrom: { name: action.server.name, sourcePath: action.server.sourcePath, sourceTool: action.server.sourceTool },',
    '    }, { projectDir });',
    '    return { status: "ok", data: await buildPayload() };',
    '  }',
    '  throw new Error(`Unknown MCP management action: ${action.action}`);',
    '}',
    'try { process.stdout.write(JSON.stringify(await run())); }',
    'catch (error) { process.stdout.write(JSON.stringify({ status: "error", error: error instanceof Error ? error.message : String(error) })); }',
  ].join(" ")

  const prefixArgs = buildSubprocessPrefixArgs(
    packageRoot,
    managerResolution,
    pathToFileURL(resolveTsLoader).href,
  )

  return await new Promise<WebMcpManagementPayload | WebMcpMutationResponse>((resolveResult, reject) => {
    execFile(
      process.execPath,
      [
        ...prefixArgs,
        "--eval",
        script,
      ],
      {
        cwd: packageRoot,
        env: {
          ...process.env,
          GSD_MCP_MANAGER_MODULE: managerResolution.modulePath,
          GSD_MCP_DISCOVERY_MODULE: discoveryResolution.modulePath,
          GSD_MCP_PROJECT_CWD: projectCwd,
          GSD_MCP_ACTION: JSON.stringify(action),
        },
        maxBuffer: MCP_MANAGEMENT_MAX_BUFFER,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`MCP management subprocess failed: ${stderr || error.message}`))
          return
        }
        try {
          resolveResult(JSON.parse(stdout) as WebMcpManagementPayload | WebMcpMutationResponse)
        } catch (parseError) {
          reject(
            new Error(
              `MCP management subprocess returned invalid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
            ),
          )
        }
      },
    )
  })
}
