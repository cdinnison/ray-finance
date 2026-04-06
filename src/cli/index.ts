#!/usr/bin/env node
import { resolve } from "path";
import { homedir } from "os";

// --demo flag: use dedicated demo database (must run before config import)
const isDemoMode = process.argv.includes("--demo");
if (isDemoMode) {
  process.argv = process.argv.filter(a => a !== "--demo");
}

import { Command } from "commander";
import { createRequire } from "module";
import { config, isConfigured, useManaged, RAY_PROXY_BASE } from "../config.js";
import { helpScreen } from "./format.js";

// Override config for demo mode (demo DB is unencrypted)
if (isDemoMode) {
  config.dbPath = resolve(homedir(), ".ray", "data", "demo.db");
  config.dbEncryptionKey = "";
}

const require = createRequire(import.meta.url);
const { version } = require("../../package.json");

const program = new Command();

program
  .name("ray")
  .description("Personal finance AI assistant")
  .version(version)
  .addHelpCommand(false)
  .action(async () => {
    if (!isConfigured()) {
      console.log("Ray is not configured yet. Running setup...\n");
      const { runSetup } = await import("./setup.js");
      await runSetup();
      return;
    }
    const { startChat } = await import("./chat.js");
    await startChat();
  });

program
  .command("setup")
  .description("Configure Ray (API keys, preferences)")
  .action(async () => {
    const { runSetup } = await import("./setup.js");
    await runSetup();
  });

program
  .command("sync")
  .description("Sync transactions from linked banks")
  .action(async () => {
    ensureConfigured();
    const { runSync } = await import("./commands.js");
    await runSync();
  });

program
  .command("link")
  .description("Link a new financial account via Plaid")
  .action(async () => {
    ensureConfigured();
    if (!useManaged() && (!config.plaidClientId || !config.plaidSecret)) {
      console.error("Plaid credentials not configured. Run 'ray setup' to add them, or use a Ray API key for easy setup.");
      process.exit(1);
    }
    const { runLink } = await import("./commands.js");
    await runLink();
  });

program
  .command("add")
  .description("Add a manual account (home, car, crypto, etc.)")
  .action(async () => {
    ensureConfigured();
    const { runAdd } = await import("./commands.js");
    await runAdd();
  });

program
  .command("remove")
  .description("Remove a manual account")
  .action(async () => {
    ensureConfigured();
    const { runRemove } = await import("./commands.js");
    await runRemove();
  });

program
  .command("accounts")
  .description("Show linked accounts and balances")
  .action(async () => {
    ensureConfigured();
    const { showAccounts } = await import("./commands.js");
    await showAccounts();
  });

program
  .command("status")
  .description("Show financial overview")
  .action(async () => {
    ensureConfigured();
    const { showStatus } = await import("./commands.js");
    showStatus();
  });

program
  .command("transactions")
  .description("Show recent transactions")
  .option("-n, --limit <number>", "Number of transactions", "20")
  .option("-c, --category <category>", "Filter by category")
  .option("-m, --merchant <name>", "Filter by merchant")
  .action(async (opts) => {
    ensureConfigured();
    const { showTransactions } = await import("./commands.js");
    showTransactions({ limit: Number(opts.limit), category: opts.category, merchant: opts.merchant });
  });

program
  .command("spending")
  .description("Show spending breakdown")
  .argument("[period]", "Period: this_month, last_month, last_30, last_90", "this_month")
  .action(async (period) => {
    ensureConfigured();
    const { showSpending } = await import("./commands.js");
    await showSpending(period);
  });

program
  .command("budgets")
  .description("Show budget statuses")
  .action(async () => {
    ensureConfigured();
    const { showBudgets } = await import("./commands.js");
    showBudgets();
  });

program
  .command("goals")
  .description("Show financial goals")
  .action(async () => {
    ensureConfigured();
    const { showGoals } = await import("./commands.js");
    showGoals();
  });

program
  .command("score")
  .description("Show daily financial score and streaks")
  .action(async () => {
    ensureConfigured();
    const { showScore } = await import("./commands.js");
    showScore();
  });

program
  .command("alerts")
  .description("Show financial alerts")
  .action(async () => {
    ensureConfigured();
    const { showAlerts } = await import("./commands.js");
    showAlerts();
  });

program
  .command("export")
  .description("Export user data (goals, budgets, memories, context) to a backup file")
  .argument("[path]", "Output file path", undefined)
  .action(async (path) => {
    ensureConfigured();
    const { runExport } = await import("./backup.js");
    runExport(path);
  });

program
  .command("import")
  .description("Restore user data from a backup file")
  .argument("<path>", "Backup file path")
  .action(async (path) => {
    ensureConfigured();
    const { runImport } = await import("./backup.js");
    runImport(path);
  });

program
  .command("billing")
  .description("Manage your Ray subscription")
  .action(async () => {
    ensureConfigured();
    if (!useManaged()) {
      console.log("You're using self-hosted keys. No subscription to manage.");
      return;
    }
    const open = (await import("open")).default;
    console.log("Opening billing portal...");
    try {
      const resp = await fetch(`${RAY_PROXY_BASE.replace("/v1", "")}/stripe/portal`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Authorization": `Bearer ${config.rayApiKey}`,
        },
      });
      const { url } = await resp.json() as { url: string };
      // Only open URLs from trusted domains
      const parsed = new URL(url);
      if (!parsed.hostname.endsWith("stripe.com") && !parsed.hostname.endsWith("rayfinance.app")) {
        console.error("Unexpected billing URL. Visit https://rayfinance.app/billing");
      } else {
        await open(url);
      }
    } catch {
      console.error("Could not open billing portal. Visit https://rayfinance.app/billing");
    }
  });

program
  .command("update")
  .description("Update Ray to the latest version")
  .action(async () => {
    const { runUpdate } = await import("./updater.js");
    await runUpdate(version);
  });

program
  .command("doctor")
  .description("Check system health")
  .action(async () => {
    const { runDoctor } = await import("./doctor.js");
    await runDoctor();
  });

program
  .command("demo")
  .description("Seed a demo database with realistic fake data")
  .action(async () => {
    const demoPath = resolve(homedir(), ".ray", "data", "demo.db");
    const { seedDemoDb } = await import("../demo/seed.js");
    seedDemoDb(demoPath);
  });

program
  .command("completions")
  .description("Install shell completions")
  .action(async () => {
    const { installCompletions } = await import("./completions.js");
    installCompletions();
  });

function ensureConfigured(): void {
  if (isDemoMode) return;
  if (!isConfigured()) {
    console.error("Ray is not configured. Run 'ray setup' first.");
    process.exit(1);
  }
}

// Custom help screen
program.configureHelp({
  formatHelp: () => helpScreen([
    { name: "setup", desc: "Configure Ray (API keys, preferences)" },
    { name: "link", desc: "Link a new financial account via Plaid" },
    { name: "add", desc: "Add a manual account (home, car, crypto, etc.)" },
    { name: "remove", desc: "Remove a manual account" },
    { name: "sync", desc: "Sync transactions from linked banks" },
    { name: "accounts", desc: "Show linked accounts and balances" },
    { name: "status", desc: "Show financial overview" },
    { name: "transactions", desc: "Show recent transactions" },
    { name: "spending", desc: "Show spending breakdown" },
    { name: "budgets", desc: "Show budget statuses" },
    { name: "goals", desc: "Show financial goals" },
    { name: "score", desc: "Show daily financial score and streaks" },
    { name: "alerts", desc: "Show financial alerts" },
    { name: "export", desc: "Export data to a backup file" },
    { name: "import", desc: "Restore data from a backup file" },
    { name: "billing", desc: "Manage your Ray subscription" },
    { name: "update", desc: "Update Ray to the latest version" },
    { name: "doctor", desc: "Check system health" },
    { name: "demo", desc: "Seed a demo database with fake data" },
    { name: "completions", desc: "Install shell completions" },
  ]),
});

import("./updater.js").then(m => m.checkForUpdate(version)).catch(() => {});

program.parse();
