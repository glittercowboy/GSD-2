import test from "node:test";
import assert from "node:assert/strict";
import { AssistantMessageComponent } from "../../packages/pi-coding-agent/src/modes/interactive/components/assistant-message.ts";

function firstRenderedMarkdown(component: AssistantMessageComponent): any {
  return (component as any).contentContainer.children[0];
}

function longThinking() {
  return Array.from({ length: 20 }, (_, i) => `thought ${i}`).join("\n");
}

test("assistant-message caps thinking block height when text content is present", () => {
  const component = new AssistantMessageComponent({
    id: "msg-1",
    role: "assistant",
    timestamp: Date.now(),
    provider: "openai",
    model: "test-model",
    content: [
      { type: "thinking", thinking: longThinking() },
      { type: "text", text: "final answer" },
    ],
  } as any);

  assert.equal(firstRenderedMarkdown(component).maxLines, 8);
});

test("assistant-message caps thinking block height when tool content is present", () => {
  const component = new AssistantMessageComponent({
    id: "msg-2",
    role: "assistant",
    timestamp: Date.now(),
    provider: "openai",
    model: "test-model",
    content: [
      { type: "thinking", thinking: longThinking() },
      { type: "toolCall", toolCallId: "tool-1", toolName: "bash", args: {} },
    ],
  } as any);

  assert.equal(firstRenderedMarkdown(component).maxLines, 8);
});

test("assistant-message caps claude-code thinking-only traces", () => {
  const component = new AssistantMessageComponent({
    id: "msg-3",
    role: "assistant",
    timestamp: Date.now(),
    provider: "claude-code",
    model: "test-model",
    content: [{ type: "thinking", thinking: longThinking() }],
  } as any);

  assert.equal(firstRenderedMarkdown(component).maxLines, 8);
});
