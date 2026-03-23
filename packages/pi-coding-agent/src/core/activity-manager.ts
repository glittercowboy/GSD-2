export type ActivityLane = "status" | "modal" | "inline" | "countdown" | "decorative" | "cli";

export type ActivityState = "running" | "succeeded" | "failed" | "stopped";

export interface ActivityStartOptions {
	owner: string;
	lane: ActivityLane;
	key?: string;
	message?: string;
	progress?: number;
}

export interface ActivitySnapshot {
	id: number;
	owner: string;
	lane: ActivityLane;
	key?: string;
	state: ActivityState;
	message?: string;
	progress?: number;
	startedAt: number;
	updatedAt: number;
	finishedAt?: number;
}

export interface ActivityHandle {
	setMessage(message?: string): void;
	setProgress(percent?: number): void;
	stop(): void;
	succeed(message?: string): void;
	fail(message?: string): void;
	isActive(): boolean;
}

export type ActivityClockTick = (tick: number, nowMs: number) => void;

export interface ActivityClock {
	subscribe(listener: ActivityClockTick): () => void;
}

export interface ActivityChangeEvent {
	type: "start" | "update" | "stop" | "result" | "clear";
	activity?: ActivitySnapshot;
	lane?: ActivityLane;
	visibleByLane: Record<ActivityLane, ActivitySnapshot | undefined>;
	laneActivities: Record<ActivityLane, ActivitySnapshot[]>;
}

type ActivityRecord = {
	id: number;
	owner: string;
	lane: ActivityLane;
	key?: string;
	state: ActivityState;
	message?: string;
	progress?: number;
	startedAt: number;
	updatedAt: number;
	finishedAt?: number;
};

export type ActivityListener = (event: ActivityChangeEvent) => void;

const LANES: ActivityLane[] = ["status", "modal", "inline", "countdown", "decorative", "cli"];
const EXCLUSIVE_LANES = new Set<ActivityLane>(["modal", "cli"]);
const KEYED_REPLACE_LANES = new Set<ActivityLane>(["inline", "countdown", "decorative"]);
const BRAILLE_SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

type ClockRecord = {
	intervalMs: number;
	subscribers: Set<ActivityClockTick>;
	timer: ReturnType<typeof setInterval> | undefined;
	tick: number;
};

export class ActivityManager {
	private nextId = 1;
	private readonly records = new Map<number, ActivityRecord>();
	private readonly laneOrder = new Map<ActivityLane, number[]>();
	private readonly listeners = new Set<ActivityListener>();
	private readonly clocks = new Map<number, ClockRecord>();

	constructor() {
		for (const lane of LANES) {
			this.laneOrder.set(lane, []);
		}
	}

	start(options: ActivityStartOptions): ActivityHandle {
		this.assertOwner(options.owner);
		const lane = options.lane;

		if (EXCLUSIVE_LANES.has(lane)) {
			this.stopLane(lane);
		}

		if (KEYED_REPLACE_LANES.has(lane) && options.key) {
			this.stopByLaneAndKey(lane, options.key);
		}

		const now = Date.now();
		const record: ActivityRecord = {
			id: this.nextId++,
			owner: options.owner,
			lane,
			key: normalizeString(options.key),
			state: "running",
			message: normalizeString(options.message),
			progress: normalizeProgress(options.progress),
			startedAt: now,
			updatedAt: now,
		};
		this.records.set(record.id, record);
		this.laneOrder.get(lane)?.push(record.id);
		this.emit({ type: "start", activity: this.toSnapshot(record), lane });
		return this.createHandle(record.id);
	}

	async run<T>(operation: () => Promise<T>, options: ActivityStartOptions): Promise<T> {
		const handle = this.start(options);
		try {
			const result = await operation();
			handle.succeed();
			return result;
		} catch (error) {
			handle.fail(error instanceof Error ? error.message : String(error));
			throw error;
		}
	}

	update(id: number, update: { message?: string; progress?: number }): void {
		const record = this.records.get(id);
		if (!record || record.state !== "running") return;
		record.message = normalizeString(update.message);
		record.progress = normalizeProgress(update.progress);
		record.updatedAt = Date.now();
		this.emit({ type: "update", activity: this.toSnapshot(record), lane: record.lane });
	}

	stop(id: number): void {
		const record = this.records.get(id);
		if (!record) return;
		record.state = "stopped";
		record.finishedAt = Date.now();
		record.updatedAt = record.finishedAt;
		this.removeRecord(record.id, record.lane);
		this.emit({ type: "stop", activity: this.toSnapshot(record), lane: record.lane });
	}

	succeed(id: number, message?: string): void {
		this.finish(id, "succeeded", message);
	}

	fail(id: number, message?: string): void {
		this.finish(id, "failed", message);
	}

	isActive(id: number): boolean {
		const record = this.records.get(id);
		return record !== undefined && record.state === "running";
	}

	clearByOwner(owner: string): void {
		this.assertOwner(owner);
		for (const record of [...this.records.values()]) {
			if (record.owner === owner) {
				record.state = "stopped";
				record.finishedAt = Date.now();
				record.updatedAt = record.finishedAt;
				this.removeRecord(record.id, record.lane);
			}
		}
		this.emit({ type: "clear" });
	}

	clearLane(lane: ActivityLane): void {
		const ids = [...(this.laneOrder.get(lane) ?? [])];
		if (ids.length === 0) return;
		for (const id of ids) {
			const record = this.records.get(id);
			if (!record) continue;
			record.state = "stopped";
			record.finishedAt = Date.now();
			record.updatedAt = record.finishedAt;
			this.removeRecord(record.id, record.lane);
		}
		this.emit({ type: "clear", lane });
	}

	clearAll(): void {
		if (this.records.size === 0) return;
		this.records.clear();
		for (const lane of LANES) {
			this.laneOrder.set(lane, []);
		}
		this.emit({ type: "clear" });
	}

	getVisible(lane: ActivityLane): ActivitySnapshot | undefined {
		const ids = this.laneOrder.get(lane) ?? [];
		if (ids.length === 0) return undefined;
		const lastId = ids[ids.length - 1];
		const record = this.records.get(lastId);
		return record ? this.toSnapshot(record) : undefined;
	}

	getLaneActivities(lane: ActivityLane): ActivitySnapshot[] {
		const ids = this.laneOrder.get(lane) ?? [];
		const snapshots: ActivitySnapshot[] = [];
		for (const id of ids) {
			const record = this.records.get(id);
			if (record) snapshots.push(this.toSnapshot(record));
		}
		return snapshots;
	}

	subscribe(listener: ActivityListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	subscribeClock(intervalMs: number, listener: ActivityClockTick): () => void {
		const normalized = normalizeInterval(intervalMs);
		let clock = this.clocks.get(normalized);
		if (!clock) {
			clock = {
				intervalMs: normalized,
				subscribers: new Set<ActivityClockTick>(),
				timer: undefined,
				tick: 0,
			};
			this.clocks.set(normalized, clock);
		}

		clock.subscribers.add(listener);
		if (!clock.timer) {
			clock.timer = setInterval(() => {
				const current = this.clocks.get(normalized);
				if (!current || current.subscribers.size === 0) return;
				current.tick += 1;
				const now = Date.now();
				for (const subscriber of [...current.subscribers]) {
					try {
						subscriber(current.tick, now);
					} catch {
						// Best-effort tick delivery: a bad listener must not affect others.
					}
				}
			}, clock.intervalMs);
		}

		return () => {
			const current = this.clocks.get(normalized);
			if (!current) return;
			current.subscribers.delete(listener);
			if (current.subscribers.size === 0) {
				if (current.timer) {
					clearInterval(current.timer);
				}
				this.clocks.delete(normalized);
			}
		};
	}

	getClock(intervalMs: number): ActivityClock {
		const normalized = normalizeInterval(intervalMs);
		return {
			subscribe: (listener: ActivityClockTick) => this.subscribeClock(normalized, listener),
		};
	}

	getSpinnerFrame(frame: number): string {
		const normalized = Number.isFinite(frame) ? Math.max(0, Math.floor(frame)) : 0;
		return BRAILLE_SPINNER_FRAMES[normalized % BRAILLE_SPINNER_FRAMES.length];
	}

	dispose(): void {
		for (const clock of this.clocks.values()) {
			if (clock.timer) {
				clearInterval(clock.timer);
			}
		}
		this.clocks.clear();
		this.clearAll();
		this.listeners.clear();
	}

	private createHandle(id: number): ActivityHandle {
		return {
			setMessage: (message?: string) => this.update(id, { message }),
			setProgress: (percent?: number) => this.update(id, { progress: percent }),
			stop: () => this.stop(id),
			succeed: (message?: string) => this.succeed(id, message),
			fail: (message?: string) => this.fail(id, message),
			isActive: () => this.isActive(id),
		};
	}

	private finish(id: number, state: "succeeded" | "failed", message?: string): void {
		const record = this.records.get(id);
		if (!record || record.state !== "running") return;
		record.state = state;
		record.message = normalizeString(message) ?? record.message;
		record.finishedAt = Date.now();
		record.updatedAt = record.finishedAt;
		this.emit({ type: "result", activity: this.toSnapshot(record), lane: record.lane });
		this.removeRecord(record.id, record.lane);
		this.emit({ type: "stop", activity: this.toSnapshot(record), lane: record.lane });
	}

	private stopLane(lane: ActivityLane): void {
		const ids = [...(this.laneOrder.get(lane) ?? [])];
		for (const id of ids) {
			this.stop(id);
		}
	}

	private stopByLaneAndKey(lane: ActivityLane, key: string): void {
		const ids = [...(this.laneOrder.get(lane) ?? [])];
		for (const id of ids) {
			const record = this.records.get(id);
			if (record?.key === key) {
				this.stop(id);
			}
		}
	}

	private removeRecord(id: number, lane: ActivityLane): void {
		this.records.delete(id);
		const ordered = this.laneOrder.get(lane);
		if (!ordered) return;
		const index = ordered.indexOf(id);
		if (index !== -1) {
			ordered.splice(index, 1);
		}
	}

	private emit(payload: Pick<ActivityChangeEvent, "type" | "activity" | "lane">): void {
		const event: ActivityChangeEvent = {
			...payload,
			visibleByLane: {
				status: this.getVisible("status"),
				modal: this.getVisible("modal"),
				inline: this.getVisible("inline"),
				countdown: this.getVisible("countdown"),
				decorative: this.getVisible("decorative"),
				cli: this.getVisible("cli"),
			},
			laneActivities: {
				status: this.getLaneActivities("status"),
				modal: this.getLaneActivities("modal"),
				inline: this.getLaneActivities("inline"),
				countdown: this.getLaneActivities("countdown"),
				decorative: this.getLaneActivities("decorative"),
				cli: this.getLaneActivities("cli"),
			},
		};
		for (const listener of this.listeners) {
			listener(event);
		}
	}

	private toSnapshot(record: ActivityRecord): ActivitySnapshot {
		return {
			id: record.id,
			owner: record.owner,
			lane: record.lane,
			key: record.key,
			state: record.state,
			message: record.message,
			progress: record.progress,
			startedAt: record.startedAt,
			updatedAt: record.updatedAt,
			finishedAt: record.finishedAt,
		};
	}

	private assertOwner(owner: string): void {
		if (!owner || owner.trim().length === 0) {
			throw new Error("Activity owner is required");
		}
	}
}

function normalizeString(value?: string): string | undefined {
	if (value === undefined) return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeProgress(value?: number): number | undefined {
	if (value === undefined) return undefined;
	if (!Number.isFinite(value)) return undefined;
	return Math.max(0, Math.min(100, value));
}

function normalizeInterval(value: number): number {
	if (!Number.isFinite(value)) return 1;
	return Math.max(1, Math.floor(value));
}
