/**
 * Shared utility for mapping provider-specific stop/finish reasons to the unified StopReason type.
 *
 * Each provider maps its own string values (e.g., "end_turn", "STOP", "completed") to the
 * unified StopReason. This factory eliminates duplicated switch statements across providers.
 */
import type { StopReason } from "../types.js";

/**
 * Create a stop reason mapper from a record of provider-specific reason strings to unified StopReason values.
 *
 * @param mapping - Record mapping provider reason strings to StopReason values.
 * @param options.nullValue - StopReason to return for null/undefined input. Defaults to "stop".
 * @param options.defaultValue - StopReason for unrecognized reasons. Defaults to "stop".
 *   Set to "throw" to throw an Error for unrecognized reasons (useful for exhaustive enums).
 */
export function createStopReasonMapper(
	mapping: Readonly<Record<string, StopReason>>,
	options?: { nullValue?: StopReason; defaultValue?: StopReason | "throw" },
): (reason: string | null | undefined) => StopReason {
	const nullValue = options?.nullValue ?? "stop";
	const defaultValue = options?.defaultValue ?? "stop";

	return (reason: string | null | undefined): StopReason => {
		if (reason == null) return nullValue;
		const mapped = mapping[reason];
		if (mapped !== undefined) return mapped;
		if (defaultValue === "throw") {
			throw new Error(`Unhandled stop reason: ${reason}`);
		}
		return defaultValue;
	};
}

// =============================================================================
// Pre-built mappers for each provider API
// =============================================================================

/**
 * Anthropic Messages API stop reasons.
 * Throws on unrecognized reasons since the API should only return known values.
 */
export const mapAnthropicStopReason = createStopReasonMapper(
	{
		end_turn: "stop",
		max_tokens: "length",
		tool_use: "toolUse",
		refusal: "error",
		pause_turn: "stop", // resubmit
		stop_sequence: "stop",
		sensitive: "error", // content flagged by safety filters
	},
	{ defaultValue: "throw" },
);

/**
 * OpenAI Chat Completions API finish reasons.
 * Returns "stop" for unrecognized reasons (community models may emit non-standard values like "eos_token").
 */
export const mapOpenAICompletionsStopReason = createStopReasonMapper(
	{
		stop: "stop",
		length: "length",
		function_call: "toolUse",
		tool_calls: "toolUse",
		content_filter: "error",
	},
	{ nullValue: "stop", defaultValue: "stop" },
);

/**
 * OpenAI Responses API status values.
 * Throws on unrecognized status since the API defines an exhaustive enum.
 */
export const mapOpenAIResponsesStopReason = createStopReasonMapper(
	{
		completed: "stop",
		incomplete: "length",
		failed: "error",
		cancelled: "error",
		in_progress: "stop",
		queued: "stop",
	},
	{ nullValue: "stop", defaultValue: "throw" },
);

/**
 * Google Gemini / Vertex AI FinishReason enum values.
 * Throws on unrecognized reasons to catch new enum members.
 */
export const mapGoogleFinishReason = createStopReasonMapper(
	{
		STOP: "stop",
		MAX_TOKENS: "length",
		BLOCKLIST: "error",
		PROHIBITED_CONTENT: "error",
		SPII: "error",
		SAFETY: "error",
		IMAGE_SAFETY: "error",
		IMAGE_PROHIBITED_CONTENT: "error",
		IMAGE_RECITATION: "error",
		IMAGE_OTHER: "error",
		RECITATION: "error",
		FINISH_REASON_UNSPECIFIED: "error",
		OTHER: "error",
		LANGUAGE: "error",
		MALFORMED_FUNCTION_CALL: "error",
		UNEXPECTED_TOOL_CALL: "error",
		NO_IMAGE: "error",
	},
	{ defaultValue: "throw" },
);

/**
 * Google Gemini CLI raw string finish reasons (from REST API responses).
 * Returns "error" for unrecognized reasons.
 */
export const mapGoogleFinishReasonString = createStopReasonMapper(
	{
		STOP: "stop",
		MAX_TOKENS: "length",
	},
	{ defaultValue: "error" },
);

/**
 * Mistral chat finish reasons.
 * Returns "stop" for unrecognized reasons.
 */
export const mapMistralStopReason = createStopReasonMapper(
	{
		stop: "stop",
		length: "length",
		model_length: "length",
		tool_calls: "toolUse",
		error: "error",
	},
	{ nullValue: "stop", defaultValue: "stop" },
);

/**
 * Amazon Bedrock Converse API stop reasons.
 * Returns "error" for unrecognized reasons.
 */
export const mapBedrockStopReason = createStopReasonMapper(
	{
		end_turn: "stop",
		stop_sequence: "stop",
		max_tokens: "length",
		model_context_window_exceeded: "length",
		tool_use: "toolUse",
	},
	{ nullValue: "error", defaultValue: "error" },
);
