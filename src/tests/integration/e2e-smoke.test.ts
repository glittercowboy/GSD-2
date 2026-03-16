/**
 * E2E smoke tests for the GSD CLI binary (dist/loader.js).
 *
 * These tests exercise the CLI entry point as a black box by spawning child
 * processes and asserting on exit codes and output text.  They do NOT require
 * API keys; tests that depend on a live LLM are scoped to gracefully handle
 * the "No model selected" error path.
 *
 * Prerequisite: npm run build must be run first.
 *
 * Run with:
 *   node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs \
 *        --experimental-strip-types --test \
 *        src/tests/integration/e2e-smoke.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const projectRoot = process.cwd();
const loaderPath = join(projectRoot, "dist", "loader.js");

if (!existsSync(loaderPath)) {
  throw new Error("dist/loader.js not found — run: npm run build");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RunResult = {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
};

/**
 * Spawn `node dist/loader.js ...args` and collect output.
 *
 * @param args    CLI arguments to pass after the script path
 * @param timeoutMs  Maximum time to wait before SIGTERM (default 8 s)
 * @param env     Additional / override environment variables
 */
function runGsd(
  args: string[],
  timeoutMs = 8_000,
  env: NodeJS.ProcessEnv = {},
): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn("node", [loaderPath, ...args], {
      cwd: projectRoot,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    // Close stdin so the process sees a non-TTY environment.
    child.stdin.end();

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut });
    });
  });
}

/** Strip ANSI escape codes from a string. */
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

// ---------------------------------------------------------------------------
// 1. gsd --version outputs a semver string and exits 0
// ---------------------------------------------------------------------------

test("gsd --version outputs a semver version string and exits 0", async () => {
  const result = await runGsd(["--version"]);

  assert.strictEqual(result.code, 0, `expected exit 0, got ${result.code}`);
  assert.ok(!result.timedOut, "process should not time out");

  const version = result.stdout.trim();
  // Semver: MAJOR.MINOR.PATCH with optional pre-release / build metadata
  assert.match(
    version,
    /^\d+\.\d+\.\d+/,
    `expected semver output, got: ${JSON.stringify(version)}`,
  );
});

// ---------------------------------------------------------------------------
// 2. gsd --help outputs usage information and exits 0
// ---------------------------------------------------------------------------

test("gsd --help outputs usage information and exits 0", async () => {
  const result = await runGsd(["--help"]);

  assert.strictEqual(result.code, 0, `expected exit 0, got ${result.code}`);
  assert.ok(!result.timedOut, "process should not time out");

  const output = stripAnsi(result.stdout);

  assert.ok(
    output.includes("Usage:"),
    `expected 'Usage:' in help output, got:\n${output.slice(0, 500)}`,
  );
  assert.ok(
    output.includes("--version"),
    "help output should mention --version flag",
  );
  assert.ok(
    output.includes("--help"),
    "help output should mention --help flag",
  );
  assert.ok(
    output.includes("--print"),
    "help output should mention --print flag",
  );
  assert.ok(
    output.includes("--list-models"),
    "help output should mention --list-models flag",
  );
});

// ---------------------------------------------------------------------------
// 3. gsd config --help outputs config-specific or general help and exits 0
// ---------------------------------------------------------------------------

test("gsd config --help outputs help and exits 0", async () => {
  const result = await runGsd(["config", "--help"]);

  assert.strictEqual(result.code, 0, `expected exit 0, got ${result.code}`);
  assert.ok(!result.timedOut, "process should not time out");

  // The loader fast-path intercepts --help only when it is the first argument.
  // "config --help" passes through to cli.js where parseCliArgs() encounters
  // --help and calls printHelp(), producing the full usage text.
  const output = stripAnsi(result.stdout);
  assert.ok(
    output.includes("Usage:"),
    `expected 'Usage:' in output, got:\n${output.slice(0, 500)}`,
  );
});

// ---------------------------------------------------------------------------
// 4. gsd update --help outputs update-specific or general help and exits 0
// ---------------------------------------------------------------------------

test("gsd update --help outputs help and exits 0", async () => {
  const result = await runGsd(["update", "--help"]);

  assert.strictEqual(result.code, 0, `expected exit 0, got ${result.code}`);
  assert.ok(!result.timedOut, "process should not time out");

  const output = stripAnsi(result.stdout);
  assert.ok(
    output.includes("Usage:"),
    `expected 'Usage:' in output, got:\n${output.slice(0, 500)}`,
  );
});

// ---------------------------------------------------------------------------
// 5. gsd --list-models runs without crashing
// ---------------------------------------------------------------------------

test("gsd --list-models runs without crashing", async () => {
  const result = await runGsd(["--list-models"]);

  assert.ok(!result.timedOut, "gsd --list-models should exit within the timeout");
  assert.strictEqual(result.code, 0, `expected exit 0, got ${result.code}`);

  // No unhandled crash markers
  const combinedOutput = stripAnsi(result.stdout + result.stderr);
  assert.ok(
    !combinedOutput.includes("Error: Cannot find module"),
    "should not have missing module errors",
  );
  assert.ok(
    !combinedOutput.includes("ERR_MODULE_NOT_FOUND"),
    "should not have ERR_MODULE_NOT_FOUND",
  );

  // Either a table of models or the "no models" message
  const hasTable = result.stdout.includes("provider") || result.stdout.includes("model");
  const hasNoModelsMsg = result.stdout.includes("No models available");
  assert.ok(
    hasTable || hasNoModelsMsg,
    `expected model list or 'No models available', got stdout:\n${result.stdout.slice(0, 300)}`,
  );
});

// ---------------------------------------------------------------------------
// 6. gsd --print in text mode does not segfault or throw unhandled errors
//    (may fail with "No model selected" when no API keys are configured)
// ---------------------------------------------------------------------------

test("gsd --mode text --print does not segfault or throw unhandled errors", { skip: !process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY ? "no API key available — print mode requires a configured provider" : undefined }, async () => {
  const result = await runGsd(
    ["--mode", "text", "--print", "echo hello"],
    15_000,
  );

  assert.ok(!result.timedOut, "gsd --print should not hang indefinitely");

  const combinedOutput = stripAnsi(result.stdout + result.stderr);

  // Must not crash with module-not-found errors
  assert.ok(
    !combinedOutput.includes("ERR_MODULE_NOT_FOUND"),
    "should not have ERR_MODULE_NOT_FOUND",
  );
  assert.ok(
    !combinedOutput.includes("Error: Cannot find module"),
    "should not have missing module errors",
  );

  // Must not terminate from a fatal signal (SIGSEGV, SIGABRT, etc.)
  // Node exits with 128 + signal number on signal termination.
  // SIGTERM is 15 (128+15=143), but we sent SIGTERM ourselves only on timeout,
  // and we already asserted timedOut is false above.
  assert.ok(
    result.code !== null,
    "process should exit cleanly, not be killed by a signal",
  );

  // Acceptable exit codes: 0 (success) or 1 (no model / API key error)
  const acceptableCodes = new Set([0, 1]);
  assert.ok(
    acceptableCodes.has(result.code as number),
    `expected exit code 0 or 1, got ${result.code}.\nstdout: ${result.stdout.slice(0, 300)}\nstderr: ${combinedOutput.slice(0, 300)}`,
  );

  // If exit code is 1, verify it's a clean error (no stack traces from
  // unhandled exceptions). The specific error message varies by environment.
  if (result.code === 1) {
    const combined = stripAnsi(result.stdout + result.stderr);
    const hasUnhandledCrash =
      combined.includes("SyntaxError:") ||
      combined.includes("ReferenceError:") ||
      combined.includes("TypeError: Cannot read") ||
      combined.includes("FATAL ERROR");

    assert.ok(
      !hasUnhandledCrash,
      `exit 1 should be a clean error, not an unhandled crash:\n${combined.slice(0, 500)}`,
    );
  }
});
