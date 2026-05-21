// Project/App: GSD-2
// File Purpose: Compact connected status message formatting for GSD TUI notifications.

const STATUS_INDENT = "    ";
const STATUS_RULE = "────────────────────────────────────────";
const ANSI_RESET = "\x1b[0m";
const ANSI_DIM = "\x1b[2m";
const ANSI_BOLD = "\x1b[1m";
const ANSI_GREEN = "\x1b[32m";
const ANSI_RED = "\x1b[31m";
const ANSI_BLUE = "\x1b[34m";
const ANSI_CYAN = "\x1b[36m";

function color(text: string, code: string): string {
  return `${code}${text}${ANSI_RESET}`;
}

function titleColor(title: string): string {
  if (title.includes("✕") || title.toLowerCase().includes("failed")) return ANSI_RED;
  if (title.includes("✓")) return ANSI_GREEN;
  return ANSI_BLUE;
}

export function formatPostUnitStatusCard(title: string, detail?: string): string {
  const cleanTitle = title.trim();
  const cleanDetail = detail?.trim();
  const lines = [`${STATUS_INDENT}${color("╭─", ANSI_BLUE)} ${color(cleanTitle, `${titleColor(cleanTitle)}${ANSI_BOLD}`)}`];
  if (cleanDetail) {
    lines.push(`${STATUS_INDENT}   ${color(cleanDetail, ANSI_CYAN)}`);
  }
  lines.push(`${STATUS_INDENT}${color(`╰${STATUS_RULE}`, ANSI_BLUE)}`);
  return lines.join("\n");
}

export function formatConnectedStepStack(
  statusTitle: string,
  completedLabel: string,
): string {
  const statusColor = titleColor(statusTitle);
  return [
    `${STATUS_INDENT}${color("╭─", ANSI_BLUE)} ${color(statusTitle, `${statusColor}${ANSI_BOLD}`)}`,
    `${STATUS_INDENT}   ${color("Completed:", ANSI_DIM)} ${color(completedLabel, ANSI_CYAN)}`,
    `${STATUS_INDENT}${color(`╰${STATUS_RULE}`, ANSI_BLUE)}`,
  ].join("\n");
}
