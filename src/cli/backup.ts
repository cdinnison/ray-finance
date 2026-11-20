import { writeFileSync, readFileSync, existsSync, chmodSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";
import chalk from "chalk";
import { getDb } from "../db/connection.js";
import { readContext, writeContext } from "../ai/context.js";
import { isValidRedfinUrl } from "../property.js";

const ALLOWED_RECAT_FIELDS = new Set(["name", "merchant_name", "category", "subcategory"]);

interface BackupData {
  version: 1;
  exported_at: string;
  context: string;
  memories: { content: string; category: string }[];
  goals: { name: string; target_amount: number; current_amount: number; target_date: string | null; deadline?: string | null; status: string }[];
  budgets: { category: string; monthly_limit: number; period: string }[];
  recat_rules: { match_field: string; match_pattern: string; target_category: string; target_subcategory: string | null; label: string | null }[];
  settings: { key: string; value: string }[];
  milestones: { name: string; target_date: string | null; monthly_savings: number | null; description: string | null }[];
}

export function runExport(outputPath?: string): void {
  const db = getDb();
  const dest = outputPath || resolve(homedir(), ".ray", "backup.json");

  const backup: BackupData = {
    version: 1,
    exported_at: new Date().toISOString(),
    context: readContext(),
    memories: db.prepare("SELECT content, category FROM memories").all() as any[],
    goals: db.prepare("SELECT name, target_amount, current_amount, target_date, status FROM goals").all() as any[],
    budgets: db.prepare("SELECT category, monthly_limit, period FROM budgets").all() as any[],
    recat_rules: db.prepare("SELECT match_field, match_pattern, target_category, target_subcategory, label FROM recategorization_rules").all() as any[],
    settings: db.prepare("SELECT key, value FROM settings").all() as any[],
    milestones: db.prepare("SELECT name, target_date, monthly_savings, description FROM milestones").all() as any[],
  };

  writeFileSync(dest, JSON.stringify(backup, null, 2) + "\n", { mode: 0o600 });
  try { chmodSync(dest, 0o600); } catch {}
  console.log(chalk.green(`\nBackup saved to ${dest}`));
  console.log(chalk.dim(`  ${backup.memories.length} memories, ${backup.goals.length} goals, ${backup.budgets.length} budgets, ${backup.recat_rules.length} rules`));
  console.log(chalk.dim(`  Context: ${backup.context.length} chars`));
  console.log(chalk.dim(`\nThis file does NOT contain secrets, transactions, or account credentials.`));
  console.log(chalk.dim(`After restoring, re-link accounts with 'ray link' and sync with 'ray sync'.\n`));
}

export function runImport(inputPath: string): void {
  if (!existsSync(inputPath)) {
    console.error(chalk.red(`File not found: ${inputPath}`));
    process.exit(1);
  }

  let backup: BackupData;
  try {
    backup = JSON.parse(readFileSync(inputPath, "utf-8"));
  } catch {
    console.error(chalk.red("Invalid backup file."));
    if (inputPath.toLowerCase().endsWith(".csv")) {
      console.error(chalk.dim("Did you mean 'ray import-apple'? That command imports Apple Card CSV exports."));
    }
    process.exit(1);
  }

  if (!backup || typeof backup !== "object" || backup.version !== 1) {
    console.error(chalk.red("Unsupported backup version."));
    process.exit(1);
  }

  const memories = Array.isArray(backup.memories) ? backup.memories : [];
  const goals = Array.isArray(backup.goals) ? backup.goals : [];
  const budgets = Array.isArray(backup.budgets) ? backup.budgets : [];
  const recatRules = Array.isArray(backup.recat_rules) ? backup.recat_rules : [];
  const settings = Array.isArray(backup.settings) ? backup.settings : [];
  const milestones = Array.isArray(backup.milestones) ? backup.milestones : [];

  const db = getDb();

  // Restore context.md
  if (typeof backup.context === "string" && backup.context.length > 0) {
    writeContext(backup.context);
  }

  // Restore memories (skip exact duplicates)
  const insertMemory = db.prepare(
    "INSERT INTO memories (content, category) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM memories WHERE content = ? AND category = ?)"
  );
  for (const m of memories) {
    if (!m || typeof m.content !== "string" || typeof m.category !== "string") continue;
    insertMemory.run(m.content, m.category, m.content, m.category);
  }

  // Restore goals (skip if name already exists)
  const existingGoal = db.prepare("SELECT 1 FROM goals WHERE name = ?");
  const insertGoal = db.prepare(
    "INSERT INTO goals (name, target_amount, current_amount, target_date, status) VALUES (?, ?, ?, ?, ?)"
  );
  for (const g of goals) {
    if (!g || typeof g.name !== "string" || typeof g.target_amount !== "number" || !Number.isFinite(g.target_amount)) continue;
    const currentAmount = typeof g.current_amount === "number" && Number.isFinite(g.current_amount) ? g.current_amount : 0;
    const status = typeof g.status === "string" ? g.status : "active";
    if (!existingGoal.get(g.name)) {
      insertGoal.run(g.name, g.target_amount, currentAmount, g.target_date ?? g.deadline ?? null, status);
    }
  }

  // Restore budgets
  const insertBudget = db.prepare(
    "INSERT INTO budgets (category, monthly_limit, period) VALUES (?, ?, ?) ON CONFLICT(category, period) DO UPDATE SET monthly_limit = excluded.monthly_limit"
  );
  for (const b of budgets) {
    if (!b || typeof b.category !== "string" || typeof b.monthly_limit !== "number" || !Number.isFinite(b.monthly_limit)) continue;
    const period = typeof b.period === "string" && b.period ? b.period : "monthly";
    insertBudget.run(b.category, b.monthly_limit, period);
  }

  // Restore recat rules (skip exact duplicates, including target_subcategory).
  // Reject unknown match_fields and empty / whitespace-only match_patterns.
  const existingRule = db.prepare(
    "SELECT 1 FROM recategorization_rules WHERE match_field = ? AND match_pattern = ? AND target_category = ? AND COALESCE(target_subcategory, '') = COALESCE(?, '')"
  );
  const insertRule = db.prepare("INSERT INTO recategorization_rules (match_field, match_pattern, target_category, target_subcategory, label) VALUES (?, ?, ?, ?, ?)");
  let skippedInvalidRules = 0;
  for (const r of recatRules) {
    if (
      !r ||
      typeof r.match_field !== "string" ||
      !ALLOWED_RECAT_FIELDS.has(r.match_field) ||
      typeof r.match_pattern !== "string" ||
      r.match_pattern.trim() === "" ||
      typeof r.target_category !== "string" ||
      r.target_category.trim() === ""
    ) {
      skippedInvalidRules++;
      continue;
    }
    if (!existingRule.get(r.match_field, r.match_pattern, r.target_category, r.target_subcategory ?? null)) {
      insertRule.run(r.match_field, r.match_pattern, r.target_category, r.target_subcategory ?? null, r.label ?? null);
    }
  }
  if (skippedInvalidRules > 0) {
    console.warn(chalk.yellow(`  Skipped ${skippedInvalidRules} invalid recat rule(s).`));
  }

  // Restore settings (validate listing_url:* entries to prevent SSRF on sync)
  const insertSetting = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  let skippedInvalidSettings = 0;
  for (const s of settings) {
    if (!s || typeof s.key !== "string" || typeof s.value !== "string") {
      skippedInvalidSettings++;
      continue;
    }
    if (s.key.startsWith("listing_url:") && !isValidRedfinUrl(s.value)) {
      skippedInvalidSettings++;
      continue;
    }
    insertSetting.run(s.key, s.value);
  }
  if (skippedInvalidSettings > 0) {
    console.warn(chalk.yellow(`  Skipped ${skippedInvalidSettings} invalid setting(s).`));
  }

  // Restore milestones (skip if name already exists)
  const existingMilestone = db.prepare("SELECT 1 FROM milestones WHERE name = ?");
  const insertMilestone = db.prepare("INSERT INTO milestones (name, target_date, monthly_savings, description) VALUES (?, ?, ?, ?)");
  for (const m of milestones) {
    if (!m || typeof m.name !== "string") continue;
    if (!existingMilestone.get(m.name)) {
      insertMilestone.run(m.name, m.target_date ?? null, m.monthly_savings ?? null, m.description ?? null);
    }
  }

  console.log(chalk.green(`\nBackup restored from ${inputPath}`));
  console.log(chalk.dim(`  ${memories.length} memories, ${goals.length} goals, ${budgets.length} budgets, ${recatRules.length} rules`));
  console.log(chalk.dim(`\nNext steps:`));
  console.log(chalk.dim(`  1. Run 'ray link' to re-connect your bank accounts`));
  console.log(chalk.dim(`  2. Run 'ray sync' to pull transactions`));
  console.log(chalk.dim(`  3. Run 'ray import-apple <path>' to re-import Apple Card transactions (if you had any)\n`));
}
