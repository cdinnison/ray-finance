import { writeFileSync, readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";
import chalk from "chalk";
import { getDb } from "../db/connection.js";
import { readContext, writeContext } from "../ai/context.js";

interface BackupData {
  version: 1;
  exported_at: string;
  context: string;
  memories: { content: string; category: string }[];
  goals: { name: string; target_amount: number; current_amount: number; deadline: string | null; status: string }[];
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
    goals: db.prepare("SELECT name, target_amount, current_amount, deadline, status FROM goals").all() as any[],
    budgets: db.prepare("SELECT category, monthly_limit, period FROM budgets").all() as any[],
    recat_rules: db.prepare("SELECT match_field, match_pattern, target_category, target_subcategory, label FROM recategorization_rules").all() as any[],
    settings: db.prepare("SELECT key, value FROM settings").all() as any[],
    milestones: db.prepare("SELECT name, target_date, monthly_savings, description FROM milestones").all() as any[],
  };

  writeFileSync(dest, JSON.stringify(backup, null, 2) + "\n", { mode: 0o600 });
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
    process.exit(1);
  }

  if (!backup.version || backup.version !== 1) {
    console.error(chalk.red("Unsupported backup version."));
    process.exit(1);
  }

  const db = getDb();

  // Restore context.md
  if (backup.context) {
    writeContext(backup.context);
  }

  // Restore memories (skip exact duplicates)
  const insertMemory = db.prepare(
    "INSERT INTO memories (content, category) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM memories WHERE content = ? AND category = ?)"
  );
  for (const m of backup.memories) {
    insertMemory.run(m.content, m.category, m.content, m.category);
  }

  // Restore goals (skip if name already exists)
  const existingGoal = db.prepare("SELECT 1 FROM goals WHERE name = ?");
  const insertGoal = db.prepare(
    "INSERT INTO goals (name, target_amount, current_amount, deadline, status) VALUES (?, ?, ?, ?, ?)"
  );
  for (const g of backup.goals) {
    if (!existingGoal.get(g.name)) {
      insertGoal.run(g.name, g.target_amount, g.current_amount, g.deadline, g.status);
    }
  }

  // Restore budgets
  const insertBudget = db.prepare(
    "INSERT INTO budgets (category, monthly_limit, period) VALUES (?, ?, ?) ON CONFLICT(category, period) DO UPDATE SET monthly_limit = excluded.monthly_limit"
  );
  for (const b of backup.budgets) {
    insertBudget.run(b.category, b.monthly_limit, b.period);
  }

  // Restore recat rules (skip exact duplicates)
  const existingRule = db.prepare("SELECT 1 FROM recategorization_rules WHERE match_field = ? AND match_pattern = ? AND target_category = ?");
  const insertRule = db.prepare("INSERT INTO recategorization_rules (match_field, match_pattern, target_category, target_subcategory, label) VALUES (?, ?, ?, ?, ?)");
  for (const r of backup.recat_rules) {
    if (!existingRule.get(r.match_field, r.match_pattern, r.target_category)) {
      insertRule.run(r.match_field, r.match_pattern, r.target_category, r.target_subcategory, r.label);
    }
  }

  // Restore settings
  const insertSetting = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  for (const s of backup.settings) {
    insertSetting.run(s.key, s.value);
  }

  // Restore milestones (skip if name already exists)
  const existingMilestone = db.prepare("SELECT 1 FROM milestones WHERE name = ?");
  const insertMilestone = db.prepare("INSERT INTO milestones (name, target_date, monthly_savings, description) VALUES (?, ?, ?, ?)");
  for (const m of backup.milestones) {
    if (!existingMilestone.get(m.name)) {
      insertMilestone.run(m.name, m.target_date, m.monthly_savings, m.description);
    }
  }

  console.log(chalk.green(`\nBackup restored from ${inputPath}`));
  console.log(chalk.dim(`  ${backup.memories.length} memories, ${backup.goals.length} goals, ${backup.budgets.length} budgets, ${backup.recat_rules.length} rules`));
  console.log(chalk.dim(`\nNext steps:`));
  console.log(chalk.dim(`  1. Run 'ray link' to re-connect your bank accounts`));
  console.log(chalk.dim(`  2. Run 'ray sync' to pull transactions\n`));
}
