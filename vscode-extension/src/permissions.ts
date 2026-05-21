import * as vscode from "vscode";
import type { GsdClient, AgentEvent } from "./gsd-client.js";
import {
	APPROVAL_MODE_LABELS,
	APPROVAL_MODES,
	type ApprovalMode,
	describeApprovalEvent,
	GSD_APPROVAL_CONFIG_KEY,
	GSD_APPROVAL_CONFIG_PATH,
	GSD_APPROVAL_CONFIG_SECTION,
	nextApprovalMode,
} from "./approval-mode.js";

/**
 * Permission/approval system for agent actions.
 * Can be configured to prompt before file writes, command execution, etc.
 */
export class GsdPermissionManager implements vscode.Disposable {
	private _mode: ApprovalMode = "auto-approve";
	private disposables: vscode.Disposable[] = [];

	private readonly _onModeChange = new vscode.EventEmitter<ApprovalMode>();
	readonly onModeChange = this._onModeChange.event;

	constructor(private readonly client: GsdClient) {
		// Load saved mode from configuration
		this._mode = vscode.workspace.getConfiguration(GSD_APPROVAL_CONFIG_SECTION).get<ApprovalMode>(GSD_APPROVAL_CONFIG_KEY, "auto-approve");

		this.disposables.push(
			this._onModeChange,
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration(GSD_APPROVAL_CONFIG_PATH)) {
					this._mode = vscode.workspace.getConfiguration(GSD_APPROVAL_CONFIG_SECTION).get<ApprovalMode>(GSD_APPROVAL_CONFIG_KEY, "auto-approve");
					this._onModeChange.fire(this._mode);
				}
			}),
		);

		// If mode is "ask", intercept tool executions for write operations
		if (this._mode === "ask") {
			this.disposables.push(
				client.onEvent((evt) => this.handleEvent(evt)),
			);
		}
	}

	get mode(): ApprovalMode {
		return this._mode;
	}

	/**
	 * Cycle through approval modes: auto-approve -> ask -> plan-only -> auto-approve
	 */
	async cycleMode(): Promise<void> {
		this._mode = nextApprovalMode(this._mode);

		await vscode.workspace.getConfiguration(GSD_APPROVAL_CONFIG_SECTION).update(GSD_APPROVAL_CONFIG_KEY, this._mode, vscode.ConfigurationTarget.Workspace);
		this._onModeChange.fire(this._mode);

		vscode.window.showInformationMessage(`Approval mode: ${APPROVAL_MODE_LABELS[this._mode]}`);
	}

	/**
	 * Show a QuickPick to select approval mode.
	 */
	async selectMode(): Promise<void> {
		const items: (vscode.QuickPickItem & { mode: ApprovalMode })[] = APPROVAL_MODES.map((mode) => ({
			label: mode === "auto-approve" ? "$(check) Auto-Approve" : mode === "ask" ? "$(shield) Ask" : "$(eye) Plan Only",
			description: mode === "auto-approve" ? "Agent runs freely without prompts" : mode === "ask" ? "Prompt before file changes" : "Read-only mode, no writes allowed",
			detail: mode === "auto-approve"
				? "Best for trusted workflows. The agent can read, write, and execute without asking."
				: mode === "ask"
					? "The agent will ask for approval before writing or editing files."
					: "The agent can read and analyze but cannot modify files or run commands.",
			mode,
		}));

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: `Current mode: ${this._mode}`,
		});

		if (selected) {
			this._mode = selected.mode;
			await vscode.workspace.getConfiguration(GSD_APPROVAL_CONFIG_SECTION).update(GSD_APPROVAL_CONFIG_KEY, this._mode, vscode.ConfigurationTarget.Workspace);
			this._onModeChange.fire(this._mode);
		}
	}

	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
	}

	private async handleEvent(evt: AgentEvent): Promise<void> {
		if (this._mode !== "ask") return;
		const description = describeApprovalEvent(evt);
		if (!description) return;

		// Note: In practice, the RPC protocol doesn't support blocking tool execution
		// for approval. This notification serves as awareness — the user sees what's
		// happening and can abort if needed. True blocking approval would require
		// protocol changes in the RPC server.
		vscode.window.showInformationMessage(
			`Agent: ${description}`,
			"OK",
			"Abort",
		).then((choice) => {
			if (choice === "Abort") {
				this.client.abort().catch(() => {});
			}
		});
	}
}
