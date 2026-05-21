// Project/App: GSD-2
// File Purpose: Shared command gate for validation-blocked milestones.

import { existsSync } from "node:fs";

import { getAutoWorktreePath, isInAutoWorktree } from "./auto-worktree.js";
import { ensureDbOpen } from "./bootstrap/dynamic-tools.js";
import { getIsolationMode } from "./preferences.js";
import { deriveState } from "./state.js";
import type { GSDState } from "./types.js";
import { detectWorktreeName } from "./worktree.js";

const VALIDATION_BLOCK_RE =
  /milestone validation returned needs-(?:attention|remediation)|validation verdict is needs-(?:attention|remediation)/i;

const ALLOWED_COMMANDS = new Set([
  "help",
  "h",
  "?",
  "status",
  "verdict",
  "validate-milestone",
  "park",
  "logs",
  "notifications",
  "inspect",
  "doctor",
]);

export function isValidationBlockedState(state: GSDState): boolean {
  if (state.phase !== "blocked") return false;
  return state.blockers.some((blocker) => VALIDATION_BLOCK_RE.test(blocker));
}

export function isValidationBlockAllowedCommand(trimmed: string): boolean {
  const command = trimmed.trim();
  if (!command) return false;

  const [name, subcommand] = command.split(/\s+/, 2);
  if (name === "dispatch") {
    return subcommand === "validate" || subcommand === "validate-milestone";
  }
  return ALLOWED_COMMANDS.has(name);
}

export function formatValidationBlockedMessage(
  state: GSDState,
  attemptedCommand = "",
): string | null {
  if (!isValidationBlockedState(state)) return null;

  const commandLabel = attemptedCommand.trim()
    ? `/gsd ${attemptedCommand.trim()}`
    : "/gsd";
  const blockers = state.blockers.filter((blocker) => blocker.trim().length > 0);

  return [
    `${commandLabel} cannot run because the active milestone is blocked by validation.`,
    ...blockers,
  ].join("\n\n");
}

export async function getValidationBlockMessageForBase(
  base: string,
  attemptedCommand = "",
): Promise<string | null> {
  await ensureDbOpen(base);
  let state = await deriveState(base);

  if (
    state.activeMilestone &&
    getIsolationMode(base) === "worktree" &&
    !detectWorktreeName(base) &&
    !isInAutoWorktree(base)
  ) {
    const wtPath = getAutoWorktreePath(base, state.activeMilestone.id);
    if (wtPath && existsSync(wtPath)) {
      state = await deriveState(wtPath);
    }
  }

  return formatValidationBlockedMessage(state, attemptedCommand);
}
