// GSD-2 + packages/pi-coding-agent/src/modes/interactive/components/countdown-timer.ts - Dialog countdown timer lifecycle.
/**
 * Reusable countdown timer for dialog components.
 */

import type { TUI } from "@gsd/pi-tui";
import { ManagedInterval } from "./animated-component.js";

export class CountdownTimer {
	private interval = new ManagedInterval();
	private remainingSeconds: number;
	private _disposed = false;

	constructor(
		timeoutMs: number,
		private tui: TUI | undefined,
		private onTick: (seconds: number) => void,
		private onExpire: () => void,
	) {
		this.remainingSeconds = Math.ceil(timeoutMs / 1000);
		this.onTick(this.remainingSeconds);

		this.interval.start(1000, () => {
			if (this._disposed) return;
			this.remainingSeconds--;
			this.onTick(this.remainingSeconds);
			this.tui?.requestRender();

			if (this.remainingSeconds <= 0) {
				this.dispose();
				this.onExpire();
				return true;
			}
			return false;
		});
	}

	dispose(): void {
		if (this._disposed) return;
		this._disposed = true;
		this.interval.dispose();
	}
}
