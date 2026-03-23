export type AnimationTick = (nowMs: number) => void;

type Unsubscribe = () => void;

/**
 * Shared animation clock keyed by interval duration.
 * Multiple components can subscribe without creating redundant timers.
 */
class SharedAnimationClock {
	private readonly intervalMs: number;
	private readonly subscribers = new Set<AnimationTick>();
	private timer: NodeJS.Timeout | undefined;

	constructor(intervalMs: number) {
		this.intervalMs = intervalMs;
	}

	subscribe(tick: AnimationTick): Unsubscribe {
		this.subscribers.add(tick);
		this.ensureRunning();
		return () => {
			this.subscribers.delete(tick);
			if (this.subscribers.size === 0) {
				this.stop();
			}
		};
	}

	private ensureRunning(): void {
		if (this.timer) return;
		this.timer = setInterval(() => {
			const now = Date.now();
			for (const subscriber of this.subscribers) {
				try {
					subscriber(now);
				} catch {
					// Best-effort scheduler: one bad subscriber must not stop animation for others.
				}
			}
		}, this.intervalMs);
	}

	private stop(): void {
		if (!this.timer) return;
		clearInterval(this.timer);
		this.timer = undefined;
	}
}

const sharedClocks = new Map<number, SharedAnimationClock>();

export function getSharedAnimationClock(intervalMs: number): { subscribe: (tick: AnimationTick) => Unsubscribe } {
	const normalized = Math.max(1, Math.floor(intervalMs));
	let clock = sharedClocks.get(normalized);
	if (!clock) {
		clock = new SharedAnimationClock(normalized);
		sharedClocks.set(normalized, clock);
	}
	return clock;
}

