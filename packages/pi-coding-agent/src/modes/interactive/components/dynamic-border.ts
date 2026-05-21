// GSD-2 + packages/pi-coding-agent/src/modes/interactive/components/dynamic-border.ts - Width-adaptive border with optional spinner.

import type { TUI } from "@gsd/pi-tui";
import { visibleWidth } from "@gsd/pi-tui";
import { theme } from "../theme/theme.js";
import { AnimatedComponent } from "./animated-component.js";

/**
 * Dynamic border component that adjusts to viewport width.
 * Supports an optional animated spinner in the label area.
 *
 * Note: When used from extensions loaded via jiti, the global `theme` may be undefined
 * because jiti creates a separate module cache. Always pass an explicit color
 * function when using DynamicBorder in components exported for extension use.
 */
export class DynamicBorder extends AnimatedComponent {
	private color: (str: string) => string;
	private label?: string;
	private spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
	private spinnerIndex = 0;
	private spinnerColorFn?: (str: string) => string;
	private lastExternalRender = 0;

	constructor(color: (str: string) => string = (str) => {
		try { return theme.fg("border", str); } catch { return str; }
	}, label?: string) {
		super();
		this.color = color;
		this.label = label;
	}

	setLabel(label: string | undefined): void {
		this.label = label;
	}

	/**
	 * Start an animated spinner that prepends to the label.
	 * The spinner rotates every 200ms and triggers a re-render via the TUI.
	 */
	startSpinner(ui: TUI, colorFn: (str: string) => string): void {
		this.stopSpinner();
		this.spinnerColorFn = colorFn;
		this.spinnerIndex = 0;
		this.startAnimation(200, () => {
			this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerFrames.length;
			// Only trigger standalone render if no other source rendered recently.
			// During active streaming, message_update already calls requestRender().
			return { render: Date.now() - this.lastExternalRender > 200 };
		}, () => ui.requestRender());
		ui.requestRender();
	}

	/**
	 * Stop the spinner animation. The border reverts to a static label.
	 */
	stopSpinner(): void {
		this.stopAnimation();
		this.spinnerColorFn = undefined;
	}

	get isSpinning(): boolean {
		return this.isAnimating;
	}

	private get spinnerInterval(): ReturnType<typeof setInterval> | undefined {
		return this.animationInterval;
	}

	/**
	 * Stop the spinner when the component is removed. Without this, a spinner
	 * started via startSpinner() keeps firing its interval (and calling
	 * ui.requestRender()) after the border is detached from its container.
	 */
	dispose(): void {
		this.stopSpinner();
		super.dispose();
	}

	render(width: number): string[] {
		this.lastExternalRender = Date.now();
		const spinnerPrefix = this.isSpinning && this.spinnerColorFn
			? this.spinnerColorFn(this.spinnerFrames[this.spinnerIndex]) + " "
			: "";

		if (this.label) {
			const labelText = ` ${spinnerPrefix}${this.label} `;
			const labelVisible = visibleWidth(labelText);
			const leading = "── ";
			const remaining = Math.max(0, width - labelVisible - leading.length);
			const trailing = "─".repeat(Math.max(1, remaining));
			// Color leading and trailing separately so embedded ANSI in the
			// spinner/label doesn't bleed into the trailing dashes.
			return [this.color(leading) + labelText + this.color(trailing)];
		}
		return [this.color("─".repeat(Math.max(1, width)))];
	}
}
