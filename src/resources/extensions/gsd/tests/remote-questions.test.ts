import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseSlackReply, parseDiscordResponse, formatForDiscord, formatForSlack, parseSlackReactionResponse, formatForTelegram, parseTelegramResponse } from "../../remote-questions/format.ts";
import { resolveRemoteConfig, isValidChannelId } from "../../remote-questions/config.ts";
import { DiscordAdapter } from "../../remote-questions/discord-adapter.ts";
import { isRemoteConfigured } from "../../remote-questions/manager.ts";
import { handleRemote, saveRemoteQuestionsConfig } from "../../remote-questions/remote-command.ts";
import { SlackAdapter } from "../../remote-questions/slack-adapter.ts";
import { sanitizeError } from "../../shared/sanitize.ts";

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  } as Response;
}

async function withTempGsdHome<T>(fn: (home: string) => T | Promise<T>): Promise<T> {
  const oldHome = process.env.GSD_HOME;
  const home = mkdtempSync(join(tmpdir(), "gsd-remote-home-"));
  try {
    process.env.GSD_HOME = home;
    return await fn(home);
  } finally {
    if (oldHome === undefined) delete process.env.GSD_HOME;
    else process.env.GSD_HOME = oldHome;
    rmSync(home, { recursive: true, force: true });
  }
}

test("parseSlackReply handles single-number single-question answers", () => {
  const result = parseSlackReply("2", [{
    id: "choice",
    header: "Choice",
    question: "Pick one",
    allowMultiple: false,
    options: [
      { label: "Alpha", description: "A" },
      { label: "Beta", description: "B" },
    ],
  }]);

  assert.deepEqual(result, { answers: { choice: { answers: ["Beta"] } } });
});

test("parseSlackReply handles multiline multi-question answers", () => {
  const result = parseSlackReply("1\ncustom note", [
    {
      id: "first",
      header: "First",
      question: "Pick one",
      allowMultiple: false,
      options: [
        { label: "Alpha", description: "A" },
        { label: "Beta", description: "B" },
      ],
    },
    {
      id: "second",
      header: "Second",
      question: "Explain",
      allowMultiple: false,
      options: [
        { label: "Gamma", description: "G" },
        { label: "Delta", description: "D" },
      ],
    },
  ]);

  assert.deepEqual(result, {
    answers: {
      first: { answers: ["Alpha"] },
      second: { answers: [], user_note: "custom note" },
    },
  });
});

test("parseDiscordResponse handles single-question reactions", () => {
  const result = parseDiscordResponse([{ emoji: "2️⃣", count: 1 }], null, [{
    id: "choice",
    header: "Choice",
    question: "Pick one",
    allowMultiple: false,
    options: [
      { label: "Alpha", description: "A" },
      { label: "Beta", description: "B" },
    ],
  }]);

  assert.deepEqual(result, { answers: { choice: { answers: ["Beta"] } } });
});

test("parseDiscordResponse rejects multi-question reaction parsing", () => {
  const result = parseDiscordResponse([{ emoji: "1️⃣", count: 1 }], null, [
    {
      id: "first",
      header: "First",
      question: "Pick one",
      allowMultiple: false,
      options: [{ label: "Alpha", description: "A" }],
    },
    {
      id: "second",
      header: "Second",
      question: "Pick one",
      allowMultiple: false,
      options: [{ label: "Beta", description: "B" }],
    },
  ]);

  assert.match(String(result.answers.first.user_note), /single-question prompts/i);
  assert.match(String(result.answers.second.user_note), /single-question prompts/i);
});

test("parseSlackReactionResponse handles single-question reactions", () => {
  const result = parseSlackReactionResponse(["two"], [{
    id: "choice",
    header: "Choice",
    question: "Pick one",
    allowMultiple: false,
    options: [
      { label: "Alpha", description: "A" },
      { label: "Beta", description: "B" },
    ],
  }]);

  assert.deepEqual(result, { answers: { choice: { answers: ["Beta"] } } });
});

test("parseSlackReply truncates user_note longer than 500 chars", () => {
  const longText = "x".repeat(600);
  const result = parseSlackReply(longText, [{
    id: "q1",
    header: "Q1",
    question: "Pick",
    allowMultiple: false,
    options: [{ label: "A", description: "a" }],
  }]);

  const note = result.answers.q1.user_note!;
  assert.ok(note.length <= 502, `note should be truncated, got ${note.length} chars`);
  assert.ok(note.endsWith("…"), "truncated note should end with ellipsis");
});

test("isValidChannelId rejects invalid Slack channel IDs", () => {
  // Too short
  assert.equal(isValidChannelId("slack", "C123"), false);
  // Contains invalid chars (URL injection)
  assert.equal(isValidChannelId("slack", "https://evil.com"), false);
  // Lowercase
  assert.equal(isValidChannelId("slack", "c12345678"), false);
  // Too long
  assert.equal(isValidChannelId("slack", "C1234567890AB"), false);
  // Valid: 9-12 uppercase alphanumeric
  assert.equal(isValidChannelId("slack", "C12345678"), true);
  assert.equal(isValidChannelId("slack", "C12345678AB"), true);
  assert.equal(isValidChannelId("slack", "C1234567890A"), true);
});

test("isValidChannelId rejects invalid Discord channel IDs", () => {
  // Too short
  assert.equal(isValidChannelId("discord", "12345"), false);
  // Contains letters (not a snowflake)
  assert.equal(isValidChannelId("discord", "abc12345678901234"), false);
  // URL injection
  assert.equal(isValidChannelId("discord", "https://evil.com"), false);
  // Too long (21 digits)
  assert.equal(isValidChannelId("discord", "123456789012345678901"), false);
  // Valid: 17-20 digit snowflake
  assert.equal(isValidChannelId("discord", "12345678901234567"), true);
  assert.equal(isValidChannelId("discord", "11234567890123456789"), true);
});

test("sanitizeError strips Slack token patterns from error messages", () => {
  assert.equal(
    sanitizeError("Auth failed: xoxb-1234-5678-abcdef"),
    "Auth failed: [REDACTED]",
  );
  assert.equal(
    sanitizeError("Bad token xoxp-abc-def-ghi in request"),
    "Bad token [REDACTED] in request",
  );
});

test("sanitizeError strips long opaque secrets", () => {
  const fakeDiscordToken = "MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.G1x2y3.abcdefghijklmnop";
  assert.ok(!sanitizeError(`Token: ${fakeDiscordToken}`).includes(fakeDiscordToken));
});

test("sanitizeError preserves short safe messages", () => {
  assert.equal(sanitizeError("HTTP 401: Unauthorized"), "HTTP 401: Unauthorized");
  assert.equal(sanitizeError("Connection refused"), "Connection refused");
});


// ═══════════════════════════════════════════════════════════════════════════
// Discord Parity Tests
// ═══════════════════════════════════════════════════════════════════════════

test("formatForDiscord includes context source in footer when present", () => {
  const prompt = {
    id: "test-1",
    channel: "discord" as const,
    createdAt: Date.now(),
    timeoutAt: Date.now() + 60000,
    pollIntervalMs: 5000,
    context: { source: "auto-mode-dispatch" },
    questions: [{
      id: "q1",
      header: "Confirm",
      question: "Proceed?",
      options: [
        { label: "Yes", description: "Continue" },
        { label: "No", description: "Stop" },
      ],
      allowMultiple: false,
    }],
  };

  const { embeds } = formatForDiscord(prompt);
  assert.equal(embeds.length, 1);
  assert.ok(embeds[0].footer?.text.includes("auto-mode-dispatch"), "footer should include context source");
});

test("formatForSlack includes context source when present", () => {
  const blocks = formatForSlack({
    id: "slack-1",
    channel: "slack",
    createdAt: Date.now(),
    timeoutAt: Date.now() + 60000,
    pollIntervalMs: 5000,
    context: { source: "ask_user_questions" },
    questions: [{
      id: "q1",
      header: "Confirm",
      question: "Proceed?",
      options: [
        { label: "Yes", description: "Continue" },
        { label: "No", description: "Stop" },
      ],
      allowMultiple: false,
    }],
  });

  const sourceBlock = blocks.find((block) => block.type === "context" && block.elements?.some((el) => el.text.includes("Source:")));
  assert.ok(sourceBlock, "Slack blocks should include a context source block");
});

test("formatForSlack multi-question prompts explain semicolon and newline reply format", () => {
  const blocks = formatForSlack({
    id: "slack-2",
    channel: "slack",
    createdAt: Date.now(),
    timeoutAt: Date.now() + 60000,
    pollIntervalMs: 5000,
    questions: [
      {
        id: "q1",
        header: "First",
        question: "Pick one",
        options: [
          { label: "Alpha", description: "A" },
          { label: "Beta", description: "B" },
        ],
        allowMultiple: false,
      },
      {
        id: "q2",
        header: "Second",
        question: "Explain",
        options: [
          { label: "Gamma", description: "G" },
          { label: "Delta", description: "D" },
        ],
        allowMultiple: false,
      },
    ],
  });

  const instructionBlock = blocks.find((block) => block.type === "context" && block.elements?.some((el) => el.text.includes("one line per question")));
  assert.ok(instructionBlock, "Slack multi-question prompts should explain one-line or semicolon reply format");
});

test("formatForDiscord omits source from footer when context is absent", () => {
  const prompt = {
    id: "test-2",
    channel: "discord" as const,
    createdAt: Date.now(),
    timeoutAt: Date.now() + 60000,
    pollIntervalMs: 5000,
    questions: [{
      id: "q1",
      header: "Choice",
      question: "Pick one",
      options: [
        { label: "A", description: "Alpha" },
        { label: "B", description: "Beta" },
      ],
      allowMultiple: false,
    }],
  };

  const { embeds } = formatForDiscord(prompt);
  assert.ok(!embeds[0].footer?.text.includes("Source:"), "footer should not include Source when context absent");
});

test("formatForDiscord multi-question footer includes question position", () => {
  const prompt = {
    id: "test-3",
    channel: "discord" as const,
    createdAt: Date.now(),
    timeoutAt: Date.now() + 60000,
    pollIntervalMs: 5000,
    questions: [
      {
        id: "q1",
        header: "First",
        question: "Pick",
        options: [{ label: "A", description: "a" }],
        allowMultiple: false,
      },
      {
        id: "q2",
        header: "Second",
        question: "Pick",
        options: [{ label: "B", description: "b" }],
        allowMultiple: false,
      },
    ],
  };

  const { embeds } = formatForDiscord(prompt);
  assert.equal(embeds.length, 2);
  assert.ok(embeds[0].footer?.text.includes("1/2"), "first embed footer should show 1/2");
  assert.ok(embeds[1].footer?.text.includes("2/2"), "second embed footer should show 2/2");
});

test("formatForDiscord single-question generates reaction emojis", () => {
  const prompt = {
    id: "test-4",
    channel: "discord" as const,
    createdAt: Date.now(),
    timeoutAt: Date.now() + 60000,
    pollIntervalMs: 5000,
    questions: [{
      id: "q1",
      header: "Pick",
      question: "Choose",
      options: [
        { label: "A", description: "a" },
        { label: "B", description: "b" },
        { label: "C", description: "c" },
      ],
      allowMultiple: false,
    }],
  };

  const { reactionEmojis } = formatForDiscord(prompt);
  assert.equal(reactionEmojis.length, 3, "should generate 3 reaction emojis for 3 options");
  assert.equal(reactionEmojis[0], "1️⃣");
  assert.equal(reactionEmojis[1], "2️⃣");
  assert.equal(reactionEmojis[2], "3️⃣");
});

test("formatForDiscord multi-question generates no reaction emojis", () => {
  const prompt = {
    id: "test-5",
    channel: "discord" as const,
    createdAt: Date.now(),
    timeoutAt: Date.now() + 60000,
    pollIntervalMs: 5000,
    questions: [
      {
        id: "q1",
        header: "First",
        question: "Pick",
        options: [{ label: "A", description: "a" }],
        allowMultiple: false,
      },
      {
        id: "q2",
        header: "Second",
        question: "Pick",
        options: [{ label: "B", description: "b" }],
        allowMultiple: false,
      },
    ],
  };

  const { reactionEmojis } = formatForDiscord(prompt);
  assert.equal(reactionEmojis.length, 0, "multi-question should not generate reaction emojis");
});

test("parseDiscordResponse handles multi-question text reply via semicolons", () => {
  const result = parseDiscordResponse([], "1;2", [
    {
      id: "first",
      header: "First",
      question: "Pick one",
      allowMultiple: false,
      options: [
        { label: "Alpha", description: "A" },
        { label: "Beta", description: "B" },
      ],
    },
    {
      id: "second",
      header: "Second",
      question: "Pick one",
      allowMultiple: false,
      options: [
        { label: "Gamma", description: "G" },
        { label: "Delta", description: "D" },
      ],
    },
  ]);

  assert.deepEqual(result.answers.first.answers, ["Alpha"]);
  assert.deepEqual(result.answers.second.answers, ["Delta"]);
});

test("parseDiscordResponse handles multiple reactions for allowMultiple question", () => {
  const result = parseDiscordResponse(
    [{ emoji: "1️⃣", count: 1 }, { emoji: "3️⃣", count: 1 }],
    null,
    [{
      id: "choice",
      header: "Choice",
      question: "Pick any",
      allowMultiple: true,
      options: [
        { label: "Alpha", description: "A" },
        { label: "Beta", description: "B" },
        { label: "Gamma", description: "G" },
      ],
    }],
  );

  assert.deepEqual(result.answers.choice.answers, ["Alpha", "Gamma"]);
});

test("DiscordAdapter validates guild, sends prompt URL, and acknowledges with checkmark", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchMock = mock.method(globalThis, "fetch", async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    calls.push({ url: href, method: String(init?.method ?? "GET") });
    if (href.endsWith("/users/@me")) return jsonResponse({ id: "bot-1" });
    if (href.includes("/channels/12345678901234567") && !href.includes("/messages")) return jsonResponse({ guild_id: "guild-1" });
    if (href.endsWith("/messages")) return jsonResponse({ id: "message-1" });
    return jsonResponse({});
  });
  try {
    const adapter = new DiscordAdapter("token", "12345678901234567");
    await adapter.validate();
    const result = await adapter.sendPrompt({
      id: "discord-1",
      channel: "discord",
      createdAt: Date.now(),
      timeoutAt: Date.now() + 60_000,
      pollIntervalMs: 5000,
      questions: [{
        id: "q1",
        header: "Pick",
        question: "Choose",
        allowMultiple: false,
        options: [{ label: "A", description: "a" }],
      }],
    });
    await adapter.acknowledgeAnswer(result.ref);

    assert.equal(result.ref.threadUrl, "https://discord.com/channels/guild-1/12345678901234567/message-1");
    assert.ok(calls.some((call) => call.method === "PUT" && call.url.includes(encodeURIComponent("✅"))));
  } finally {
    fetchMock.mock.restore();
  }
});

test("SlackAdapter polls reactions and acknowledges with white_check_mark", async () => {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const fetchMock = mock.method(globalThis, "fetch", async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    calls.push({ url: href, method: String(init?.method ?? "GET"), body: String(init?.body ?? "") });
    if (href.includes("/auth.test")) return jsonResponse({ ok: true, user_id: "bot-1" });
    if (href.includes("/chat.postMessage")) return jsonResponse({ ok: true, ts: "123.456", channel: "C12345678" });
    if (href.includes("/reactions.get")) {
      return jsonResponse({
        ok: true,
        message: { reactions: [{ name: "two", count: 1, users: ["human-1"] }] },
      });
    }
    return jsonResponse({ ok: true });
  });
  try {
    const adapter = new SlackAdapter("xoxb-test", "C12345678");
    await adapter.validate();
    const prompt = {
      id: "slack-1",
      channel: "slack" as const,
      createdAt: Date.now(),
      timeoutAt: Date.now() + 60_000,
      pollIntervalMs: 5000,
      questions: [{
        id: "q1",
        header: "Pick",
        question: "Choose",
        allowMultiple: false,
        options: [
          { label: "A", description: "a" },
          { label: "B", description: "b" },
        ],
      }],
    };
    const sent = await adapter.sendPrompt(prompt);
    const answer = await adapter.pollAnswer(prompt, sent.ref);
    await adapter.acknowledgeAnswer(sent.ref);

    assert.deepEqual(answer, { answers: { q1: { answers: ["B"] } } });
    assert.ok(calls.some((call) => call.url.includes("/reactions.get")));
    assert.ok(calls.some((call) =>
      call.url.includes("/reactions.add")
      && typeof call.body === "string"
      && call.body.includes("white_check_mark")
    ));
  } finally {
    fetchMock.mock.restore();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Telegram Tests
// ═══════════════════════════════════════════════════════════════════════════

test("formatForTelegram single-question produces inline keyboard", () => {
  const prompt = {
    id: "tg-1",
    channel: "telegram" as const,
    createdAt: Date.now(),
    timeoutAt: Date.now() + 60000,
    pollIntervalMs: 5000,
    questions: [{
      id: "q1",
      header: "Confirm",
      question: "Proceed?",
      options: [
        { label: "Yes", description: "Continue" },
        { label: "No", description: "Stop" },
      ],
      allowMultiple: false,
    }],
  };

  const msg = formatForTelegram(prompt);
  assert.equal(msg.parse_mode, "HTML");
  assert.ok(msg.text.includes("<b>GSD needs your input</b>"));
  assert.ok(msg.text.includes("<b>Confirm</b>"));
  assert.ok(msg.reply_markup, "single-question should have inline keyboard");
  assert.equal(msg.reply_markup!.inline_keyboard.length, 2, "should have 2 button rows");
  assert.equal(msg.reply_markup!.inline_keyboard[0][0].callback_data, "tg-1:0");
  assert.equal(msg.reply_markup!.inline_keyboard[1][0].callback_data, "tg-1:1");
});

test("formatForTelegram multi-question omits inline keyboard", () => {
  const prompt = {
    id: "tg-2",
    channel: "telegram" as const,
    createdAt: Date.now(),
    timeoutAt: Date.now() + 60000,
    pollIntervalMs: 5000,
    questions: [
      {
        id: "q1",
        header: "First",
        question: "Pick",
        options: [{ label: "A", description: "a" }],
        allowMultiple: false,
      },
      {
        id: "q2",
        header: "Second",
        question: "Pick",
        options: [{ label: "B", description: "b" }],
        allowMultiple: false,
      },
    ],
  };

  const msg = formatForTelegram(prompt);
  assert.equal(msg.reply_markup, undefined, "multi-question should not have inline keyboard");
  assert.ok(msg.text.includes("1/2"), "should show question position");
  assert.ok(msg.text.includes("2/2"), "should show question position");
});

test("formatForTelegram escapes HTML in user content", () => {
  const prompt = {
    id: "tg-3",
    channel: "telegram" as const,
    createdAt: Date.now(),
    timeoutAt: Date.now() + 60000,
    pollIntervalMs: 5000,
    questions: [{
      id: "q1",
      header: "Test <script>",
      question: "Is 5 > 3 & 2 < 4?",
      options: [{ label: "<b>Yes</b>", description: "it's true" }],
      allowMultiple: false,
    }],
  };

  const msg = formatForTelegram(prompt);
  assert.ok(msg.text.includes("&lt;script&gt;"), "should escape < > in header");
  assert.ok(msg.text.includes("5 &gt; 3 &amp; 2 &lt; 4"), "should escape in question");
  assert.ok(msg.text.includes("&lt;b&gt;Yes&lt;/b&gt;"), "should escape in option label");
});

test("parseTelegramResponse handles callback_data button press", () => {
  const questions = [{
    id: "choice",
    header: "Pick",
    question: "Choose",
    allowMultiple: false,
    options: [
      { label: "Alpha", description: "A" },
      { label: "Beta", description: "B" },
    ],
  }];

  const result = parseTelegramResponse("prompt-123:1", null, questions, "prompt-123");
  assert.deepEqual(result, { answers: { choice: { answers: ["Beta"] } } });
});

test("parseTelegramResponse handles text reply delegation", () => {
  const questions = [{
    id: "choice",
    header: "Pick",
    question: "Choose",
    allowMultiple: false,
    options: [
      { label: "Alpha", description: "A" },
      { label: "Beta", description: "B" },
    ],
  }];

  const result = parseTelegramResponse(null, "1", questions, "prompt-123");
  assert.deepEqual(result, { answers: { choice: { answers: ["Alpha"] } } });
});

test("parseTelegramResponse handles multi-question semicolons", () => {
  const questions = [
    {
      id: "first",
      header: "First",
      question: "Pick",
      allowMultiple: false,
      options: [
        { label: "Alpha", description: "A" },
        { label: "Beta", description: "B" },
      ],
    },
    {
      id: "second",
      header: "Second",
      question: "Pick",
      allowMultiple: false,
      options: [
        { label: "Gamma", description: "G" },
        { label: "Delta", description: "D" },
      ],
    },
  ];

  const result = parseTelegramResponse(null, "2;1", questions, "prompt-123");
  assert.deepEqual(result.answers.first.answers, ["Beta"]);
  assert.deepEqual(result.answers.second.answers, ["Gamma"]);
});

test("isValidChannelId validates Telegram chat IDs", () => {
  // Valid positive ID
  assert.equal(isValidChannelId("telegram", "12345"), true);
  // Valid negative group ID
  assert.equal(isValidChannelId("telegram", "-1001234567890"), true);
  // Too short
  assert.equal(isValidChannelId("telegram", "1234"), false);
  // Non-numeric
  assert.equal(isValidChannelId("telegram", "abc12345"), false);
  // URL injection
  assert.equal(isValidChannelId("telegram", "https://evil.com"), false);
});

test("sanitizeError strips Telegram bot token patterns", () => {
  const fakeToken = "1234567890:ABCdefGHIjklMNOpqrSTUvwxyz12345678";
  const result = sanitizeError(`Token: ${fakeToken}`);
  assert.ok(!result.includes("1234567890:ABC"), "should strip Telegram bot token");
});

// ═══════════════════════════════════════════════════════════════════════════
// Auth.json Token Hydration Tests
// ═══════════════════════════════════════════════════════════════════════════

test("resolveRemoteConfig uses configured channel and existing environment token", async () => {
  const saved = process.env.SLACK_BOT_TOKEN;
  try {
    await withTempGsdHome(() => {
      process.env.SLACK_BOT_TOKEN = "xoxb-existing";
      saveRemoteQuestionsConfig("slack", "C12345678");
      assert.deepEqual(resolveRemoteConfig(), {
        channel: "slack",
        channelId: "C12345678",
        timeoutMs: 5 * 60 * 1000,
        pollIntervalMs: 5 * 1000,
        token: "xoxb-existing",
      });
      assert.equal(isRemoteConfigured(), true);
    });
  } finally {
    if (saved === undefined) delete process.env.SLACK_BOT_TOKEN;
    else process.env.SLACK_BOT_TOKEN = saved;
  }
});

test("resolveRemoteConfig returns null when preferences are absent (no env side-effects)", () => {
  // Guard: ensure that with no prefs configured, resolveRemoteConfig returns null cleanly.
  // This exercises the hydration path without auth.json present (it should no-op silently).
  const savedHome = process.env.HOME;
  const savedUserProfile = process.env.USERPROFILE;
  const savedDiscord = process.env.DISCORD_BOT_TOKEN;
  const savedSlack = process.env.SLACK_BOT_TOKEN;
  const savedTelegram = process.env.TELEGRAM_BOT_TOKEN;
  try {
    // Point HOME to a nonexistent dir so auth.json lookup finds nothing.
    process.env.HOME = "/tmp/gsd-no-such-home-for-test";
    process.env.USERPROFILE = "/tmp/gsd-no-such-home-for-test";
    delete process.env.DISCORD_BOT_TOKEN;
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;

    const result = resolveRemoteConfig();
    // With no prefs file, result is null — not an exception.
    assert.equal(result, null, "resolveRemoteConfig should return null when no preferences are configured");
  } finally {
    process.env.HOME = savedHome;
    process.env.USERPROFILE = savedUserProfile;
    if (savedDiscord !== undefined) process.env.DISCORD_BOT_TOKEN = savedDiscord;
    if (savedSlack !== undefined) process.env.SLACK_BOT_TOKEN = savedSlack;
    if (savedTelegram !== undefined) process.env.TELEGRAM_BOT_TOKEN = savedTelegram;
  }
});

test("remote disconnect removes active env token and disables remote config", async () => {
  const saved = process.env.DISCORD_BOT_TOKEN;
  try {
    await withTempGsdHome(async () => {
      process.env.DISCORD_BOT_TOKEN = "discord-token";
      saveRemoteQuestionsConfig("discord", "12345678901234567");
      assert.equal(isRemoteConfigured(), true);

      const notifications: string[] = [];
      await handleRemote("disconnect", {
        ui: { notify(message: string) { notifications.push(message); } },
      } as any, {} as any);

      assert.equal(process.env.DISCORD_BOT_TOKEN, undefined);
      assert.equal(resolveRemoteConfig(), null);
      assert.ok(notifications.some((message) => message.includes("disconnected")));
    });
  } finally {
    if (saved === undefined) delete process.env.DISCORD_BOT_TOKEN;
    else process.env.DISCORD_BOT_TOKEN = saved;
  }
});
