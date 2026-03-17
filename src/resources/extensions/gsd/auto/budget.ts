/**
 * Budget management for auto-mode sessions.
 *
 * Tracks token/cost budget consumption and determines alert levels
 * and enforcement actions (warn, pause, halt) when thresholds are crossed.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type BudgetAlertLevel = 0 | 75 | 80 | 90 | 100;

export type BudgetEnforcementMode = "none" | "warn" | "pause" | "halt";

// ─── Alert Levels ───────────────────────────────────────────────────────────

/**
 * Map a budget percentage (0.0–1.0+) to an alert level.
 */
export function getBudgetAlertLevel(budgetPct: number): BudgetAlertLevel {
  if (budgetPct >= 1.0) return 100;
  if (budgetPct >= 0.90) return 90;
  if (budgetPct >= 0.80) return 80;
  if (budgetPct >= 0.75) return 75;
  return 0;
}

/**
 * Returns a new alert level only if it's higher than the previous one.
 * Used to fire notifications once per threshold crossing.
 */
export function getNewBudgetAlertLevel(
  previousLevel: BudgetAlertLevel,
  budgetPct: number,
): BudgetAlertLevel | null {
  const currentLevel = getBudgetAlertLevel(budgetPct);
  if (currentLevel === 0 || currentLevel <= previousLevel) return null;
  return currentLevel;
}

/**
 * Determine the enforcement action based on budget consumption.
 */
export function getBudgetEnforcementAction(
  enforcement: BudgetEnforcementMode,
  budgetPct: number,
): "none" | "warn" | "pause" | "halt" {
  if (budgetPct < 1.0) return "none";
  if (enforcement === "halt") return "halt";
  if (enforcement === "pause") return "pause";
  if (enforcement === "warn") return "warn";
  return "none";
}
