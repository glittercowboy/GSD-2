/**
 * Core modules shared between all run modes.
 */

export {
	AgentSession,
	type AgentSessionConfig,
	type AgentSessionEvent,
	type AgentSessionEventListener,
	type ModelCycleResult,
	type PromptOptions,
	type SessionStats,
} from "./agent-session.js";
export {
	ActivityManager,
	type ActivityClock,
	type ActivityClockTick,
	type ActivityChangeEvent,
	type ActivityHandle,
	type ActivityLane,
	type ActivitySnapshot,
	type ActivityStartOptions,
	type ActivityState,
} from "./activity-manager.js";
export { type BashExecutorOptions, type BashResult, executeBash, executeBashWithOperations } from "./bash-executor.js";
export { FallbackResolver, type FallbackResult } from "./fallback-resolver.js";
export type { CompactionResult } from "./compaction/index.js";
export { createEventBus, type EventBus, type EventBusController } from "./event-bus.js";

// Extensions system
export {
	type AgentEndEvent,
	type AgentStartEvent,
	type AgentToolResult,
	type AgentToolUpdateCallback,
	type BeforeAgentStartEvent,
	type ContextEvent,
	discoverAndLoadExtensions,
	type ExecOptions,
	type ExecResult,
	type Extension,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	type ExtensionError,
	type ExtensionEvent,
	type ExtensionFactory,
	type ExtensionFlag,
	type ExtensionHandler,
	ExtensionRunner,
	type ExtensionShortcut,
	type ExtensionUIActivityApi,
	type ExtensionUIActivityHandle,
	type ExtensionUIActivityLane,
	type ExtensionUIActivityOptions,
	type ExtensionUIContext,
	type LoadExtensionsResult,
	type MessageRenderer,
	type RegisteredCommand,
	type SessionBeforeCompactEvent,
	type SessionBeforeForkEvent,
	type SessionBeforeSwitchEvent,
	type SessionBeforeTreeEvent,
	type SessionCompactEvent,
	type SessionForkEvent,
	type SessionShutdownEvent,
	type SessionStartEvent,
	type SessionSwitchEvent,
	type SessionTreeEvent,
	type ToolCallEvent,
	type ToolDefinition,
	type ToolRenderResultOptions,
	type ToolResultEvent,
	type TurnEndEvent,
	type TurnStartEvent,
	wrapToolsWithExtensions,
} from "./extensions/index.js";
