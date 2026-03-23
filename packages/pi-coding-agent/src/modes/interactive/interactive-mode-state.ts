import type { AgentSessionEvent } from "../../core/agent-session.js";
import type { ActivityHandle, ActivityManager, ActivityStartOptions } from "../../core/activity-manager.js";

export interface InteractiveModeStateHost {
	defaultEditor: any;
	editor: any;
	session: any;
	ui: any;
	footer: any;
	keybindings: any;
	statusContainer: any;
	chatContainer: any;
	settingsManager: any;
	pendingTools: Map<string, any>;
	toolOutputExpanded: boolean;
	hideThinkingBlock: boolean;
	isBashMode: boolean;
	onInputCallback?: (text: string) => void;
	isInitialized: boolean;
	activityManager: ActivityManager;
	agentStatusActivity?: ActivityHandle;
	startActivity(options: ActivityStartOptions): ActivityHandle;
	runActivity<T>(operation: () => Promise<T>, options: ActivityStartOptions): Promise<T>;
	stopActivity(handle?: ActivityHandle): void;
	streamingComponent?: any;
	streamingMessage?: any;
	retryEscapeHandler?: () => void;
	retryLoader?: ActivityHandle;
	autoCompactionLoader?: ActivityHandle;
	autoCompactionEscapeHandler?: () => void;
	compactionQueuedMessages: Array<{ text: string; mode: "steer" | "followUp" }>;
	extensionSelector?: any;
	extensionInput?: any;
	extensionEditor?: any;
	editorContainer: any;
	keybindingsManager?: any;
}

export type InteractiveModeEvent = AgentSessionEvent;
