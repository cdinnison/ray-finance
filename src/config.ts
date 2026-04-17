import "dotenv/config";
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";

export interface RayConfig {
  anthropicKey: string;
  rayApiKey: string;
  model: string;
  providerType: "anthropic" | "openai-compatible";
  openaiCompatibleKey: string;
  openaiCompatibleBaseURL: string;
  plaidClientId: string;
  plaidSecret: string;
  plaidEnv: string;
  dbPath: string;
  dbEncryptionKey: string;
  plaidTokenSecret: string;
  port: number;
  userName: string;
  thinkingBudget: number;
  syncSchedule: string; // "HH:MM" for daily sync, "" for disabled
  plaidCountries: string[]; // ISO country codes for Plaid Link (e.g. ["US", "GB"])
  mcpMutations: boolean;
}

export const RAY_PROXY_BASE = "https://api.rayfinance.app/v1";

export function useManaged(): boolean {
  return !!config.rayApiKey;
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
  return {
    anthropicKey: file.anthropicKey || process.env.ANTHROPIC_API_KEY || "",
    rayApiKey: file.rayApiKey || process.env.RAY_API_KEY || "",
    model: file.model || process.env.RAY_MODEL || "claude-sonnet-4-6",
    providerType: file.providerType || (process.env.RAY_PROVIDER as any) || "anthropic",
    openaiCompatibleKey: file.openaiCompatibleKey || process.env.OPENAI_COMPATIBLE_KEY || "",
    openaiCompatibleBaseURL: file.openaiCompatibleBaseURL || process.env.OPENAI_COMPATIBLE_BASE_URL || "",
    plaidClientId: file.plaidClientId || process.env.PLAID_CLIENT_ID || "",
    plaidSecret: file.plaidSecret || process.env.PLAID_SECRET || "",
    plaidEnv: file.plaidEnv || process.env.PLAID_ENV || "production",
    dbPath: file.dbPath || process.env.DB_PATH || resolve(RAY_DIR, "data", "finance.db"),
    dbEncryptionKey: file.dbEncryptionKey || process.env.DB_ENCRYPTION_KEY || "",
    plaidTokenSecret: file.plaidTokenSecret || process.env.PLAID_TOKEN_SECRET || "",
    port: file.port || Number(process.env.RAY_PORT) || 9876,
    userName: file.userName || process.env.RAY_USER_NAME || "User",
    thinkingBudget: file.thinkingBudget ?? (Number(process.env.RAY_THINKING_BUDGET) || 8000),
    syncSchedule: file.syncSchedule || "",
    plaidCountries: file.plaidCountries || ["US", "GB", "CA"],
    mcpMutations: file.mcpMutations ?? (process.env.RAY_MCP_MUTATIONS === "true"),
  };
}

export const config = buildConfig();

export function isConfigured(): boolean {
  return !!config.anthropicKey || !!config.rayApiKey || !!config.openaiCompatibleKey;
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
