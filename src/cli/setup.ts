import chalk from "chalk";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { config, saveConfig, getConfigPath, isConfigured, useManaged, RAY_PROXY_BASE } from "../config.js";
import { heading, dim } from "./format.js";

export async function runSetup(): Promise<void> {
  const inquirer = (await import("inquirer")).default;

  console.log(`\n${heading("Ray Finance Setup")}\n`);

  if (isConfigured()) {
    const { proceed } = await inquirer.prompt([{
      type: "confirm",
      name: "proceed",
      message: "Ray is already configured. Reconfigure?",
      default: false,
    }]);
    if (!proceed) return;
  }

  const { setupMode } = await inquirer.prompt([{
    type: "list",
    name: "setupMode",
    message: "How would you like to set up Ray?",
    choices: [
      { name: "Quick setup — we handle the API keys, your data stays local", value: "managed" },
      { name: "Self-hosted — bring your own Anthropic and Plaid credentials", value: "selfhosted" },
    ],
  }]);

  let canLink = false;

  if (setupMode === "managed") {
    const { userName } = await inquirer.prompt([{
      type: "input",
      name: "userName",
      message: "Your name:",
      default: config.userName !== "User" ? config.userName : undefined,
    }]);

    const { hasKey } = await inquirer.prompt([{
      type: "list",
      name: "hasKey",
      message: "Do you have a Ray API key?",
      choices: [
        { name: "Yes — I have a key", value: true },
        { name: "No — I need to get one ($10/mo)", value: false },
      ],
    }]);

    if (!hasKey) {
      const open = (await import("open")).default;
      const ora = (await import("ora")).default;

      console.log(`\n  Opening Stripe checkout in your browser...\n`);

      try {
        const resp = await fetch(`${RAY_PROXY_BASE.replace("/v1", "")}/stripe/checkout`, {
          method: "POST",
          headers: { "content-type": "application/json" },
        });
        const { url } = await resp.json() as { url: string };
        const parsed = new URL(url);
        if (!parsed.hostname.endsWith("stripe.com") && !parsed.hostname.endsWith("rayfinance.app")) {
          console.log(dim(`  Unexpected checkout URL. Visit https://rayfinance.app to subscribe.\n`));
        } else {
          await open(url);
        }
      } catch {
        console.log(dim(`  Could not open checkout automatically.`));
        console.log(dim(`  Re-run ray setup to try again.\n`));
      }

      console.log(dim("  Complete checkout, then paste your key below.\n"));
    }

    const { rayApiKey } = await inquirer.prompt([{
      type: "input",
      name: "rayApiKey",
      message: "Ray API key:",
      validate: (v: string) => v.startsWith("ray_") || "Should start with ray_",
    }]);

    // Auto-generate encryption keys if not already set
    const { generateKey } = await import("../db/encryption.js");

    saveConfig({
      userName,
      rayApiKey,
      anthropicKey: "",
      model: "claude-sonnet-4-6",
      plaidClientId: "",
      plaidSecret: "",
      plaidEnv: "production",
      dbEncryptionKey: config.dbEncryptionKey || generateKey(),
      plaidTokenSecret: config.plaidTokenSecret || generateKey(),
    });

    canLink = true;
  } else {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "userName",
        message: "Your name:",
        default: config.userName !== "User" ? config.userName : undefined,
      },
      {
        type: "input",
        name: "anthropicKey",
        message: "Anthropic API key:",
        default: config.anthropicKey || undefined,
        validate: (v: string) => v.length > 0 || "Required",
      },
      {
        type: "list",
        name: "model",
        message: "AI model:",
        choices: [
          { name: "Claude Sonnet 4.6 (recommended)", value: "claude-sonnet-4-6" },
          { name: "Claude Haiku 4.5 (faster, cheaper)", value: "claude-haiku-4-5" },
          { name: "Claude Opus 4.6 (most capable)", value: "claude-opus-4-6" },
        ],
        default: config.model,
      },
      {
        type: "input",
        name: "plaidClientId",
        message: "Plaid production client ID (enter to skip):",
        default: config.plaidClientId || undefined,
      },
      {
        type: "input",
        name: "plaidSecret",
        message: "Plaid production secret (enter to skip):",
        default: config.plaidSecret || undefined,
      },
      {
        type: "input",
        name: "dbEncryptionKey",
        message: "Database encryption key (enter to skip):",
        default: config.dbEncryptionKey || undefined,
      },
    ]);

    const { generateKey } = await import("../db/encryption.js");

    saveConfig({
      userName: answers.userName,
      anthropicKey: answers.anthropicKey,
      rayApiKey: "",
      model: answers.model,
      plaidClientId: answers.plaidClientId || "",
      plaidSecret: answers.plaidSecret || "",
      plaidEnv: "production",
      dbEncryptionKey: answers.dbEncryptionKey || generateKey(),
      plaidTokenSecret: config.plaidTokenSecret || generateKey(),
    });

    canLink = !!(answers.plaidClientId && answers.plaidSecret);
  }

  // Ensure data directory exists
  const dbDir = dirname(config.dbPath);
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

  // Initialize DB
  const { getDb } = await import("../db/connection.js");
  getDb();

  // Create persistent context file
  const { createContextTemplate } = await import("../ai/context.js");
  createContextTemplate(config.userName);

  console.log(`\n${chalk.green("✓")} Config saved`);
  console.log(chalk.green(`\n  Welcome to Ray, ${config.userName}! You're all set.\n`));

  // Ask before linking — don't just open the browser
  if (canLink) {
    const { linkNow } = await inquirer.prompt([{
      type: "confirm",
      name: "linkNow",
      message: "Would you like to link your first bank account now?",
      default: true,
    }]);

    if (linkNow) {
      const { runLink } = await import("./commands.js");
      await runLink();

      // Auto-schedule daily sync at 6am after first successful link
      if (!config.syncSchedule) {
        saveConfig({ syncSchedule: "06:00" });
        const { installSyncSchedule } = await import("./scheduler.js");
        installSyncSchedule("06:00");
        console.log(`${chalk.green("✓")} Daily sync scheduled at 6:00 AM`);
      }
    }
  }

  // Transition directly to chat instead of exiting
  console.log();
  const { startChat } = await import("./chat.js");
  await startChat();
}
