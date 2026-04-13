import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { config, getLlmProviderLabel, resolveSelfHostedLlmConfig, type RayConfig, type SelfHostedLlmProvider } from "../config.js";

export interface ResolvedSelfHostedModelConfig {
  provider: SelfHostedLlmProvider;
  providerLabel: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export function getResolvedSelfHostedModelConfig(input: Partial<RayConfig> = config): ResolvedSelfHostedModelConfig {
  const resolved = resolveSelfHostedLlmConfig(input);
  return {
    ...resolved,
    providerLabel: getLlmProviderLabel(resolved.provider),
  };
}

export function supportsThinking(input: Partial<RayConfig> = config): boolean {
  const { provider, model } = getResolvedSelfHostedModelConfig(input);
  return provider === "anthropic" && /sonnet-4|opus-4/i.test(model);
}

export function createSelfHostedModel(input: Partial<RayConfig> = config) {
  const resolved = getResolvedSelfHostedModelConfig(input);

  switch (resolved.provider) {
    case "anthropic":
      return createAnthropic({ apiKey: resolved.apiKey })(resolved.model);
    case "openai":
      return createOpenAI({ apiKey: resolved.apiKey })(resolved.model);
    case "ollama":
      return createOpenAICompatible({
        name: "ollama",
        apiKey: resolved.apiKey || "ollama",
        baseURL: resolved.baseUrl,
      })(resolved.model);
  }
}

export function getSelfHostedProviderOptions(input: Partial<RayConfig> = config) {
  const resolved = getResolvedSelfHostedModelConfig(input);
  if (resolved.provider !== "anthropic" || !supportsThinking(input)) {
    return undefined;
  }

  const budgetTokens = input.thinkingBudget ?? 0;
  if (budgetTokens <= 0) return undefined;

  return {
    anthropic: {
      thinking: {
        type: "enabled" as const,
        budgetTokens,
      },
    },
  };
}
