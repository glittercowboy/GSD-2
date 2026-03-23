/**
 * GSD Command — /gsd codebase
 *
 * Generate and manage the codebase map (.gsd/CODEBASE.md).
 * Subcommands: generate, update, stats
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";

import {
  generateCodebaseMap,
  updateCodebaseMap,
  writeCodebaseMap,
  getCodebaseMapStats,
  readCodebaseMap,
  parseCodebaseMap,
} from "./codebase-generator.js";

export async function handleCodebase(
  args: string,
  ctx: ExtensionCommandContext,
  _pi: ExtensionAPI,
): Promise<void> {
  const basePath = process.cwd();
  const parts = args.trim().split(/\s+/);
  const sub = parts[0] ?? "";

  switch (sub) {
    case "":
    case "generate": {
      const maxFilesStr = extractFlag(args, "--max-files");
      const maxFiles = maxFilesStr ? parseInt(maxFilesStr, 10) : undefined;

      // Preserve existing descriptions on bare `/gsd codebase`
      let existingDescriptions: Map<string, string> | undefined;
      if (sub === "") {
        const existing = readCodebaseMap(basePath);
        if (existing) {
          existingDescriptions = parseCodebaseMap(existing);
        }
      }

      const result = generateCodebaseMap(basePath, { maxFiles }, existingDescriptions);
      const outPath = writeCodebaseMap(basePath, result.content);

      ctx.ui.notify(
        `Codebase map generated: ${result.fileCount} files\n` +
        `Written to: ${outPath}` +
        (result.truncated ? `\n(Truncated — increase --max-files to include more)` : ""),
        "success",
      );
      return;
    }

    case "update": {
      const result = updateCodebaseMap(basePath);
      writeCodebaseMap(basePath, result.content);

      ctx.ui.notify(
        `Codebase map updated: ${result.fileCount} files\n` +
        `  Added: ${result.added} | Removed: ${result.removed} | Unchanged: ${result.unchanged}`,
        "success",
      );
      return;
    }

    case "stats": {
      const stats = getCodebaseMapStats(basePath);
      if (!stats.exists) {
        ctx.ui.notify("No codebase map found. Run /gsd codebase to generate one.", "info");
        return;
      }

      const coverage = stats.fileCount > 0
        ? Math.round((stats.describedCount / stats.fileCount) * 100)
        : 0;

      ctx.ui.notify(
        `Codebase Map Stats:\n` +
        `  Files: ${stats.fileCount}\n` +
        `  Described: ${stats.describedCount} (${coverage}%)\n` +
        `  Undescribed: ${stats.undescribedCount}\n` +
        `  Generated: ${stats.generatedAt ?? "unknown"}`,
        "info",
      );
      return;
    }

    default:
      ctx.ui.notify(
        "Usage: /gsd codebase [generate|update|stats]\n\n" +
        "  generate [--max-files N]  — Generate or regenerate CODEBASE.md\n" +
        "  update                    — Incremental update (preserves descriptions)\n" +
        "  stats                     — Show coverage and staleness\n\n" +
        "With no subcommand, generates (preserving existing descriptions).",
        "warning",
      );
  }
}

function extractFlag(args: string, flag: string): string | undefined {
  const regex = new RegExp(`${flag}\\s+(\\S+)`);
  const match = args.match(regex);
  return match?.[1];
}
