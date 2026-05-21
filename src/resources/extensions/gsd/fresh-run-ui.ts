// Project/App: GSD-2
// File Purpose: Clears stale GSD run surfaces before starting new workflow work.

import type { ExtensionCommandContext } from "@gsd/pi-coding-agent";

const FRESH_RUN_COMMANDS = new Set([
  "",
  "auto",
  "next",
  "quick",
  "start",
  "new-milestone",
]);

const GSD_WIDGET_KEYS = [
  "gsd-outcome",
  "gsd-progress",
  "gsd-health",
];

const GSD_STATUS_KEYS = [
  "gsd-step",
  "gsd-auto",
];

export function isFreshGsdWorkCommand(trimmed: string): boolean {
  const command = trimmed.trim();
  if (!command) return true;

  const [name] = command.split(/\s+/, 1);
  if (FRESH_RUN_COMMANDS.has(name)) return true;
  return name === "do";
}

export function clearFreshGsdRunSurfaces(ctx: ExtensionCommandContext): void {
  const ui = ctx.ui;
  for (const key of GSD_WIDGET_KEYS) {
    ui.setWidget?.(key, undefined);
  }
  for (const key of GSD_STATUS_KEYS) {
    ui.setStatus?.(key, undefined);
  }
}
