import "dotenv/config";
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";

export type SelfHostedLlmProvider = "anthropic" | "openai" | "ollama";

export interface RayConfig {
  anthropicKey: string;
  rayApiKey: string;
  model: string;
  displayLocale: string;
  displayCurrency: string;
  llmProvider: SelfHostedLlmProvider;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  plaidClientId: string;
  plaidSecret: string;
  plaidEnv: string;
  bridgeClientId: string;
  bridgeClientSecret: string;
  bridgeDefaultExternalUserId: string;
  dbPath: string;
  dbEncryptionKey: string;
  plaidTokenSecret: string;
  port: number;
  userName: string;
  thinkingBudget: number;
  syncSchedule: string; // "HH:MM" for daily sync, "" for disabled
}

export const RAY_PROXY_BASE = "https://api.rayfinance.app/v1";
export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1";

const DEFAULT_LLM_MODELS: Record<SelfHostedLlmProvider, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-5-mini",
  ollama: "llama3.1:8b",
};

function normalizeProvider(value: unknown): SelfHostedLlmProvider | null {
  if (value === "anthropic" || value === "openai" || value === "ollama") return value;
  return null;
}

export function getDefaultLlmModel(provider: SelfHostedLlmProvider): string {
  return DEFAULT_LLM_MODELS[provider];
}

export function getLlmProviderLabel(provider: SelfHostedLlmProvider): string {
  switch (provider) {
    case "anthropic":
      return "Anthropic";
    case "openai":
      return "OpenAI";
    case "ollama":
      return "Ollama";
  }
}

export function resolveSelfHostedLlmConfig(input: Partial<RayConfig>) {
  const provider =
    normalizeProvider(input.llmProvider) ||
    (input.anthropicKey ? "anthropic" : "anthropic");
  const model = input.llmModel || input.model || getDefaultLlmModel(provider);
  const apiKey =
    input.llmApiKey ||
    (provider === "anthropic" ? input.anthropicKey || "" : "");
  const baseUrl =
    input.llmBaseUrl ||
    (provider === "ollama" ? DEFAULT_OLLAMA_BASE_URL : "");

  return { provider, model, apiKey, baseUrl };
}

export function hasSelfHostedLlmConfig(input: Partial<RayConfig> = config): boolean {
  const resolved = resolveSelfHostedLlmConfig(input);
  if (!resolved.model) return false;
  if (resolved.provider === "ollama") return true;
  return !!resolved.apiKey;
}

export function useManaged(): boolean {
  return !!config.rayApiKey;
}

export function hasPlaidByokConfig(): boolean {
  return !useManaged() && !!config.plaidClientId && !!config.plaidSecret;
}

export function hasBridgeByokConfig(): boolean {
  return !useManaged() && !!config.bridgeClientId && !!config.bridgeClientSecret;
}

export function canLinkAnyProvider(): boolean {
  return useManaged() || hasPlaidByokConfig() || hasBridgeByokConfig();
}

const RAY_DIR = resolve(homedir(), ".ray");

export function getConfigPath(): string {
  return resolve(RAY_DIR, "config.json");
}

function loadFileConfig(): Partial<RayConfig> {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return {};
  }
}

function buildConfig(): RayConfig {
  const file = loadFileConfig();
  const legacyAnthropicKey = file.anthropicKey || process.env.ANTHROPIC_API_KEY || "";
  const llmProvider =
    normalizeProvider(file.llmProvider || process.env.RAY_LLM_PROVIDER) ||
    (legacyAnthropicKey ? "anthropic" : "anthropic");
  const llmModel =
    file.llmModel ||
    process.env.RAY_LLM_MODEL ||
    file.model ||
    process.env.RAY_MODEL ||
    getDefaultLlmModel(llmProvider);

  return {
    anthropicKey: legacyAnthropicKey,
    rayApiKey: file.rayApiKey || process.env.RAY_API_KEY || "",
    model: file.model || process.env.RAY_MODEL || llmModel,
    displayLocale:
      file.displayLocale ||
      process.env.RAY_DISPLAY_LOCALE ||
      Intl.DateTimeFormat().resolvedOptions().locale ||
      "en-US",
    displayCurrency:
      file.displayCurrency ||
      process.env.RAY_DISPLAY_CURRENCY ||
      "",
    llmProvider,
    llmApiKey:
      file.llmApiKey ||
      process.env.RAY_LLM_API_KEY ||
      (llmProvider === "anthropic" ? legacyAnthropicKey : ""),
    llmBaseUrl:
      file.llmBaseUrl ||
      process.env.RAY_LLM_BASE_URL ||
      (llmProvider === "ollama" ? DEFAULT_OLLAMA_BASE_URL : ""),
    llmModel,
    plaidClientId: file.plaidClientId || process.env.PLAID_CLIENT_ID || "",
    plaidSecret: file.plaidSecret || process.env.PLAID_SECRET || "",
    plaidEnv: file.plaidEnv || process.env.PLAID_ENV || "production",
    bridgeClientId: file.bridgeClientId || process.env.BRIDGE_CLIENT_ID || "",
    bridgeClientSecret: file.bridgeClientSecret || process.env.BRIDGE_CLIENT_SECRET || "",
    bridgeDefaultExternalUserId: file.bridgeDefaultExternalUserId || process.env.BRIDGE_DEFAULT_EXTERNAL_USER_ID || "",
    dbPath: file.dbPath || process.env.DB_PATH || resolve(RAY_DIR, "data", "finance.db"),
    dbEncryptionKey: file.dbEncryptionKey || process.env.DB_ENCRYPTION_KEY || "",
    plaidTokenSecret: file.plaidTokenSecret || process.env.PLAID_TOKEN_SECRET || "",
    port: file.port || Number(process.env.RAY_PORT) || 9876,
    userName: file.userName || process.env.RAY_USER_NAME || "User",
    thinkingBudget: file.thinkingBudget ?? (Number(process.env.RAY_THINKING_BUDGET) || 8000),
    syncSchedule: file.syncSchedule || "",
  };
}

export const config = buildConfig();

export function isConfigured(): boolean {
  return useManaged() || hasSelfHostedLlmConfig(config);
}

export function saveConfig(partial: Partial<RayConfig>): void {
  const configPath = getConfigPath();
  const dir = resolve(RAY_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const existing = loadFileConfig();
  const merged = { ...existing, ...partial };
  writeFileSync(configPath, JSON.stringify(merged, null, 2) + "\n", { mode: 0o600 });
  try { chmodSync(configPath, 0o600); } catch {}

  // Update live config
  Object.assign(config, merged);
}
