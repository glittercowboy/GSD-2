import assert from "node:assert/strict";
import test from "node:test";
import { getSharedAnimationClock } from "../../packages/pi-tui/src/animation-clock.ts";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

test("shared animation clock publishes ticks to multiple subscribers", async () => {
	const clock = getSharedAnimationClock(10);
	let first = 0;
	let second = 0;

	const unsubscribeFirst = clock.subscribe(() => {
		first++;
	});
	const unsubscribeSecond = clock.subscribe(() => {
		second++;
	});

	await sleep(35);
	unsubscribeFirst();
	unsubscribeSecond();

	assert.ok(first > 0, `expected first subscriber ticks, got ${first}`);
	assert.ok(second > 0, `expected second subscriber ticks, got ${second}`);
});

test("unsubscribed listeners stop receiving ticks", async () => {
	const clock = getSharedAnimationClock(10);
	let ticks = 0;
	const unsubscribe = clock.subscribe(() => {
		ticks++;
	});

	await sleep(25);
	unsubscribe();
	const afterUnsubscribe = ticks;
	await sleep(25);

	assert.equal(ticks, afterUnsubscribe);
});
