import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, resolve } from "path";
import chalk from "chalk";

const CACHE_PATH = resolve(homedir(), ".ray", "update-check.json");
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const REGISTRY_URL = "https://registry.npmjs.org/ray-finance/latest";
const PACKAGE_NAME = "ray-finance";

interface UpdateCache {
  latestVersion: string;
  checkedAt: number;
}

function isNewer(latest: string, current: string): boolean {
  const [a1, a2, a3] = latest.split(".").map(Number);
  const [b1, b2, b3] = current.split(".").map(Number);
  if (a1 !== b1) return a1 > b1;
  if (a2 !== b2) return a2 > b2;
  return a3 > b3;
}

function readCache(): UpdateCache | null {
  try {
    const data = readFileSync(CACHE_PATH, "utf-8");
    return JSON.parse(data) as UpdateCache;
  } catch {
    return null;
  }
}

function writeCache(latestVersion: string): void {
  try {
    writeFileSync(CACHE_PATH, JSON.stringify({ latestVersion, checkedAt: Date.now() }));
  } catch {
    // ~/.ray/ may not exist yet — that's fine
  }
}

export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const resp = await fetch(REGISTRY_URL, {
      signal: AbortSignal.timeout(5000),
      headers: { accept: "application/json" },
    });
    const data = (await resp.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

export async function checkForUpdate(currentVersion: string): Promise<void> {
  try {
    if (!existsSync(dirname(CACHE_PATH))) return;

    let latest: string | null = null;
    const cache = readCache();

    if (cache && Date.now() - cache.checkedAt < CHECK_INTERVAL_MS) {
      latest = cache.latestVersion;
    } else {
      latest = await fetchLatestVersion();
      if (latest) writeCache(latest);
    }

    if (latest && isNewer(latest, currentVersion)) {
      process.stderr.write(
        chalk.yellow(`Update available: ${currentVersion} → ${latest}`) +
          chalk.dim(` — run "ray update"\n`),
      );
    }
  } catch {
    // Never block the user
  }
}

export async function runUpdate(currentVersion: string): Promise<void> {
  console.log(`Current version: ${currentVersion}`);
  console.log("Checking for updates...");

  const latest = await fetchLatestVersion();
  if (!latest) {
    console.error(chalk.red("Failed to check for updates. Check your internet connection."));
    process.exit(1);
  }

  if (!isNewer(latest, currentVersion)) {
    console.log(chalk.green(`Ray is up to date (${currentVersion})`));
    return;
  }

  console.log(`Updating to ${latest}...`);
  try {
    execSync(`npm install -g ${PACKAGE_NAME}@latest`, {
      stdio: "inherit",
      cwd: homedir(),
    });
    console.log(chalk.green(`\nSuccessfully updated: ${currentVersion} → ${latest}`));
    writeCache(latest);
    // Regenerate shell completions if installed
    const completionBase = resolve(homedir(), ".ray", "completion.");
    for (const ext of ["zsh", "bash", "fish"]) {
      if (existsSync(completionBase + ext)) {
        const { installCompletions } = await import("./completions.js");
        installCompletions();
        break;
      }
    }
  } catch {
    console.error(chalk.red("\nUpdate failed."));
    console.error(`Try: sudo npm install -g ${PACKAGE_NAME}`);
    process.exit(1);
  }
}
