import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rewriteCommandWithRtk } from "../rtk.js";
import type { spawnSync } from "node:child_process";

type SpawnSyncImpl = typeof spawnSync;

const makeSpawn = (status: number, stdout: string): SpawnSyncImpl =>
  ((_bin: string, _args: string[]) => ({
    status,
    stdout,
    stderr: "",
    output: [],
    pid: 0,
    signal: null,
    error: undefined,
  })) as unknown as SpawnSyncImpl;

describe("rewriteCommandWithRtk (shared extension)", () => {
  it("rewrites command when spawn returns exit 0", () => {
    assert.equal(
      rewriteCommandWithRtk("git status", { binaryPath: "/fake/rtk", spawnSyncImpl: makeSpawn(0, "rtk git status") }),
      "rtk git status",
    );
  });

  it("rewrites command when spawn returns exit 3 (ask mode)", () => {
    assert.equal(
      rewriteCommandWithRtk("npm run test", { binaryPath: "/fake/rtk", spawnSyncImpl: makeSpawn(3, "rtk npm run test") }),
      "rtk npm run test",
    );
  });

  it("passes command through when spawn returns non-zero non-3 status", () => {
    assert.equal(
      rewriteCommandWithRtk("echo hello", { binaryPath: "/fake/rtk", spawnSyncImpl: makeSpawn(1, "") }),
      "echo hello",
    );
  });

  it("passes command through when spawn errors", () => {
    const failingSpawn = ((_bin: string, _args: string[]) => ({
      status: null,
      stdout: "",
      stderr: "",
      output: [],
      pid: 0,
      signal: null,
      error: new Error("spawn failed"),
    })) as unknown as SpawnSyncImpl;
    assert.equal(
      rewriteCommandWithRtk("git status", { binaryPath: "/fake/rtk", spawnSyncImpl: failingSpawn }),
      "git status",
    );
  });

  it("passes command through when RTK is disabled via env", () => {
    const shouldNotRun = (() => { throw new Error("should not be called"); }) as unknown as SpawnSyncImpl;
    assert.equal(
      rewriteCommandWithRtk("git status", { binaryPath: "/fake/rtk", spawnSyncImpl: shouldNotRun, env: { GSD_RTK_DISABLED: "1" } }),
      "git status",
    );
  });

  it("passes command through when no binary resolves", () => {
    assert.equal(
      rewriteCommandWithRtk("git status", { env: { GSD_HOME: "/nonexistent" }, spawnSyncImpl: makeSpawn(0, "rtk git status") }),
      "git status",
    );
  });

  it("trims trailing whitespace from rewritten command", () => {
    assert.equal(
      rewriteCommandWithRtk("git status", { binaryPath: "/fake/rtk", spawnSyncImpl: makeSpawn(0, "rtk git status  \n") }),
      "rtk git status",
    );
  });

  it("falls back to original when spawn returns empty stdout", () => {
    assert.equal(
      rewriteCommandWithRtk("git status", { binaryPath: "/fake/rtk", spawnSyncImpl: makeSpawn(0, "") }),
      "git status",
    );
  });

  it("returns whitespace-only command unchanged without spawning", () => {
    const shouldNotRun = (() => { throw new Error("should not be called"); }) as unknown as SpawnSyncImpl;
    assert.equal(rewriteCommandWithRtk("  ", { binaryPath: "/fake/rtk", spawnSyncImpl: shouldNotRun }), "  ");
  });
});
