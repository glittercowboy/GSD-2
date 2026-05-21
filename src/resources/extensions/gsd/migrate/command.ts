/**
 * /gsd migrate — one-shot migration from .planning to .gsd
 *
 * Thin UX orchestrator: resolves paths, runs the validate → parse → transform →
 * preview → write pipeline, and shows confirmation UI via showNextAction.
 * All business logic lives in the pipeline modules (S01–S03).
 *
 * After a successful write, offers a read-only review that audits the output
 * for GSD-2 standards compliance.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { gsdRoot } from "../paths.js";
import { fileURLToPath } from "node:url";
import { showNextAction } from "../../shared/tui.js";
import {
  validatePlanningDirectory,
  parsePlanningDirectory,
  transformToGSD,
  generatePreview,
  writeGSDDirectory,
} from "./index.js";

import type { MigrationPreview, WrittenFiles } from "./writer.js";
import { ensureDbOpen } from "../bootstrap/dynamic-tools.js";
import { clearArtifacts, clearDecisions, clearRequirements, clearEngineHierarchy, transaction } from "../gsd-db.js";
import { migrateFromMarkdown } from "../md-importer.js";
import { invalidateStateCache } from "../state.js";
import {
  archiveLegacyPlanningDirectory,
  verifyMigrationProjection,
  writeMigrationAudit,
  type LegacyArchiveResult,
  type MigrationAuditResult,
  type MigrationProjectionVerification,
} from "./audit.js";
import {
  assertMigrationHasSlices,
  assertMigrationTargetAvailable,
  prepareMigrationTarget,
  resolveMigrationPaths,
  restoreMigrationTarget,
  type MigrationBackup,
} from "./safety.js";

export type MigrationImportCounts = ReturnType<typeof migrateFromMarkdown>;

export interface MigrationExecutionResult {
  backup: MigrationBackup;
  written: WrittenFiles;
  imported: MigrationImportCounts;
  legacyArchive: LegacyArchiveResult;
  verification: MigrationProjectionVerification;
  audit: MigrationAuditResult;
}

function assertMigrationImportMatchesPreview(imported: MigrationImportCounts, preview: MigrationPreview): void {
  const mismatches: string[] = [];
  if (imported.decisions !== preview.decisions.total) {
    mismatches.push(`decisions ${imported.decisions}/${preview.decisions.total}`);
  }
  if (imported.hierarchy.milestones !== preview.milestoneCount) {
    mismatches.push(`milestones ${imported.hierarchy.milestones}/${preview.milestoneCount}`);
  }
  if (imported.hierarchy.slices !== preview.totalSlices) {
    mismatches.push(`slices ${imported.hierarchy.slices}/${preview.totalSlices}`);
  }
  if (imported.hierarchy.tasks !== preview.totalTasks) {
    mismatches.push(`tasks ${imported.hierarchy.tasks}/${preview.totalTasks}`);
  }
  if (imported.requirements !== preview.requirements.total) {
    mismatches.push(`requirements ${imported.requirements}/${preview.requirements.total}`);
  }
  if (mismatches.length > 0) {
    throw new Error(`migration DB import verification failed: ${mismatches.join(", ")}`);
  }
}

export async function importWrittenMigrationToDb(
  basePath: string,
  preview?: MigrationPreview,
): Promise<MigrationImportCounts> {
  const opened = await ensureDbOpen(basePath);
  if (!opened) {
    throw new Error(`failed to open or create the GSD database at ${basePath}`);
  }

  const counts = transaction(() => {
    clearEngineHierarchy();
    clearArtifacts();
    clearDecisions();
    clearRequirements();
    const imported = migrateFromMarkdown(basePath);
    if (preview) assertMigrationImportMatchesPreview(imported, preview);
    return imported;
  });
  invalidateStateCache();
  return counts;
}

export async function executeMigrationWrite(
  sourcePath: string,
  targetRoot: string,
  project: ReturnType<typeof transformToGSD>,
  preview: MigrationPreview,
  startedAt: string = new Date().toISOString(),
): Promise<MigrationExecutionResult> {
  const backup = prepareMigrationTarget(targetRoot);

  try {
    const written = await writeGSDDirectory(project, targetRoot);
    const legacyArchive = await archiveLegacyPlanningDirectory(sourcePath, targetRoot);
    const imported = await importWrittenMigrationToDb(targetRoot, preview);
    const verification = await verifyMigrationProjection(targetRoot, preview);
    const audit = await writeMigrationAudit({
      sourcePath,
      targetRoot,
      backupPath: backup.backupPath,
      preview,
      written,
      imported,
      legacyArchive,
      verification,
      startedAt,
      completedAt: new Date().toISOString(),
    });

    return { backup, written, imported, legacyArchive, verification, audit };
  } catch (err) {
    restoreMigrationTarget(backup);
    throw err;
  }
}

/** Format preview stats for embedding in the review prompt. */
function formatPreviewStats(preview: MigrationPreview): string {
  const lines = [
    `- Decisions: ${preview.decisions.total}`,
    `- Milestones: ${preview.milestoneCount}`,
    `- Slices: ${preview.totalSlices} (${preview.doneSlices} done — ${preview.sliceCompletionPct}%)`,
    `- Tasks: ${preview.totalTasks} (${preview.doneTasks} done — ${preview.taskCompletionPct}%)`,
  ];
  if (preview.requirements.total > 0) {
    lines.push(
      `- Requirements: ${preview.requirements.total} (${preview.requirements.validated} validated, ${preview.requirements.active} active, ${preview.requirements.deferred} deferred)`,
    );
  }
  return lines.join("\n");
}

/** Load and interpolate the review-migration prompt template. */
function buildReviewPrompt(
  sourcePath: string,
  gsdPath: string,
  preview: MigrationPreview,
): string {
  const promptsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts");
  const templatePath = join(promptsDir, "review-migration.md");
  let content = readFileSync(templatePath, "utf-8");

  content = content.replaceAll("{{sourcePath}}", sourcePath);
  content = content.replaceAll("{{gsdPath}}", gsdPath);
  content = content.replaceAll("{{previewStats}}", formatPreviewStats(preview));

  return content.trim();
}

/** Dispatch the review prompt to the agent. */
function dispatchReview(
  pi: ExtensionAPI,
  sourcePath: string,
  gsdPath: string,
  preview: MigrationPreview,
): void {
  const prompt = buildReviewPrompt(sourcePath, gsdPath, preview);

  pi.sendMessage(
    {
      customType: "gsd-migrate-review",
      content: prompt,
      display: false,
    },
    { triggerTurn: true },
  );
}

export async function handleMigrate(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  // ── Resolve source path ────────────────────────────────────────────────────
  const { sourcePath, targetRoot } = resolveMigrationPaths(args);

  if (!existsSync(sourcePath)) {
    ctx.ui.notify(
      `Directory not found: ${sourcePath}\n\n` +
      'Migration converts a .planning/ directory (from older GSD versions) into .gsd/ format.\n' +
      'If you are starting a new project, use /gsd:new-project instead.\n' +
      'If migrating, ensure the path contains a .planning/ directory.',
      "error",
    );
    return;
  }

  // ── Validate ───────────────────────────────────────────────────────────────
  const validation = await validatePlanningDirectory(sourcePath);

  const warnings = validation.issues.filter((i) => i.severity === "warning");
  const fatals = validation.issues.filter((i) => i.severity === "fatal");

  for (const w of warnings) {
    ctx.ui.notify(`⚠ ${w.message} (${w.file})`, "warning");
  }
  for (const f of fatals) {
    ctx.ui.notify(`✖ ${f.message} (${f.file})`, "error");
  }

  if (!validation.valid) {
    ctx.ui.notify(
      "Migration blocked — fix the fatal issues above before retrying.",
      "error",
    );
    return;
  }

  // ── Parse → Transform → Preview ───────────────────────────────────────────
  const parsed = await parsePlanningDirectory(sourcePath);
  const project = transformToGSD(parsed);
  const preview = generatePreview(project);
  try {
    assertMigrationHasSlices(preview);
    await assertMigrationTargetAvailable(targetRoot);
  } catch (err) {
    ctx.ui.notify((err as Error).message, "error");
    return;
  }

  // ── Build preview text ─────────────────────────────────────────────────────
  const lines: string[] = [
    `Decisions: ${preview.decisions.total}`,
    `Milestones: ${preview.milestoneCount}`,
    `Slices: ${preview.totalSlices} (${preview.doneSlices} done — ${preview.sliceCompletionPct}%)`,
    `Tasks: ${preview.totalTasks} (${preview.doneTasks} done — ${preview.taskCompletionPct}%)`,
  ];

  if (preview.requirements.total > 0) {
    lines.push(
      `Requirements: ${preview.requirements.total} (${preview.requirements.validated} validated, ${preview.requirements.active} active, ${preview.requirements.deferred} deferred)`,
    );
  }

  const targetGsdExists = existsSync(gsdRoot(targetRoot));
  if (targetGsdExists) {
    lines.push("");
    lines.push(`⚠ A .gsd directory already exists at ${gsdRoot(targetRoot)}.`);
    lines.push("It will be backed up, deleted, and rewritten fresh before DB import.");
  }

  // ── Confirmation via showNextAction ────────────────────────────────────────
  const choice = await showNextAction(ctx, {
    title: "Migration preview",
    summary: lines,
    actions: [
      {
        id: "confirm",
        label: "Write .gsd directory",
        description: `Migrate ${preview.milestoneCount} milestone(s) to ${gsdRoot(targetRoot)}`,
        recommended: true,
      },
      {
        id: "cancel",
        label: "Cancel",
        description: "Exit without writing anything",
      },
    ],
    notYetMessage: "Run /gsd migrate again when ready.",
  });

  if (choice !== "confirm") {
    ctx.ui.notify("Migration cancelled — no files were written.", "info");
    return;
  }

  // ── Write ──────────────────────────────────────────────────────────────────
  ctx.ui.notify("Writing .gsd directory and importing DB state…", "info");

  let execution: MigrationExecutionResult;
  try {
    execution = await executeMigrationWrite(sourcePath, targetRoot, project, preview);
  } catch (err) {
    ctx.ui.notify(
      `Migration failed and the previous .gsd state was restored: ${(err as Error).message}`,
      "error",
    );
    return;
  }

  const gsdPath = gsdRoot(targetRoot);
  const { written, imported } = execution;

  ctx.ui.notify(
    `✓ Migration complete — ${written.paths.length} file(s) written to .gsd/, ${imported.hierarchy.milestones}M/${imported.hierarchy.slices}S/${imported.hierarchy.tasks}T imported to the database, and ${execution.audit.importedArtifacts} audit artifact(s) recorded`,
    "info",
  );

  // ── Post-write review offer ────────────────────────────────────────────────
  const reviewChoice = await showNextAction(ctx, {
    title: "Migration written",
    summary: [
      `${written.paths.length} files written to .gsd/`,
      `${imported.hierarchy.milestones} milestone(s), ${imported.hierarchy.slices} slice(s), and ${imported.hierarchy.tasks} task(s) imported to gsd.db`,
      `Legacy source archived at ${execution.legacyArchive.archivePath}`,
      `Migration audit written at ${execution.audit.migrationPath}`,
      "",
      "The agent can now review the migrated output against GSD-2 standards —",
      "checking structure, content quality, deriveState() round-trip, and",
      "requirement statuses. The review is read-only by default.",
    ],
    actions: [
      {
        id: "review",
        label: "Review migration",
        description: "Agent audits the .gsd output and reports PASS/FAIL per category",
        recommended: true,
      },
      {
        id: "skip",
        label: "Skip review",
        description: "Trust the migration output as-is",
      },
    ],
    notYetMessage: "Run /gsd migrate again to re-migrate, or review .gsd manually.",
  });

  if (reviewChoice === "review") {
    dispatchReview(pi, sourcePath, gsdPath, preview);
  }
}
