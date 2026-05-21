// GSD-2 — Guided workflow Unit context.
// Tracks the guided Unit whose queued turn should use manifest Tool Contract policy.

export interface GuidedUnitContext {
  basePath: string;
  unitType: string;
  startedAt: number;
}

const guidedUnitContextByBasePath = new Map<string, GuidedUnitContext>();

export function setGuidedUnitContext(basePath: string, unitType: string): GuidedUnitContext {
  const context = { basePath, unitType, startedAt: Date.now() };
  guidedUnitContextByBasePath.set(basePath, context);
  return context;
}

export function getGuidedUnitContext(basePath?: string): GuidedUnitContext | null {
  if (basePath) return guidedUnitContextByBasePath.get(basePath) ?? null;
  if (guidedUnitContextByBasePath.size === 1) return guidedUnitContextByBasePath.values().next().value!;
  return null;
}

export function clearGuidedUnitContext(basePath?: string): void {
  if (basePath) {
    guidedUnitContextByBasePath.delete(basePath);
  } else {
    guidedUnitContextByBasePath.clear();
  }
}
