// GSD Extension — Desktop Notification Helper
// Cross-platform desktop notifications for auto-mode events.
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { execSync } from "node:child_process";

export type NotifyLevel = "info" | "success" | "warning" | "error";

/**
 * Send a native desktop notification. Non-blocking, non-fatal.
 * macOS: osascript, Linux: notify-send, Windows: skipped.
 */
export function sendDesktopNotification(title: string, message: string, level: NotifyLevel = "info"): void {
  try {
    if (process.platform === "darwin") {
      const sound = level === "error" ? 'sound name "Basso"' : 'sound name "Glass"';
      const script = `display notification "${escapeAppleScript(message)}" with title "${escapeAppleScript(title)}" ${sound}`;
      execSync(`osascript -e '${script}'`, { timeout: 3000, stdio: "ignore" });
    } else if (process.platform === "linux") {
      const urgency = level === "error" ? "critical" : level === "warning" ? "normal" : "low";
      execSync(`notify-send -u ${urgency} "${escapeShell(title)}" "${escapeShell(message)}"`, { timeout: 3000, stdio: "ignore" });
    }
  } catch {
    // Non-fatal — desktop notifications are best-effort
  }
}

function escapeAppleScript(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
}

function escapeShell(s: string): string {
  return s.replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/`/g, "\\`").replace(/\n/g, " ");
}
