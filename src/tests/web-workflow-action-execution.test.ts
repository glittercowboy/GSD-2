import test from "node:test"
import assert from "node:assert/strict"

const {
  derivePendingWorkflowCommandLabel,
  executeWorkflowActionInPowerMode,
  navigateToGSDView,
} = await import("../../web/lib/workflow-action-execution.ts")

test("derivePendingWorkflowCommandLabel prefers the latest input line while a command is in flight", () => {
  const label = derivePendingWorkflowCommandLabel({
    commandInFlight: "prompt",
    terminalLines: [
      { id: "1", timestamp: "12:00", type: "system", content: "Bridge ready" },
      { id: "2", timestamp: "12:01", type: "input", content: "/gsd" },
      { id: "3", timestamp: "12:02", type: "system", content: "Working…" },
    ],
  })

  assert.equal(label, "/gsd")
})

test("derivePendingWorkflowCommandLabel falls back to the command type when no input line exists", () => {
  const label = derivePendingWorkflowCommandLabel({
    commandInFlight: "abort",
    terminalLines: [],
  })

  assert.equal(label, "/abort")
})

test("navigateToGSDView dispatches the shared browser navigation event", () => {
  const originalWindow = (globalThis as { window?: EventTarget }).window
  const fakeWindow = new EventTarget()
  const seen: string[] = []

  fakeWindow.addEventListener("gsd:navigate-view", (event: Event) => {
    seen.push((event as CustomEvent<{ view: string }>).detail.view)
  })

  ;(globalThis as { window?: EventTarget }).window = fakeWindow

  try {
    navigateToGSDView("power")
  } finally {
    ;(globalThis as { window?: EventTarget }).window = originalWindow
  }

  assert.deepEqual(seen, ["power"])
})

test("executeWorkflowActionInPowerMode posts the workflow command to the main-session terminal and navigates to power mode", async () => {
  const originalWindow = (globalThis as { window?: EventTarget }).window
  const originalFetch = globalThis.fetch
  const fakeWindow = new EventTarget()
  const seenViews: string[] = []
  const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

  fakeWindow.addEventListener("gsd:navigate-view", (event: Event) => {
    seenViews.push((event as CustomEvent<{ view: string }>).detail.view)
  })

  ;(globalThis as { window?: EventTarget }).window = fakeWindow
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ input, init })
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }) as typeof fetch

  try {
    await executeWorkflowActionInPowerMode({
      command: "/gsd",
      projectCwd: "/tmp/project-alpha",
    })
  } finally {
    ;(globalThis as { window?: EventTarget }).window = originalWindow
    globalThis.fetch = originalFetch
  }

  assert.deepEqual(seenViews, ["power"])
  assert.equal(fetchCalls.length, 1)
  assert.equal(String(fetchCalls[0]?.input), "/api/bridge-terminal/input?project=%2Ftmp%2Fproject-alpha")
  assert.equal(fetchCalls[0]?.init?.method, "POST")
  assert.equal(fetchCalls[0]?.init?.headers && (fetchCalls[0].init.headers as Record<string, string>)["Content-Type"], "application/json")

  const body = JSON.parse(String(fetchCalls[0]?.init?.body)) as { data: string }
  assert.equal(body.data, "/gsd\r")
})
