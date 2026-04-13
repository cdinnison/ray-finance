import { describe, expect, it } from "vitest";
import { getResolvedSelfHostedModelConfig, getSelfHostedProviderOptions, supportsThinking } from "./model.js";

describe("AI model resolution", () => {
  it("resolves OpenAI config directly", () => {
    expect(getResolvedSelfHostedModelConfig({
      llmProvider: "openai",
      llmApiKey: "openai-key",
      llmModel: "gpt-5-mini",
    } as any)).toEqual({
      provider: "openai",
      providerLabel: "OpenAI",
      apiKey: "openai-key",
      baseUrl: "",
      model: "gpt-5-mini",
    });
  });

  it("applies thinking only to supported Anthropic models", () => {
    expect(supportsThinking({
      llmProvider: "anthropic",
      llmModel: "claude-sonnet-4-6",
    } as any)).toBe(true);

    expect(getSelfHostedProviderOptions({
      llmProvider: "anthropic",
      llmModel: "claude-sonnet-4-6",
      thinkingBudget: 4000,
    } as any)).toEqual({
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: 4000,
        },
      },
    });
  });

  it("ignores thinking for OpenAI and Ollama", () => {
    expect(supportsThinking({
      llmProvider: "openai",
      llmModel: "gpt-5-mini",
    } as any)).toBe(false);

    expect(getSelfHostedProviderOptions({
      llmProvider: "openai",
      llmModel: "gpt-5-mini",
      thinkingBudget: 4000,
    } as any)).toBeUndefined();

    expect(getSelfHostedProviderOptions({
      llmProvider: "ollama",
      llmModel: "llama3.1:8b",
      thinkingBudget: 4000,
    } as any)).toBeUndefined();
  });
});
