import { existsSync, statSync } from "fs";
import { execSync } from "child_process";
import { platform, homedir } from "os";
import { resolve } from "path";
import chalk from "chalk";
import { config, getConfigPath, isConfigured, useManaged } from "../config.js";
import { padColumns, colors } from "./format.js";

interface Check {
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

const TICK = chalk.green("✓");
const WARN = chalk.yellow("!");
const CROSS = chalk.red("✗");

function icon(status: Check["status"]): string {
  return status === "ok" ? TICK : status === "warn" ? WARN : CROSS;
}

function octal(mode: number): string {
  return mode.toString(8);
}

function getShellName(): string {
  const shell = process.env.SHELL || "";
  if (shell.endsWith("/fish") || shell.endsWith("/fish.exe")) return "fish";
  if (shell.endsWith("/bash") || shell.endsWith("/bash.exe")) return "bash";
  return "zsh";
}

function isSyncScheduleInstalled(): boolean {
  if (platform() === "darwin") {
    const plistPath = resolve(homedir(), "Library", "LaunchAgents", "com.ray-finance.daily-sync.plist");
    return existsSync(plistPath);
  }
  try {
    const crontab = execSync("crontab -l 2>/dev/null", { encoding: "utf-8" });
    return crontab.includes("ray-finance daily sync");
  } catch {
    return false;
  }
}

export async function runDoctor(): Promise<void> {
  const checks: Check[] = [];

  // ── Config file ──
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    checks.push({ label: "Config file", status: "fail", detail: `Not found. Run ${chalk.bold("ray setup")}` });
  } else {
    const mode = statSync(configPath).mode & 0o777;
    if (mode !== 0o600) {
      checks.push({ label: "Config file", status: "warn", detail: `Permissions ${octal(mode)} — expected 600` });
    } else {
      checks.push({ label: "Config file", status: "ok", detail: configPath });
    }
  }

  // ── Auth ──
  if (!isConfigured()) {
    checks.push({ label: "Authentication", status: "fail", detail: `No API key. Run ${chalk.bold("ray setup")}` });
  } else if (useManaged()) {
    const valid = config.rayApiKey.startsWith("ray_");
    checks.push({
      label: "Authentication",
      status: valid ? "ok" : "warn",
      detail: valid ? "Ray managed (ray_***)" : "Key doesn't start with ray_ — may be invalid",
    });
  } else {
    checks.push({ label: "Authentication", status: "ok", detail: "Self-hosted (Anthropic key)" });
  }

  // ── Database ──
  const dbPath = config.dbPath;
  if (!existsSync(dbPath)) {
    checks.push({ label: "Database", status: "fail", detail: `Not found at ${dbPath}. Run ${chalk.bold("ray sync")}` });
  } else {
    try {
      const { getDb } = await import("../db/connection.js");
      const db = getDb();
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
      const tableNames = tables.map(t => t.name);
      const required = ["accounts", "transactions", "institutions"];
      const missing = required.filter(t => !tableNames.includes(t));
      if (missing.length > 0) {
        checks.push({ label: "Database", status: "warn", detail: `Missing tables: ${missing.join(", ")}` });
      } else {
        const count = (db.prepare("SELECT COUNT(*) as n FROM transactions").get() as { n: number }).n;
        checks.push({ label: "Database", status: "ok", detail: `${count.toLocaleString()} transactions, ${tableNames.length} tables` });
      }
    } catch (err: any) {
      checks.push({ label: "Database", status: "fail", detail: err.message?.slice(0, 80) || "Cannot open" });
    }
  }

  // ── Database permissions ──
  if (existsSync(dbPath)) {
    const mode = statSync(dbPath).mode & 0o777;
    if (mode !== 0o600) {
      checks.push({ label: "DB permissions", status: "warn", detail: `Permissions ${octal(mode)} — expected 600` });
    } else {
      checks.push({ label: "DB permissions", status: "ok", detail: "600 (owner only)" });
    }
  }

  // ── Encryption ──
  if (config.dbEncryptionKey) {
    checks.push({ label: "Encryption", status: "ok", detail: "AES-256-CBC enabled" });
  } else {
    checks.push({ label: "Encryption", status: "warn", detail: "No encryption key set. Data stored in plaintext." });
  }

  // ── Plaid ──
  if (useManaged()) {
    checks.push({ label: "Banking (Plaid)", status: "ok", detail: "Via Ray managed proxy" });
  } else if (config.plaidClientId && config.plaidSecret) {
    checks.push({ label: "Banking (Plaid)", status: "ok", detail: `Self-hosted (${config.plaidEnv})` });
  } else {
    checks.push({ label: "Banking (Plaid)", status: "warn", detail: `Not configured. Run ${chalk.bold("ray link")}` });
  }

  // ── Sync schedule ──
  if (config.syncSchedule) {
    const installed = isSyncScheduleInstalled();
    if (installed) {
      checks.push({ label: "Daily sync", status: "ok", detail: `Scheduled at ${config.syncSchedule}` });
    } else {
      checks.push({ label: "Daily sync", status: "warn", detail: `Config says ${config.syncSchedule} but scheduler not installed` });
    }
  } else {
    checks.push({ label: "Daily sync", status: "warn", detail: `Disabled. Set up via ${chalk.bold("ray setup")}` });
  }

  // ── Shell completions ──
  const completionPath = resolve(homedir(), ".ray", `completion.${getShellName()}`);
  if (existsSync(completionPath)) {
    checks.push({ label: "Shell completions", status: "ok", detail: completionPath });
  } else {
    checks.push({ label: "Shell completions", status: "warn", detail: "Not installed" });
  }

  // ── Node version ──
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1));
  if (major < 18) {
    checks.push({ label: "Node.js", status: "fail", detail: `${nodeVersion} — requires ≥18` });
  } else {
    checks.push({ label: "Node.js", status: "ok", detail: nodeVersion });
  }

  // ── Print ──
  console.log(chalk.bold("\nRay Doctor\n"));

  const rows: [string, string][] = checks.map(c => [
    `  ${icon(c.status)} ${c.label}`,
    colors.muted(c.detail),
  ]);
  console.log(padColumns(rows, 3));

  const fails = checks.filter(c => c.status === "fail").length;
  const warns = checks.filter(c => c.status === "warn").length;
  console.log();
  if (fails > 0) {
    console.log(colors.error(`  ${fails} issue${fails > 1 ? "s" : ""} found.`));
  } else if (warns > 0) {
    console.log(colors.warning(`  ${warns} warning${warns > 1 ? "s" : ""}, but everything should work.`));
  } else {
    console.log(colors.success("  All checks passed."));
  }
  console.log();
}
