// GSD-2 - /gsd migrate audit helpers.
// File Purpose: Legacy archive, migration manifest, and projection verification support.

import { cpSync, existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { saveFile } from "../files.js";
import { insertArtifact } from "../gsd-db.js";
import { renderAllFromDb } from "../markdown-renderer.js";
import { gsdRoot } from "../paths.js";
import { countDbHierarchy, countMarkdownHierarchy, type HierarchyCounts } from "../migration-auto-check.js";
import type { MigrationPreview, WrittenFiles } from "./writer.js";

interface ImportedMigrationCounts {
  decisions: number;
  requirements: number;
  artifacts: number;
  hierarchy: HierarchyCounts;
}

export interface LegacyArchiveResult {
  archived: boolean;
  archivePath: string;
  manifestPath: string;
  strategy: "full-source-copy";
}

export interface MigrationProjectionVerification {
  markdown: HierarchyCounts;
  db: HierarchyCounts;
  rendered: number;
  skipped: number;
  errors: string[];
}

export interface MigrationAuditResult {
  migrationPath: string;
  manifestPath: string;
  importedArtifacts: number;
}

export interface MigrationAuditInput {
  sourcePath: string;
  targetRoot: string;
  backupPath: string | null;
  preview: MigrationPreview;
  written: WrittenFiles;
  imported: ImportedMigrationCounts;
  legacyArchive: LegacyArchiveResult;
  verification: MigrationProjectionVerification;
  startedAt: string;
  completedAt: string;
}

function relToGsd(targetRoot: string, path: string): string {
  return relative(gsdRoot(targetRoot), path).replaceAll("\\", "/");
}

function sameCounts(a: HierarchyCounts, b: HierarchyCounts): boolean {
  return a.milestones === b.milestones && a.slices === b.slices && a.tasks === b.tasks;
}

function previewHierarchy(preview: MigrationPreview): HierarchyCounts {
  return {
    milestones: preview.milestoneCount,
    slices: preview.totalSlices,
    tasks: preview.totalTasks,
  };
}

export async function archiveLegacyPlanningDirectory(
  sourcePath: string,
  targetRoot: string,
): Promise<LegacyArchiveResult> {
  const archiveRoot = join(gsdRoot(targetRoot), "migration", "legacy");
  const archivePath = join(archiveRoot, "planning");
  const manifestPath = join(archiveRoot, "manifest.json");

  if (existsSync(sourcePath)) {
    cpSync(sourcePath, archivePath, { recursive: true });
  }

  const manifest = {
    sourcePath,
    archivePath: relToGsd(targetRoot, archivePath),
    strategy: "full-source-copy",
    note: "Full .planning source copied so legacy content without a GSD-2 field is not lost.",
  };

  await saveFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    archived: existsSync(archivePath),
    archivePath,
    manifestPath,
    strategy: "full-source-copy",
  };
}

export async function verifyMigrationProjection(
  targetRoot: string,
  preview: MigrationPreview,
): Promise<MigrationProjectionVerification> {
  const render = await renderAllFromDb(targetRoot);
  const markdown = countMarkdownHierarchy(targetRoot);
  const db = countDbHierarchy();
  const expected = previewHierarchy(preview);
  const errors = [...render.errors];

  if (!sameCounts(db, expected)) {
    errors.push(
      `DB hierarchy ${db.milestones}M/${db.slices}S/${db.tasks}T did not match preview ${expected.milestones}M/${expected.slices}S/${expected.tasks}T`,
    );
  }
  if (!sameCounts(markdown, db)) {
    errors.push(
      `Markdown projection ${markdown.milestones}M/${markdown.slices}S/${markdown.tasks}T did not match DB ${db.milestones}M/${db.slices}S/${db.tasks}T`,
    );
  }

  if (errors.length > 0) {
    throw new Error(`migration projection verification failed: ${errors.join("; ")}`);
  }

  return {
    markdown,
    db,
    rendered: render.rendered,
    skipped: render.skipped,
    errors,
  };
}

function formatMigrationMarkdown(input: MigrationAuditInput): string {
  const backup = input.backupPath ? input.backupPath : "none";
  return [
    "# Migration Audit",
    "",
    `- Started: ${input.startedAt}`,
    `- Completed: ${input.completedAt}`,
    `- Source: ${input.sourcePath}`,
    `- Target: ${input.targetRoot}`,
    `- Backup: ${backup}`,
    `- Legacy archive: ${relToGsd(input.targetRoot, input.legacyArchive.archivePath)}`,
    "",
    "## Imported Counts",
    "",
    `- Decisions: ${input.imported.decisions}/${input.preview.decisions.total}`,
    `- Requirements: ${input.imported.requirements}/${input.preview.requirements.total}`,
    `- Milestones: ${input.imported.hierarchy.milestones}/${input.preview.milestoneCount}`,
    `- Slices: ${input.imported.hierarchy.slices}/${input.preview.totalSlices}`,
    `- Tasks: ${input.imported.hierarchy.tasks}/${input.preview.totalTasks}`,
    `- Artifacts: ${input.imported.artifacts}`,
    "",
    "## Projection Verification",
    "",
    `- DB: ${input.verification.db.milestones}M/${input.verification.db.slices}S/${input.verification.db.tasks}T`,
    `- Markdown: ${input.verification.markdown.milestones}M/${input.verification.markdown.slices}S/${input.verification.markdown.tasks}T`,
    `- Rendered: ${input.verification.rendered}`,
    `- Skipped: ${input.verification.skipped}`,
    "",
  ].join("\n");
}

export async function writeMigrationAudit(input: MigrationAuditInput): Promise<MigrationAuditResult> {
  const migrationDir = join(gsdRoot(input.targetRoot), "migration");
  const migrationPath = join(migrationDir, "MIGRATION.md");
  const manifestPath = join(migrationDir, "manifest.json");

  const manifest = {
    sourcePath: input.sourcePath,
    targetRoot: input.targetRoot,
    backupPath: input.backupPath,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    preview: input.preview,
    written: input.written.counts,
    imported: input.imported,
    legacyArchive: {
      archived: input.legacyArchive.archived,
      path: relToGsd(input.targetRoot, input.legacyArchive.archivePath),
      manifestPath: relToGsd(input.targetRoot, input.legacyArchive.manifestPath),
      strategy: input.legacyArchive.strategy,
    },
    verification: input.verification,
  };

  await saveFile(migrationPath, formatMigrationMarkdown(input));
  await saveFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    migrationPath,
    manifestPath,
    importedArtifacts: importMigrationAuditArtifacts(input.targetRoot),
  };
}

export function importMigrationAuditArtifacts(targetRoot: string): number {
  const candidates = [
    { path: join(gsdRoot(targetRoot), "migration", "MIGRATION.md"), type: "MIGRATION_AUDIT" },
    { path: join(gsdRoot(targetRoot), "migration", "manifest.json"), type: "MIGRATION_MANIFEST" },
    { path: join(gsdRoot(targetRoot), "migration", "legacy", "manifest.json"), type: "MIGRATION_LEGACY_MANIFEST" },
  ];

  let imported = 0;
  for (const candidate of candidates) {
    if (!existsSync(candidate.path)) continue;
    insertArtifact({
      path: relToGsd(targetRoot, candidate.path),
      artifact_type: candidate.type,
      milestone_id: null,
      slice_id: null,
      task_id: null,
      full_content: readFileSync(candidate.path, "utf-8"),
    });
    imported++;
  }
  return imported;
}
