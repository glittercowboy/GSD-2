/**
 * State derivation engine for the file-to-state pipeline.
 * Reads GSD 2's flat .gsd/ directory schema into a typed GSD2State object.
 * Called on startup (full rebuild) and on file change events.
 *
 * GSD 2 file schema (all files live in .gsd/ root):
 *   STATE.md            — active milestone/slice/task pointers, status
 *   M{NNN}-ROADMAP.md   — milestone structure (NNN from STATE.md active_milestone)
 *   S{NN}-PLAN.md       — slice task decomposition (NN from STATE.md active_slice)
 *   T{NN}-SUMMARY.md    — completed task output (NN from STATE.md active_task)
 *   DECISIONS.md        — architectural decision register
 *   preferences.md      — model config, budget ceiling, skill_discovery (YAML frontmatter)
 *   PROJECT.md          — living project description
 *   M{NNN}-CONTEXT.md   — user decisions for active milestone
 */
import matter from "gray-matter";
import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  GSD2State,
  GSD2ProjectState,
  GSD2Preferences,
  GSD2RoadmapState,
  GSD2SlicePlan,
  GSD2TaskSummary,
} from "./types";

// -- Default values --

const DEFAULT_GSD2_PROJECT_STATE: GSD2ProjectState = {
  gsd_state_version: "",
  milestone: "",
  milestone_name: "",
  status: "unknown",
  active_milestone: "M001",
  active_slice: "S01",
  active_task: "T01",
  auto_mode: false,
  cost: 0,
  tokens: 0,
  last_updated: "",
};

// -- File reading helpers --

async function readFileText(path: string): Promise<string | null> {
  try {
    return await Bun.file(path).text();
  } catch {
    return null;
  }
}

// -- GSD 2 STATE.md parser --

/**
 * Parses GSD 2 STATE.md content into GSD2ProjectState.
 *
 * Handles multiple YAML frontmatter blocks (gray-matter only parses the first).
 * Strategy: split on "\n---\n" boundaries, find all YAML blocks, use the LAST one.
 * This ensures the most recent state is used when STATE.md has accumulated history.
 */
export function parseGSD2State(raw: string): GSD2ProjectState {
  // Find all segments between --- delimiters
  // STATE.md may look like: ---\nblock1\n---\ncontent\n---\nblock2\n---\ncontent
  const segments = raw.split(/\n---\n|\r\n---\r\n/);

  // Collect all YAML-containing segments (those that look like frontmatter)
  // A frontmatter segment starts with "---\n" or is preceded by "---"
  // After splitting on \n---\n, even-indexed segments (0, 2, 4...) are frontmatter candidates
  // We want the LAST frontmatter block that has meaningful content
  let lastYamlData: Record<string, unknown> = {};

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i].trim();
    if (!seg) continue;

    // Try to parse this segment as YAML frontmatter
    try {
      const parsed = matter(`---\n${seg}\n---\n`);
      const data = parsed.data;
      // Only accept if it has at least one recognized GSD2 state field
      if (
        data.gsd_state_version !== undefined ||
        data.milestone !== undefined ||
        data.status !== undefined ||
        data.active_milestone !== undefined
      ) {
        lastYamlData = data as Record<string, unknown>;
      }
    } catch {
      // Not valid YAML, skip
    }
  }

  // Also try parsing with gray-matter directly on the full content
  // to catch single-block STATE.md files
  try {
    const directParsed = matter(raw);
    const directData = directParsed.data as Record<string, unknown>;
    if (
      directData.gsd_state_version !== undefined ||
      directData.active_milestone !== undefined
    ) {
      // If we got data from direct parse and segments didn't find anything better,
      // or if direct parse has active_milestone but lastYamlData doesn't, prefer segments result
      // The segment approach finds the LAST block; only use direct if no segments found
      if (Object.keys(lastYamlData).length === 0) {
        lastYamlData = directData;
      }
    }
  } catch {
    // ignore
  }

  const d = lastYamlData;

  return {
    gsd_state_version: typeof d.gsd_state_version === "string"
      ? d.gsd_state_version
      : typeof d.gsd_state_version === "number"
        ? String(d.gsd_state_version)
        : DEFAULT_GSD2_PROJECT_STATE.gsd_state_version,
    milestone: typeof d.milestone === "string"
      ? d.milestone
      : DEFAULT_GSD2_PROJECT_STATE.milestone,
    milestone_name: typeof d.milestone_name === "string"
      ? d.milestone_name
      : DEFAULT_GSD2_PROJECT_STATE.milestone_name,
    status: typeof d.status === "string"
      ? d.status
      : DEFAULT_GSD2_PROJECT_STATE.status,
    active_milestone: typeof d.active_milestone === "string"
      ? d.active_milestone
      : DEFAULT_GSD2_PROJECT_STATE.active_milestone,
    active_slice: typeof d.active_slice === "string"
      ? d.active_slice
      : DEFAULT_GSD2_PROJECT_STATE.active_slice,
    active_task: typeof d.active_task === "string"
      ? d.active_task
      : DEFAULT_GSD2_PROJECT_STATE.active_task,
    auto_mode: typeof d.auto_mode === "boolean"
      ? d.auto_mode
      : DEFAULT_GSD2_PROJECT_STATE.auto_mode,
    cost: typeof d.cost === "number"
      ? d.cost
      : DEFAULT_GSD2_PROJECT_STATE.cost,
    tokens: typeof d.tokens === "number"
      ? d.tokens
      : DEFAULT_GSD2_PROJECT_STATE.tokens,
    last_updated: typeof d.last_updated === "string"
      ? d.last_updated
      : DEFAULT_GSD2_PROJECT_STATE.last_updated,
    ...(typeof d.last_activity === "string" ? { last_activity: d.last_activity } : {}),
  };
}

// -- Migration detection --

/**
 * Detects whether the project needs migration from GSD v1 (.planning/) to GSD 2 (.gsd/).
 * Returns true when .planning/ exists but .gsd/ does not.
 */
async function checkMigrationNeeded(repoRoot: string, gsdDir: string): Promise<boolean> {
  try {
    await access(join(repoRoot, ".planning"));
    // .planning exists — now check if .gsd does NOT exist
    try {
      await access(gsdDir);
      return false; // .gsd exists — no migration needed
    } catch {
      return true; // .planning exists but .gsd does not — migration needed
    }
  } catch {
    return false; // .planning does not exist — not a v1 project
  }
}

// -- Preferences parser --

function parsePreferences(raw: string): GSD2Preferences {
  try {
    const parsed = matter(raw);
    const d = parsed.data as Record<string, unknown>;
    const prefs: GSD2Preferences = {};

    if (typeof d.research_model === "string") prefs.research_model = d.research_model;
    if (typeof d.planning_model === "string") prefs.planning_model = d.planning_model;
    if (typeof d.execution_model === "string") prefs.execution_model = d.execution_model;
    if (typeof d.completion_model === "string") prefs.completion_model = d.completion_model;
    if (typeof d.budget_ceiling === "number") prefs.budget_ceiling = d.budget_ceiling;
    if (d.skill_discovery === "auto" || d.skill_discovery === "suggest" || d.skill_discovery === "off") {
      prefs.skill_discovery = d.skill_discovery;
    }

    return prefs;
  } catch {
    return {};
  }
}

// -- Main entry point --

/**
 * Builds the complete GSD2State from a .gsd/ directory.
 * This is the main entry point for state derivation.
 *
 * Phase 1: Read STATE.md → parse active pointers
 * Phase 2: Parallel read of all derived files using dynamic paths
 * Phase 3: Parse preferences.md with gray-matter
 * Phase 4: Check migration status
 *
 * All missing files return null — never throws.
 * Calling this twice on the same files produces identical output.
 */
export async function buildFullState(gsdDir: string): Promise<GSD2State> {
  // Phase 1: Read STATE.md to get active pointers
  const stateRaw = await readFileText(join(gsdDir, "STATE.md"));
  const projectState: GSD2ProjectState = stateRaw
    ? parseGSD2State(stateRaw)
    : { ...DEFAULT_GSD2_PROJECT_STATE };

  const { active_milestone, active_slice, active_task } = projectState;

  // Phase 2: Parallel read of all derived and static files
  const [
    roadmapRaw,
    planRaw,
    summaryRaw,
    decisionsRaw,
    prefsRaw,
    projectRaw,
    contextRaw,
  ] = await Promise.all([
    readFileText(join(gsdDir, `${active_milestone}-ROADMAP.md`)),
    readFileText(join(gsdDir, `${active_slice}-PLAN.md`)),
    readFileText(join(gsdDir, `${active_task}-SUMMARY.md`)),
    readFileText(join(gsdDir, "DECISIONS.md")),
    readFileText(join(gsdDir, "preferences.md")),
    readFileText(join(gsdDir, "PROJECT.md")),
    readFileText(join(gsdDir, `${active_milestone}-CONTEXT.md`)),
  ]);

  // Phase 3: Build typed sub-state objects
  const roadmap: GSD2RoadmapState | null = roadmapRaw ? { raw: roadmapRaw } : null;
  const activePlan: GSD2SlicePlan | null = planRaw ? { raw: planRaw } : null;
  const activeTask: GSD2TaskSummary | null = summaryRaw ? { raw: summaryRaw } : null;
  const preferences: GSD2Preferences | null = prefsRaw
    ? parsePreferences(prefsRaw)
    : null;

  // Phase 4: Migration detection
  const repoRoot = resolve(gsdDir, "..");
  const needsMigration = await checkMigrationNeeded(repoRoot, gsdDir);

  return {
    projectState,
    roadmap,
    activePlan,
    activeTask,
    decisions: decisionsRaw,
    preferences,
    project: projectRaw,
    milestoneContext: contextRaw,
    needsMigration,
  };
}
