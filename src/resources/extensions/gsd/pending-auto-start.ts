// GSD-2 — Pending auto-start handoff state.
// Stores discuss-to-auto handoff entries keyed by project root.

import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";
import { createWorkspace, scopeMilestone, type MilestoneScope } from "./workspace.js";

export interface PendingAutoStartEntry {
  ctx: ExtensionCommandContext;
  pi: ExtensionAPI;
  basePath: string;
  milestoneId: string;
  step?: boolean;
  startAuto?: boolean;
  createdAt: number;
  readyRejectCount?: number;
  scope: MilestoneScope;
  planBlockedRecoveryCount: number;
}

export interface PendingAutoStartInput {
  basePath: string;
  milestoneId: string;
  ctx: ExtensionCommandContext;
  pi: ExtensionAPI;
  step?: boolean;
  startAuto?: boolean;
  createdAt?: number;
}

const pendingAutoStartMap = new Map<string, PendingAutoStartEntry>();

export function getPendingAutoStart(basePath?: string): PendingAutoStartEntry | null {
  if (basePath) return pendingAutoStartMap.get(basePath) ?? null;
  if (pendingAutoStartMap.size === 1) return pendingAutoStartMap.values().next().value!;
  return null;
}

export const _getPendingAutoStart = getPendingAutoStart;

export function hasPendingAutoStart(basePath?: string): boolean {
  if (basePath) return pendingAutoStartMap.has(basePath);
  return pendingAutoStartMap.size > 0;
}

export function setPendingAutoStart(basePath: string, entry: PendingAutoStartInput): void {
  if (!entry.ctx || !entry.pi) {
    throw new Error("setPendingAutoStart requires ctx and pi");
  }
  const ws = createWorkspace(entry.basePath);
  const scope = scopeMilestone(ws, entry.milestoneId);
  pendingAutoStartMap.set(basePath, {
    createdAt: Date.now(),
    planBlockedRecoveryCount: 0,
    ...entry,
    scope,
    ctx: entry.ctx,
    pi: entry.pi,
  });
}

export function deletePendingAutoStart(basePath: string): void {
  pendingAutoStartMap.delete(basePath);
}

export function clearPendingAutoStart(basePath?: string): void {
  if (basePath) {
    pendingAutoStartMap.delete(basePath);
  } else {
    pendingAutoStartMap.clear();
  }
}

export function getDiscussionMilestoneId(basePath?: string): string | null {
  if (basePath) {
    return pendingAutoStartMap.get(basePath)?.milestoneId ?? null;
  }
  if (pendingAutoStartMap.size === 1) {
    return pendingAutoStartMap.values().next().value!.milestoneId;
  }
  return null;
}
