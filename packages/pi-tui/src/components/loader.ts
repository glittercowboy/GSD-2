import type { TUI } from "../tui.js";
import { Text } from "./text.js";

/**
 * Loader component with externally-driven frame updates.
 * It does not own timers; callers must invoke `setFrame` to animate.
 */
export class Loader extends Text {
	private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
	private currentFrame = 0;
	private ui: TUI | null = null;

	constructor(
		ui: TUI,
		private spinnerColorFn: (str: string) => string,
		private messageColorFn: (str: string) => string,
		private message: string = "Loading...",
	) {
		super("", 1, 0);
		this.ui = ui;
		this.start();
	}

	render(width: number): string[] {
		return ["", ...super.render(width)];
	}

	start() {
		this.updateDisplay();
	}

	stop() {}

	dispose() {
		this.ui = null;
	}

	setMessage(message: string) {
		this.message = message;
		this.updateDisplay();
	}

	setFrame(frame: number) {
		if (!Number.isFinite(frame)) return;
		const normalized = Math.max(0, Math.floor(frame));
		this.currentFrame = normalized % this.frames.length;
		this.updateDisplay();
	}

	private updateDisplay() {
		const frame = this.frames[this.currentFrame];
		this.setText(`${this.spinnerColorFn(frame)} ${this.messageColorFn(this.message)}`);
		if (this.ui) {
			this.ui.requestRender();
		}
	}
}
