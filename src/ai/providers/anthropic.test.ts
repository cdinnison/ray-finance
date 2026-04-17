import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
    constructor(_opts: any) {}
  },
}));

import { createAnthropicProvider } from "./anthropic.js";

const baseParams = {
  model: "claude-sonnet-4-6",
  system: "You are a test assistant",
  messages: [{ role: "user" as const, content: "hello" }],
  tools: [],
  maxTokens: 4096,
};

describe("AnthropicProvider", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("has correct name and supports thinking", () => {
    const p = createAnthropicProvider({ apiKey: "test-key" });
    expect(p.name).toBe("anthropic");
    expect(p.supportsThinking).toBe(true);
  });

  it("normalizes a text response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Hello back!" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const p = createAnthropicProvider({ apiKey: "test-key" });
    const response = await p.sendMessage(baseParams);

    expect(response.content).toEqual([{ type: "text", text: "Hello back!" }]);
    expect(response.stopReason).toBe("end_turn");
    expect(response.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
  });

  it("normalizes a tool_use response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: "text", text: "Let me check" },
        { type: "tool_use", id: "tu_123", name: "get_net_worth", input: {} },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 20, output_tokens: 15 },
    });

    const p = createAnthropicProvider({ apiKey: "test-key" });
    const response = await p.sendMessage(baseParams);

    expect(response.content).toEqual([
      { type: "text", text: "Let me check" },
      { type: "tool_use", id: "tu_123", name: "get_net_worth", input: {} },
    ]);
    expect(response.stopReason).toBe("tool_use");
  });

  it("filters out thinking blocks", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        { type: "thinking", thinking: "hmm let me think..." },
        { type: "text", text: "Here's my answer" },
      ],
      stop_reason: "end_turn",
      usage: { input_tokens: 30, output_tokens: 25 },
    });

    const p = createAnthropicProvider({ apiKey: "test-key" });
    const response = await p.sendMessage(baseParams);

    expect(response.content).toEqual([{ type: "text", text: "Here's my answer" }]);
  });

  it("passes thinking config when provided", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "ok" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 5, output_tokens: 2 },
    });

    const p = createAnthropicProvider({ apiKey: "test-key" });
    await p.sendMessage({
      ...baseParams,
      thinking: { type: "enabled", budget_tokens: 8000 },
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        thinking: { type: "enabled", budget_tokens: 8000 },
      }),
      expect.anything(),
    );
  });

  it("does not pass thinking when not provided", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "ok" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 5, output_tokens: 2 },
    });

    const p = createAnthropicProvider({ apiKey: "test-key" });
    await p.sendMessage(baseParams);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.thinking).toBeUndefined();
  });

  it("handles missing stop_reason", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "ok" }],
      stop_reason: null,
      usage: { input_tokens: 5, output_tokens: 2 },
    });

    const p = createAnthropicProvider({ apiKey: "test-key" });
    const response = await p.sendMessage(baseParams);

    expect(response.stopReason).toBe("end_turn");
  });
});
