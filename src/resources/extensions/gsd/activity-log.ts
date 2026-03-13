/**
 * GSD Activity Log — Save raw chat sessions to .gsd/activity/
 *
 * Before each context wipe in auto-mode, dumps the full session
 * as JSONL. No formatting, no truncation, no information loss.
 * These are debug artifacts — only read when summaries aren't enough.
 *
 * Diagnostic extraction is handled by session-forensics.ts.
 */

import { writeFileSync, mkdirSync, readdirSync, unlinkSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionContext } from "@gsd/pi-coding-agent";
import { gsdRoot } from "./paths.js";

export function saveActivityLog(
  ctx: ExtensionContext,
  basePath: string,
  unitType: string,
  unitId: string,
): void {
  try {
    const entries = ctx.sessionManager.getEntries();
    if (!entries || entries.length === 0) return;

    const activityDir = join(gsdRoot(basePath), "activity");
    mkdirSync(activityDir, { recursive: true });

    // Next sequence number
    let maxSeq = 0;
    try {
      for (const f of readdirSync(activityDir)) {
        const match = f.match(/^(\d+)-/);
        if (match) maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
      }
    } catch { /* empty dir */ }
    const seq = String(maxSeq + 1).padStart(3, "0");

    const safeUnitId = unitId.replace(/\//g, "-");
    const fileName = `${seq}-${unitType}-${safeUnitId}.jsonl`;
    const filePath = join(activityDir, fileName);

    const lines = entries.map(entry => JSON.stringify(entry));
    writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
  } catch {
    // Don't let logging failures break auto-mode
  }
}

export function pruneActivityLogs(activityDir: string, retentionDays: number): void {
  try {
    const files = readdirSync(activityDir);
    const entries: { seq: number; filePath: string }[] = [];
    for (const f of files) {
      const match = f.match(/^(\d+)-/);
      if (match) entries.push({ seq: parseInt(match[1], 10), filePath: join(activityDir, f) });
    }
    if (entries.length === 0) return;
    const maxSeq = Math.max(...entries.map(e => e.seq));
    const cutoff = Date.now() - retentionDays * 86_400_000;
    for (const entry of entries) {
      if (entry.seq === maxSeq) continue;  // always preserve highest-seq
      try {
        const mtime = statSync(entry.filePath).mtimeMs;
        if (Math.floor(mtime) <= cutoff) unlinkSync(entry.filePath);
      } catch { /* file vanished or stat failed — skip */ }
    }
  } catch { /* empty dir or readdirSync failure — skip */ }
}
