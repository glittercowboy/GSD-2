import type { ExtensionAPI } from "@gsd/pi-coding-agent";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function animationManualExtension(pi: ExtensionAPI): void {
	pi.registerCommand("anim-help", {
		description: "Show manual animation verification commands",
		handler: async (_args, ctx) => {
			ctx.ui.notify(
				[
					"Animation manual checklist:",
					"/anim-all          -> run full animation sweep end-to-end",
					"/sv                -> status lane visual spinner",
					"/anim-status       -> status lane updates/progress",
					"/anim-branch-summary -> branch summarization status flow",
					"/anim-compaction   -> compaction status flow",
					"/anim-auto-compaction -> auto-compaction status flow",
					"/anim-auto-retry   -> auto-retry status flow",
					"/anim-share        -> share modal flow",
					"/anim-modal        -> modal lane editor replacement",
					"/anim-countdown    -> countdown timeout dialog",
					"!sleep 3           -> inline lane bash spinner",
					"/arminsayshi       -> decorative animation (armin)",
					"/daxnuts           -> decorative animation (daxnuts)",
					"/reload            -> modal reload animation",
				].join("\n"),
				"info",
			);
		},
	});

	pi.registerCommand("anim-all", {
		description: "Run all animation lanes in one command",
		handler: async (_args, ctx) => {
			ctx.ui.notify("ANIM-ALL: starting full animation sweep", "info");

			const status = ctx.ui.activity.start({
				owner: "manual.anim.all.status",
				lane: "status",
				message: "ANIM-ALL STATUS-PHASE-1",
				progress: 0,
			});
			await sleep(450);
			status.setProgress(35);
			status.setMessage("ANIM-ALL STATUS-PHASE-2");
			await sleep(450);
			status.setProgress(70);
			status.setMessage("ANIM-ALL STATUS-PHASE-3");
			await sleep(450);
			status.succeed("ANIM-ALL STATUS-DONE");

			const statusPhases: Array<{ owner: string; message: string; done: string }> = [
				{
					owner: "manual.anim.all.branch_summary",
					message: "Summarizing branch... (Esc to cancel)",
					done: "Branch summary done",
				},
				{
					owner: "manual.anim.all.compaction",
					message: "Compacting context... (Esc to cancel)",
					done: "Compaction done",
				},
				{
					owner: "manual.anim.all.auto_compaction",
					message: "Auto-compacting... (Esc to cancel)",
					done: "Auto-compaction done",
				},
			];
			for (const phase of statusPhases) {
				const activity = ctx.ui.activity.start({
					owner: phase.owner,
					lane: "status",
					message: phase.message,
				});
				await sleep(900);
				activity.succeed(phase.done);
			}

			const retry = ctx.ui.activity.start({
				owner: "manual.anim.all.auto_retry",
				lane: "status",
				message: "Retrying (1/3) in 3s... (Esc to cancel)",
			});
			await sleep(600);
			retry.setMessage("Retrying (2/3) in 2s... (Esc to cancel)");
			await sleep(600);
			retry.setMessage("Retrying (3/3) in 1s... (Esc to cancel)");
			await sleep(600);
			retry.succeed("Retry done");

			const share = ctx.ui.activity.start({
				owner: "manual.anim.all.share",
				lane: "modal",
				message: "Creating gist...",
			});
			await sleep(1000);
			share.succeed("Share complete");

			const modal = ctx.ui.activity.start({
				owner: "manual.anim.all.modal",
				lane: "modal",
				message: "ANIM-ALL MODAL-PHASE-1",
				progress: 0,
			});
			await sleep(500);
			modal.setProgress(40);
			modal.setMessage("ANIM-ALL MODAL-PHASE-2");
			await sleep(500);
			modal.setProgress(80);
			modal.setMessage("ANIM-ALL MODAL-PHASE-3");
			await sleep(500);
			modal.succeed("ANIM-ALL MODAL-DONE");

			const confirmed = await ctx.ui.confirm("ANIM-ALL COUNTDOWN", "Auto-closes after timeout", {
				timeout: 5000,
			});
			ctx.ui.notify(`ANIM-ALL COUNTDOWN RESULT: ${confirmed ? "confirmed" : "timed-out/cancelled"}`, "info");

			const inline = ctx.ui.activity.start({
				owner: "manual.anim.all.inline",
				lane: "inline",
				key: "manual-inline-all",
				message: "ANIM-ALL INLINE-PHASE-1",
				progress: 0,
			});
			await sleep(400);
			inline.setProgress(50);
			inline.setMessage("ANIM-ALL INLINE-PHASE-2");
			await sleep(400);
			inline.succeed("ANIM-ALL INLINE-DONE");

			const decorative = ctx.ui.activity.start({
				owner: "manual.anim.all.decorative",
				lane: "decorative",
				key: "manual-decorative-all",
				message: "ANIM-ALL DECORATIVE-PHASE-1",
				progress: 0,
			});
			await sleep(350);
			decorative.setProgress(50);
			decorative.setMessage("ANIM-ALL DECORATIVE-PHASE-2");
			await sleep(350);
			decorative.succeed("ANIM-ALL DECORATIVE-DONE");

			ctx.ui.notify(
				[
					"ANIM-ALL complete.",
					"Optional visual extras not invokable from extension commands:",
					"!sleep 3",
					"/arminsayshi",
					"/daxnuts",
					"/reload",
				].join("\n"),
				"success",
			);
		},
	});

	pi.registerCommand("anim-status", {
		description: "Status lane with progress/message transitions",
		handler: async (_args, ctx) => {
			const activity = ctx.ui.activity.start({
				owner: "manual.anim.status",
				lane: "status",
				message: "STATUS-PHASE-1",
				progress: 0,
			});
			await sleep(450);
			activity.setProgress(35);
			activity.setMessage("STATUS-PHASE-2");
			await sleep(450);
			activity.setProgress(70);
			activity.setMessage("STATUS-PHASE-3");
			await sleep(450);
			activity.succeed("STATUS-DONE");
		},
	});

	pi.registerCommand("anim-modal", {
		description: "Modal lane (replaces editor) with phased updates",
		handler: async (_args, ctx) => {
			const activity = ctx.ui.activity.start({
				owner: "manual.anim.modal",
				lane: "modal",
				message: "MODAL-PHASE-1",
				progress: 0,
			});
			await sleep(500);
			activity.setProgress(40);
			activity.setMessage("MODAL-PHASE-2");
			await sleep(500);
			activity.setProgress(80);
			activity.setMessage("MODAL-PHASE-3");
			await sleep(500);
			activity.succeed("MODAL-DONE");
		},
	});

	pi.registerCommand("anim-branch-summary", {
		description: "Branch summary status flow",
		handler: async (_args, ctx) => {
			const activity = ctx.ui.activity.start({
				owner: "manual.anim.branch_summary",
				lane: "status",
				message: "Summarizing branch... (Esc to cancel)",
			});
			await sleep(1200);
			activity.succeed("Branch summary done");
		},
	});

	pi.registerCommand("anim-compaction", {
		description: "Compaction status flow",
		handler: async (_args, ctx) => {
			const activity = ctx.ui.activity.start({
				owner: "manual.anim.compaction",
				lane: "status",
				message: "Compacting context... (Esc to cancel)",
			});
			await sleep(1200);
			activity.succeed("Compaction done");
		},
	});

	pi.registerCommand("anim-auto-compaction", {
		description: "Auto-compaction status flow",
		handler: async (_args, ctx) => {
			const activity = ctx.ui.activity.start({
				owner: "manual.anim.auto_compaction",
				lane: "status",
				message: "Auto-compacting... (Esc to cancel)",
			});
			await sleep(1200);
			activity.succeed("Auto-compaction done");
		},
	});

	pi.registerCommand("anim-auto-retry", {
		description: "Auto-retry status flow",
		handler: async (_args, ctx) => {
			const activity = ctx.ui.activity.start({
				owner: "manual.anim.auto_retry",
				lane: "status",
				message: "Retrying (1/3) in 3s... (Esc to cancel)",
			});
			await sleep(600);
			activity.setMessage("Retrying (2/3) in 2s... (Esc to cancel)");
			await sleep(600);
			activity.setMessage("Retrying (3/3) in 1s... (Esc to cancel)");
			await sleep(600);
			activity.succeed("Retry done");
		},
	});

	pi.registerCommand("anim-share", {
		description: "Share modal flow",
		handler: async (_args, ctx) => {
			const activity = ctx.ui.activity.start({
				owner: "manual.anim.share",
				lane: "modal",
				message: "Creating gist...",
			});
			await sleep(1000);
			activity.succeed("Share complete");
		},
	});

	pi.registerCommand("anim-countdown", {
		description: "Countdown dialog timeout path",
		handler: async (_args, ctx) => {
			const confirmed = await ctx.ui.confirm("COUNTDOWN TEST", "Wait for timeout to auto-cancel", { timeout: 5000 });
			ctx.ui.notify(`COUNTDOWN RESULT: ${confirmed ? "confirmed" : "timed-out/cancelled"}`, "info");
		},
	});

	pi.registerCommand("anim-inline", {
		description: "Inline lane lifecycle (state-only lane in current TUI)",
		handler: async (_args, ctx) => {
			const activity = ctx.ui.activity.start({
				owner: "manual.anim.inline",
				lane: "inline",
				key: "manual-inline",
				message: "INLINE-PHASE-1",
				progress: 0,
			});
			await sleep(400);
			activity.setProgress(50);
			activity.setMessage("INLINE-PHASE-2");
			await sleep(400);
			activity.succeed("INLINE-DONE");
			ctx.ui.notify("INLINE lane lifecycle emitted (bash command shows inline visuals)", "info");
		},
	});

	pi.registerCommand("anim-decorative", {
		description: "Decorative lane lifecycle (state-only lane in current TUI)",
		handler: async (_args, ctx) => {
			const activity = ctx.ui.activity.start({
				owner: "manual.anim.decorative",
				lane: "decorative",
				key: "manual-decorative",
				message: "DECORATIVE-PHASE-1",
				progress: 0,
			});
			await sleep(350);
			activity.setProgress(50);
			activity.setMessage("DECORATIVE-PHASE-2");
			await sleep(350);
			activity.succeed("DECORATIVE-DONE");
			ctx.ui.notify("DECORATIVE lane lifecycle emitted (/arminsayshi and /daxnuts are visual)", "info");
		},
	});
}
