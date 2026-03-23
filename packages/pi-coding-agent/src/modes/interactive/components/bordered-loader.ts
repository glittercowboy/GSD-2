import { Container, Spacer, Text, getEditorKeybindings, type TUI } from "@gsd/pi-tui";
import type { Theme } from "../theme/theme.js";
import { DynamicBorder } from "./dynamic-border.js";
import { keyHint } from "./keybinding-hints.js";

/**
 * Bordered activity placeholder view (no internal spinner/timer ownership).
 * Any animation cadence must be provided by external activity updates.
 */
export class BorderedLoader extends Container {
	private readonly messageText: Text;
	private cancellable: boolean;
	private readonly signalController: AbortController;
	private onAbortHandler: (() => void) | undefined;

	constructor(_tui: TUI, theme: Theme, message: string, options?: { cancellable?: boolean }) {
		super();
		this.cancellable = options?.cancellable ?? true;
		this.signalController = new AbortController();
		const borderColor = (s: string) => theme.fg("border", s);
		this.addChild(new DynamicBorder(borderColor));
		this.addChild(new Spacer(1));
		this.messageText = new Text(`${theme.fg("accent", "⠋")} ${theme.fg("muted", message)}`, 1, 0);
		this.addChild(this.messageText);
		if (this.cancellable) {
			this.addChild(new Spacer(1));
			this.addChild(new Text(keyHint("selectCancel", "cancel"), 1, 0));
		}
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder(borderColor));
	}

	get signal(): AbortSignal {
		return this.signalController.signal;
	}

	set onAbort(fn: (() => void) | undefined) {
		this.onAbortHandler = fn;
	}

	handleInput(data: string): void {
		if (!this.cancellable) return;
		const kb = getEditorKeybindings();
		if (kb.matches(data, "selectCancel")) {
			if (!this.signalController.signal.aborted) {
				this.signalController.abort();
			}
			this.onAbortHandler?.();
		}
	}

	setMessage(message: string): void {
		this.messageText.setText(message);
	}

	dispose(): void {
		if (!this.signalController.signal.aborted) {
			this.signalController.abort();
		}
		this.onAbortHandler = undefined;
	}
}
