/**
 * GSD Codebase Map Generator
 *
 * Produces .gsd/CODEBASE.md — a structural table of contents for the project.
 * Gives fresh agent contexts instant orientation without filesystem exploration.
 *
 * Generation: walk `git ls-files`, group by directory, output with descriptions.
 * Maintenance: agent updates descriptions as it works; incremental update preserves them.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, extname } from "node:path";

import { execSync } from "node:child_process";
import { gsdRoot } from "./paths.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CodebaseMapOptions {
  excludePatterns?: string[];
  maxFiles?: number;
  collapseThreshold?: number;
}

interface FileEntry {
  path: string;
  description: string;
}

interface DirectoryGroup {
  path: string;
  files: FileEntry[];
  collapsed: boolean;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_EXCLUDES = [
  ".gsd/",
  ".planning/",
  ".git/",
  "node_modules/",
  "dist/",
  "build/",
  ".next/",
  "coverage/",
  "__pycache__/",
  ".venv/",
  "vendor/",
];

const DEFAULT_MAX_FILES = 500;
const DEFAULT_COLLAPSE_THRESHOLD = 20;

// ─── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Parse an existing CODEBASE.md to extract file → description mappings.
 */
export function parseCodebaseMap(content: string): Map<string, string> {
  const descriptions = new Map<string, string>();
  for (const line of content.split("\n")) {
    // Match: - `path/to/file.ts` — Description here
    const match = line.match(/^- `(.+?)` — (.+)$/);
    if (match) {
      descriptions.set(match[1], match[2]);
    }
    // Match: - `path/to/file.ts` (no description)
    const bareMatch = line.match(/^- `(.+?)`\s*$/);
    if (bareMatch) {
      descriptions.set(bareMatch[1], "");
    }
  }
  return descriptions;
}

// ─── File Enumeration ────────────────────────────────────────────────────────

function shouldExclude(filePath: string, excludes: string[]): boolean {
  for (const pattern of excludes) {
    if (pattern.endsWith("/")) {
      if (filePath.startsWith(pattern) || filePath.includes(`/${pattern}`)) return true;
    } else if (filePath === pattern || filePath.endsWith(`/${pattern}`)) {
      return true;
    }
  }
  // Skip binary/lock files
  const ext = extname(filePath).toLowerCase();
  if ([".lock", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".svg"].includes(ext)) {
    return true;
  }
  return false;
}

function lsFiles(basePath: string): string[] {
  try {
    // Use git ls-files directly — nativeLsFiles("") doesn't work in all contexts
    const result = execSync("git ls-files", { cwd: basePath, encoding: "utf-8", timeout: 10000 });
    return result.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function enumerateFiles(basePath: string, excludes: string[], maxFiles: number): string[] {
  let files: string[];
  try {
    files = lsFiles(basePath);
  } catch {
    return [];
  }

  const filtered = files.filter((f) => !shouldExclude(f, excludes));

  if (filtered.length > maxFiles) {
    return filtered.slice(0, maxFiles);
  }

  return filtered;
}

// ─── Grouping ────────────────────────────────────────────────────────────────

function groupByDirectory(
  files: string[],
  descriptions: Map<string, string>,
  collapseThreshold: number,
): DirectoryGroup[] {
  const dirMap = new Map<string, FileEntry[]>();

  for (const file of files) {
    const dir = dirname(file);
    const dirKey = dir === "." ? "" : dir;
    if (!dirMap.has(dirKey)) {
      dirMap.set(dirKey, []);
    }
    dirMap.get(dirKey)!.push({
      path: file,
      description: descriptions.get(file) ?? "",
    });
  }

  const groups: DirectoryGroup[] = [];
  const sortedDirs = [...dirMap.keys()].sort();

  for (const dir of sortedDirs) {
    const files = dirMap.get(dir)!;
    files.sort((a, b) => a.path.localeCompare(b.path));

    groups.push({
      path: dir,
      files,
      collapsed: files.length > collapseThreshold,
    });
  }

  return groups;
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function renderCodebaseMap(groups: DirectoryGroup[], totalFiles: number, truncated: boolean): string {
  const lines: string[] = [];
  const now = new Date().toISOString().slice(0, 19) + "Z";
  const described = groups.reduce((sum, g) => sum + g.files.filter((f) => f.description).length, 0);

  lines.push("# Codebase Map");
  lines.push("");
  lines.push(`Generated: ${now} | Files: ${totalFiles} | Described: ${described}/${totalFiles}`);
  if (truncated) {
    lines.push(`Note: Truncated to first ${totalFiles} files. Run with higher --max-files to include all.`);
  }
  lines.push("");

  for (const group of groups) {
    const heading = group.path || "(root)";
    // Use ### for directories to keep hierarchy flat and scannable
    lines.push(`### ${heading}/`);

    if (group.collapsed) {
      // Summarize collapsed directories
      const extensions = new Map<string, number>();
      for (const f of group.files) {
        const ext = extname(f.path) || "(no ext)";
        extensions.set(ext, (extensions.get(ext) ?? 0) + 1);
      }
      const extSummary = [...extensions.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([ext, count]) => `${count} ${ext}`)
        .join(", ");
      lines.push(`- *(${group.files.length} files: ${extSummary})*`);
    } else {
      for (const file of group.files) {
        if (file.description) {
          lines.push(`- \`${file.path}\` — ${file.description}`);
        } else {
          lines.push(`- \`${file.path}\``);
        }
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate a fresh CODEBASE.md from scratch.
 * Preserves existing descriptions if `existingDescriptions` is provided.
 */
export function generateCodebaseMap(
  basePath: string,
  options?: CodebaseMapOptions,
  existingDescriptions?: Map<string, string>,
): { content: string; fileCount: number; truncated: boolean } {
  const excludes = [...DEFAULT_EXCLUDES, ...(options?.excludePatterns ?? [])];
  const maxFiles = options?.maxFiles ?? DEFAULT_MAX_FILES;
  const collapseThreshold = options?.collapseThreshold ?? DEFAULT_COLLAPSE_THRESHOLD;

  const files = enumerateFiles(basePath, excludes, maxFiles);
  const truncated = files.length >= maxFiles;
  const descriptions = existingDescriptions ?? new Map<string, string>();
  const groups = groupByDirectory(files, descriptions, collapseThreshold);
  const content = renderCodebaseMap(groups, files.length, truncated);

  return { content, fileCount: files.length, truncated };
}

/**
 * Incremental update: re-scan files, preserve existing descriptions,
 * add new files, remove deleted files.
 */
export function updateCodebaseMap(
  basePath: string,
  options?: CodebaseMapOptions,
): { content: string; added: number; removed: number; unchanged: number; fileCount: number } {
  const codebasePath = join(gsdRoot(basePath), "CODEBASE.md");

  // Load existing descriptions
  let existingDescriptions = new Map<string, string>();
  if (existsSync(codebasePath)) {
    const existing = readFileSync(codebasePath, "utf-8");
    existingDescriptions = parseCodebaseMap(existing);
  }

  const existingFiles = new Set(existingDescriptions.keys());

  // Generate new map preserving descriptions
  const result = generateCodebaseMap(basePath, options, existingDescriptions);

  // Count changes
  const newFiles = new Set<string>();
  const excludes = [...DEFAULT_EXCLUDES, ...(options?.excludePatterns ?? [])];
  const maxFiles = options?.maxFiles ?? DEFAULT_MAX_FILES;
  const currentFiles = enumerateFiles(basePath, excludes, maxFiles);

  for (const f of currentFiles) {
    if (!existingFiles.has(f)) newFiles.add(f);
  }

  const currentSet = new Set(currentFiles);
  let removed = 0;
  for (const f of existingFiles) {
    if (!currentSet.has(f)) removed++;
  }

  return {
    content: result.content,
    added: newFiles.size,
    removed,
    unchanged: currentFiles.length - newFiles.size,
    fileCount: result.fileCount,
  };
}

/**
 * Write CODEBASE.md to .gsd/ directory.
 */
export function writeCodebaseMap(basePath: string, content: string): string {
  const root = gsdRoot(basePath);
  mkdirSync(root, { recursive: true });
  const outPath = join(root, "CODEBASE.md");
  writeFileSync(outPath, content, "utf-8");
  return outPath;
}

/**
 * Read existing CODEBASE.md, or return null if it doesn't exist.
 */
export function readCodebaseMap(basePath: string): string | null {
  const codebasePath = join(gsdRoot(basePath), "CODEBASE.md");
  if (!existsSync(codebasePath)) return null;
  try {
    return readFileSync(codebasePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Get stats about the codebase map.
 */
export function getCodebaseMapStats(basePath: string): {
  exists: boolean;
  fileCount: number;
  describedCount: number;
  undescribedCount: number;
  generatedAt: string | null;
} {
  const content = readCodebaseMap(basePath);
  if (!content) {
    return { exists: false, fileCount: 0, describedCount: 0, undescribedCount: 0, generatedAt: null };
  }

  const descriptions = parseCodebaseMap(content);
  const described = [...descriptions.values()].filter((d) => d.length > 0).length;
  const dateMatch = content.match(/Generated: (\S+)/);

  return {
    exists: true,
    fileCount: descriptions.size,
    describedCount: described,
    undescribedCount: descriptions.size - described,
    generatedAt: dateMatch?.[1] ?? null,
  };
}
