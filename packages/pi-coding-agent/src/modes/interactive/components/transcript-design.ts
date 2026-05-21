// Project/App: GSD-2
// File Purpose: Shared recommended transcript rendering primitives for assistant, tool, command, footer, and auto-mode TUI surfaces.

import { alignRight, padRight, style, truncateToWidth, visibleWidth } from "@gsd/pi-tui";
import { theme, type ThemeBg, type ThemeColor } from "../theme/theme.js";
import { formatTimestamp, type TimestampFormat } from "./timestamp.js";

export type StatusTone = "running" | "success" | "error" | "warning" | "muted";
export type TuiTone = "default" | "accent" | "success" | "warning" | "error" | "muted";
export type TuiBreakpoint = "compact" | "regular" | "wide";

/** Conversation/system surfaces that the chat frame distinguishes by color. */
export type FrameTone = "assistant" | "user" | "compaction" | "skill";

export function chatMessageWidth(width: number): number {
	return Math.max(24, Math.min(width, Math.floor(width * 0.72)));
}

function trimOuterBlankLines(lines: string[]): string[] {
	let start = 0;
	let end = lines.length;
	while (start < end && lines[start].trim().length === 0) start++;
	while (end > start && lines[end - 1].trim().length === 0) end--;
	return lines.slice(start, end);
}

function copyCleanRoundedSurface(
	lines: string[],
	width: number,
	opts: {
		title: string;
		right?: string;
		borderColor: ThemeColor;
		bodyColor: ThemeColor;
		paddingX?: number;
		paddingY?: number;
	},
): string[] {
	const outerWidth = Math.max(20, width);
	const paddingX = Math.max(0, opts.paddingX ?? 3);
	const paddingY = Math.max(0, opts.paddingY ?? 1);
	const title = opts.title;
	const right = opts.right ?? "";
	const border = (text: string) => theme.fg(opts.borderColor, text);
	const contentWidth = Math.max(1, outerWidth - paddingX);

	const titleBudget = right ? Math.max(0, outerWidth - visibleWidth(right) - 9) : Math.max(0, outerWidth - 6);
	const clippedTitle = truncateToWidth(title, titleBudget, "");
	const clippedRight = right ? truncateToWidth(right, Math.max(0, outerWidth - visibleWidth(clippedTitle) - 9), "") : "";
	const fixedWidth = 3 + visibleWidth(clippedTitle) + (clippedRight ? 3 + visibleWidth(clippedRight) : 0) + 1;
	const fill = Math.max(1, outerWidth - fixedWidth);
	const top = clippedRight
		? border("╭─ ") + clippedTitle + border(` ${"─".repeat(fill)} `) + theme.fg("dim", clippedRight) + border("╮")
		: border("╭─ ") + clippedTitle + border(` ${"─".repeat(fill)}╮`);
	const bottom = border("╰" + "─".repeat(Math.max(1, outerWidth - 2)) + "╯");

	const source = trimOuterBlankLines(lines);
	const bodySource = source.length > 0 ? source : [""];
	const blank = "";
	const body = [
		...Array.from({ length: paddingY }, () => blank),
		...bodySource.map((line) =>
			" ".repeat(paddingX) +
			truncateToWidth(theme.fg(opts.bodyColor, line.trimEnd()), contentWidth, ""),
		),
		...Array.from({ length: paddingY }, () => blank),
	];

	return [top, ...body, bottom].map((line) => padRight(truncateToWidth(line, outerWidth, ""), outerWidth));
}

function toneColor(tone: StatusTone): ThemeColor {
	switch (tone) {
		case "running": return "toolRunning";
		case "success": return "border";
		case "error": return "toolError";
		case "warning": return "warning";
		case "muted":
		default: return "toolMuted";
	}
}

export function breakpoint(width: number): TuiBreakpoint {
	if (width < 72) return "compact";
	if (width < 112) return "regular";
	return "wide";
}

function panelToneColor(tone: TuiTone): ThemeColor {
	switch (tone) {
		case "accent": return "borderAccent";
		case "success": return "success";
		case "warning": return "warning";
		case "error": return "error";
		case "muted": return "borderMuted";
		case "default":
		default: return "border";
	}
}

export function badge(text: string, tone: TuiTone = "default"): string {
	return theme.fg(panelToneColor(tone), text);
}

export function keyValue(label: string, value: string, valueColor: ThemeColor = "text", labelWidth = 10): string {
	return `${theme.fg("dim", padRight(label, labelWidth))}${theme.fg(valueColor, value)}`;
}

export function roundedPanel(
	lines: string[],
	width: number,
	opts: {
		tone?: TuiTone;
		title?: string;
		rightTitle?: string;
		paddingX?: number;
	} = {},
): string[] {
	const outerWidth = Math.max(1, width);
	const body = lines.length > 0 ? lines : [""];
	if (outerWidth < 3) {
		return body.map((line) => truncateToWidth(line, outerWidth, ""));
	}

	let panel = style()
		.border("rounded")
		.borderColor((text) => theme.fg(panelToneColor(opts.tone ?? "default"), text))
		.paddingX(Math.max(0, opts.paddingX ?? 0));
	if (opts.title) {
		panel = panel.title(theme.fg("borderAccent", opts.title));
	}
	if (opts.rightTitle) {
		panel = panel.titleRight(theme.fg("dim", opts.rightTitle));
	}
	return panel.render(body, outerWidth);
}

export function rightAlign(left: string, right: string, width: number): string {
	return alignRight(left, right, width);
}

/**
 * Render a copy-clean content surface (ADR-019): a titled top rule, body
 * lines emitted with no border column or leading glyph, and a closing rule.
 * Selecting a body line in the terminal copies only its content.
 *
 * This is the target surface for transcript messages, tool output, and
 * summaries. Migration steps 3–5 move existing renderers onto it.
 */
export function openSurface(
	lines: string[],
	width: number,
	opts: { title: string; right?: string; tone: StatusTone; paddingX?: number },
): string[] {
	const tc = toneColor(opts.tone);
	let surface = style()
		.border("open")
		.title(opts.title, (text) => theme.fg("borderAccent", text))
		.borderColor((text) => theme.fg(tc, text));
	if (opts.right) {
		surface = surface.titleRight(opts.right, (text) => theme.fg(tc, text));
	}
	if (opts.paddingX !== undefined) {
		surface = surface.paddingX(opts.paddingX);
	}
	return surface.render(lines, Math.max(20, width));
}

/**
 * Render a framed system/conversation surface (compaction notices, skill
 * invocations) as a copy-clean open surface (ADR-019): a titled top rule
 * and body lines with no border column. Replaces the former chat-frame.ts.
 */
export function renderChatFrame(
	contentLines: string[],
	width: number,
	opts: {
		label: string;
		tone: FrameTone;
		timestamp?: number;
		timestampFormat: TimestampFormat;
		showTimestamp?: boolean;
	},
): string[] {
	const outerWidth = Math.max(20, width);
	const isPurple = opts.tone === "compaction" || opts.tone === "skill";
	const frameColor: ThemeColor = opts.tone === "user" ? "border" : isPurple ? "customMessageLabel" : "borderAccent";
	const bodyColor: ThemeColor =
		opts.tone === "user" ? "userMessageText" : isPurple ? "customMessageText" : "assistantMessageText";

	// A label may carry a " - " splitting a bold name from a dim detail.
	const dashIdx = opts.label.indexOf(" - ");
	const titleStyled =
		dashIdx >= 0
			? theme.fg(frameColor, theme.bold(opts.label.slice(0, dashIdx))) + theme.fg("dim", opts.label.slice(dashIdx))
			: theme.fg(frameColor, theme.bold(opts.label));
	const rightRaw =
		opts.showTimestamp === false || !opts.timestamp ? "" : formatTimestamp(opts.timestamp, opts.timestampFormat);

	const source = trimOuterBlankLines(contentLines);
	const body = (source.length > 0 ? source : [""]).map((line) => theme.fg(bodyColor, line));

	let surface = style()
		.border("open")
		.borderColor((text) => theme.fg(frameColor, text))
		.title(titleStyled);
	if (rightRaw) {
		surface = surface.titleRight(theme.fg("dim", rightRaw));
	}
	return surface.render(body, outerWidth);
}

export function renderAssistantRail(
	lines: string[],
	width: number,
	opts: { label: string; meta?: string; railColor?: ThemeColor; connected?: boolean } = { label: "GSD" },
): string[] {
	const railColor = opts.railColor ?? "borderAccent";
	const source = trimOuterBlankLines(lines);
	const indent = "";
	const innerWidth = Math.max(20, width - indent.length);
	const title = theme.fg(railColor, theme.bold(opts.label));
	const surface = copyCleanRoundedSurface(source.length > 0 ? source : [""], innerWidth, {
		title,
		right: opts.meta,
		borderColor: railColor,
		bodyColor: "assistantMessageText",
	});
	const renderedSurface = surface.map((line) => indent + theme.bg("customMessageBg", line));
	if (!opts.connected) return renderedSurface;
	return [`${indent}${theme.fg(railColor, "      ╰──────╮")}`, ...renderedSurface];
}

export function renderUserRail(
	lines: string[],
	width: number,
	opts: { label: string; meta?: string },
): string[] {
	const source = trimOuterBlankLines(lines);
	const surface = copyCleanRoundedSurface(source.length > 0 ? source : [""], Math.max(20, width), {
		title: theme.fg("border", theme.bold(opts.label)),
		right: opts.meta,
		borderColor: "border",
		bodyColor: "userMessageText",
	});
	return surface.map((line) => theme.bg("userMessageBg", line));
}

/**
 * Render a single titled rule line — the collapsed form of a tool/command
 * card on the "open" surface. `title` and `right` must be pre-styled.
 */
function openRuleLine(title: string, right: string, width: number, tone: ThemeColor): string {
	let surface = style()
		.border("open")
		.borderColor((text) => theme.fg(tone, text))
		.title(title);
	if (right) {
		surface = surface.titleRight(right);
	}
	// render([]) yields [topRule, emptyBody, bottomRule] — we want the rule.
	return surface.render([], Math.max(20, width))[0];
}

export function renderTranscriptCard(
	lines: string[],
	width: number,
	opts: {
		title: string;
		right?: string;
		tone: StatusTone;
		footerLeft?: string;
		footerRight?: string;
	},
): string[] {
	const outerWidth = Math.max(20, width);
	const tone = toneColor(opts.tone);
	const body = [...lines];
	if (opts.footerLeft || opts.footerRight) {
		body.push("");
		body.push(
			rightAlign(theme.fg("dim", opts.footerLeft ?? ""), theme.fg("dim", opts.footerRight ?? ""), outerWidth),
		);
	}
	let surface = style()
		.border("open")
		.borderColor((text) => theme.fg(tone, text))
		.title(theme.fg("borderAccent", opts.title));
	if (opts.right) {
		surface = surface.titleRight(theme.fg(tone, opts.right));
	}
	return surface.render(body, outerWidth);
}

export function renderToolLineCard(
	title: string,
	target: string | undefined,
	width: number,
	opts: { status: string; tone: StatusTone; hidden?: boolean; titlePrefix?: string; bg?: ThemeBg },
): string[] {
	const tone = toneColor(opts.tone);
	const titleText = `${opts.titlePrefix ?? ""}${theme.fg("borderAccent", title)}${
		target ? ` ${theme.fg("text", target)}` : ""
	}`;
	const statusText = opts.hidden ? `${opts.status} · output hidden · ctrl+o expand` : opts.status;
	const right = theme.fg(opts.tone === "success" ? "success" : tone, statusText);
	const rule = openRuleLine(titleText, right, width, tone);
	return [opts.bg ? theme.bg(opts.bg, rule) : rule];
}

export function renderCommandCard(
	command: string,
	width: number,
	opts: { status: string; tone: StatusTone; progress?: string },
): string[] {
	const tone = toneColor(opts.tone);
	const titleText = `${theme.fg("accent", "$")} ${theme.fg("text", command)}`;
	const statusText = opts.progress
		? `${opts.progress} ${opts.status}`
		: `${opts.status} · output hidden · ctrl+o expand`;
	const right = theme.fg(opts.tone === "success" ? "success" : tone, statusText);
	return [openRuleLine(titleText, right, width, tone)];
}

export function renderProgressBar(done: number, total: number, width: number, tone: StatusTone = "success"): string {
	const clampedWidth = Math.max(0, width);
	const pct = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;
	const filled = Math.round(pct * clampedWidth);
	return (
		theme.fg(toneColor(tone), "█".repeat(filled)) +
		theme.fg("dim", "░".repeat(clampedWidth - filled))
	);
}

export function renderFooterStrip(leftSegments: string[], right: string, width: number): string[] {
	const outerWidth = Math.max(20, width);
	const innerWidth = Math.max(1, outerWidth - 2);
	const sep = theme.fg("dim", "  │  ");
	const rightStyled = theme.fg("dim", right);
	const rightWidth = visibleWidth(rightStyled);
	const leftBudget = right ? Math.max(1, innerWidth - rightWidth - 3) : innerWidth;
	const left = truncateToWidth(leftSegments.filter(Boolean).join(sep), leftBudget, "");
	const content = rightAlign(left, rightStyled, innerWidth);
	return roundedPanel([content], outerWidth);
}
