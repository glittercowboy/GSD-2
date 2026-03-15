import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { agentDir as defaultAgentDir, sessionsDir as defaultSessionsDir } from './app-paths.js'
import { getProjectSessionsDir } from './project-sessions.js'
import { launchWebMode, stopWebMode, type WebModeLaunchStatus, type WebModeStopResult } from './web-mode.js'

export interface CliFlags {
  mode?: 'text' | 'json' | 'rpc'
  print?: boolean
  continue?: boolean
  noSession?: boolean
  model?: string
  listModels?: string | true
  extensions: string[]
  appendSystemPrompt?: string
  tools?: string[]
  messages: string[]
  web?: boolean
  help?: boolean
  version?: boolean
}

type WritableLike = Pick<typeof process.stderr, 'write'>

export interface RunWebCliBranchDeps {
  runWebMode?: typeof launchWebMode
  stopWebMode?: typeof stopWebMode
  cwd?: () => string
  stderr?: WritableLike
  baseSessionsDir?: string
  agentDir?: string
}

export function parseCliArgs(argv: string[]): CliFlags {
  const flags: CliFlags = { extensions: [], messages: [] }
  const args = argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--mode' && i + 1 < args.length) {
      const mode = args[++i]
      if (mode === 'text' || mode === 'json' || mode === 'rpc') flags.mode = mode
    } else if (arg === '--print' || arg === '-p') {
      flags.print = true
    } else if (arg === '--continue' || arg === '-c') {
      flags.continue = true
    } else if (arg === '--no-session') {
      flags.noSession = true
    } else if (arg === '--web') {
      flags.web = true
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
      flags.version = true
    } else if (arg === '--help' || arg === '-h') {
      flags.help = true
    } else if (!arg.startsWith('--') && !arg.startsWith('-')) {
      flags.messages.push(arg)
    }
  }
  return flags
}

export { getProjectSessionsDir } from './project-sessions.js'

export function migrateLegacyFlatSessions(baseSessionsDir: string, projectSessionsDir: string): void {
  if (!existsSync(baseSessionsDir)) return

  try {
    const entries = readdirSync(baseSessionsDir)
    const flatJsonl = entries.filter((file) => file.endsWith('.jsonl'))
    if (flatJsonl.length === 0) return

    mkdirSync(projectSessionsDir, { recursive: true })
    for (const file of flatJsonl) {
      const src = join(baseSessionsDir, file)
      const dst = join(projectSessionsDir, file)
      if (!existsSync(dst)) {
        renameSync(src, dst)
      }
    }
  } catch {
    // Non-fatal — don't block startup if migration fails
  }
}

function emitWebModeFailure(stderr: WritableLike, status: WebModeLaunchStatus): void {
  if (status.ok) return
  stderr.write(`[gsd] Web mode launch failed: ${status.failureReason}\n`)
}

export type RunWebCliBranchResult =
  | { handled: false }
  | {
      handled: true
      exitCode: number
      action: 'start'
      status: WebModeLaunchStatus
      launchInputs: { cwd: string; projectSessionsDir: string; agentDir: string }
    }
  | {
      handled: true
      exitCode: number
      action: 'stop'
      stopResult: WebModeStopResult
    }

export async function runWebCliBranch(
  flags: CliFlags,
  deps: RunWebCliBranchDeps = {},
): Promise<RunWebCliBranchResult> {
  // Handle `gsd web stop` subcommand
  if (flags.messages[0] === 'web' && flags.messages[1] === 'stop') {
    const stderr = deps.stderr ?? process.stderr
    const stopResult = (deps.stopWebMode ?? stopWebMode)({ stderr })
    return {
      handled: true,
      exitCode: stopResult.ok ? 0 : 1,
      action: 'stop',
      stopResult,
    }
  }

  // `gsd web start` is an alias for `gsd --web`
  const isWebStart = flags.messages[0] === 'web' && (flags.messages[1] === 'start' || flags.messages[1] === undefined && false)
  if (!flags.web && !isWebStart) {
    return { handled: false }
  }

  const stderr = deps.stderr ?? process.stderr
  const currentCwd = (deps.cwd ?? (() => process.cwd()))()
  const baseSessionsDir = deps.baseSessionsDir ?? defaultSessionsDir
  const agentDir = deps.agentDir ?? defaultAgentDir
  const projectSessionsDir = getProjectSessionsDir(currentCwd, baseSessionsDir)

  migrateLegacyFlatSessions(baseSessionsDir, projectSessionsDir)
  const status = await (deps.runWebMode ?? launchWebMode)({
    cwd: currentCwd,
    projectSessionsDir,
    agentDir,
  })

  if (!status.ok) {
    emitWebModeFailure(stderr, status)
  }

  return {
    handled: true,
    exitCode: status.ok ? 0 : 1,
    action: 'start',
    status,
    launchInputs: {
      cwd: currentCwd,
      projectSessionsDir,
      agentDir,
    },
  }
}
