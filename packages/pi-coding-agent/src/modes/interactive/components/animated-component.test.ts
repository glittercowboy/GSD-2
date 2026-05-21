// GSD-2 + packages/pi-coding-agent/src/modes/interactive/components/animated-component.test.ts - Animated component lifecycle tests.

import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { AnimatedComponent } from "./animated-component.js";
import { CountdownTimer } from "./countdown-timer.js";

class TestAnimatedComponent extends AnimatedComponent {
	version = 0;
	renderBuilds = 0;

	start(requestRender: () => void): void {
		this.startAnimation(10, () => {
			this.version++;
			return this.version >= 2;
		}, requestRender);
	}

	render(width: number): string[] {
		const cached = this.getCachedRender(width, this.version);
		if (cached) return cached;
		this.renderBuilds++;
		return this.setCachedRender(width, this.version, [`v${this.version}:${width}`]);
	}

	get active(): boolean {
		return this.isAnimating;
	}

	get handle(): ReturnType<typeof setInterval> | undefined {
		return this.animationInterval;
	}
}

describe("AnimatedComponent", () => {
	it("caches renders until animation ticks invalidate the cache", () => {
		mock.timers.enable({ apis: ["setInterval"] });
		try {
			let renderRequests = 0;
			const component = new TestAnimatedComponent();

			assert.deepEqual(component.render(80), ["v0:80"]);
			assert.deepEqual(component.render(80), ["v0:80"]);
			assert.equal(component.renderBuilds, 1);

			component.start(() => {
				renderRequests++;
			});

			mock.timers.tick(10);

			assert.equal(renderRequests, 1);
			assert.deepEqual(component.render(80), ["v1:80"]);
			assert.equal(component.renderBuilds, 2);

			mock.timers.tick(10);

			assert.equal(renderRequests, 2);
			assert.equal(component.active, false);
			assert.deepEqual(component.render(80), ["v2:80"]);

			mock.timers.tick(10);
			assert.equal(renderRequests, 2, "stopped animations should not request more renders");
		} finally {
			mock.timers.reset();
		}
	});

	it("unrefs animation intervals so cosmetic timers do not pin process exit", () => {
		const component = new TestAnimatedComponent();
		try {
			component.start(() => {});
			assert.equal(component.handle?.hasRef?.(), false);
		} finally {
			component.dispose();
		}
	});
});

describe("CountdownTimer", () => {
	it("ticks, expires once, and stops after disposal", () => {
		mock.timers.enable({ apis: ["setInterval"] });
		try {
			const ticks: number[] = [];
			let renderRequests = 0;
			let expires = 0;
			const timer = new CountdownTimer(
				2000,
				{ requestRender() { renderRequests++; } } as any,
				(seconds) => ticks.push(seconds),
				() => { expires++; },
			);

			assert.deepEqual(ticks, [2]);

			mock.timers.tick(1000);
			assert.deepEqual(ticks, [2, 1]);
			assert.equal(renderRequests, 1);
			assert.equal(expires, 0);

			mock.timers.tick(1000);
			assert.deepEqual(ticks, [2, 1, 0]);
			assert.equal(renderRequests, 2);
			assert.equal(expires, 1);

			timer.dispose();
			mock.timers.tick(3000);

			assert.deepEqual(ticks, [2, 1, 0]);
			assert.equal(expires, 1);
		} finally {
			mock.timers.reset();
		}
	});
});
