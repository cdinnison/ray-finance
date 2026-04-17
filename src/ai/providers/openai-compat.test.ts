import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } };
    constructor(_opts: any) {}
  },
}));

import { createOpenAICompatibleProvider } from "./openai-compat.js";

function makeProvider() {
  return createOpenAICompatibleProvider({
    apiKey: "test-key",
    baseURL: "https://api.openai.com/v1",
  });
}

const baseParams = {
  model: "gpt-4o",
  system: "You are a test assistant",
  messages: [{ role: "user" as const, content: "hello" }],
  tools: [
    {
      name: "get_net_worth",
      description: "Get net worth",
      input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
    },
  ],
  maxTokens: 4096,
};

describe("OpenAICompatibleProvider", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("has correct name and does not support thinking", () => {
    const p = makeProvider();
    expect(p.name).toBe("openai-compatible");
    expect(p.supportsThinking).toBe(false);
  });

  it("normalizes a text response", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: { content: "Hello!", tool_calls: null },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const p = makeProvider();
    const response = await p.sendMessage(baseParams);

    expect(response.content).toEqual([{ type: "text", text: "Hello!" }]);
    expect(response.stopReason).toBe("end_turn");
    expect(response.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
  });

  it("normalizes a tool_calls response", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: "Let me check",
          tool_calls: [{
            id: "call_123",
            type: "function",
            function: { name: "get_net_worth", arguments: "{}" },
          }],
        },
        finish_reason: "tool_calls",
      }],
      usage: { prompt_tokens: 20, completion_tokens: 15 },
    });

    const p = makeProvider();
    const response = await p.sendMessage(baseParams);

    expect(response.content).toEqual([
      { type: "text", text: "Let me check" },
      { type: "tool_use", id: "call_123", name: "get_net_worth", input: {} },
    ]);
    expect(response.stopReason).toBe("tool_use");
  });

  it("converts tool definitions to OpenAI format", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: { content: "ok", tool_calls: null },
        finish_reason: "stop",
      }],
    });

    const p = makeProvider();
    await p.sendMessage(baseParams);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [{
          type: "function",
          function: {
            name: "get_net_worth",
            description: "Get net worth",
            parameters: { type: "object", properties: {}, required: [] },
          },
        }],
      }),
      expect.anything(),
    );
  });

  it("parses arguments from JSON string", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: "call_456",
            type: "function",
            function: {
              name: "get_transactions",
              arguments: '{"start_date":"2025-01-01","limit":5}',
            },
          }],
        },
        finish_reason: "tool_calls",
      }],
    });

    const p = makeProvider();
    const response = await p.sendMessage(baseParams);

    const toolBlock = response.content.find(b => b.type === "tool_use");
    expect(toolBlock).toBeDefined();
    if (toolBlock?.type === "tool_use") {
      expect(toolBlock.input).toEqual({ start_date: "2025-01-01", limit: 5 });
    }
  });

  it("handles malformed arguments gracefully", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: "call_789",
            type: "function",
            function: { name: "get_net_worth", arguments: "not valid json" },
          }],
        },
        finish_reason: "tool_calls",
      }],
    });

    const p = makeProvider();
    const response = await p.sendMessage(baseParams);

    const toolBlock = response.content.find(b => b.type === "tool_use");
    if (toolBlock?.type === "tool_use") {
      expect(toolBlock.input).toEqual({});
    }
  });

  it("handles empty choices", async () => {
    mockCreate.mockResolvedValueOnce({ choices: [] });

    const p = makeProvider();
    const response = await p.sendMessage(baseParams);

    expect(response.content).toEqual([]);
    expect(response.stopReason).toBe("end_turn");
  });

  it("converts system message and tool results in messages", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: { content: "done", tool_calls: null },
        finish_reason: "stop",
      }],
    });

    const p = makeProvider();
    await p.sendMessage({
      ...baseParams,
      messages: [
        { role: "user", content: "check my net worth" },
        {
          role: "assistant",
          content: [
            { type: "text" as const, text: "Let me check" },
            { type: "tool_use" as const, id: "tu_1", name: "get_net_worth", input: {} },
          ],
        },
        {
          role: "user",
          content: [
            { type: "tool_result" as const, tool_use_id: "tu_1", content: "Net worth: $50,000" },
          ],
        },
      ],
    });

    const callArgs = mockCreate.mock.calls[0][0];

    // System message first
    expect(callArgs.messages[0]).toEqual({ role: "system", content: "You are a test assistant" });

    // User message
    expect(callArgs.messages[1]).toEqual({ role: "user", content: "check my net worth" });

    // Assistant with tool call
    expect(callArgs.messages[2].role).toBe("assistant");
    expect(callArgs.messages[2].tool_calls).toHaveLength(1);
    expect(callArgs.messages[2].tool_calls[0].function.name).toBe("get_net_worth");

    // Tool result
    expect(callArgs.messages[3]).toEqual({
      role: "tool",
      tool_call_id: "tu_1",
      content: "Net worth: $50,000",
    });
  });

  it("ignores thinking config silently", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: { content: "ok", tool_calls: null },
        finish_reason: "stop",
      }],
    });

    const p = makeProvider();
    await p.sendMessage({
      ...baseParams,
      thinking: { type: "enabled", budget_tokens: 8000 },
    });

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.thinking).toBeUndefined();
  });

  it("skips non-function tool calls", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: null,
          tool_calls: [
            { id: "call_1", type: "custom", custom: {} },
            { id: "call_2", type: "function", function: { name: "get_net_worth", arguments: "{}" } },
          ],
        },
        finish_reason: "tool_calls",
      }],
    });

    const p = makeProvider();
    const response = await p.sendMessage(baseParams);

    // Should only include the function tool call
    expect(response.content).toHaveLength(1);
    expect(response.content[0]).toEqual({
      type: "tool_use",
      id: "call_2",
      name: "get_net_worth",
      input: {},
    });
  });
});
