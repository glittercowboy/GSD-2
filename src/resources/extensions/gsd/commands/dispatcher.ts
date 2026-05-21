// Project/App: GSD-2
// File Purpose: Routes /gsd commands through global guards and command handlers.

import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";

import { GSDNoProjectError, projectRoot, withCommandCwd } from "./context.js";
import { handleAutoCommand } from "./handlers/auto.js";
import { handleCoreCommand } from "./handlers/core.js";
import { handleOpsCommand } from "./handlers/ops.js";
import { handleParallelCommand } from "./handlers/parallel.js";
import { handleWorkflowCommand } from "./handlers/workflow.js";
import {
  getValidationBlockMessageForBase,
  isValidationBlockAllowedCommand,
} from "../validation-block-guard.js";
import {
  getUnmergedMilestoneBlockMessageForBase,
  isUnmergedMilestoneAllowedCommand,
} from "../unmerged-milestone-guard.js";
import { clearFreshGsdRunSurfaces, isFreshGsdWorkCommand } from "../fresh-run-ui.js";

function emitVisibleCommandBlock(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  message: string,
): void {
  if (pi && typeof pi.sendMessage === "function") {
    pi.sendMessage({
      customType: "gsd-command-block",
      content: message,
      display: true,
    });
    return;
  }
  ctx.ui.notify(message, "warning");
}

export async function handleGSDCommand(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const trimmed = (typeof args === "string" ? args : "").trim();

  const handlers = [
    () => handleCoreCommand(trimmed, ctx, pi),
    () => handleAutoCommand(trimmed, ctx, pi),
    () => handleParallelCommand(trimmed, ctx, pi),
    () => handleWorkflowCommand(trimmed, ctx, pi),
    () => handleOpsCommand(trimmed, ctx, pi),
  ];

  let handled = false;
  try {
    handled = await withCommandCwd(ctx.cwd, async () => {
      if (isFreshGsdWorkCommand(trimmed)) {
        clearFreshGsdRunSurfaces(ctx);
      }
      const base = projectRoot();
      if (!isUnmergedMilestoneAllowedCommand(trimmed)) {
        const blockedMessage = await getUnmergedMilestoneBlockMessageForBase(base, trimmed);
        if (blockedMessage) {
          emitVisibleCommandBlock(ctx, pi, blockedMessage);
          return true;
        }
      }
      if (!isValidationBlockAllowedCommand(trimmed)) {
        const blockedMessage = await getValidationBlockMessageForBase(base, trimmed);
        if (blockedMessage) {
          emitVisibleCommandBlock(ctx, pi, blockedMessage);
          return true;
        }
      }
      for (const handler of handlers) {
        if (await handler()) {
          return true;
        }
      }
      return false;
    });
  } catch (err) {
    if (err instanceof GSDNoProjectError) {
      ctx.ui.notify(
        `${err.message} \`cd\` into a project directory first.`,
        "warning",
      );
      return;
    }
    throw err;
  }

  if (handled) return;

  if (trimmed.includes(" ")) {
    const { handleDo } = await import("../commands-do.js");
    await handleDo(trimmed, ctx, pi);
    return;
  }

  ctx.ui.notify(`Unknown: /gsd ${trimmed}. Run /gsd help for available commands.`, "warning");
}
