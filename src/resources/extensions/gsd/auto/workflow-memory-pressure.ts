// Project/App: GSD-2
// File Purpose: Memory-pressure measurement adapter for auto-mode loop.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const DEFAULT_MEMORY_PRESSURE_THRESHOLD = 0.85;
const DEFAULT_HEAP_LIMIT_MB = 4096;

export interface MemoryPressureSnapshot {
  pressured: boolean;
  heapMB: number;
  limitMB: number;
  pct: number;
}

export interface MeasureMemoryPressureDeps {
  memoryUsage: () => { heapUsed: number };
  heapLimitBytes: () => number;
}

/**
 * Returns true on auto-mode startup, then every configured interval.
 *
 * Iteration 1 is checked explicitly so early session memory pressure cannot
 * bypass the periodic interval guard.
 */
export function shouldCheckMemoryPressure(iteration: number, interval: number): boolean {
  if (!Number.isInteger(interval) || interval <= 0) {
    throw new Error("Memory pressure check interval must be a positive integer");
  }
  return iteration === 1 || iteration % interval === 0;
}

function defaultHeapLimitBytes(): number {
  const v8 = require("node:v8") as {
    getHeapStatistics?: () => { heap_size_limit?: number };
  };
  const limit = v8.getHeapStatistics?.().heap_size_limit;
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
    throw new Error("V8 heap limit unavailable");
  }
  return limit;
}

export function measureMemoryPressure(options?: {
  threshold?: number;
  fallbackLimitMB?: number;
  deps?: Partial<MeasureMemoryPressureDeps>;
}): MemoryPressureSnapshot {
  const threshold = options?.threshold ?? DEFAULT_MEMORY_PRESSURE_THRESHOLD;
  const fallbackLimitMB = options?.fallbackLimitMB ?? DEFAULT_HEAP_LIMIT_MB;
  const memoryUsage = options?.deps?.memoryUsage ?? (() => process.memoryUsage());
  const heapLimitBytes = options?.deps?.heapLimitBytes ?? defaultHeapLimitBytes;

  const mem = memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  let limitMB = fallbackLimitMB;
  try {
    limitMB = Math.round(heapLimitBytes() / 1024 / 1024);
  } catch {
    limitMB = fallbackLimitMB;
  }
  const pct = heapMB / limitMB;
  return {
    pressured: pct > threshold,
    heapMB,
    limitMB,
    pct,
  };
}
