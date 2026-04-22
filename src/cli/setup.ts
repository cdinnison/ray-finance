import chalk from "chalk";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { config, saveConfig, getConfigPath, isConfigured, useManaged, RAY_PROXY_BASE } from "../config.js";
import { heading, dim } from "./format.js";

function stepHeader(current: number, total: number): string {
  return chalk.dim(`Step ${current}/${total}`);
}

const theme = {
  style: {
    answer: (text: string) => chalk.yellowBright(text),
    highlight: (text: string) => chalk.yellowBright(text),
  },
};

/** Show first 4 + last 4 chars of a key, mask the middle */
function maskKey(val: string): string {
  if (val.length <= 10) return "*".repeat(val.length);
  return val.slice(0, 4) + "*".repeat(val.length - 8) + val.slice(-4);
}

export async function runSetup(): Promise<void> {
  const inquirer = (await import("inquirer")).default;

  console.log(`\n${heading("Ray Finance Setup")}\n`);

  if (isConfigured()) {
    const { proceed } = await inquirer.prompt([{theme,
      type: "confirm",
      name: "proceed",
      message: "Ray is already configured. Reconfigure?",
      default: false,
    }]);
    if (!proceed) return;
  }

  const { setupMode } = await inquirer.prompt([{theme,
    type: "list",
    name: "setupMode",
    message: "How would you like to set up Ray?",
    choices: [
      { name: "Quick setup — we handle the API keys, your data stays local", value: "managed" },
      { name: "Bring your own keys — use your own AI and Plaid credentials", value: "selfhosted" },
    ],
  }]);

  let canLink = false;

  if (setupMode === "managed") {
    console.log(stepHeader(1, 3));
    const { userName } = await inquirer.prompt([{theme,
      type: "input",
      name: "userName",
      message: "Your name:",
      default: config.userName !== "User" ? config.userName : undefined,
    }]);

    console.log(stepHeader(2, 3));
    const { hasKey } = await inquirer.prompt([{theme,
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

    const { rayApiKey } = await inquirer.prompt([{theme,
      type: "input",
      name: "rayApiKey",
      message: "Ray API key:",
      transformer: maskKey,
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
    console.log(stepHeader(1, 5));
    const { userName } = await inquirer.prompt([{
      theme,
      type: "input",
      name: "userName",
      message: "Your name:",
      default: config.userName !== "User" ? config.userName : undefined,
    }]);

    console.log(stepHeader(2, 5));
    const { providerChoice } = await inquirer.prompt([{
      theme,
      type: "list",
      name: "providerChoice",
      message: "AI provider:",
      choices: [
        { name: "Anthropic (Claude)", value: "anthropic" },
        { name: "OpenAI", value: "openai" },
        { name: "Ollama (local)", value: "ollama" },
        { name: "Other OpenAI-compatible", value: "other" },
      ],
    }]);

    let providerType: "anthropic" | "openai-compatible" = "anthropic";
    let anthropicKey = "";
    let openaiCompatibleKey = "";
    let openaiCompatibleBaseURL = "";
    let model = config.model;

    if (providerChoice === "anthropic") {
      // Existing Anthropic flow
      console.log(stepHeader(3, 5));
      const anthropicAnswers = await inquirer.prompt([
        {
          theme,
          type: "input",
          name: "anthropicKey",
          message: config.anthropicKey ? "Anthropic API key (enter to keep current):" : "Anthropic API key:",
          transformer: maskKey,
          validate: (v: string) => v.length > 0 || !!config.anthropicKey || "Required",
        },
        {
          theme,
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
      ]);
      anthropicKey = anthropicAnswers.anthropicKey || config.anthropicKey;
      model = anthropicAnswers.model;
    } else {
      // OpenAI-compatible flow
      providerType = "openai-compatible";

      const baseURLDefaults: Record<string, string> = {
        openai: "https://api.openai.com/v1",
        ollama: "http://localhost:11434/v1",
        other: config.openaiCompatibleBaseURL || "",
      };

      console.log(stepHeader(3, 5));

      // Build model choices from models.dev catalog or Ollama's local list
      const catalogProviderIds: Record<string, string> = { openai: "openai", ollama: "ollama" };
      let modelChoices: { name: string; value: string }[] = [];

      if (providerChoice === "ollama") {
        // Try Ollama's native API first, then OpenAI-compat endpoint
        try {
          let resp = await fetch("http://localhost:11434/api/tags");
          if (resp.ok) {
            const data = await resp.json() as { models: { name: string }[] };
            modelChoices = data.models.map(m => ({ name: m.name, value: m.name }));
          } else {
            // Fall back to OpenAI-compatible endpoint
            resp = await fetch("http://localhost:11434/v1/models");
            if (resp.ok) {
              const data = await resp.json() as { data: { id: string }[] };
              modelChoices = data.data.map(m => ({ name: m.id, value: m.id }));
            }
          }
        } catch {
          console.log(dim("  Could not reach Ollama. Make sure it's running."));
        }
      }

      if (modelChoices.length === 0 && catalogProviderIds[providerChoice]) {
        // Fall back to models.dev catalog
        try {
          const { getCatalog, getProviderModels } = await import("../ai/models-catalog.js");
          const catalog = await getCatalog();
          const models = getProviderModels(catalog, catalogProviderIds[providerChoice]);
          const withTools = models.filter(m => m.tool_call !== false);
          // Sort by release date descending, take top 10
          withTools.sort((a, b) => (b.release_date || "").localeCompare(a.release_date || ""));
          modelChoices = withTools.slice(0, 10).map(m => {
            const parts: string[] = [m.name || m.id];
            if (m.cost?.input != null) parts.push(`$${m.cost.input}/M in`);
            if (m.limit?.context) parts.push(`${(m.limit.context / 1000).toFixed(0)}k ctx`);
            return { name: parts.join(" — "), value: m.id };
          });
        } catch {
          // Catalog fetch failed — fall through to free text
        }
      }

      const prompts: any[] = [
        {
          theme,
          type: "input",
          name: "apiKey",
          message: providerChoice === "ollama"
            ? "API key (enter to skip):"
            : config.openaiCompatibleKey ? "API key (enter to keep current):" : "API key:",
          transformer: maskKey,
          validate: (v: string) => providerChoice === "ollama" || v.length > 0 || !!config.openaiCompatibleKey || "Required",
        },
      ];

      // Only ask for base URL when provider isn't known
      if (providerChoice === "other") {
        prompts.push({
          theme,
          type: "input",
          name: "baseURL",
          message: "Base URL:",
          default: config.openaiCompatibleBaseURL || "",
          validate: (v: string) => v.length > 0 || "Required",
        });
      }

      // Model picker — dynamic list for known providers, free text fallback
      if (modelChoices.length > 0) {
        prompts.push({
          theme,
          type: "list",
          name: "model",
          message: "AI model:",
          choices: [
            ...modelChoices,
            { name: "Other (enter manually)", value: "__other__" },
          ],
        });
      } else {
        prompts.push({
          theme,
          type: "input",
          name: "model",
          message: "Model name:",
          validate: (v: string) => v.length > 0 || "Required",
        });
      }

      const compatAnswers = await inquirer.prompt(prompts);

      // Handle "Other" selection — prompt for manual entry
      if (compatAnswers.model === "__other__") {
        const { customModel } = await inquirer.prompt([{
          theme,
          type: "input",
          name: "customModel",
          message: "Model name:",
          validate: (v: string) => v.length > 0 || "Required",
        }]);
        compatAnswers.model = customModel;
      }

      openaiCompatibleKey = compatAnswers.apiKey || config.openaiCompatibleKey || "";
      openaiCompatibleBaseURL = compatAnswers.baseURL || baseURLDefaults[providerChoice];
      model = compatAnswers.model;

      // Show model info from models.dev if available
      try {
        const { getCatalog, lookupModel } = await import("../ai/models-catalog.js");
        const catalog = await getCatalog();
        const info = lookupModel(catalog, model);
        if (info) {
          const parts: string[] = [];
          if (info.limit?.context) parts.push(`context: ${(info.limit.context / 1000).toFixed(0)}k`);
          if (info.cost?.input != null) parts.push(`input: $${info.cost.input}/1M`);
          if (info.cost?.output != null) parts.push(`output: $${info.cost.output}/1M`);
          if (parts.length > 0) console.log(dim(`  Model info: ${parts.join(", ")}`));
          if (info.tool_call === false) {
            console.log(chalk.yellow("  Warning: this model may not support tool calling. Ray relies heavily on tools."));
          }
        }
      } catch {
        // Catalog fetch failed — not critical
      }
    }

    console.log(stepHeader(4, 5));
    const plaidAnswers = await inquirer.prompt([
      {
        theme,
        type: "input",
        name: "plaidClientId",
        message: config.plaidClientId ? "Plaid production client ID (enter to keep current):" : "Plaid production client ID (enter to skip):",
        transformer: maskKey,
      },
      {
        theme,
        type: "input",
        name: "plaidSecret",
        message: config.plaidSecret ? "Plaid production secret (enter to keep current):" : "Plaid production secret (enter to skip):",
        transformer: maskKey,
      },
      {
        theme,
        type: "input",
        name: "dbEncryptionKey",
        message: config.dbEncryptionKey ? "Database encryption key (enter to keep current):" : "Database encryption key (enter to skip):",
        transformer: maskKey,
      },
    ]);

    const { generateKey } = await import("../db/encryption.js");

    saveConfig({
      userName,
      anthropicKey,
      rayApiKey: "",
      model,
      providerType,
      openaiCompatibleKey,
      openaiCompatibleBaseURL,
      plaidClientId: plaidAnswers.plaidClientId || config.plaidClientId || "",
      plaidSecret: plaidAnswers.plaidSecret || config.plaidSecret || "",
      plaidEnv: "production",
      dbEncryptionKey: plaidAnswers.dbEncryptionKey || config.dbEncryptionKey || generateKey(),
      plaidTokenSecret: config.plaidTokenSecret || generateKey(),
    });

    canLink = !!(plaidAnswers.plaidClientId && plaidAnswers.plaidSecret);
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
  console.log(`${chalk.green("✓")} Database initialized`);
  console.log(`${chalk.green("✓")} Ready to go\n`);

  // Ask to link account (skip if accounts already exist)
  const db = getDb();
  const hasAccounts = (db.prepare("SELECT COUNT(*) as n FROM institutions").get() as { n: number }).n > 0;

  if (canLink && !hasAccounts) {
    console.log(stepHeader(setupMode === "managed" ? 3 : 5, setupMode === "managed" ? 3 : 5));
    const { wantLink } = await inquirer.prompt([{theme,
      type: "confirm",
      name: "wantLink",
      message: "Link your first bank account now?",
      default: true,
    }]);

    if (wantLink) {
      const { runLink } = await import("./commands.js");
      await runLink();

      // Sync immediately after linking
      const ora = (await import("ora")).default;
      const spinner = ora("Syncing your transactions...").start();
      try {
        const { getDb } = await import("../db/connection.js");
        const { runDailySync } = await import("../daily-sync.js");
        const syncResult = await runDailySync(getDb());
        // Partial-failure signal: post-sync derivation or achievement check
        // may have thrown even though transactions committed cleanly. Warn
        // instead of succeed so onboarding doesn't claim "Transactions
        // synced!" on a half-synced state (mirror runSync in commands.ts).
        const postWarns: string[] = [];
        if (syncResult.derivationError) postWarns.push(`derivation failed: ${syncResult.derivationError}`);
        if (syncResult.achievementError) postWarns.push(`achievement check failed: ${syncResult.achievementError}`);
        if (postWarns.length > 0) {
          spinner.warn(`Transactions synced, but post-sync steps failed: ${postWarns.join("; ")}`);
        } else {
          spinner.succeed("Transactions synced!");
        }
        console.log(chalk.dim("  Note: some banks take a few hours to deliver all transactions."));
        console.log(chalk.dim("  Ray will re-sync in the background to pick up anything missing.\n"));
      } catch (err: any) {
        spinner.fail(`Sync failed: ${err.message}`);
      }

      // Auto-schedule daily sync at 6am
      if (!config.syncSchedule) {
        saveConfig({ syncSchedule: "06:00" });
        const { installSyncSchedule } = await import("./scheduler.js");
        installSyncSchedule("06:00");
        console.log(`${chalk.green("✓")} Daily sync scheduled at 6:00 AM`);
      }

      // Go straight into chat
      console.log();
      const { startChat } = await import("./chat.js");
      await startChat();
      return;
    }
  }

  console.log(`Run ${chalk.bold("ray")} to start chatting.\n`);
}
