/**
 * GSD Commit Utilities
 *
 * Conventional commit type inference and task commit message generation.
 * These are pure helpers with no side effects — safe to import anywhere.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

/** Context for generating a meaningful commit message from task execution results. */
export interface TaskCommitContext {
  taskId: string;
  taskTitle: string;
  /** The one-liner from the task summary (e.g. "Added retry-aware worker status logging") */
  oneLiner?: string;
  /** Files modified by this task (from task summary frontmatter) */
  keyFiles?: string[];
  /** GitHub issue number — appends "Resolves #N" trailer when set. */
  issueNumber?: number;
}

// ─── Commit Type Inference ─────────────────────────────────────────────────

/**
 * Keyword-to-commit-type mapping. Order matters — first match wins.
 * Each entry: [keywords[], commitType]
 */
const COMMIT_TYPE_RULES: [string[], string][] = [
  [["fix", "fixed", "fixes", "bug", "patch", "hotfix", "repair", "correct"], "fix"],
  [["refactor", "restructure", "reorganize"], "refactor"],
  [["doc", "docs", "documentation", "readme", "changelog"], "docs"],
  [["test", "tests", "testing", "spec", "coverage"], "test"],
  [["perf", "performance", "optimize", "speed", "cache"], "perf"],
  [["chore", "cleanup", "clean up", "dependencies", "deps", "bump", "config", "ci", "archive", "remove", "delete"], "chore"],
];

/**
 * Infer a conventional commit type from a title (and optional one-liner).
 * Uses case-insensitive word-boundary matching against known keywords.
 * Returns "feat" when no keywords match.
 *
 * Used for both slice squash-merge titles and task commit messages.
 */
export function inferCommitType(title: string, oneLiner?: string): string {
  const lower = `${title} ${oneLiner || ""}`.toLowerCase();

  for (const [keywords, commitType] of COMMIT_TYPE_RULES) {
    for (const keyword of keywords) {
      // "clean up" is multi-word — use indexOf for it
      if (keyword.includes(" ")) {
        if (lower.includes(keyword)) return commitType;
      } else {
        // Word boundary match: keyword must not be surrounded by word chars
        const re = new RegExp(`\\b${keyword}\\b`, "i");
        if (re.test(lower)) return commitType;
      }
    }
  }

  return "feat";
}

// ─── Commit Message Generation ─────────────────────────────────────────────

/**
 * Build a meaningful conventional commit message from task execution context.
 * Format: `{type}: {description}` (clean conventional commit — no GSD IDs in subject).
 *
 * GSD metadata is placed in a `GSD-Task:` git trailer at the end of the body,
 * following the same convention as `Signed-off-by:` or `Co-Authored-By:`.
 *
 * The description is the task summary one-liner if available (it describes
 * what was actually built), falling back to the task title (what was planned).
 */
export function buildTaskCommitMessage(ctx: TaskCommitContext): string {
  const description = ctx.oneLiner || ctx.taskTitle;
  const type = inferCommitType(ctx.taskTitle, ctx.oneLiner);

  // Truncate description to ~72 chars for subject line (full budget without scope)
  const maxDescLen = 70 - type.length;
  const truncated = description.length > maxDescLen
    ? description.slice(0, maxDescLen - 1).trimEnd() + "…"
    : description;

  const subject = `${type}: ${truncated}`;

  // Build body with key files if available
  const bodyParts: string[] = [];

  if (ctx.keyFiles && ctx.keyFiles.length > 0) {
    const fileLines = ctx.keyFiles
      .slice(0, 8) // cap at 8 files to keep commit concise
      .map(f => `- ${f}`)
      .join("\n");
    bodyParts.push(fileLines);
  }

  // Trailers: GSD-Task first, then Resolves
  bodyParts.push(`GSD-Task: ${ctx.taskId}`);

  if (ctx.issueNumber) {
    bodyParts.push(`Resolves #${ctx.issueNumber}`);
  }

  return `${subject}\n\n${bodyParts.join("\n\n")}`;
}
