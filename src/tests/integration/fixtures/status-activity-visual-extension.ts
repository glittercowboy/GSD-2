import type { ExtensionAPI } from "@gsd/pi-coding-agent";

const PHASE_ONE = "VISUAL-SPIN-PHASE-1";
const PHASE_TWO = "VISUAL-SPIN-PHASE-2";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function statusActivityVisualExtension(pi: ExtensionAPI): void {
  pi.registerCommand("sv", {
    description: "Test-only command that exercises the status activity spinner",
    handler: async (_args, ctx) => {
      await ctx.ui.activity.run(async () => {
        await sleep(450);
        const update = ctx.ui.activity.start({
          owner: "test.visual.phase2",
          lane: "status",
          message: PHASE_TWO,
        });
        await sleep(450);
        update.stop();
      }, { owner: "test.visual.phase1", lane: "status", message: PHASE_ONE });
    },
  });
}
