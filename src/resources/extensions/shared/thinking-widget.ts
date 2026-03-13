/**
 * Shared thinking/spinner widget.
 *
 * Shows an animated spinner with a label and an optional live-preview of
 * streamed text (e.g. LLM output) while a background operation is running.
 *
 * Usage:
 *
 *   import { showThinkingWidget } from "./shared/thinking-widget.js";
 *
 *   const widget = showThinkingWidget("Generating questions…", ctx);
 *
 *   // Optionally stream partial text into the preview line:
 *   widget.setText(partialLlmOutput);
 *
 *   // Always dispose when done — removes the widget from the UI:
 *   widget.dispose();
 *
 * Each call gets a unique widget key derived from a monotonic counter, so
 * multiple widgets can safely coexist without key collisions.
 */

import type { ExtensionCommandContext } from "@gsd/pi-coding-agent";
import { type Theme } from "@gsd/pi-coding-agent";
import { truncateToWidth, type TUI } from "@gsd/pi-tui";

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ThinkingWidget {
	/**
	 * Update the streamed-text preview line.
	 * Pass the full accumulated text — the widget trims and previews the tail.
	 */
	setText(text: string): void;
	/** Remove the widget from the UI. Always call this when the operation completes. */
	dispose(): void;
}

// ─── Internal constants ───────────────────────────────────────────────────────

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const SPINNER_INTERVAL_MS = 80;
const PREVIEW_MAX_CHARS = 120;

let widgetCounter = 0;

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Show an animated thinking spinner as a TUI widget.
 *
 * @param label  Short description of what is happening, e.g. "Writing PROJECT.md…"
 * @param ctx    Extension command context
 * @returns      Handle with setText() and dispose()
 */
export function showThinkingWidget(label: string, ctx: ExtensionCommandContext): ThinkingWidget {
	const widgetKey = `thinking-widget-${++widgetCounter}`;

	let streamedText = "";
	let widgetRef: { invalidate: () => void; requestRender: () => void } | null = null;

	ctx.ui.setWidget(widgetKey, (tui: TUI, theme: Theme) => {
		let frame = 0;
		let cachedLines: string[] | undefined;

		const interval = setInterval(() => {
			frame = (frame + 1) % SPINNER_FRAMES.length;
			cachedLines = undefined;
			tui.requestRender();
		}, SPINNER_INTERVAL_MS);

		widgetRef = {
			invalidate: () => { cachedLines = undefined; },
			requestRender: () => tui.requestRender(),
		};

		return {
			render(width: number): string[] {
				if (cachedLines) return cachedLines;
				const spinner = theme.fg("accent", SPINNER_FRAMES[frame]);
				const lines: string[] = [];
				lines.push(truncateToWidth(`  ${spinner} ${theme.fg("muted", label)}`, width));
				if (streamedText) {
					const preview = streamedText.replace(/\s+/g, " ").trim().slice(-PREVIEW_MAX_CHARS);
					lines.push(truncateToWidth(`  ${theme.fg("dim", preview)}`, width));
				}
				cachedLines = lines;
				return lines;
			},
			invalidate() { cachedLines = undefined; },
			dispose() { clearInterval(interval); },
		};
	});

	return {
		setText(text: string) {
			streamedText = text;
			if (widgetRef) {
				widgetRef.invalidate();
				widgetRef.requestRender();
			}
		},
		dispose() {
			ctx.ui.setWidget(widgetKey, undefined);
		},
	};
}
