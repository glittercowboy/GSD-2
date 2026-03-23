/**
 * Component for displaying bash command execution with streaming output.
 */

import { Container, Spacer, Text, type TUI } from "@gsd/pi-tui";
import stripAnsi from "strip-ansi";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	type TruncationResult,
	truncateTail,
} from "../../../core/tools/truncate.js";
import type { ActivityClock, ActivityHandle } from "../../../core/activity-manager.js";
import { theme } from "../theme/theme.js";
import { DynamicBorder } from "./dynamic-border.js";
import { editorKey, keyHint } from "./keybinding-hints.js";
import { truncateToVisualLines } from "./visual-truncate.js";

// Preview line limit when not expanded (matches tool execution behavior)
const PREVIEW_LINES = 20;

export class BashExecutionComponent extends Container {
	private command: string;
	private outputLines: string[] = [];
	private status: "running" | "complete" | "cancelled" | "error" = "running";
	private exitCode: number | undefined = undefined;
	private truncationResult?: TruncationResult;
	private fullOutputPath?: string;
	private expanded = false;
	private contentContainer: Container;
	private ui: TUI;
	private activity: ActivityHandle | undefined;
	private runningMessage: string;
	private spinnerFrame = 0;
	private readonly spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
	private spinnerUnsubscribe: (() => void) | undefined;
	private readonly spinnerClock: ActivityClock;

	constructor(
		command: string,
		ui: TUI,
		spinnerClock: ActivityClock,
		excludeFromContext = false,
		activity?: ActivityHandle,
	) {
		super();
		this.command = command;
		this.ui = ui;
		this.spinnerClock = spinnerClock;
		this.activity = activity;
		this.runningMessage = `Running... (${editorKey("selectCancel")} to cancel)`;

		// Use dim border for excluded-from-context commands (!! prefix)
		const colorKey = excludeFromContext ? "dim" : "bashMode";
		const borderColor = (str: string) => theme.fg(colorKey, str);

		// Add spacer
		this.addChild(new Spacer(1));

		// Top border
		this.addChild(new DynamicBorder(borderColor));

		// Content container (holds dynamic content between borders)
		this.contentContainer = new Container();
		this.addChild(this.contentContainer);

		// Command header
		const header = new Text(theme.fg(colorKey, theme.bold(`$ ${command}`)), 1, 0);
		this.contentContainer.addChild(header);
		this.startSpinner();
		this.updateDisplay();

		// Bottom border
		this.addChild(new DynamicBorder(borderColor));
	}

	/**
	 * Set whether the output is expanded (shows full output) or collapsed (preview only).
	 */
	setExpanded(expanded: boolean): void {
		this.expanded = expanded;
		this.updateDisplay();
	}

	override invalidate(): void {
		super.invalidate();
		this.updateDisplay();
	}

	appendOutput(chunk: string): void {
		// Strip ANSI codes and normalize line endings
		// Note: binary data is already sanitized in tui-renderer.ts executeBashCommand
		const clean = stripAnsi(chunk).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

		// Append to output lines
		const newLines = clean.split("\n");
		if (this.outputLines.length > 0 && newLines.length > 0) {
			// Append first chunk to last line (incomplete line continuation)
			this.outputLines[this.outputLines.length - 1] += newLines[0];
			this.outputLines.push(...newLines.slice(1));
		} else {
			this.outputLines.push(...newLines);
		}

		this.updateDisplay();
	}

	setComplete(
		exitCode: number | undefined,
		cancelled: boolean,
		truncationResult?: TruncationResult,
		fullOutputPath?: string,
	): void {
		this.exitCode = exitCode;
		this.status = cancelled
			? "cancelled"
			: exitCode !== 0 && exitCode !== undefined && exitCode !== null
				? "error"
				: "complete";
		this.truncationResult = truncationResult;
		this.fullOutputPath = fullOutputPath;

		this.stopSpinner();
		if (this.activity?.isActive()) {
			if (cancelled) {
				this.activity.stop();
			} else if (this.status === "error") {
				this.activity.fail(exitCode !== undefined ? `Exit ${exitCode}` : "Command failed");
			} else {
				this.activity.succeed();
			}
		}

		this.updateDisplay();
	}

	private updateDisplay(): void {
		// Apply truncation for LLM context limits (same limits as bash tool)
		const fullOutput = this.outputLines.join("\n");
		const contextTruncation = truncateTail(fullOutput, {
			maxLines: DEFAULT_MAX_LINES,
			maxBytes: DEFAULT_MAX_BYTES,
		});

		// Get the lines to potentially display (after context truncation)
		const availableLines = contextTruncation.content ? contextTruncation.content.split("\n") : [];

		// Apply preview truncation based on expanded state
		const previewLogicalLines = availableLines.slice(-PREVIEW_LINES);
		const hiddenLineCount = availableLines.length - previewLogicalLines.length;

		// Rebuild content container
		this.contentContainer.clear();

		// Command header
		const header = new Text(theme.fg("bashMode", theme.bold(`$ ${this.command}`)), 1, 0);
		this.contentContainer.addChild(header);

		// Output
		if (availableLines.length > 0) {
			if (this.expanded) {
				// Show all lines
				const displayText = availableLines.map((line) => theme.fg("muted", line)).join("\n");
				this.contentContainer.addChild(new Text(`\n${displayText}`, 1, 0));
			} else {
				// Use shared visual truncation utility
				const styledOutput = previewLogicalLines.map((line) => theme.fg("muted", line)).join("\n");
				const { visualLines } = truncateToVisualLines(
					`\n${styledOutput}`,
					PREVIEW_LINES,
					this.ui.terminal.columns,
					1, // padding
				);
				this.contentContainer.addChild({ render: () => visualLines, invalidate: () => {} });
			}
		}

		// Running indicator or status
		if (this.status === "running") {
			const frame = this.spinnerFrames[this.spinnerFrame];
			this.contentContainer.addChild(new Text(`\n${theme.fg("bashMode", frame)} ${theme.fg("muted", this.runningMessage)}`, 1, 0));
		} else {
			const statusParts: string[] = [];

			// Show how many lines are hidden (collapsed preview)
			if (hiddenLineCount > 0) {
				if (this.expanded) {
					statusParts.push(`(${keyHint("expandTools", "to collapse")})`);
				} else {
					statusParts.push(
						`${theme.fg("muted", `... ${hiddenLineCount} more lines`)} (${keyHint("expandTools", "to expand")})`,
					);
				}
			}

			if (this.status === "cancelled") {
				statusParts.push(theme.fg("warning", "(cancelled)"));
			} else if (this.status === "error") {
				statusParts.push(theme.fg("error", `(exit ${this.exitCode})`));
			}

			// Add truncation warning (context truncation, not preview truncation)
			const wasTruncated = this.truncationResult?.truncated || contextTruncation.truncated;
			if (wasTruncated && this.fullOutputPath) {
				statusParts.push(theme.fg("warning", `Output truncated. Full output: ${this.fullOutputPath}`));
			}

			if (statusParts.length > 0) {
				this.contentContainer.addChild(new Text(`\n${statusParts.join("\n")}`, 1, 0));
			}
		}
	}

	/**
	 * Get the raw output for creating BashExecutionMessage.
	 */
	getOutput(): string {
		return this.outputLines.join("\n");
	}

	/**
	 * Get the command that was executed.
	 */
	getCommand(): string {
		return this.command;
	}

	setRunningMessage(message: string): void {
		this.runningMessage = message;
		if (this.activity?.isActive()) {
			this.activity.setMessage(message);
		}
		this.updateDisplay();
	}

	dispose(): void {
		this.stopSpinner();
		if (this.activity?.isActive()) {
			this.activity.stop();
		}
	}

	private startSpinner(): void {
		if (this.spinnerUnsubscribe) return;
		this.spinnerUnsubscribe = this.spinnerClock.subscribe((tick) => {
			this.spinnerFrame = tick % this.spinnerFrames.length;
			this.updateDisplay();
			this.ui.requestRender();
		});
	}

	private stopSpinner(): void {
		if (this.spinnerUnsubscribe) {
			this.spinnerUnsubscribe();
			this.spinnerUnsubscribe = undefined;
		}
	}
}
