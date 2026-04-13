import chalk from "chalk";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { config, saveConfig, getConfigPath, isConfigured, useManaged, RAY_PROXY_BASE, DEFAULT_OLLAMA_BASE_URL, getDefaultLlmModel, type RayConfig, type SelfHostedLlmProvider } from "../config.js";
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

const SELF_HOSTED_PROVIDER_CHOICES: { name: string; value: SelfHostedLlmProvider }[] = [
  { name: "Anthropic", value: "anthropic" },
  { name: "OpenAI", value: "openai" },
  { name: "Ollama", value: "ollama" },
];

function getModelChoices(provider: SelfHostedLlmProvider): { name: string; value: string }[] | null {
  switch (provider) {
    case "anthropic":
      return [
        { name: "Claude Sonnet 4.6 (recommended)", value: "claude-sonnet-4-6" },
        { name: "Claude Haiku 4.5 (faster, cheaper)", value: "claude-haiku-4-5" },
        { name: "Claude Opus 4.6 (most capable)", value: "claude-opus-4-6" },
      ];
    case "openai":
      return [
        { name: "GPT-5 mini (recommended)", value: "gpt-5-mini" },
        { name: "GPT-5.4", value: "gpt-5.4" },
        { name: "GPT-5.4 mini", value: "gpt-5.4-mini" },
      ];
    case "ollama":
      return null;
  }
}

export interface SelfHostedSetupAnswers {
  userName: string;
  llmProvider: SelfHostedLlmProvider;
  llmApiKey?: string;
  llmBaseUrl?: string;
  llmModel: string;
  plaidClientId?: string;
  plaidSecret?: string;
  bridgeClientId?: string;
  bridgeClientSecret?: string;
  dbEncryptionKey?: string;
}

export function buildSelfHostedConfigUpdate(
  answers: SelfHostedSetupAnswers,
  currentConfig: RayConfig,
  generateKey: () => string,
): Partial<RayConfig> {
  const llmApiKey = answers.llmProvider === "ollama" ? "" : answers.llmApiKey || "";
  const llmBaseUrl = answers.llmProvider === "ollama"
    ? answers.llmBaseUrl || DEFAULT_OLLAMA_BASE_URL
    : "";

  return {
    userName: answers.userName,
    anthropicKey: answers.llmProvider === "anthropic" ? llmApiKey : "",
    rayApiKey: "",
    model: answers.llmModel,
    llmProvider: answers.llmProvider,
    llmApiKey,
    llmBaseUrl,
    llmModel: answers.llmModel,
    plaidClientId: answers.plaidClientId || "",
    plaidSecret: answers.plaidSecret || "",
    plaidEnv: "production",
    bridgeClientId: answers.bridgeClientId || "",
    bridgeClientSecret: answers.bridgeClientSecret || "",
    bridgeDefaultExternalUserId: currentConfig.bridgeDefaultExternalUserId || "",
    dbEncryptionKey: answers.dbEncryptionKey || generateKey(),
    plaidTokenSecret: currentConfig.plaidTokenSecret || generateKey(),
  };
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
        { name: "Bring your own keys — use your own LLM provider and Plaid credentials", value: "selfhosted" },
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
      type: "password",
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
      llmProvider: "anthropic",
      llmApiKey: "",
      llmBaseUrl: "",
      llmModel: "claude-sonnet-4-6",
      plaidClientId: "",
      plaidSecret: "",
      plaidEnv: "production",
      bridgeClientId: "",
      bridgeClientSecret: "",
      bridgeDefaultExternalUserId: "",
      dbEncryptionKey: config.dbEncryptionKey || generateKey(),
      plaidTokenSecret: config.plaidTokenSecret || generateKey(),
    });

    canLink = true;
  } else {
    console.log(stepHeader(1, 4));
    const { generateKey } = await import("../db/encryption.js");
    const { userName, llmProvider } = await inquirer.prompt([
      {
        theme,
        type: "input",
        name: "userName",
        message: "Your name:",
        default: config.userName !== "User" ? config.userName : undefined,
      },
      {
        theme,
        type: "list",
        name: "llmProvider",
        message: "LLM provider:",
        choices: SELF_HOSTED_PROVIDER_CHOICES,
        default: config.llmProvider,
      },
    ]) as Pick<SelfHostedSetupAnswers, "userName" | "llmProvider">;

    const modelChoices = getModelChoices(llmProvider);
    const llmPrompts: any[] = [];

    if (llmProvider !== "ollama") {
      llmPrompts.push({
        theme,
        type: "password",
        name: "llmApiKey",
        message: `${SELF_HOSTED_PROVIDER_CHOICES.find(choice => choice.value === llmProvider)?.name} API key:`,
        default: llmProvider === "anthropic" ? config.anthropicKey || config.llmApiKey || undefined : config.llmApiKey || undefined,
        validate: (value: string) => value.length > 0 || "Required",
      });
    }

    if (modelChoices) {
      llmPrompts.push({
        theme,
        type: "list",
        name: "llmModel",
        message: "AI model:",
        choices: modelChoices,
        default: config.llmProvider === llmProvider ? config.llmModel : getDefaultLlmModel(llmProvider),
      });
    } else {
      llmPrompts.push(
        {
          theme,
          type: "input",
          name: "llmModel",
          message: "Ollama model:",
          default: config.llmProvider === "ollama" ? config.llmModel : getDefaultLlmModel("ollama"),
          validate: (value: string) => value.length > 0 || "Required",
        },
        {
          theme,
          type: "input",
          name: "llmBaseUrl",
          message: "Ollama base URL:",
          default: config.llmProvider === "ollama" && config.llmBaseUrl ? config.llmBaseUrl : DEFAULT_OLLAMA_BASE_URL,
          validate: (value: string) => value.length > 0 || "Required",
        },
      );
    }

    const providerAnswers = await inquirer.prompt(llmPrompts) as Pick<SelfHostedSetupAnswers, "llmApiKey" | "llmBaseUrl" | "llmModel">;
    const plaidAnswers = await inquirer.prompt([
      {
        theme,
        type: "password",
        name: "plaidClientId",
        message: "Plaid production client ID (enter to skip):",
        default: config.plaidClientId || undefined,
      },
      {
        theme,
        type: "password",
        name: "plaidSecret",
        message: "Plaid production secret (enter to skip):",
        default: config.plaidSecret || undefined,
      },
      {
        theme,
        type: "password",
        name: "bridgeClientId",
        message: "Bridge client ID (enter to skip):",
        default: config.bridgeClientId || undefined,
      },
      {
        theme,
        type: "password",
        name: "bridgeClientSecret",
        message: "Bridge client secret (enter to skip):",
        default: config.bridgeClientSecret || undefined,
      },
      {
        theme,
        type: "password",
        name: "dbEncryptionKey",
        message: "Database encryption key (enter to skip):",
        default: config.dbEncryptionKey || undefined,
      },
    ]) as Pick<SelfHostedSetupAnswers, "plaidClientId" | "plaidSecret" | "bridgeClientId" | "bridgeClientSecret" | "dbEncryptionKey">;

    saveConfig(
      buildSelfHostedConfigUpdate(
        { userName, llmProvider, ...providerAnswers, ...plaidAnswers },
        config,
        generateKey,
      ),
    );

    canLink = !!(
      (plaidAnswers.plaidClientId && plaidAnswers.plaidSecret) ||
      (plaidAnswers.bridgeClientId && plaidAnswers.bridgeClientSecret)
    );
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

  // Ask to link first account
  if (canLink) {
    console.log(stepHeader(setupMode === "managed" ? 3 : 4, setupMode === "managed" ? 3 : 4));
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
        await runDailySync(getDb());
        spinner.succeed("Transactions synced!");
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
