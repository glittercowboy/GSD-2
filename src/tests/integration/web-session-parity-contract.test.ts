import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { EventEmitter } from "node:events"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { PassThrough } from "node:stream"
import { StringDecoder } from "node:string_decoder"

const repoRoot = process.cwd()
const bridge = await import("../../web/bridge-service.ts")
const onboarding = await import("../../web/onboarding-service.ts")
const browserRoute = await import("../../../web/app/api/session/browser/route.ts")
const manageRoute = await import("../../../web/app/api/session/manage/route.ts")
const gitRoute = await import("../../../web/app/api/git/route.ts")
const commandSurfaceContract = await import("../../../web/lib/command-surface-contract.ts")
const { GSDWorkspaceStore } = await import("../../../web/lib/gsd-workspace-store.tsx")
const { AuthStorage } = await import("@gsd/pi-coding-agent")

class FakeRpcChild extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  exitCode: number | null = null

  kill(signal: NodeJS.Signals = "SIGTERM"): boolean {
    if (this.exitCode === null) {
      this.exitCode = 0
    }
    queueMicrotask(() => {
      this.emit("exit", this.exitCode, signal)
    })
    return true
  }
}

function serializeJsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`
}

function attachJsonLineReader(stream: PassThrough, onLine: (line: string) => void): void {
  const decoder = new StringDecoder("utf8")
  let buffer = ""

  stream.on("data", (chunk: string | Buffer) => {
    buffer += typeof chunk === "string" ? chunk : decoder.write(chunk)
    while (true) {
      const newlineIndex = buffer.indexOf("\n")
      if (newlineIndex === -1) return
      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      onLine(line.endsWith("\r") ? line.slice(0, -1) : line)
    }
  })
}

function waitForMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function makeWorkspaceFixture(): {
  root: string
  projectCwd: string
  sessionsDir: string
  otherProjectCwd: string
  otherSessionsDir: string
  cleanup: () => void
} {
  const root = mkdtempSync(join(tmpdir(), "gsd-web-session-parity-"))
  const projectCwd = join(root, "project")
  const sessionsDir = join(root, "sessions")
  const otherProjectCwd = join(root, "other-project")
  const otherSessionsDir = join(root, "other-sessions")

  mkdirSync(projectCwd, { recursive: true })
  mkdirSync(sessionsDir, { recursive: true })
  mkdirSync(otherProjectCwd, { recursive: true })
  mkdirSync(otherSessionsDir, { recursive: true })

  return {
    root,
    projectCwd,
    sessionsDir,
    otherProjectCwd,
    otherSessionsDir,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

type SessionFixtureOptions = {
  projectCwd: string
  sessionsDir: string
  sessionId: string
  fileStamp: string
  createdAt: string
  assistantAt: string
  userText: string
  assistantText: string
  name?: string
  parentSessionPath?: string
}

function createSessionFile(options: SessionFixtureOptions): string {
  const sessionPath = join(options.sessionsDir, `${options.fileStamp}_${options.sessionId}.jsonl`)
  const entries: unknown[] = [
    {
      type: "session",
      version: 3,
      id: options.sessionId,
      timestamp: options.createdAt,
      cwd: options.projectCwd,
      ...(options.parentSessionPath ? { parentSession: options.parentSessionPath } : {}),
    },
  ]

  let parentId: string | null = null

  if (options.name) {
    parentId = `${options.sessionId}-info`
    entries.push({
      type: "session_info",
      id: parentId,
      parentId: null,
      timestamp: options.createdAt,
      name: options.name,
    })
  }

  const userId = `${options.sessionId}-user`
  entries.push({
    type: "message",
    id: userId,
    parentId,
    timestamp: options.createdAt,
    message: {
      role: "user",
      content: options.userText,
      timestamp: new Date(options.createdAt).getTime(),
    },
  })

  const assistantId = `${options.sessionId}-assistant`
  entries.push({
    type: "message",
    id: assistantId,
    parentId: userId,
    timestamp: options.assistantAt,
    message: {
      role: "assistant",
      content: options.assistantText,
      timestamp: new Date(options.assistantAt).getTime(),
      provider: "openai",
      model: "gpt-test",
    },
  })

  writeFileSync(sessionPath, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`)
  return sessionPath
}

function getLatestSessionName(sessionPath: string): string | undefined {
  const lines = readFileSync(sessionPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)

  for (let index = lines.length - 1; index >= 0; index--) {
    const parsed = JSON.parse(lines[index]!) as { type?: string; name?: string }
    if (parsed.type === "session_info" && typeof parsed.name === "string") {
      return parsed.name
    }
  }

  return undefined
}

function git(basePath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: basePath,
    encoding: "utf8",
  }).trim()
}

function withProjectGitEnv(projectCwd: string, run: () => Promise<void>): Promise<void> {
  const previousProjectCwd = process.env.GSD_WEB_PROJECT_CWD
  process.env.GSD_WEB_PROJECT_CWD = projectCwd

  return run().finally(() => {
    if (previousProjectCwd === undefined) {
      delete process.env.GSD_WEB_PROJECT_CWD
      return
    }
    process.env.GSD_WEB_PROJECT_CWD = previousProjectCwd
  })
}

function createHarness(onCommand: (command: any, harness: ReturnType<typeof createHarness>) => void) {
  let child: FakeRpcChild | null = null
  const commands: any[] = []

  const harness = {
    spawn() {
      child = new FakeRpcChild()
      attachJsonLineReader(child.stdin, (line) => {
        const parsed = JSON.parse(line)
        commands.push(parsed)
        onCommand(parsed, harness)
      })
      return child as any
    },
    emit(payload: unknown) {
      if (!child) throw new Error("fake child not started")
      child.stdout.write(serializeJsonLine(payload))
    },
    get commands() {
      return commands
    },
  }

  return harness
}

function configureBridgeFixture(
  fixture: ReturnType<typeof makeWorkspaceFixture>,
  harness: ReturnType<typeof createHarness>,
): void {
  bridge.configureBridgeServiceForTests({
    env: {
      ...process.env,
      GSD_WEB_PROJECT_CWD: fixture.projectCwd,
      GSD_WEB_PROJECT_SESSIONS_DIR: fixture.sessionsDir,
      GSD_WEB_PACKAGE_ROOT: repoRoot,
    },
    spawn: harness.spawn,
  })
}

test("/api/session/browser stays current-project scoped and carries threaded/search metadata outside /api/boot", async (t) => {
  const fixture = makeWorkspaceFixture()
  const rootPath = createSessionFile({
    projectCwd: fixture.projectCwd,
    sessionsDir: fixture.sessionsDir,
    sessionId: "sess-root",
    fileStamp: "2026-03-14T18-00-00-000Z",
    createdAt: "2026-03-14T18:00:00.000Z",
    assistantAt: "2026-03-14T18:05:00.000Z",
    userText: "Plan the deploy checklist",
    assistantText: "Baseline deploy context",
  })
  const childPath = createSessionFile({
    projectCwd: fixture.projectCwd,
    sessionsDir: fixture.sessionsDir,
    sessionId: "sess-child",
    fileStamp: "2026-03-14T18-10-00-000Z",
    createdAt: "2026-03-14T18:10:00.000Z",
    assistantAt: "2026-03-14T18:20:00.000Z",
    userText: "Investigate the branch rename",
    assistantText: "No dedicated browser notes here",
    name: "Deploy Child",
    parentSessionPath: rootPath,
  })
  createSessionFile({
    projectCwd: fixture.projectCwd,
    sessionsDir: fixture.sessionsDir,
    sessionId: "sess-named",
    fileStamp: "2026-03-14T18-30-00-000Z",
    createdAt: "2026-03-14T18:30:00.000Z",
    assistantAt: "2026-03-14T18:35:00.000Z",
    userText: "Write release notes",
    assistantText: "api-session-browser appears only in this searchable assistant message",
    name: "Release Notes",
  })
  const outsidePath = createSessionFile({
    projectCwd: fixture.otherProjectCwd,
    sessionsDir: fixture.otherSessionsDir,
    sessionId: "sess-outside",
    fileStamp: "2026-03-14T18-40-00-000Z",
    createdAt: "2026-03-14T18:40:00.000Z",
    assistantAt: "2026-03-14T18:45:00.000Z",
    userText: "Outside scope",
    assistantText: "api-session-browser should stay hidden from the current project route",
    name: "Outside",
  })

  const harness = createHarness((command, current) => {
    if (command.type === "get_state") {
      current.emit({
        id: command.id,
        type: "response",
        command: "get_state",
        success: true,
        data: {
          sessionId: "sess-child",
          sessionFile: childPath,
          sessionName: "Deploy Child",
          thinkingLevel: "off",
          isStreaming: false,
          isCompacting: false,
          steeringMode: "all",
          followUpMode: "all",
          autoCompactionEnabled: false,
          autoRetryEnabled: false,
          retryInProgress: false,
          retryAttempt: 0,
          messageCount: 0,
          pendingMessageCount: 0,
        },
      })
      return
    }

    assert.fail(`unexpected command: ${command.type}`)
  })

  configureBridgeFixture(fixture, harness)

  t.after(async () => {
    await bridge.resetBridgeServiceForTests()
    onboarding.resetOnboardingServiceForTests()
    fixture.cleanup()
  });

  const response = await browserRoute.GET(new Request("http://localhost/api/session/browser"))
  assert.equal(response.status, 200)
  const payload = await response.json() as any

  assert.equal(payload.project.scope, "current_project")
  assert.equal(payload.project.cwd, fixture.projectCwd)
  assert.equal(payload.project.sessionsDir, fixture.sessionsDir)
  assert.equal(payload.project.activeSessionPath, childPath)
  assert.equal(payload.totalSessions, 3)
  assert.equal(payload.returnedSessions, 3)
  assert.equal(payload.sessions.some((session: any) => session.path === outsidePath), false)

  const child = payload.sessions.find((session: any) => session.id === "sess-child")
  assert.ok(child)
  assert.equal(child.parentSessionPath, rootPath)
  assert.equal(child.firstMessage, "Investigate the branch rename")
  assert.equal(child.isActive, true)
  assert.equal(child.depth, 1)
  assert.deepEqual(child.ancestorHasNextSibling, [false])
  assert.equal("allMessagesText" in child, false)

  const searchResponse = await browserRoute.GET(
    new Request("http://localhost/api/session/browser?query=api-session-browser&sortMode=relevance&nameFilter=named"),
  )
  assert.equal(searchResponse.status, 200)
  const searchPayload = await searchResponse.json() as any

  assert.equal(searchPayload.totalSessions, 3)
  assert.equal(searchPayload.returnedSessions, 1)
  assert.equal(searchPayload.query.sortMode, "relevance")
  assert.equal(searchPayload.query.nameFilter, "named")
  assert.equal(searchPayload.sessions[0].id, "sess-named")
  assert.equal(searchPayload.sessions[0].name, "Release Notes")
})

test("/api/session/manage renames the active session through bridge-aware RPC instead of mutating the file directly", async (t) => {
  const fixture = makeWorkspaceFixture()
  const activePath = createSessionFile({
    projectCwd: fixture.projectCwd,
    sessionsDir: fixture.sessionsDir,
    sessionId: "sess-active",
    fileStamp: "2026-03-14T19-00-00-000Z",
    createdAt: "2026-03-14T19:00:00.000Z",
    assistantAt: "2026-03-14T19:05:00.000Z",
    userText: "Name this session",
    assistantText: "Active rename should go through rpc",
    name: "Before Active Rename",
  })

  const harness = createHarness((command, current) => {
    if (command.type === "get_state") {
      current.emit({
        id: command.id,
        type: "response",
        command: "get_state",
        success: true,
        data: {
          sessionId: "sess-active",
          sessionFile: activePath,
          sessionName: "Before Active Rename",
          thinkingLevel: "off",
          isStreaming: false,
          isCompacting: false,
          steeringMode: "all",
          followUpMode: "all",
          autoCompactionEnabled: false,
          autoRetryEnabled: false,
          retryInProgress: false,
          retryAttempt: 0,
          messageCount: 0,
          pendingMessageCount: 0,
        },
      })
      return
    }

    if (command.type === "set_session_name") {
      current.emit({
        id: command.id,
        type: "response",
        command: "set_session_name",
        success: true,
      })
      return
    }

    assert.fail(`unexpected command: ${command.type}`)
  })

  configureBridgeFixture(fixture, harness)
  onboarding.configureOnboardingServiceForTests({
    authStorage: AuthStorage.inMemory({
      openai: { type: "api_key", key: "sk-active-rename" },
    } as any),
  })

  t.after(async () => {
    await bridge.resetBridgeServiceForTests()
    onboarding.resetOnboardingServiceForTests()
    fixture.cleanup()
  });

  const response = await manageRoute.POST(
    new Request("http://localhost/api/session/manage", {
      method: "POST",
      body: JSON.stringify({
        action: "rename",
        sessionPath: activePath,
        name: "Active Renamed",
      }),
    }),
  )
  const payload = await response.json() as any
  await waitForMicrotasks()

  assert.equal(response.status, 200)
  assert.equal(payload.success, true)
  assert.equal(payload.sessionPath, activePath)
  assert.equal(payload.isActiveSession, true)
  assert.equal(payload.mutation, "rpc")
  assert.ok(harness.commands.some((command) => command.type === "set_session_name" && command.name === "Active Renamed"))
  assert.equal(getLatestSessionName(activePath), "Before Active Rename")
})

test("/api/session/manage renames inactive sessions via authoritative session-file mutation and rejects out-of-scope paths", async (t) => {
  const fixture = makeWorkspaceFixture()
  const activePath = createSessionFile({
    projectCwd: fixture.projectCwd,
    sessionsDir: fixture.sessionsDir,
    sessionId: "sess-active",
    fileStamp: "2026-03-14T20-00-00-000Z",
    createdAt: "2026-03-14T20:00:00.000Z",
    assistantAt: "2026-03-14T20:05:00.000Z",
    userText: "Keep this active",
    assistantText: "This session stays active",
    name: "Active Session",
  })
  const inactivePath = createSessionFile({
    projectCwd: fixture.projectCwd,
    sessionsDir: fixture.sessionsDir,
    sessionId: "sess-inactive",
    fileStamp: "2026-03-14T20-10-00-000Z",
    createdAt: "2026-03-14T20:10:00.000Z",
    assistantAt: "2026-03-14T20:15:00.000Z",
    userText: "Rename this stored session",
    assistantText: "Inactive rename should append session_info",
    name: "Before Inactive Rename",
  })
  const outsidePath = createSessionFile({
    projectCwd: fixture.otherProjectCwd,
    sessionsDir: fixture.otherSessionsDir,
    sessionId: "sess-outside",
    fileStamp: "2026-03-14T20-20-00-000Z",
    createdAt: "2026-03-14T20:20:00.000Z",
    assistantAt: "2026-03-14T20:25:00.000Z",
    userText: "Outside scope",
    assistantText: "This file should not be renameable from the current project route",
    name: "Outside Session",
  })

  const harness = createHarness((command, current) => {
    if (command.type === "get_state") {
      current.emit({
        id: command.id,
        type: "response",
        command: "get_state",
        success: true,
        data: {
          sessionId: "sess-active",
          sessionFile: activePath,
          sessionName: "Active Session",
          thinkingLevel: "off",
          isStreaming: false,
          isCompacting: false,
          steeringMode: "all",
          followUpMode: "all",
          autoCompactionEnabled: false,
          autoRetryEnabled: false,
          retryInProgress: false,
          retryAttempt: 0,
          messageCount: 0,
          pendingMessageCount: 0,
        },
      })
      return
    }

    if (command.type === "set_session_name") {
      assert.fail("inactive rename should not go through set_session_name")
    }

    assert.fail(`unexpected command: ${command.type}`)
  })

  configureBridgeFixture(fixture, harness)
  onboarding.configureOnboardingServiceForTests({
    authStorage: AuthStorage.inMemory({
      openai: { type: "api_key", key: "sk-inactive-rename" },
    } as any),
  })

  t.after(async () => {
    await bridge.resetBridgeServiceForTests()
    onboarding.resetOnboardingServiceForTests()
    fixture.cleanup()
  });

  const renameResponse = await manageRoute.POST(
    new Request("http://localhost/api/session/manage", {
      method: "POST",
      body: JSON.stringify({
        action: "rename",
        sessionPath: inactivePath,
        name: "Inactive Renamed",
      }),
    }),
  )
  const renamePayload = await renameResponse.json() as any

  assert.equal(renameResponse.status, 200)
  assert.equal(renamePayload.success, true)
  assert.equal(renamePayload.isActiveSession, false)
  assert.equal(renamePayload.mutation, "session_file")
  assert.equal(getLatestSessionName(inactivePath), "Inactive Renamed")
  assert.equal(harness.commands.some((command) => command.type === "set_session_name"), false)

  const outsideResponse = await manageRoute.POST(
    new Request("http://localhost/api/session/manage", {
      method: "POST",
      body: JSON.stringify({
        action: "rename",
        sessionPath: outsidePath,
        name: "Should Fail",
      }),
    }),
  )
  const outsidePayload = await outsideResponse.json() as any

  assert.equal(outsideResponse.status, 404)
  assert.equal(outsidePayload.success, false)
  assert.equal(outsidePayload.code, "not_found")
  assert.equal(getLatestSessionName(outsidePath), "Outside Session")
})

test("/api/git returns a current-project-scoped repo summary and ignores changes outside the current project subtree", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "gsd-web-git-summary-"))
  const repoRoot = join(root, "repo")
  const projectCwd = join(repoRoot, "apps", "current-project")
  const docsDir = join(repoRoot, "docs")

  t.after(() => { rmSync(root, { recursive: true, force: true }) });

  mkdirSync(projectCwd, { recursive: true })
  mkdirSync(docsDir, { recursive: true })

  writeFileSync(join(projectCwd, "staged.txt"), "baseline staged\n")
  writeFileSync(join(projectCwd, "dirty.txt"), "baseline dirty\n")
  writeFileSync(join(docsDir, "outside.txt"), "baseline outside\n")

  git(repoRoot, ["init"])
  git(repoRoot, ["config", "user.name", "GSD Test"])
  git(repoRoot, ["config", "user.email", "gsd-test@example.com"])
  git(repoRoot, ["add", "."])
  git(repoRoot, ["commit", "-m", "initial"])

  writeFileSync(join(projectCwd, "staged.txt"), "baseline staged\nnext staged line\n")
  git(repoRoot, ["add", "apps/current-project/staged.txt"])
  writeFileSync(join(projectCwd, "dirty.txt"), "baseline dirty\nnext dirty line\n")
  writeFileSync(join(projectCwd, "untracked.txt"), "brand new\n")
  writeFileSync(join(docsDir, "outside.txt"), "baseline outside\noutside change\n")

  const authoritativeRepoRoot = resolve(git(projectCwd, ["rev-parse", "--show-toplevel"]))

  await withProjectGitEnv(projectCwd, async () => {
    const response = await gitRoute.GET()
    assert.equal(response.status, 200)

    const payload = await response.json() as any
    assert.equal(payload.kind, "repo")
    assert.equal(payload.project.scope, "current_project")
    assert.equal(payload.project.cwd, projectCwd)
    assert.equal(payload.project.repoRoot, authoritativeRepoRoot)
    assert.equal(payload.project.repoRelativePath, "apps/current-project")
    assert.equal(payload.hasChanges, true)
    assert.equal(payload.counts.changed, 3)
    assert.equal(payload.counts.staged, 1)
    assert.equal(payload.counts.dirty, 1)
    assert.equal(payload.counts.untracked, 1)
    assert.equal(payload.counts.conflicts, 0)
    assert.equal(payload.changedFiles.some((file: any) => file.repoPath === "docs/outside.txt"), false)
    assert.deepEqual(
      payload.changedFiles.map((file: any) => file.path).sort(),
      ["dirty.txt", "staged.txt", "untracked.txt"],
    )
  })
})

test("/api/git exposes an explicit not-a-repo state instead of failing silently", async (t) => {
  const projectCwd = mkdtempSync(join(tmpdir(), "gsd-web-not-repo-"))

  t.after(() => { rmSync(projectCwd, { recursive: true, force: true }) });

  await withProjectGitEnv(projectCwd, async () => {
    const response = await gitRoute.GET()
    assert.equal(response.status, 200)

    const payload = await response.json() as any
    assert.equal(payload.kind, "not_repo")
    assert.equal(payload.project.scope, "current_project")
    assert.equal(payload.project.cwd, projectCwd)
    assert.equal(payload.project.repoRoot, null)
    assert.match(payload.message, /not inside a Git repository/i)
  })
})

test("browser session, settings, and git surfaces keep inspectable state through contracts and store actions", () => {
  const {
    applyCommandSurfaceActionResult,
    createInitialCommandSurfaceState,
    setCommandSurfacePending,
  } = commandSurfaceContract

  const initial = createInitialCommandSurfaceState()
  assert.equal(initial.gitSummary.loaded, false)
  assert.equal(initial.sessionBrowser.loaded, false)
  assert.equal(initial.resumeRequest.pending, false)
  assert.equal(initial.renameRequest.pending, false)
  assert.equal(initial.settingsRequests.autoRetry.pending, false)

  const pendingGit = setCommandSurfacePending(initial, "load_git_summary")
  assert.equal(pendingGit.pendingAction, "load_git_summary")
  assert.equal(pendingGit.gitSummary.pending, true)

  const loadedGit = applyCommandSurfaceActionResult(pendingGit, {
    action: "load_git_summary",
    success: true,
    message: "",
    gitSummary: {
      pending: false,
      loaded: true,
      result: {
        kind: "not_repo",
        project: {
          scope: "current_project",
          cwd: "/tmp/project",
          repoRoot: null,
          repoRelativePath: null,
        },
        message: "not inside a Git repository",
      },
      error: null,
    },
  })
  assert.equal(loadedGit.gitSummary.loaded, true)
  assert.equal(loadedGit.gitSummary.result?.kind, "not_repo")

  const store = new GSDWorkspaceStore("/tmp/project")
  assert.equal(typeof store.loadGitSummary, "function")
  assert.equal(typeof store.renameSessionFromSurface, "function")
  assert.equal(typeof store.switchSessionFromSurface, "function")
  assert.equal(typeof store.setSteeringModeFromSurface, "function")
  assert.equal(typeof store.setFollowUpModeFromSurface, "function")
  assert.equal(typeof store.setAutoCompactionFromSurface, "function")
  assert.equal(typeof store.setAutoRetryFromSurface, "function")
  assert.equal(typeof store.abortRetryFromSurface, "function")
})
