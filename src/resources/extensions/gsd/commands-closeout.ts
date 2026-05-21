// Project/App: GSD-2
// File Purpose: Handles /gsd closeout recovery commands for failed git closeout.

import type { ExtensionCommandContext } from "@gsd/pi-coding-agent";

import { ensureDbOpen } from "./bootstrap/dynamic-tools.js";
import {
  formatCloseoutAutoBlockMessage,
  listCloseoutFailures,
  listUnresolvedCloseoutFailures,
  markLatestCloseoutFailureResolved,
  retryLatestCloseoutFailure,
  type CloseoutFailureRecord,
} from "./closeout-recovery.js";

const USAGE = [
  "Usage: /gsd closeout [status|retry|resolve] [unit-id]",
  "",
  "  status   Show unresolved git closeout failures",
  "  retry    Retry the latest failed closeout git action",
  "  resolve  Mark the latest failure resolved after the worktree is clean",
].join("\n");

function formatRecord(record: CloseoutFailureRecord): string {
  const unit = [record.unitType, record.unitId].filter(Boolean).join(" ");
  const firstErrorLine = record.error.split(/\r?\n/, 1)[0] ?? record.error;
  return [
    `- ${unit || record.turnId}`,
    `  action: ${record.action}`,
    `  updated: ${record.updatedAt || "(unknown)"}`,
    `  error: ${firstErrorLine || "(none recorded)"}`,
  ].join("\n");
}

async function ensureCloseoutDb(ctx: ExtensionCommandContext, basePath: string): Promise<boolean> {
  if (await ensureDbOpen(basePath)) return true;
  ctx.ui.notify("Closeout recovery could not open the GSD database for this project.", "error");
  return false;
}

export async function handleCloseout(args: string, ctx: ExtensionCommandContext, basePath: string): Promise<void> {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  const subcommand = parts[0] ?? "status";
  const unitId = parts[1];

  if (!["status", "retry", "resolve", "help", "--help", "-h"].includes(subcommand)) {
    ctx.ui.notify(USAGE, "warning");
    return;
  }

  if (subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    ctx.ui.notify(USAGE, "info");
    return;
  }

  if (!(await ensureCloseoutDb(ctx, basePath))) return;

  if (subcommand === "status") {
    const unresolved = listUnresolvedCloseoutFailures();
    if (unresolved.length === 0) {
      const total = listCloseoutFailures().length;
      ctx.ui.notify(
        total > 0
          ? `No unresolved closeout git failures. ${total} historical failure record(s) are resolved.`
          : "No closeout git failures recorded.",
        "info",
      );
      return;
    }
    ctx.ui.notify(
      [
        formatCloseoutAutoBlockMessage(unresolved.length),
        "",
        ...unresolved.slice(0, 10).map(formatRecord),
      ].join("\n"),
      "warning",
    );
    return;
  }

  if (subcommand === "retry") {
    const result = retryLatestCloseoutFailure(basePath, unitId);
    if (result.status === "not-found") {
      ctx.ui.notify(result.message, "info");
      return;
    }
    if (result.status === "ok") {
      const subject = result.gitResult.commitMessage?.split("\n", 1)[0] ?? `${result.gitResult.action} completed`;
      ctx.ui.notify(`Closeout retry succeeded for ${result.record.unitId} in ${result.basePath}: ${subject}`, "info");
      return;
    }
    ctx.ui.notify(
      `Closeout retry failed for ${result.record.unitId}: ${result.gitResult.error ?? "unknown git failure"}`,
      "error",
    );
    return;
  }

  const result = markLatestCloseoutFailureResolved(basePath, unitId);
  if (result.status === "not-found") {
    ctx.ui.notify(result.message, "info");
    return;
  }
  if (result.status === "blocked") {
    ctx.ui.notify(result.message, "error");
    return;
  }
  ctx.ui.notify(`Closeout failure resolved for ${result.record.unitId}. Auto-mode can resume.`, "info");
}
