import {
  AuthStorage,
  DefaultResourceLoader,
  ModelRegistry,
  SettingsManager,
  SessionManager,
  createAgentSession,
  InteractiveMode,
  runPrintMode,
  runRpcMode,
} from '@gsd/pi-coding-agent'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { agentDir, sessionsDir, authFilePath } from './app-paths.js'
<<<<<<< HEAD
import {
  getProjectSessionsDir,
  migrateLegacyFlatSessions,
  parseCliArgs,
  runWebCliBranch,
  type RunWebCliBranchDeps,
} from './cli-web-branch.js'
import { stopWebMode } from './web-mode.js'
import { initResources, buildResourceLoader } from './resource-loader.js'
=======
import { initResources, buildResourceLoader, getNewerManagedResourceVersion } from './resource-loader.js'
>>>>>>> upstream/main
import { ensureManagedTools } from './tool-bootstrap.js'
import { loadStoredEnvKeys } from './wizard.js'
import { getPiDefaultModelAndProvider, migratePiCredentials } from './pi-migration.js'
import { shouldRunOnboarding, runOnboarding } from './onboarding.js'
import chalk from 'chalk'
import { checkForUpdates } from './update-check.js'
import { printHelp, printSubcommandHelp } from './help-text.js'

<<<<<<< HEAD
type WritableLike = Pick<typeof process.stdout, 'write'>

type ExitFn = (code: number) => never | void

export interface CliDeps extends RunWebCliBranchDeps {
  ensureManagedTools?: typeof ensureManagedTools
  createAuthStorage?: (path: string) => ReturnType<typeof AuthStorage.create>
  loadStoredEnvKeys?: typeof loadStoredEnvKeys
  migratePiCredentials?: typeof migratePiCredentials
  shouldRunOnboarding?: typeof shouldRunOnboarding
  runOnboarding?: typeof runOnboarding
  checkForUpdates?: typeof checkForUpdates
  createModelRegistry?: (authStorage: ReturnType<typeof AuthStorage.create>) => ModelRegistry
  createSettingsManager?: (dir: string) => SettingsManager
  createAgentSession?: typeof createAgentSession
  createInteractiveMode?: (session: Awaited<ReturnType<typeof createAgentSession>>['session']) => { run: () => Promise<void> }
  initResources?: typeof initResources
  buildResourceLoader?: typeof buildResourceLoader
  stdin?: { isTTY?: boolean }
  stdout?: WritableLike
  stderr?: WritableLike
  exit?: ExitFn
  importRunUpdate?: () => Promise<{ runUpdate: () => Promise<void> }>
  stopWebMode?: typeof stopWebMode
}

function writeHelp(stdout: WritableLike): void {
  stdout.write(`GSD v${process.env.GSD_VERSION || '0.0.0'} — Get Shit Done\n\n`)
  stdout.write('Usage: gsd [options] [message...]\n\n')
  stdout.write('Options:\n')
  stdout.write('  --mode <text|json|rpc>   Output mode (default: interactive)\n')
  stdout.write('  --print, -p              Single-shot print mode\n')
  stdout.write('  --web [path]             Launch browser-only web mode (optionally for a different project)\n')
  stdout.write('  --continue, -c           Resume the most recent session\n')
  stdout.write('  --model <id>             Override model (e.g. claude-opus-4-6)\n')
  stdout.write('  --no-session             Disable session persistence\n')
  stdout.write('  --extension <path>       Load additional extension\n')
  stdout.write('  --tools <a,b,c>          Restrict available tools\n')
  stdout.write('  --list-models [search]   List available models and exit\n')
  stdout.write('  --version, -v            Print version and exit\n')
  stdout.write('  --help, -h               Print this help and exit\n')
  stdout.write('\nSubcommands:\n')
  stdout.write('  config                   Re-run the setup wizard\n')
  stdout.write('  update                   Update GSD to the latest version\n')
  stdout.write('  web [start] [path]       Launch web mode (optionally for a different project)\n')
  stdout.write('  web stop [path|all]      Stop web server (specific project, or all)\n')
}

function exitAndReturn(exit: ExitFn, code: number): number {
  exit(code)
  return code
}

function emitExtensionLoadErrors(stderr: WritableLike, errors: Array<{ error: unknown }>): void {
  if (errors.length === 0) return
  for (const err of errors) {
    stderr.write(`[gsd] Extension load error: ${err.error}\n`)
=======
// ---------------------------------------------------------------------------
// Minimal CLI arg parser — detects print/subagent mode flags
// ---------------------------------------------------------------------------
interface CliFlags {
  mode?: 'text' | 'json' | 'rpc' | 'mcp'
  print?: boolean
  continue?: boolean
  noSession?: boolean
  model?: string
  listModels?: string | true
  extensions: string[]
  appendSystemPrompt?: string
  tools?: string[]
  messages: string[]
}

function exitIfManagedResourcesAreNewer(currentAgentDir: string): void {
  const currentVersion = process.env.GSD_VERSION || '0.0.0'
  const managedVersion = getNewerManagedResourceVersion(currentAgentDir, currentVersion)
  if (!managedVersion) {
    return
  }

  process.stderr.write(
    `[gsd] ${chalk.yellow('Version mismatch detected')}\n` +
    `[gsd] Synced resources are from ${chalk.bold(`v${managedVersion}`)}, but this \`gsd\` binary is ${chalk.dim(`v${currentVersion}`)}.\n` +
    `[gsd] Run ${chalk.bold('npm install -g gsd-pi@latest')} or ${chalk.bold('gsd update')}, then try again.\n`,
  )
  process.exit(1)
}

function parseCliArgs(argv: string[]): CliFlags {
  const flags: CliFlags = { extensions: [], messages: [] }
  const args = argv.slice(2) // skip node + script
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--mode' && i + 1 < args.length) {
      const m = args[++i]
      if (m === 'text' || m === 'json' || m === 'rpc' || m === 'mcp') flags.mode = m
    } else if (arg === '--print' || arg === '-p') {
      flags.print = true
    } else if (arg === '--continue' || arg === '-c') {
      flags.continue = true
    } else if (arg === '--no-session') {
      flags.noSession = true
    } else if (arg === '--model' && i + 1 < args.length) {
      flags.model = args[++i]
    } else if (arg === '--extension' && i + 1 < args.length) {
      flags.extensions.push(args[++i])
    } else if (arg === '--append-system-prompt' && i + 1 < args.length) {
      flags.appendSystemPrompt = args[++i]
    } else if (arg === '--tools' && i + 1 < args.length) {
      flags.tools = args[++i].split(',')
    } else if (arg === '--list-models') {
      flags.listModels = (i + 1 < args.length && !args[i + 1].startsWith('-')) ? args[++i] : true
    } else if (arg === '--version' || arg === '-v') {
      process.stdout.write((process.env.GSD_VERSION || '0.0.0') + '\n')
      process.exit(0)
    } else if (arg === '--help' || arg === '-h') {
      printHelp(process.env.GSD_VERSION || '0.0.0')
      process.exit(0)
    } else if (!arg.startsWith('--') && !arg.startsWith('-')) {
      flags.messages.push(arg)
    }
  }
  return flags
}

const cliFlags = parseCliArgs(process.argv)
const isPrintMode = cliFlags.print || cliFlags.mode !== undefined

// `gsd <subcommand> --help` — show subcommand-specific help
const subcommand = cliFlags.messages[0]
if (subcommand && process.argv.includes('--help')) {
  if (printSubcommandHelp(subcommand, process.env.GSD_VERSION || '0.0.0')) {
    process.exit(0)
  }
}

// `gsd config` — replay the setup wizard and exit
if (cliFlags.messages[0] === 'config') {
  const authStorage = AuthStorage.create(authFilePath)
  loadStoredEnvKeys(authStorage)
  await runOnboarding(authStorage)
  process.exit(0)
}

// `gsd update` — update to the latest version via npm
if (cliFlags.messages[0] === 'update') {
  const { runUpdate } = await import('./update-cmd.js')
  await runUpdate()
  process.exit(0)
}

// Pi's tool bootstrap can mis-detect already-installed fd/rg on some systems
// because spawnSync(..., ["--version"]) returns EPERM despite a zero exit code.
// Provision local managed binaries first so Pi sees them without probing PATH.
ensureManagedTools(join(agentDir, 'bin'))

const authStorage = AuthStorage.create(authFilePath)
loadStoredEnvKeys(authStorage)
migratePiCredentials(authStorage)

const modelRegistry = new ModelRegistry(authStorage)
const settingsManager = SettingsManager.create(agentDir)

// Run onboarding wizard on first launch (no LLM provider configured)
if (!isPrintMode && shouldRunOnboarding(authStorage, settingsManager.getDefaultProvider())) {
  await runOnboarding(authStorage)

  // Clean up stdin state left by @clack/prompts.
  // readline.emitKeypressEvents() adds a permanent data listener and
  // readline.createInterface() may leave stdin paused. Remove stale
  // listeners and pause stdin so the TUI can start with a clean slate.
  process.stdin.removeAllListeners('data')
  process.stdin.removeAllListeners('keypress')
  if (process.stdin.setRawMode) process.stdin.setRawMode(false)
  process.stdin.pause()
}

// Non-blocking update check — runs at most once per 24h, fire-and-forget
if (!isPrintMode) {
  checkForUpdates().catch(() => {})
}

// Warn if terminal is too narrow for readable output
if (!isPrintMode && process.stdout.columns && process.stdout.columns < 40) {
  process.stderr.write(
    chalk.yellow(`[gsd] Terminal width is ${process.stdout.columns} columns (minimum recommended: 40). Output may be unreadable.\n`),
  )
}

// --list-models: print available models and exit (no TTY needed)
if (cliFlags.listModels !== undefined) {
  const models = modelRegistry.getAvailable()
  if (models.length === 0) {
    console.log('No models available. Set API keys in environment variables.')
    process.exit(0)
  }

  const searchPattern = typeof cliFlags.listModels === 'string' ? cliFlags.listModels : undefined
  let filtered = models
  if (searchPattern) {
    const q = searchPattern.toLowerCase()
    filtered = models.filter((m) => `${m.provider} ${m.id} ${m.name}`.toLowerCase().includes(q))
  }

  // Sort by name descending (newest first), then provider, then id
  filtered.sort((a, b) => {
    const nameCmp = b.name.localeCompare(a.name)
    if (nameCmp !== 0) return nameCmp
    const provCmp = a.provider.localeCompare(b.provider)
    if (provCmp !== 0) return provCmp
    return a.id.localeCompare(b.id)
  })

  const fmt = (n: number) => n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1_000 ? `${n / 1_000}K` : `${n}`
  const rows = filtered.map((m) => [
    m.provider,
    m.id,
    m.name,
    fmt(m.contextWindow),
    fmt(m.maxTokens),
    m.reasoning ? 'yes' : 'no',
  ])
  const hdrs = ['provider', 'model', 'name', 'context', 'max-out', 'thinking']
  const widths = hdrs.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
  const pad = (s: string, w: number) => s.padEnd(w)
  console.log(hdrs.map((h, i) => pad(h, widths[i])).join('  '))
  for (const row of rows) {
    console.log(row.map((c, i) => pad(c, widths[i])).join('  '))
  }
  process.exit(0)
}

// Validate configured model on startup — catches stale settings from prior installs
// (e.g. grok-2 which no longer exists) and fresh installs with no settings.
// Only resets the default when the configured model no longer exists in the registry;
// never overwrites a valid user choice.
const configuredProvider = settingsManager.getDefaultProvider()
const configuredModel = settingsManager.getDefaultModel()
const allModels = modelRegistry.getAll()
const availableModels = modelRegistry.getAvailable()
const configuredExists = configuredProvider && configuredModel &&
  allModels.some((m) => m.provider === configuredProvider && m.id === configuredModel)
const configuredAvailable = configuredProvider && configuredModel &&
  availableModels.some((m) => m.provider === configuredProvider && m.id === configuredModel)

if (!configuredModel || !configuredExists || !configuredAvailable) {
  const piDefault = getPiDefaultModelAndProvider()
  const preferred =
    (piDefault
      ? availableModels.find((m) => m.provider === piDefault.provider && m.id === piDefault.model)
      : undefined) ||
    availableModels.find((m) => m.provider === 'openai' && m.id === 'gpt-5.4') ||
    availableModels.find((m) => m.provider === 'openai') ||
    availableModels.find((m) => m.provider === 'anthropic' && m.id === 'claude-opus-4-6') ||
    availableModels.find((m) => m.provider === 'anthropic' && m.id.includes('opus')) ||
    availableModels.find((m) => m.provider === 'anthropic') ||
    availableModels[0]
  if (preferred) {
    settingsManager.setDefaultModelAndProvider(preferred.provider, preferred.id)
>>>>>>> upstream/main
  }
}

export async function runCli(argv = process.argv, deps: CliDeps = {}): Promise<number> {
  const stdout = deps.stdout ?? process.stdout
  const stderr = deps.stderr ?? process.stderr
  const stdin = deps.stdin ?? process.stdin
  const exit = deps.exit ?? ((code: number) => process.exit(code))
  const currentCwd = (deps.cwd ?? (() => process.cwd()))()
  const cliFlags = parseCliArgs(argv)
  const isPrintMode = cliFlags.print || cliFlags.mode !== undefined

  if (cliFlags.version) {
    stdout.write((process.env.GSD_VERSION || '0.0.0') + '\n')
    return exitAndReturn(exit, 0)
  }

  if (cliFlags.help) {
    writeHelp(stdout)
    return exitAndReturn(exit, 0)
  }

  const ensureManagedToolsFn = deps.ensureManagedTools ?? ensureManagedTools
  ensureManagedToolsFn(join(agentDir, 'bin'))

  const createAuthStorage = deps.createAuthStorage ?? ((path: string) => AuthStorage.create(path))
  const authStorage = createAuthStorage(authFilePath)

  if (cliFlags.messages[0] === 'config') {
    await (deps.runOnboarding ?? runOnboarding)(authStorage)
    return exitAndReturn(exit, 0)
  }

  if (cliFlags.messages[0] === 'update') {
    const { runUpdate } = await (deps.importRunUpdate ?? (() => import('./update-cmd.js')) )()
    await runUpdate()
    return exitAndReturn(exit, 0)
  }

  // Handle `gsd web stop` before the --web branch so it doesn't require the flag
  if (cliFlags.messages[0] === 'web' && cliFlags.messages[1] === 'stop') {
    const webBranch = await runWebCliBranch(cliFlags, {
      stopWebMode: deps.stopWebMode,
      cwd: deps.cwd,
      stderr,
      baseSessionsDir: sessionsDir,
      agentDir,
    })
    if (webBranch.handled) {
      return exitAndReturn(exit, webBranch.exitCode)
    }
  }

<<<<<<< HEAD
  ;(deps.loadStoredEnvKeys ?? loadStoredEnvKeys)(authStorage)
  ;(deps.migratePiCredentials ?? migratePiCredentials)(authStorage)

  const projectSessionsDir = getProjectSessionsDir(currentCwd)

  const webBranch = await runWebCliBranch(cliFlags, {
    runWebMode: deps.runWebMode,
    cwd: () => currentCwd,
    stderr,
    baseSessionsDir: sessionsDir,
=======
  exitIfManagedResourcesAreNewer(agentDir)
  initResources(agentDir)
  const resourceLoader = new DefaultResourceLoader({
>>>>>>> upstream/main
    agentDir,
  })
  if (webBranch.handled) {
    return exitAndReturn(exit, webBranch.exitCode)
  }

  if (!isPrintMode && (deps.shouldRunOnboarding ?? shouldRunOnboarding)(authStorage)) {
    await (deps.runOnboarding ?? runOnboarding)(authStorage)
  }

  if (!isPrintMode) {
    void (deps.checkForUpdates ?? checkForUpdates)().catch(() => {})
  }

  const modelRegistry = (deps.createModelRegistry ?? ((storage) => new ModelRegistry(storage)))(authStorage)
  const settingsManager = (deps.createSettingsManager ?? ((dir: string) => SettingsManager.create(dir)))(agentDir)

  if (cliFlags.listModels !== undefined) {
    const models = modelRegistry.getAvailable()
    if (models.length === 0) {
      stdout.write('No models available. Set API keys in environment variables.\n')
      return exitAndReturn(exit, 0)
    }

    const searchPattern = typeof cliFlags.listModels === 'string' ? cliFlags.listModels : undefined
    let filtered = models
    if (searchPattern) {
      const query = searchPattern.toLowerCase()
      filtered = models.filter((model) => `${model.provider} ${model.id} ${model.name}`.toLowerCase().includes(query))
    }

    filtered.sort((a, b) => {
      const nameCmp = b.name.localeCompare(a.name)
      if (nameCmp !== 0) return nameCmp
      const provCmp = a.provider.localeCompare(b.provider)
      if (provCmp !== 0) return provCmp
      return a.id.localeCompare(b.id)
    })

    const fmt = (n: number) => n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1_000 ? `${n / 1_000}K` : `${n}`
    const rows = filtered.map((model) => [
      model.provider,
      model.id,
      model.name,
      fmt(model.contextWindow),
      fmt(model.maxTokens),
      model.reasoning ? 'yes' : 'no',
    ])
    const headers = ['provider', 'model', 'name', 'context', 'max-out', 'thinking']
    const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index].length)))
    const pad = (value: string, width: number) => value.padEnd(width)
    stdout.write(headers.map((header, index) => pad(header, widths[index])).join('  ') + '\n')
    for (const row of rows) {
      stdout.write(row.map((cell, index) => pad(cell, widths[index])).join('  ') + '\n')
    }
    return exitAndReturn(exit, 0)
  }

  const configuredProvider = settingsManager.getDefaultProvider()
  const configuredModel = settingsManager.getDefaultModel()
  const allModels = modelRegistry.getAll()
  const availableModels = modelRegistry.getAvailable()
  const configuredExists = configuredProvider && configuredModel &&
    allModels.some((model) => model.provider === configuredProvider && model.id === configuredModel)
  const configuredAvailable = configuredProvider && configuredModel &&
    availableModels.some((model) => model.provider === configuredProvider && model.id === configuredModel)

  if (!configuredModel || !configuredExists || !configuredAvailable) {
    const piDefault = getPiDefaultModelAndProvider()
    const preferred =
      (piDefault
        ? availableModels.find((model) => model.provider === piDefault.provider && model.id === piDefault.model)
        : undefined) ||
      availableModels.find((model) => model.provider === 'openai' && model.id === 'gpt-5.4') ||
      availableModels.find((model) => model.provider === 'openai') ||
      availableModels.find((model) => model.provider === 'anthropic' && model.id === 'claude-opus-4-6') ||
      availableModels.find((model) => model.provider === 'anthropic' && model.id.includes('opus')) ||
      availableModels.find((model) => model.provider === 'anthropic') ||
      availableModels[0]

    if (preferred) {
      settingsManager.setDefaultModelAndProvider(preferred.provider, preferred.id)
    }
  }

  if (settingsManager.getDefaultThinkingLevel() !== 'off' && (!configuredExists || !configuredAvailable)) {
    settingsManager.setDefaultThinkingLevel('off')
  }

  if (!settingsManager.getQuietStartup()) {
    settingsManager.setQuietStartup(true)
  }

  if (!settingsManager.getCollapseChangelog()) {
    settingsManager.setCollapseChangelog(true)
  }

  if (isPrintMode) {
    const sessionManager = cliFlags.noSession
      ? SessionManager.inMemory()
      : SessionManager.create(currentCwd)

    let appendSystemPrompt: string | undefined
    if (cliFlags.appendSystemPrompt) {
      try {
        appendSystemPrompt = readFileSync(cliFlags.appendSystemPrompt, 'utf-8')
      } catch {
        appendSystemPrompt = cliFlags.appendSystemPrompt
      }
    }

    ;(deps.initResources ?? initResources)(agentDir)
    const resourceLoader = new DefaultResourceLoader({
      agentDir,
      additionalExtensionPaths: cliFlags.extensions.length > 0 ? cliFlags.extensions : undefined,
      appendSystemPrompt,
    })
    await resourceLoader.reload()

    const { session, extensionsResult } = await (deps.createAgentSession ?? createAgentSession)({
      authStorage,
      modelRegistry,
      settingsManager,
      sessionManager,
      resourceLoader,
    })

    emitExtensionLoadErrors(stderr, extensionsResult.errors)

    if (cliFlags.model) {
      const available = modelRegistry.getAvailable()
      const match =
        available.find((model) => model.id === cliFlags.model) ||
        available.find((model) => `${model.provider}/${model.id}` === cliFlags.model)
      if (match) {
        session.setModel(match)
      }
    }

    const mode = cliFlags.mode || 'text'
    if (mode === 'rpc') {
      await runRpcMode(session)
      return exitAndReturn(exit, 0)
    }

    await runPrintMode(session, {
      mode,
      messages: cliFlags.messages,
    })
    return exitAndReturn(exit, 0)
  }

  migrateLegacyFlatSessions(sessionsDir, projectSessionsDir)

  const sessionManager = cliFlags.continue
    ? SessionManager.continueRecent(currentCwd, projectSessionsDir)
    : SessionManager.create(currentCwd, projectSessionsDir)

  ;(deps.initResources ?? initResources)(agentDir)
  const resourceLoader = (deps.buildResourceLoader ?? buildResourceLoader)(agentDir)
  await resourceLoader.reload()

  const { session, extensionsResult } = await (deps.createAgentSession ?? createAgentSession)({
    authStorage,
    modelRegistry,
    settingsManager,
    sessionManager,
    resourceLoader,
  })

  emitExtensionLoadErrors(stderr, extensionsResult.errors)

  const enabledModelPatterns = settingsManager.getEnabledModels()
  if (enabledModelPatterns && enabledModelPatterns.length > 0) {
    const scopedAvailableModels = modelRegistry.getAvailable()
    const scopedModels: Array<{ model: (typeof scopedAvailableModels)[number] }> = []
    const seen = new Set<string>()

<<<<<<< HEAD
    for (const pattern of enabledModelPatterns) {
      const slashIdx = pattern.indexOf('/')
      if (slashIdx !== -1) {
        const provider = pattern.substring(0, slashIdx)
        const modelId = pattern.substring(slashIdx + 1)
        const model = scopedAvailableModels.find((candidate) => candidate.provider === provider && candidate.id === modelId)
        if (model) {
          const key = `${model.provider}/${model.id}`
          if (!seen.has(key)) {
            seen.add(key)
            scopedModels.push({ model })
          }
        }
      } else {
        const model = scopedAvailableModels.find((candidate) => candidate.id === pattern)
        if (model) {
          const key = `${model.provider}/${model.id}`
          if (!seen.has(key)) {
            seen.add(key)
            scopedModels.push({ model })
          }
=======
  const mode = cliFlags.mode || 'text'

  if (mode === 'rpc') {
    await runRpcMode(session)
    process.exit(0)
  }

  if (mode === 'mcp') {
    const { startMcpServer } = await import('./mcp-server.js')
    await startMcpServer({
      tools: session.agent.state.tools ?? [],
      version: process.env.GSD_VERSION || '0.0.0',
    })
    // MCP server runs until the transport closes; keep alive
    await new Promise(() => {})
  }

  await runPrintMode(session, {
    mode: mode as 'text' | 'json',
    messages: cliFlags.messages,
  })
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Interactive mode — normal TTY session
// ---------------------------------------------------------------------------

// Per-directory session storage — same encoding as the upstream SDK so that
// /resume only shows sessions from the current working directory.
const cwd = process.cwd()
const safePath = `--${cwd.replace(/^[/\\]/, '').replace(/[/\\:]/g, '-')}--`
const projectSessionsDir = join(sessionsDir, safePath)

// Migrate legacy flat sessions: before per-directory scoping, all .jsonl session
// files lived directly in ~/.gsd/sessions/. Move them into the correct per-cwd
// subdirectory so /resume can find them.
if (existsSync(sessionsDir)) {
  try {
    const entries = readdirSync(sessionsDir)
    const flatJsonl = entries.filter(f => f.endsWith('.jsonl'))
    if (flatJsonl.length > 0) {
      const { mkdirSync } = await import('node:fs')
      mkdirSync(projectSessionsDir, { recursive: true })
      for (const file of flatJsonl) {
        const src = join(sessionsDir, file)
        const dst = join(projectSessionsDir, file)
        if (!existsSync(dst)) {
          renameSync(src, dst)
>>>>>>> upstream/main
        }
      }
    }

<<<<<<< HEAD
    if (scopedModels.length > 0 && scopedModels.length < scopedAvailableModels.length) {
      session.setScopedModels(scopedModels)
=======
const sessionManager = cliFlags.continue
  ? SessionManager.continueRecent(cwd, projectSessionsDir)
  : SessionManager.create(cwd, projectSessionsDir)

exitIfManagedResourcesAreNewer(agentDir)
initResources(agentDir)
const resourceLoader = buildResourceLoader(agentDir)
await resourceLoader.reload()

const { session, extensionsResult } = await createAgentSession({
  authStorage,
  modelRegistry,
  settingsManager,
  sessionManager,
  resourceLoader,
})

if (extensionsResult.errors.length > 0) {
  for (const err of extensionsResult.errors) {
    process.stderr.write(`[gsd] Extension load error: ${err.error}\n`)
  }
}

// Restore scoped models from settings on startup.
// The upstream InteractiveMode reads enabledModels from settings when /scoped-models is opened,
// but doesn't apply them to the session at startup — so Ctrl+P cycles all models instead of
// just the saved selection until the user re-runs /scoped-models.
const enabledModelPatterns = settingsManager.getEnabledModels()
if (enabledModelPatterns && enabledModelPatterns.length > 0) {
  const availableModels = modelRegistry.getAvailable()
  const scopedModels: Array<{ model: (typeof availableModels)[number] }> = []
  const seen = new Set<string>()

  for (const pattern of enabledModelPatterns) {
    // Patterns are "provider/modelId" exact strings saved by /scoped-models
    const slashIdx = pattern.indexOf('/')
    if (slashIdx !== -1) {
      const provider = pattern.substring(0, slashIdx)
      const modelId = pattern.substring(slashIdx + 1)
      const model = availableModels.find((m) => m.provider === provider && m.id === modelId)
      if (model) {
        const key = `${model.provider}/${model.id}`
        if (!seen.has(key)) {
          seen.add(key)
          scopedModels.push({ model })
        }
      }
    } else {
      // Fallback: match by model id alone
      const model = availableModels.find((m) => m.id === pattern)
      if (model) {
        const key = `${model.provider}/${model.id}`
        if (!seen.has(key)) {
          seen.add(key)
          scopedModels.push({ model })
        }
      }
>>>>>>> upstream/main
    }
  }

  if (!stdin.isTTY) {
    stderr.write('[gsd] Error: Interactive mode requires a terminal (TTY).\n')
    stderr.write('[gsd] Non-interactive alternatives:\n')
    stderr.write('[gsd]   gsd --print "your message"     Single-shot prompt\n')
    stderr.write('[gsd]   gsd --web [path]               Browser-only web mode\n')
    stderr.write('[gsd]   gsd --mode rpc               JSON-RPC over stdin/stdout\n')
    stderr.write('[gsd]   gsd --mode text "message"    Text output mode\n')
    return exitAndReturn(exit, 1)
  }

  const interactiveMode = (deps.createInteractiveMode ?? ((agentSession) => new InteractiveMode(agentSession)))(session)
  await interactiveMode.run()
  return 0
}

<<<<<<< HEAD
if (process.env.GSD_SKIP_CLI_AUTORUN !== '1') {
  await runCli()
=======
if (!process.stdin.isTTY) {
  process.stderr.write('[gsd] Error: Interactive mode requires a terminal (TTY).\n')
  process.stderr.write('[gsd] Non-interactive alternatives:\n')
  process.stderr.write('[gsd]   gsd --print "your message"     Single-shot prompt\n')
  process.stderr.write('[gsd]   gsd --mode rpc                 JSON-RPC over stdin/stdout\n')
  process.stderr.write('[gsd]   gsd --mode mcp                 MCP server over stdin/stdout\n')
  process.stderr.write('[gsd]   gsd --mode text "message"      Text output mode\n')
  process.exit(1)
>>>>>>> upstream/main
}
