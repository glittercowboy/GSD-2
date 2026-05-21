// GSD-2 + packages/pi-coding-agent/src/modes/interactive/components/animated-component.ts - Shared animated component lifecycle.

import type { Component } from "@gsd/pi-tui";

type IntervalHandle = ReturnType<typeof setInterval>;
type TickResult = boolean | { done?: boolean; render?: boolean } | void;

/**
 * Owns a single unref'd interval and guarantees idempotent cleanup.
 */
export class ManagedInterval {
	private interval: IntervalHandle | undefined;
	private disposed = false;

	start(intervalMs: number, onTick: () => boolean | void): void {
		this.stop();
		this.disposed = false;
		this.interval = setInterval(() => {
			if (this.disposed) return;
			const done = onTick();
			if (done) this.stop();
		}, intervalMs);
		this.interval.unref?.();
	}

	stop(): void {
		if (!this.interval) return;
		clearInterval(this.interval);
		this.interval = undefined;
	}

	dispose(): void {
		this.disposed = true;
		this.stop();
	}

	get active(): boolean {
		return this.interval !== undefined;
	}

	get handle(): IntervalHandle | undefined {
		return this.interval;
	}
}

/**
 * Base class for TUI components driven by a timer and render cache.
 */
export abstract class AnimatedComponent implements Component {
	private animation = new ManagedInterval();
	private cachedWidth: number | undefined;
	private cachedVersion: number | undefined;
	private cachedLines: string[] | undefined;

	invalidate(): void {
		this.clearRenderCache();
	}

	dispose(): void {
		this.animation.dispose();
	}

	protected startAnimation(intervalMs: number, onTick: () => TickResult, requestRender?: () => void): void {
		this.animation.start(intervalMs, () => {
			const result = onTick();
			const done = result === true || (typeof result === "object" && result?.done === true);
			const shouldRender = !(typeof result === "object" && result?.render === false);
			this.clearRenderCache();
			if (shouldRender) requestRender?.();
			return done;
		});
	}

	protected stopAnimation(): void {
		this.animation.stop();
	}

	protected get isAnimating(): boolean {
		return this.animation.active;
	}

	protected get animationInterval(): IntervalHandle | undefined {
		return this.animation.handle;
	}

	protected getCachedRender(width: number, version: number): string[] | undefined {
		if (this.cachedWidth === width && this.cachedVersion === version) {
			return this.cachedLines;
		}
		return undefined;
	}

	protected setCachedRender(width: number, version: number, lines: string[]): string[] {
		this.cachedWidth = width;
		this.cachedVersion = version;
		this.cachedLines = lines;
		return lines;
	}

	protected clearRenderCache(): void {
		this.cachedWidth = undefined;
		this.cachedVersion = undefined;
		this.cachedLines = undefined;
	}

	abstract render(width: number): string[];
}
