import { describe, expect, it, vi } from "vitest";
import type { RayConfig } from "../config.js";
import { DEFAULT_OLLAMA_BASE_URL } from "../config.js";
import { buildSelfHostedConfigUpdate } from "./setup.js";

const baseConfig: RayConfig = {
  anthropicKey: "",
  rayApiKey: "",
  model: "claude-sonnet-4-6",
  llmProvider: "anthropic",
  llmApiKey: "",
  llmBaseUrl: "",
  llmModel: "claude-sonnet-4-6",
  plaidClientId: "",
  plaidSecret: "",
  plaidEnv: "production",
  dbPath: ":memory:",
  dbEncryptionKey: "",
  plaidTokenSecret: "existing-token-secret",
  port: 9876,
  userName: "User",
  thinkingBudget: 8000,
  syncSchedule: "",
};

describe("buildSelfHostedConfigUpdate", () => {
  it("stores Anthropic as the active self-hosted provider", () => {
    const generateKey = vi.fn(() => "generated-key");

    const update = buildSelfHostedConfigUpdate({
      userName: "Anas",
      llmProvider: "anthropic",
      llmApiKey: "anthropic-key",
      llmModel: "claude-sonnet-4-6",
      plaidClientId: "plaid-id",
      plaidSecret: "plaid-secret",
    }, baseConfig, generateKey);

    expect(update).toMatchObject({
      userName: "Anas",
      anthropicKey: "anthropic-key",
      llmProvider: "anthropic",
      llmApiKey: "anthropic-key",
      llmModel: "claude-sonnet-4-6",
      model: "claude-sonnet-4-6",
      plaidClientId: "plaid-id",
      plaidSecret: "plaid-secret",
      plaidTokenSecret: "existing-token-secret",
    });
  });

  it("stores OpenAI without leaving the legacy Anthropic key behind", () => {
    const update = buildSelfHostedConfigUpdate({
      userName: "Anas",
      llmProvider: "openai",
      llmApiKey: "openai-key",
      llmModel: "gpt-5-mini",
    }, baseConfig, () => "generated-key");

    expect(update).toMatchObject({
      anthropicKey: "",
      llmProvider: "openai",
      llmApiKey: "openai-key",
      llmModel: "gpt-5-mini",
      model: "gpt-5-mini",
    });
  });

  it("stores Ollama with the default local base URL and no API key", () => {
    const update = buildSelfHostedConfigUpdate({
      userName: "Anas",
      llmProvider: "ollama",
      llmModel: "llama3.1:8b",
    }, baseConfig, () => "generated-key");

    expect(update).toMatchObject({
      anthropicKey: "",
      llmProvider: "ollama",
      llmApiKey: "",
      llmBaseUrl: DEFAULT_OLLAMA_BASE_URL,
      llmModel: "llama3.1:8b",
    });
  });
});
