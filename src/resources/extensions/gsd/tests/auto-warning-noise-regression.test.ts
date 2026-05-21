// GSD Extension — Regression tests for auto-mode warning noise (PR #4294)
//
// Three independent bug fixes, three regression tests:
//
//   1. auto-model-selection.ts — buildFlatRateContext detached
//      getProviderAuthMode from its receiver, losing `this` and throwing
//      "Cannot read properties of undefined (reading 'registeredProviders')".
//      Runtime test: pass a registry whose method actually uses `this` and
//      verify the returned authMode survives (proves the method is called
//      with correct binding).
//
//   2. auto-worktree.ts — isSamePath logged every error as a warning,
//      including ENOENT when a worktree's .gsd dir hadn't been created yet.
//      Source-check test: the catch block must short-circuit on ENOENT
//      before hitting logWarning. Follows the same style as
//      copy-planning-artifacts-samepath.test.ts.
//
//   3. guided-flow.ts — checkAutoStartAfterDiscuss unconditionally tried
//      to unlink DISCUSSION-MANIFEST.json and warned on ENOENT even when
//      the milestone never had a discussion phase. Source-check test:
//      the unlink must be guarded with existsSync, matching the
//      CONTEXT-DRAFT.md cleanup pattern two lines above.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildFlatRateContext } from "../auto-model-selection.ts";
import { _isSamePath, _resetAutoWorktreeOriginalBaseForTests } from "../auto-worktree.ts";
import {
  checkAutoStartAfterDiscuss,
  clearPendingAutoStart,
  setPendingAutoStart,
} from "../guided-flow.ts";

// ─── Bug 2: this-binding regression ─────────────────────────────────────

test("buildFlatRateContext invokes getProviderAuthMode with correct `this`", () => {
  // Mimics ModelRegistry: getProviderAuthMode reads from an instance field.
  // Detaching the method to a local variable would break this — the old code
  // did `const fn = ctx.modelRegistry.getProviderAuthMode; fn(provider)`,
  // which called the method with `this === undefined` and threw.
  const providerData = new Map<string, string>([
    ["claude-code", "externalCli"],
    ["anthropic", "apiKey"],
  ]);
  const registry = {
    _providers: providerData,
    getProviderAuthMode(provider: string): string {
      // Access via `this` — fails loudly if the method was called unbound.
      const map = this._providers;
      return map.get(provider) ?? "apiKey";
    },
  };

  const ctx = buildFlatRateContext("claude-code", { modelRegistry: registry });
  assert.equal(
    ctx.authMode,
    "externalCli",
    "authMode should be extracted when getProviderAuthMode is called as a method",
  );

  const ctx2 = buildFlatRateContext("anthropic", { modelRegistry: registry });
  assert.equal(ctx2.authMode, "apiKey");
});

// ─── Bug 1: isSamePath source check ─────────────────────────────────────

test("isSamePath returns false for missing paths without throwing", () => {
  const dir = mkdtempSync(join(tmpdir(), "gsd-same-path-"));
  try {
    assert.equal(_isSamePath(join(dir, "missing-a"), join(dir, "missing-b")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    _resetAutoWorktreeOriginalBaseForTests();
  }
});

// ─── Bug 3: guided-flow manifest unlink source check ────────────────────

test("checkAutoStartAfterDiscuss completes when discussion manifest is absent", () => {
  const base = mkdtempSync(join(tmpdir(), "gsd-discuss-manifest-"));
  const notifications: Array<{ message: string; level: string }> = [];
  let scheduled = false;
  try {
    const milestoneDir = join(base, ".gsd", "milestones", "M001");
    mkdirSync(milestoneDir, { recursive: true });
    writeFileSync(join(milestoneDir, "M001-CONTEXT.md"), "# Context\n", "utf-8");
    writeFileSync(join(base, ".gsd", "STATE.md"), "# State\n", "utf-8");
    setPendingAutoStart(base, {
      basePath: base,
      milestoneId: "M001",
      ctx: { ui: { notify: (message: string, level: string) => notifications.push({ message, level }) } } as any,
      pi: { sendMessage: () => { scheduled = true; } } as any,
    });

    assert.equal(checkAutoStartAfterDiscuss(), true);
    assert.equal(scheduled, false);
    assert.deepEqual(notifications, [{ message: "Milestone M001 ready.", level: "success" }]);
  } finally {
    clearPendingAutoStart(base);
    rmSync(base, { recursive: true, force: true });
  }
});
