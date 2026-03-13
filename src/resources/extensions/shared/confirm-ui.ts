/**
 * Themed yes/no confirmation dialog.
 *
 * Uses the shared UI design system for consistent styling.
 * Returns true if confirmed, false if declined.
 *
 * Usage:
 *
 *   import { showConfirm } from "./shared/confirm-ui.js";
 *
 *   const confirmed = await showConfirm(ctx, {
 *     title: "GitHub Action",
 *     message: 'Close issue #42?',
 *   });
 *   if (!confirmed) return textResult("Cancelled.");
 */

import type { ExtensionContext } from "@gsd/pi-coding-agent";
import { type Theme } from "@gsd/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, type TUI } from "@gsd/pi-tui";
import { makeUI, GLYPH } from "./ui.js";

export interface ConfirmOptions {
	/** Title shown at the top of the dialog */
	title: string;
	/** Descriptive message — what the user is confirming */
	message: string;
	/** Label for the confirm option. Default: "Yes" */
	confirmLabel?: string;
	/** Label for the decline option. Default: "No" */
	declineLabel?: string;
}

/**
 * Show a themed yes/no confirmation dialog.
 * Returns true if confirmed, false if declined or UI unavailable.
 */
export async function showConfirm(
	ctx: ExtensionContext,
	opts: ConfirmOptions,
): Promise<boolean> {
	if (!ctx.hasUI) return false;

	return ctx.ui.custom<boolean>((tui: TUI, theme: Theme, _kb, done) => {
		let cursor = 0; // 0 = yes (confirm), 1 = no (decline)
		let cachedLines: string[] | undefined;

		const yesLabel = opts.confirmLabel ?? "Yes";
		const noLabel = opts.declineLabel ?? "No";

		function refresh() {
			cachedLines = undefined;
			tui.requestRender();
		}

		function handleInput(data: string) {
			if (matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
				cursor = cursor === 0 ? 1 : 0;
				refresh();
				return;
			}

			// Quick-select: 1 = yes, 2 = no
			if (data === "1") { done(true); return; }
			if (data === "2") { done(false); return; }

			// y/n shortcuts
			if (data === "y" || data === "Y") { done(true); return; }
			if (data === "n" || data === "N") { done(false); return; }

			if (matchesKey(data, Key.enter) || matchesKey(data, Key.space)) {
				done(cursor === 0);
				return;
			}

			// Escape = decline
			if (matchesKey(data, Key.escape)) {
				done(false);
				return;
			}
		}

		function render(width: number): string[] {
			if (cachedLines) return cachedLines;

			const ui = makeUI(theme, width);
			const lines: string[] = [];
			const push = (...rows: string[][]) => { for (const r of rows) lines.push(...r); };

			push(
				ui.bar(),
				ui.blank(),
				ui.header(`  ${opts.title}`),
				ui.blank(),
				ui.subtitle(`  ${opts.message}`),
				ui.blank(),
			);

			const add = (s: string) => truncateToWidth(s, width);
			const option = (num: number, label: string, selected: boolean) => {
				if (selected) {
					return add(`  ${theme.fg("accent", GLYPH.cursor)} ${theme.fg("accent", `${num}. ${label}`)}`);
				}
				return add(`    ${theme.fg("text", `${num}. ${label}`)}`);
			};

			lines.push(option(1, yesLabel, cursor === 0));
			lines.push(option(2, noLabel, cursor === 1));

			push(
				ui.blank(),
				ui.hints(["↑/↓ to choose", "y/n to quick-select", "enter to confirm"]),
				ui.bar(),
			);

			cachedLines = lines;
			return lines;
		}

		return {
			render,
			invalidate: () => { cachedLines = undefined; },
			handleInput,
		};
	});
}
