/**
 * NDJSON (Newline-Delimited JSON) stream parser.
 * Parses Claude CLI stream-json output into typed StreamEvent objects.
 *
 * Two exports:
 * - parseNdjsonLine: pure function, parses a single line
 * - createNdjsonParser: stateful line parser that buffers partial lines and emits events via callback
 */

import type { StreamEvent, GSD2StreamEvent, PhaseTransitionPhase } from "./chat-types";

/**
 * Classify a raw parsed JSON object into a GSD2StreamEvent discriminated union.
 * Returns null for null, non-object, unknown type string, or missing required fields.
 * Never throws.
 */
export function classifyPiSdkEvent(raw: unknown): GSD2StreamEvent | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;

  const obj = raw as Record<string, unknown>;
  const type = obj["type"];
  if (typeof type !== "string") return null;

  switch (type) {
    case "text": {
      if (typeof obj["text"] !== "string") return null;
      return { kind: "plain_text", text: obj["text"] as string };
    }
    case "message_update": {
      if (typeof obj["text"] !== "string") return null;
      return { kind: "plain_text", text: obj["text"] as string };
    }
    case "assistant": {
      const message = obj["message"] as any;
      if (!message || !Array.isArray(message.content)) return null;
      // Find the first text content block
      const textBlock = message.content.find((c: any) => c.type === "text");
      if (!textBlock || typeof textBlock.text !== "string") return null;
      return { kind: "plain_text", text: textBlock.text as string };
    }
    case "tool_use": {
      if (typeof obj["name"] !== "string") return null;
      return { kind: "tool_use", name: obj["name"] as string, input: obj["input"] };
    }
    case "tool_result": {
      if (typeof obj["tool_use_id"] !== "string") return null;
      return { kind: "tool_result", tool_use_id: obj["tool_use_id"] as string, content: obj["content"] };
    }
    case "phase_transition": {
      const phase = obj["phase"];
      if (phase !== "Research" && phase !== "Planning" && phase !== "Executing" && phase !== "Complete") return null;
      return { kind: "phase_transition", phase: phase as PhaseTransitionPhase };
    }
    case "cost_update": {
      if (typeof obj["total_cost_usd"] !== "number") return null;
      if (typeof obj["input_tokens"] !== "number") return null;
      if (typeof obj["output_tokens"] !== "number") return null;
      return {
        kind: "cost_update",
        total_cost_usd: obj["total_cost_usd"] as number,
        input_tokens: obj["input_tokens"] as number,
        output_tokens: obj["output_tokens"] as number,
      };
    }
    case "stuck_detection": {
      if (typeof obj["message"] !== "string") return null;
      return { kind: "stuck_detection", message: obj["message"] as string };
    }
    case "timeout": {
      if (typeof obj["message"] !== "string") return null;
      if (typeof obj["elapsed_seconds"] !== "number") return null;
      return {
        kind: "timeout",
        message: obj["message"] as string,
        elapsed_seconds: obj["elapsed_seconds"] as number,
      };
    }
    case "auto_mode_announcement": {
      const mode = obj["mode"];
      if (mode !== "start" && mode !== "stop") return null;
      const slice = typeof obj["slice"] === "string" ? obj["slice"] : undefined;
      return { kind: "auto_mode_announcement", mode: mode as "start" | "stop", slice };
    }
    default:
      return null;
  }
}

/**
 * Parse a single NDJSON line into a StreamEvent.
 * Returns null for empty/whitespace/malformed lines (never throws).
 */
export function parseNdjsonLine(line: string): StreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as StreamEvent;
  } catch {
    return null;
  }
}

/**
 * Stateful NDJSON parser that buffers partial lines across chunks.
 * Call push() with each raw text chunk, and onEvent fires for each complete parsed event.
 * Call flush() when the stream ends to emit any remaining buffered content.
 */
export interface NdjsonParser {
  push(chunk: string): void;
  flush(): void;
}

/**
 * T-NET-02 B42: Maximum NDJSON line length cap (1 MB = 1_048_576 bytes).
 * Lines exceeding this limit are silently dropped to prevent memory exhaustion
 * from pathological AI provider responses.
 */
const MAX_LINE_LENGTH = 1_048_576;

export function createNdjsonParser(onEvent: (event: StreamEvent) => void): NdjsonParser {
  let buffer = "";

  return {
    push(chunk: string) {
      // T-NET-02 B42: Check BEFORE concatenation so the large allocation never occurs.
      // A single oversized chunk must not be appended to the buffer first.
      if (buffer.length + chunk.length > MAX_LINE_LENGTH && !chunk.includes("\n")) {
        buffer = "";
        throw new Error(
          `[ndjson-parser] NDJSON line exceeded maximum length (${MAX_LINE_LENGTH} bytes) — stream aborted`
        );
      }
      buffer += chunk;

      const lines = buffer.split("\n");
      // Last element is either empty (if chunk ended with \n) or an incomplete line
      buffer = lines.pop()!;
      for (const line of lines) {
        // T-NET-02 B42: Throw on lines that exceed the maximum line length cap
        if (line.length > MAX_LINE_LENGTH) {
          buffer = "";
          throw new Error(
            `[ndjson-parser] NDJSON line exceeded maximum length (${line.length} > ${MAX_LINE_LENGTH} bytes) — stream aborted`
          );
        }
        const event = parseNdjsonLine(line);
        if (event) {
          onEvent(event);
        }
      }
    },
    flush() {
      if (buffer.trim()) {
        // T-NET-02 B42: Also throw on oversized final buffered line on flush
        if (buffer.length > MAX_LINE_LENGTH) {
          buffer = "";
          throw new Error(
            `[ndjson-parser] Final NDJSON line exceeded maximum length (${MAX_LINE_LENGTH} bytes) — stream aborted`
          );
        }
        const event = parseNdjsonLine(buffer);
        if (event) {
          onEvent(event);
        }
      }
      buffer = "";
    },
  };
}
