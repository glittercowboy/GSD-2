/**
 * Shared persistent progress/status panel widget.
 *
 * Renders an ordered list of progress items with status glyphs, optional
 * badge, subtitle, metadata, and footer hints. Supports pulse animation
 * for active items during agent execution.
 *
 * Usage:
 *
 *   import { createProgressPanel } from "./shared/progress-widget.js";
 *
 *   const panel = createProgressPanel(ctx.ui, {
 *     widgetKey: "workflow",
 *     statusKey: "workflow",
 *     statusPrefix: "wf",
 *   });
 *
 *   panel.update(model);       // render/re-render with new model
 *   panel.startPulse();        // animate active items
 *   panel.stopPulse();         // stop animation
 *   panel.dispose();           // remove widget and status
 */

import type { ExtensionUIContext, Theme } from "@gsd/pi-coding-agent";
import type { TUI } from "@gsd/pi-tui";
import { makeUI, type ProgressStatus } from "./ui.js";

// ─── Exported types ───────────────────────────────────────────────────────────

export type ProgressItemStatus = ProgressStatus;

export interface ProgressItem {
	/** Display label */
	label: string;
	/** Drives glyph and color */
	status: ProgressItemStatus;
	/** Optional text after label — e.g. artifact type, task ID */
	detail?: string;
	/** Optional secondary line below item — e.g. "waiting for /workflow-continue" */
	annotation?: string;
}

export interface ProgressPanelModel {
	/** Panel title */
	title: string;
	/** Optional badge next to title — e.g. "RUNNING", "PAUSED" */
	badge?: string;
	/** Badge color control — maps to ProgressItemStatus color */
	badgeStatus?: ProgressItemStatus;
	/** Optional subtitle lines below title */
	subtitle?: string[];
	/** Ordered progress items */
	items: ProgressItem[];
	/** Optional metadata lines below items */
	meta?: string[];
	/** Optional footer hint strings */
	hints?: string[];
}

export interface ProgressPanelOptions {
	/**
	 * Widget key used with ctx.ui.setWidget(...).
	 * Must be unique per extension.
	 */
	widgetKey: string;
	/**
	 * Status key used with ctx.ui.setStatus(...).
	 * Must be unique per extension.
	 */
	statusKey: string;
	/**
	 * Short prefix for footer status text.
	 * Example: "wf" produces "wf:2/3 RUNNING"
	 */
	statusPrefix: string;
}

export interface ProgressPanel {
	/** Update the widget with a new model. Triggers re-render. */
	update(model: ProgressPanelModel): void;
	/** Start pulsing items with status "active". */
	startPulse(): void;
	/** Stop pulsing. Active items render at full brightness. */
	stopPulse(): void;
	/** Remove the widget and status from the UI. */
	dispose(): void;
}

// ─── Internal constants ───────────────────────────────────────────────────────

const PULSE_INTERVAL_MS = 500;

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Create and register a persistent progress widget.
 *
 * @param ui       The `ctx.ui` object from ExtensionContext or ExtensionCommandContext
 * @param options  Widget key, status key, and status prefix
 * @returns        ProgressPanel controller
 */
export function createProgressPanel(
	ui: ExtensionUIContext,
	options: ProgressPanelOptions,
): ProgressPanel {
	const { widgetKey, statusKey, statusPrefix } = options;

	// ── Internal state ────────────────────────────────────────────────────────

	let currentModel: ProgressPanelModel | null = null;
	let stateVersion = 0;
	let cachedLines: string[] | undefined;
	let cachedWidth: number | undefined;
	let cachedVersion = -1;
	let pulseBright = true;
	let pulseTimer: ReturnType<typeof setInterval> | null = null;
	let widgetRef: { invalidate: () => void; requestRender: () => void } | null = null;

	// ── Footer status ─────────────────────────────────────────────────────────

	function updateFooterStatus(): void {
		if (!currentModel) return;
		const { items, badge } = currentModel;
		const total = items.length;
		let current = 0;

		// Find first active item index (1-based)
		const activeIdx = items.findIndex((it) => it.status === "active");
		if (activeIdx >= 0) {
			current = activeIdx + 1;
		} else {
			// Count done items + 1
			current = items.filter((it) => it.status === "done").length + 1;
		}
		if (current > total) current = total;

		const badgePart = badge ? ` ${badge}` : "";
		const statusText = ui.theme.fg("accent", `${statusPrefix}:${current}/${total}${badgePart}`);
		ui.setStatus(statusKey, statusText);
	}

	// ── Render function ───────────────────────────────────────────────────────

	function renderPanel(width: number, theme: Theme): string[] {
		// Version-based cache check
		if (cachedLines && cachedWidth === width && cachedVersion === stateVersion) {
			return cachedLines;
		}

		if (!currentModel) return [];

		const uiHelper = makeUI(theme, width);
		const lines: string[] = [];
		const push = (...rows: string[][]) => { for (const r of rows) lines.push(...r); };
		const model = currentModel;

		// 1. Top bar
		push(uiHelper.bar());

		// 2. Title area — title with optional inline badge
		if (model.badge && model.badgeStatus) {
			const titleText = uiHelper.header(model.title)[0];
			const badgeGlyph = uiHelper.statusGlyph(model.badgeStatus);
			const badgeLabel = uiHelper.statusBadge(model.badge, model.badgeStatus)[0];
			lines.push(`${titleText}  ${badgeGlyph} ${badgeLabel.trimStart()}`);
		} else {
			push(uiHelper.header(model.title));
		}

		// 3. Subtitle
		if (model.subtitle?.length) {
			for (const line of model.subtitle) {
				push(uiHelper.meta(line));
			}
		}

		// 4. Blank line
		push(uiHelper.blank());

		// 5. Items
		for (const item of model.items) {
			// Pulse: when pulseBright is false and item is active, render as pending (dimmed)
			const renderStatus: ProgressStatus = (!pulseBright && item.status === "active")
				? "pending"
				: item.status;

			push(uiHelper.progressItem(item.label, renderStatus, {
				detail: item.detail,
				emphasized: item.status === "active",
			}));

			if (item.annotation) {
				push(uiHelper.progressAnnotation(item.annotation));
			}
		}

		// 6. Blank line (if meta or hints follow)
		if (model.meta?.length || model.hints?.length) {
			push(uiHelper.blank());
		}

		// 7. Meta
		if (model.meta?.length) {
			for (const line of model.meta) {
				push(uiHelper.meta(line));
			}
		}

		// 8. Hints
		if (model.hints?.length) {
			push(uiHelper.hints(model.hints));
		}

		// 9. Bottom bar
		push(uiHelper.bar());

		cachedLines = lines;
		cachedWidth = width;
		cachedVersion = stateVersion;
		return lines;
	}

	// ── Register widget ───────────────────────────────────────────────────────

	ui.setWidget(widgetKey, (tui: TUI, theme: Theme) => {
		widgetRef = {
			invalidate: () => { cachedLines = undefined; },
			requestRender: () => tui.requestRender(),
		};

		return {
			render(width: number): string[] {
				return renderPanel(width, theme);
			},
			invalidate() {
				cachedLines = undefined;
			},
		};
	});

	// ── Controller ────────────────────────────────────────────────────────────

	return {
		update(model: ProgressPanelModel): void {
			currentModel = model;
			stateVersion++;
			cachedLines = undefined;
			updateFooterStatus();
			if (widgetRef) widgetRef.requestRender();
		},

		startPulse(): void {
			if (pulseTimer) return; // already pulsing
			pulseTimer = setInterval(() => {
				pulseBright = !pulseBright;
				cachedLines = undefined;
				if (widgetRef) widgetRef.requestRender();
			}, PULSE_INTERVAL_MS);
		},

		stopPulse(): void {
			if (pulseTimer) {
				clearInterval(pulseTimer);
				pulseTimer = null;
			}
			pulseBright = true;
			cachedLines = undefined;
			if (widgetRef) widgetRef.requestRender();
		},

		dispose(): void {
			if (pulseTimer) {
				clearInterval(pulseTimer);
				pulseTimer = null;
			}
			ui.setWidget(widgetKey, undefined);
			ui.setStatus(statusKey, undefined);
			currentModel = null;
			widgetRef = null;
		},
	};
}
