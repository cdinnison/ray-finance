import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

async function loadConfigModule(fileConfig?: Record<string, unknown>, env: Record<string, string> = {}) {
  const homeDir = mkdtempSync(join(tmpdir(), "ray-config-"));
  vi.stubEnv("HOME", homeDir);

  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }

  if (fileConfig) {
    const rayDir = join(homeDir, ".ray");
    mkdirSync(rayDir, { recursive: true });
    writeFileSync(join(rayDir, "config.json"), JSON.stringify(fileConfig, null, 2));
  }

  vi.resetModules();
  const mod = await import("./config.js");
  return { ...mod, homeDir };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("config", () => {
  it("falls back to the legacy Anthropic config", async () => {
    const { config, hasSelfHostedLlmConfig, homeDir } = await loadConfigModule({
      anthropicKey: "anthropic-key",
      model: "claude-sonnet-4-6",
    });

    try {
      expect(config.llmProvider).toBe("anthropic");
      expect(config.llmApiKey).toBe("anthropic-key");
      expect(config.llmModel).toBe("claude-sonnet-4-6");
      expect(hasSelfHostedLlmConfig(config)).toBe(true);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("resolves OpenAI self-hosted config fields directly", async () => {
    const { config, resolveSelfHostedLlmConfig, homeDir } = await loadConfigModule({
      llmProvider: "openai",
      llmApiKey: "openai-key",
      llmModel: "gpt-5-mini",
    });

    try {
      expect(config.llmProvider).toBe("openai");
      expect(config.llmApiKey).toBe("openai-key");
      expect(resolveSelfHostedLlmConfig(config)).toEqual({
        provider: "openai",
        apiKey: "openai-key",
        baseUrl: "",
        model: "gpt-5-mini",
      });
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("defaults Ollama to the local OpenAI-compatible base URL", async () => {
    const { config, DEFAULT_OLLAMA_BASE_URL, hasSelfHostedLlmConfig, homeDir } = await loadConfigModule({
      llmProvider: "ollama",
      llmModel: "llama3.1:8b",
    });

    try {
      expect(config.llmBaseUrl).toBe(DEFAULT_OLLAMA_BASE_URL);
      expect(hasSelfHostedLlmConfig(config)).toBe(true);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("still treats managed mode as configured", async () => {
    const { isConfigured, useManaged, homeDir } = await loadConfigModule({
      rayApiKey: "ray_test_123",
    });

    try {
      expect(useManaged()).toBe(true);
      expect(isConfigured()).toBe(true);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
