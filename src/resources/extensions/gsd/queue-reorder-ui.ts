/**
 * GSD Queue Reorder UI
 *
 * Interactive TUI overlay for reordering pending milestones.
 * ↑/↓ navigates cursor. Space grabs/releases item for moving.
 * While grabbed, ↑/↓ swaps the item with its neighbor.
 * Enter confirms all changes. Esc cancels.
 * Conflicting depends_on entries are auto-removed on confirm.
 */

import type { ExtensionContext } from "@gsd/pi-coding-agent";
import { type Theme } from "@gsd/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, type TUI } from "@gsd/pi-tui";
import { makeUI } from "../shared/tui.js";
import { GLYPH } from "../shared/mod.js";
import { validateQueueOrder, type DependencyValidation } from "./queue-order.js";

export interface ReorderItem {
  id: string;
  title: string;
  dependsOn?: string[];
}

export interface ReorderResult {
  order: string[];
  /** depends_on entries to remove from CONTEXT.md files */
  depsToRemove: Array<{ milestone: string; dep: string }>;
}

/**
 * Show the queue reorder overlay.
 * Returns the new order + deps to remove, or null if cancelled.
 */
export async function showQueueReorder(
  ctx: ExtensionContext,
  completed: ReorderItem[],
  pending: ReorderItem[],
): Promise<ReorderResult | null> {
  if (!ctx.hasUI) return null;
  if (pending.length < 2) return null;

  const result = await ctx.ui.custom<ReorderResult | null>((tui: TUI, theme: Theme, _kb, done) => {
    const items = [...pending];
    let cursor = 0;
    let grabbed = false;
    let scrollOffset = 0;
    let cachedLines: string[] | undefined;
    let validation: DependencyValidation;

    // Mutable deps map — tracks removals during this session
    const liveDeps = new Map<string, string[]>();
    for (const item of [...completed, ...pending]) {
      if (item.dependsOn && item.dependsOn.length > 0) {
        liveDeps.set(item.id, [...item.dependsOn]);
      }
    }

    const removedDeps: Array<{ milestone: string; dep: string }> = [];
    const completedIds = new Set(completed.map(c => c.id));

    function revalidate() {
      validation = validateQueueOrder(items.map(i => i.id), liveDeps, completedIds);
    }

    revalidate();

    function refresh() {
      cachedLines = undefined;
      tui.requestRender();
    }

    function swapItems(fromIdx: number, toIdx: number) {
      if (toIdx < 0 || toIdx >= items.length) return;
      const [item] = items.splice(fromIdx, 1);
      items.splice(toIdx, 0, item);
      cursor = toIdx;
      revalidate();
      refresh();
    }

    function removeDep(milestone: string, dep: string) {
      const deps = liveDeps.get(milestone);
      if (!deps) return;
      const idx = deps.indexOf(dep);
      if (idx >= 0) {
        deps.splice(idx, 1);
        if (deps.length === 0) liveDeps.delete(milestone);
        removedDeps.push({ milestone, dep });
        const item = items.find(i => i.id === milestone);
        if (item?.dependsOn) {
          item.dependsOn = item.dependsOn.filter(d => d !== dep);
        }
        revalidate();
        refresh();
      }
    }

    function handleInput(data: string) {
      if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
        done(null);
        return;
      }

      // Confirm — auto-resolve would_block violations
      if (matchesKey(data, Key.enter)) {
        const wouldBlock = validation.violations.filter(v => v.type === 'would_block');
        for (const v of wouldBlock) {
          removeDep(v.milestone, v.dependsOn);
        }
        done({ order: items.map(i => i.id), depsToRemove: removedDeps });
        return;
      }

      // Space — toggle grab mode
      if (data === " ") {
        grabbed = !grabbed;
        refresh();
        return;
      }

      // ↑/↓ — move grabbed item OR navigate cursor
      if (matchesKey(data, Key.up)) {
        if (grabbed) {
          swapItems(cursor, cursor - 1);
        } else {
          cursor = Math.max(0, cursor - 1);
          refresh();
        }
        return;
      }
      if (matchesKey(data, Key.down)) {
        if (grabbed) {
          swapItems(cursor, cursor + 1);
        } else {
          cursor = Math.min(items.length - 1, cursor + 1);
          refresh();
        }
        return;
      }

      // 'd' — manually remove a dep on the cursor item
      if (data === "d" || data === "D") {
        const item = items[cursor];
        const deps = liveDeps.get(item.id);
        if (deps) {
          const activeDep = deps.find(d => !completedIds.has(d));
          if (activeDep) removeDep(item.id, activeDep);
        }
        return;
      }
    }

    function render(width: number): string[] {
      if (cachedLines) return cachedLines;

      const ui = makeUI(theme, width);
      const lines: string[] = [];
      const queueRows: string[] = [];
      const push = (...rows: string[][]) => { for (const r of rows) lines.push(...r); };
      const add = (s: string) => truncateToWidth(s, width);
      let cursorQueueRow = 0;

      const headerText = grabbed ? "  Queue Reorder — Moving Item" : "  Queue Reorder";
      push(ui.bar(), ui.blank(), ui.header(headerText), ui.blank());

      // Completed milestones (dimmed)
      if (completed.length > 0) {
        lines.push(add(theme.fg("dim", "  Completed:")));
        for (const m of completed) {
          const label = m.title && m.title !== m.id ? `${m.id}  ${m.title}` : m.id;
          lines.push(add(`    ${theme.fg("dim", `${GLYPH.statusDone} ${label}`)}`));
        }
        push(ui.blank());
      }

      // Pending milestones
      const queueLabel = grabbed ? "  Queue (space to release, ↑/↓ to move):" : "  Queue (space to grab, ↑/↓ to navigate):";
      lines.push(add(theme.fg("text", queueLabel)));

      const violatedPairs = new Set(
        validation.violations.filter(v => v.type === 'would_block').map(v => `${v.milestone}:${v.dependsOn}`),
      );
      const redundantPairs = new Set(
        validation.redundant.map(r => `${r.milestone}:${r.dependsOn}`),
      );

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const isCursor = i === cursor;
        const num = i + 1;
        const label = item.title && item.title !== item.id ? `${item.id}  ${item.title}` : item.id;

        if (isCursor && grabbed) {
          cursorQueueRow = queueRows.length;
          queueRows.push(add(`  ${theme.fg("warning", `▸▸ ${num}. ${label}`)}`));
        } else if (isCursor) {
          cursorQueueRow = queueRows.length;
          queueRows.push(add(`  ${theme.fg("accent", `${GLYPH.cursor} ${num}. ${label}`)}`));
        } else {
          queueRows.push(add(`    ${theme.fg("text", `${num}. ${label}`)}`));
        }

        // depends_on annotations
        const deps = liveDeps.get(item.id) ?? [];
        for (const dep of deps) {
          if (completedIds.has(dep)) continue;
          const pairKey = `${item.id}:${dep}`;
          if (violatedPairs.has(pairKey)) {
            queueRows.push(add(`       ${theme.fg("warning", `${GLYPH.statusWarning} depends_on: ${dep} — auto-removed on confirm`)}`));
          } else if (redundantPairs.has(pairKey)) {
            queueRows.push(add(`       ${theme.fg("dim", `↳ depends_on: ${dep} (redundant)`)}`));
          } else {
            queueRows.push(add(`       ${theme.fg("dim", `↳ depends_on: ${dep}`)}`));
          }
        }

        // Missing deps
        for (const v of validation.violations.filter(v => v.milestone === item.id && v.type === 'missing_dep')) {
          queueRows.push(add(`       ${theme.fg("error", `${GLYPH.statusWarning} depends_on: ${v.dependsOn} (does not exist)`)}`));
        }
      }

      // Removed deps feedback
      const trailingLines: string[] = [];
      if (removedDeps.length > 0) {
        trailingLines.push(...ui.blank());
        for (const r of removedDeps) {
          trailingLines.push(add(`  ${theme.fg("success", `${GLYPH.statusDone} Removed: ${r.milestone} depends_on ${r.dep}`)}`));
        }
      }

      // Circular warning
      const circ = validation.violations.find(v => v.type === 'circular');
      if (circ) {
        trailingLines.push(...ui.blank());
        trailingLines.push(add(`  ${theme.fg("error", `${GLYPH.statusWarning} ${circ.message}`)}`));
      }

      trailingLines.push(...ui.blank());

      // Hints — context-sensitive based on grab state
      const hints: string[] = [];
      if (grabbed) {
        hints.push("↑/↓ move item", "space release");
      } else {
        hints.push("↑/↓ navigate", "space grab");
      }
      const hasDeps = liveDeps.get(items[cursor]?.id)?.some(d => !completedIds.has(d));
      if (hasDeps) hints.push("d del dep");

      const wouldBlockCount = validation.violations.filter(v => v.type === 'would_block').length;
      if (wouldBlockCount > 0) {
        hints.push(`enter (fixes ${wouldBlockCount} dep)`);
      } else {
        hints.push("enter ok");
      }
      hints.push("esc");

      trailingLines.push(...ui.hints(hints), ...ui.bar());

      const maxOverlayRows = Math.max(10, process.stdout.rows ? Math.floor(process.stdout.rows * 0.8) : 24);
      const availableQueueRows = Math.max(1, maxOverlayRows - lines.length - trailingLines.length);
      const maxScroll = Math.max(0, queueRows.length - availableQueueRows);
      if (cursorQueueRow < scrollOffset) {
        scrollOffset = cursorQueueRow;
      } else if (cursorQueueRow >= scrollOffset + availableQueueRows) {
        scrollOffset = cursorQueueRow - availableQueueRows + 1;
      }
      scrollOffset = Math.min(Math.max(scrollOffset, 0), maxScroll);

      lines.push(...queueRows.slice(scrollOffset, scrollOffset + availableQueueRows), ...trailingLines);

      cachedLines = lines;
      return lines;
    }

    return { render, invalidate: () => { cachedLines = undefined; }, handleInput };
  }, {
    overlay: true,
    overlayOptions: { width: "70%", minWidth: 50, maxHeight: "80%", anchor: "center" },
  });

  // Fallback for RPC mode where ctx.ui.custom() returns undefined.
  // Reorder requires interactive input — notify and return null.
  if (result === undefined) {
    ctx.ui.notify(
      "Queue reorder requires an interactive terminal. Current order: " +
        pending.map(p => p.id).join(" → "),
      "warning",
    );
    return null;
  }

  return result;
}
