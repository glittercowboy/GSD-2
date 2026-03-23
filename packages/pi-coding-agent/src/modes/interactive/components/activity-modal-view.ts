import { Container, Spacer, Text } from "@gsd/pi-tui";
import { DynamicBorder } from "./dynamic-border.js";

/**
 * Modal activity view that renders a bordered single-line status message.
 * Animation frame progression is owned externally by ActivityManager.
 */
export class ActivityModalView extends Container {
	private readonly messageText: Text;

	constructor(initialMessage: string) {
		super();
		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		this.messageText = new Text(initialMessage, 1, 0);
		this.addChild(this.messageText);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
	}

	setMessage(message: string): void {
		this.messageText.setText(message);
	}

	dispose(): void {
		// no-op
	}
}
