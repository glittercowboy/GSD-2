import type { ExtensionCommandContext } from "@gsd/pi-coding-agent";
import { SettingsManager, getAgentDir } from "@gsd/pi-coding-agent";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { homedir } from "node:os";

export interface ClaudeSkillCandidate {
  type: "skill";
  name: string;
  path: string;
  root: string;
  sourceLabel: string;
}

export interface ClaudePluginCandidate {
  type: "plugin";
  name: string;
  path: string;
  root: string;
  sourceLabel: string;
  packageName?: string;
}

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".worktrees",
  "dist",
  "build",
  ".next",
  ".turbo",
  "cache",
  ".cache",
]);

function uniqueExistingDirs(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of paths) {
    const resolvedPath = resolve(candidate);
    if (seen.has(resolvedPath)) continue;
    seen.add(resolvedPath);
    if (existsSync(resolvedPath)) out.push(resolvedPath);
  }
  return out;
}

export function getClaudeSearchRoots(cwd: string): { skillRoots: string[]; pluginRoots: string[] } {
  const home = homedir();
  const parent = resolve(cwd, "..");
  const grandparent = resolve(cwd, "..", "..");

  const skillRoots = uniqueExistingDirs([
    join(home, ".claude", "skills"),
    join(home, "repos", "claude_skills"),
    join(home, "repos", "skills"),
    join(parent, "claude_skills"),
    join(parent, "skills"),
    join(grandparent, "claude_skills"),
    join(grandparent, "skills"),
  ]);

  const pluginRoots = uniqueExistingDirs([
    join(home, ".claude", "plugins"),
    join(home, "repos", "claude-plugins-official"),
    join(home, "repos", "claude_skills"),
    join(parent, "claude-plugins-official"),
    join(parent, "claude_skills"),
    join(grandparent, "claude-plugins-official"),
    join(grandparent, "claude_skills"),
  ]);

  return { skillRoots, pluginRoots };
}

function sourceLabel(path: string): string {
  const home = homedir();
  if (path.startsWith(join(home, ".claude"))) return "claude-home";
  if (path.startsWith(join(home, "repos"))) return "repos";
  return "local";
}

function walkDirs(root: string, visit: (dir: string, depth: number) => void, maxDepth = 4): void {
  function walk(dir: string, depth: number) {
    visit(dir, depth);
    if (depth >= maxDepth) return;
    let entries: Array<{ name: string; isDirectory: () => boolean }> = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), depth + 1);
    }
  }
  walk(root, 0);
}

export function discoverClaudeSkills(cwd: string): ClaudeSkillCandidate[] {
  const { skillRoots } = getClaudeSearchRoots(cwd);
  const results: ClaudeSkillCandidate[] = [];
  const seen = new Set<string>();

  for (const root of skillRoots) {
    walkDirs(root, (dir) => {
      const skillFile = join(dir, "SKILL.md");
      if (!existsSync(skillFile)) return;
      const resolvedDir = resolve(dir);
      if (seen.has(resolvedDir)) return;
      seen.add(resolvedDir);
      results.push({
        type: "skill",
        name: basename(dir),
        path: resolvedDir,
        root,
        sourceLabel: sourceLabel(root),
      });
    }, 5);
  }

  return results.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
}

export function discoverClaudePlugins(cwd: string): ClaudePluginCandidate[] {
  const { pluginRoots } = getClaudeSearchRoots(cwd);
  const results: ClaudePluginCandidate[] = [];
  const seen = new Set<string>();

  for (const root of pluginRoots) {
    walkDirs(root, (dir) => {
      const pkgPath = join(dir, "package.json");
      if (!existsSync(pkgPath)) return;
      const resolvedDir = resolve(dir);
      if (seen.has(resolvedDir)) return;
      seen.add(resolvedDir);
      let packageName: string | undefined;
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
        packageName = pkg.name;
      } catch {
        packageName = undefined;
      }
      results.push({
        type: "plugin",
        name: packageName || basename(dir),
        packageName,
        path: resolvedDir,
        root,
        sourceLabel: sourceLabel(root),
      });
    }, 4);
  }

  return results.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
}

async function chooseMany<T extends { name: string; path: string; root: string; sourceLabel: string }>(
  ctx: ExtensionCommandContext,
  title: string,
  candidates: T[],
): Promise<T[]> {
  if (candidates.length === 0) return [];

  const mode = await ctx.ui.select(`${title} (${candidates.length} found)`, [
    "Import all discovered",
    "Select individually",
    "Cancel",
  ]);

  if (!mode || mode === "Cancel") return [];
  if (mode === "Import all discovered") return candidates;

  const remaining = [...candidates];
  const selected: T[] = [];
  while (remaining.length > 0) {
    const options = [
      ...remaining.map((item) => `${item.name} — ${item.sourceLabel} — ${relative(item.root, item.path) || "."}`),
      "Done selecting",
    ];
    const picked = await ctx.ui.select(`${title}: choose an item`, options);
    if (!picked || picked === "Done selecting") break;
    const idx = options.indexOf(picked);
    if (idx < 0 || idx >= remaining.length) break;
    selected.push(remaining[idx]!);
    remaining.splice(idx, 1);
  }
  return selected;
}

function mergeStringList(existing: unknown, additions: string[]): string[] {
  const list = Array.isArray(existing) ? existing.filter((v): v is string => typeof v === "string") : [];
  const seen = new Set(list);
  for (const item of additions) {
    if (!seen.has(item)) {
      list.push(item);
      seen.add(item);
    }
  }
  return list;
}

function mergePackageSources(existing: unknown, additions: string[]): Array<string | { source: string }> {
  const current = Array.isArray(existing)
    ? existing.filter((v): v is string | { source: string } => typeof v === "string" || (typeof v === "object" && v !== null && typeof (v as { source?: unknown }).source === "string"))
    : [];

  const seen = new Set(current.map((entry) => typeof entry === "string" ? entry : entry.source));
  const merged = [...current];
  for (const add of additions) {
    if (!seen.has(add)) {
      merged.push(add);
      seen.add(add);
    }
  }
  return merged;
}

export async function runClaudeImportFlow(
  ctx: ExtensionCommandContext,
  scope: "global" | "project",
  readPrefs: () => Record<string, unknown>,
  writePrefs: (prefs: Record<string, unknown>) => Promise<void>,
): Promise<void> {
  const cwd = process.cwd();
  const settingsManager = SettingsManager.create(cwd, getAgentDir());

  const assetChoice = await ctx.ui.select("Import Claude assets into GSD/Pi config", [
    "Skills + plugins",
    "Skills only",
    "Plugins only",
    "Cancel",
  ]);
  if (!assetChoice || assetChoice === "Cancel") return;

  const importSkills = assetChoice !== "Plugins only";
  const importPlugins = assetChoice !== "Skills only";

  const discoveredSkills = importSkills ? discoverClaudeSkills(cwd) : [];
  const discoveredPlugins = importPlugins ? discoverClaudePlugins(cwd) : [];

  const selectedSkills = importSkills
    ? await chooseMany(ctx, `Claude skills → ${scope} preferences`, discoveredSkills)
    : [];
  const selectedPlugins = importPlugins
    ? await chooseMany(ctx, `Claude plugins/packages → ${scope} Pi settings`, discoveredPlugins)
    : [];

  if (selectedSkills.length === 0 && selectedPlugins.length === 0) {
    ctx.ui.notify("Claude import cancelled or nothing selected.", "info");
    return;
  }

  if (selectedSkills.length > 0) {
    const prefMode = await ctx.ui.select("How should GSD treat the imported skills?", [
      "Always use when relevant",
      "Prefer when relevant",
      "Do not modify skill preferences",
    ]);

    const prefs = readPrefs();
    const skillPaths = selectedSkills.map((skill) => skill.path);
    if (prefMode === "Always use when relevant") {
      prefs.always_use_skills = mergeStringList(prefs.always_use_skills, skillPaths);
    } else if (prefMode === "Prefer when relevant") {
      prefs.prefer_skills = mergeStringList(prefs.prefer_skills, skillPaths);
    }

    await writePrefs(prefs);

    if (scope === "project") {
      settingsManager.setProjectSkillPaths(mergeStringList(settingsManager.getProjectSettings().skills, skillPaths));
    } else {
      settingsManager.setSkillPaths(mergeStringList(settingsManager.getGlobalSettings().skills, skillPaths));
    }
  }

  if (selectedPlugins.length > 0) {
    const pluginPaths = selectedPlugins.map((plugin) => plugin.path);
    if (scope === "project") {
      settingsManager.setProjectPackages(mergePackageSources(settingsManager.getProjectSettings().packages, pluginPaths));
    } else {
      settingsManager.setPackages(mergePackageSources(settingsManager.getGlobalSettings().packages, pluginPaths));
    }
  }

  await ctx.waitForIdle();
  await ctx.reload();

  const lines = [
    `Imported Claude assets into ${scope} config:`,
    `- Skills: ${selectedSkills.length}`,
    `- Plugins/packages: ${selectedPlugins.length}`,
  ];
  if (selectedSkills.length > 0) {
    lines.push(`- Skill paths added to Pi settings (${scope}) for availability`);
    lines.push(`- Skill refs added to GSD preferences (${scope}) when selected`);
  }
  if (selectedPlugins.length > 0) {
    lines.push(`- Plugin/package paths added to Pi settings (${scope}) packages`);
  }
  ctx.ui.notify(lines.join("\n"), "info");
}
