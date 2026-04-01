import chalk from "chalk";
import { getDb } from "../db/connection.js";
import {
  getNetWorth, getAccountBalances, getTransactionsFiltered,
  getBudgetStatuses, getGoals, getCashFlowThisMonth,
  formatMoney as rawFormatMoney, categoryLabel,
} from "../queries/index.js";
import { getLatestScore, getAchievements, getMonthlySavings } from "../scoring/index.js";
import { generateAlerts } from "../alerts/index.js";
import { runDailySync } from "../daily-sync.js";
import { startLinkServer } from "../server.js";
import { heading, progressBar, formatMoney, formatMoneyColored, padColumns, dim, formatDuration, formatError } from "./format.js";

export async function runSync(): Promise<void> {
  const ora = (await import("ora")).default;
  const spinner = ora("Syncing transactions...").start();
  const startTime = Date.now();
  try {
    const db = getDb();
    const result = await runDailySync(db);
    const elapsed = formatDuration(Date.now() - startTime);
    const parts = [elapsed];
    if (result.transactionsAdded > 0) parts.push(`${result.transactionsAdded} new transactions`);
    spinner.succeed(`Sync complete. ${chalk.dim(`(${parts.join(", ")})`)}`);
  } catch (err: any) {
    spinner.fail(formatError(err, "Sync failed"));
  }
}

export async function runLink(): Promise<void> {
  const open = (await import("open")).default;
  const ora = (await import("ora")).default;

  const { url, waitForComplete, stop } = startLinkServer();
  console.log(`\n${heading("Link Account")}\n`);
  console.log(`Opening Plaid Link in your browser...\n`);
  console.log(dim(`  ${url}\n`));

  await open(url);

  const spinner = ora("Waiting for bank connection...").start();
  await waitForComplete();
  stop();
  spinner.succeed("Bank account linked successfully!");
}

export function showAccounts(): void {
  const db = getDb();
  const institutions = db.prepare(
    `SELECT i.name as institution, i.item_id, i.created_at,
            a.name, a.type, a.subtype, a.mask, a.current_balance, a.currency
     FROM institutions i
     LEFT JOIN accounts a ON a.item_id = i.item_id AND a.hidden = 0
     ORDER BY i.created_at, a.type, a.current_balance DESC`
  ).all() as { institution: string; item_id: string; created_at: string; name: string | null; type: string | null; subtype: string | null; mask: string | null; current_balance: number | null; currency: string | null }[];

  if (institutions.length === 0) {
    console.log("\nNo accounts linked. Run 'ray link' to connect one.\n");
    return;
  }

  console.log(`\n${heading("Linked Accounts")}\n`);

  let currentInst = "";
  for (const row of institutions) {
    if (row.institution !== currentInst) {
      currentInst = row.institution;
      console.log(chalk.bold(currentInst));
    }
    if (!row.name) {
      console.log(dim("  No accounts found"));
      continue;
    }
    const mask = row.mask ? ` ••${row.mask}` : "";
    const balance = row.current_balance != null ? rawFormatMoney(row.current_balance) : "—";
    const label = row.subtype || row.type || "";
    console.log(`  ${row.name}${dim(mask)}  ${dim(label)}  ${balance}`);
  }
  console.log("");
}

export function showStatus(): void {
  const db = getDb();
  const nw = getNetWorth(db);
  const cashFlow = getCashFlowThisMonth(db);
  const score = getLatestScore(db);
  const savings = getMonthlySavings(db);
  const alerts = generateAlerts(db);

  console.log(`\n${heading("Financial Overview")}\n`);

  // Net worth
  const change = nw.prev_net_worth !== null ? nw.net_worth - nw.prev_net_worth : null;
  let nwLine = `Net worth: ${chalk.bold(formatMoney(nw.net_worth))}`;
  if (change !== null) {
    nwLine += `  ${change >= 0 ? chalk.green("+" + rawFormatMoney(change)) : chalk.red(rawFormatMoney(change))} from yesterday`;
  }
  console.log(nwLine);
  console.log(dim(`  Assets: ${rawFormatMoney(nw.assets)}  Liabilities: ${rawFormatMoney(nw.liabilities)}`));
  if (nw.investments > 0) console.log(dim(`  Investments: ${rawFormatMoney(nw.investments)}  Cash: ${rawFormatMoney(nw.cash)}`));

  // Cash flow
  console.log(`\n${heading("This Month")}`);
  console.log(`  Income: ${formatMoneyColored(cashFlow.income)}  Expenses: ${formatMoney(cashFlow.expenses)}  Net: ${formatMoneyColored(cashFlow.net)}`);

  if (savings.baselineMonth) {
    const savingsColor = savings.saved >= 0 ? chalk.green : chalk.red;
    console.log(`  vs ${savings.baselineMonth}: ${savingsColor((savings.saved >= 0 ? "+" : "") + rawFormatMoney(savings.saved))}`);
  }

  // Score
  if (score) {
    console.log(`\n${heading("Daily Score")}`);
    console.log(`  ${chalk.bold(String(score.score))}/100  ${progressBar(score.score)}`);
    console.log(dim(`  Streaks: ${score.no_restaurant_streak}d no restaurants | ${score.no_shopping_streak}d no shopping | ${score.on_pace_streak}d on pace`));
  }

  // Budgets (brief)
  const budgets = getBudgetStatuses(db);
  if (budgets.length > 0) {
    console.log(`\n${heading("Budgets")}`);
    for (const b of budgets) {
      const status = b.over_budget ? chalk.red("OVER") : `${b.pct_used}%`;
      console.log(`  ${b.over_budget ? chalk.red("!") : "•"} ${categoryLabel(b.category)}: ${rawFormatMoney(b.spent)} / ${rawFormatMoney(b.budget)} (${status})`);
    }
  }

  // Alerts
  if (alerts.length > 0) {
    console.log(`\n${heading("Alerts")}`);
    for (const a of alerts) {
      const icon = a.severity === "critical" ? chalk.red("●") : a.severity === "warning" ? chalk.yellow("●") : chalk.blue("●");
      console.log(`  ${icon} ${a.message}`);
    }
  }

  console.log();
}

export function showTransactions(options: { limit?: number; category?: string; merchant?: string } = {}): void {
  const db = getDb();
  const txns = getTransactionsFiltered(db, {
    limit: options.limit || 20,
    category: options.category,
    merchant: options.merchant,
  });

  if (txns.length === 0) {
    console.log("\nNo transactions found.");
    return;
  }

  console.log(`\n${heading("Recent Transactions")}\n`);
  for (const t of txns) {
    const amount = t.amount > 0 ? chalk.red(rawFormatMoney(t.amount)) : chalk.green(rawFormatMoney(Math.abs(t.amount)));
    const merchant = t.merchant_name || t.name;
    console.log(`  ${dim(t.date)}  ${amount.padEnd(22)}  ${merchant}  ${dim(categoryLabel(t.category))}`);
  }
  console.log();
}

export async function showSpending(period = "this_month"): Promise<void> {
  const db = getDb();
  const { resolvePeriod } = await import("../db/helpers.js");
  const { start, end } = resolvePeriod(period);

  const rows = db.prepare(
    `SELECT category, SUM(amount) as total, COUNT(*) as count FROM transactions
     WHERE amount > 0 AND date BETWEEN ? AND ? AND pending = 0
     AND category NOT IN ('TRANSFER_OUT', 'TRANSFER_IN', 'LOAN_PAYMENTS')
     GROUP BY category ORDER BY total DESC`
  ).all(start, end) as { category: string; total: number; count: number }[];

  if (rows.length === 0) {
    console.log("\nNo spending found for that period.");
    return;
  }

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  console.log(`\n${heading("Spending")} ${dim(`${start} to ${end}`)}`);
  console.log(`  Total: ${chalk.bold(rawFormatMoney(grandTotal))}\n`);

  for (const r of rows) {
    const pct = Math.round((r.total / grandTotal) * 100);
    console.log(`  ${categoryLabel(r.category).padEnd(20)} ${rawFormatMoney(r.total).padStart(10)}  ${progressBar(pct, 15)}  ${dim(`${r.count} txns`)}`);
  }
  console.log();
}

export function showBudgets(): void {
  const db = getDb();
  const budgets = getBudgetStatuses(db);

  if (budgets.length === 0) {
    console.log("\nNo budgets set up. Use the chat to create budgets (e.g., 'set a budget for food at $500').");
    return;
  }

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthPct = Math.round((now.getDate() / daysInMonth) * 100);

  console.log(`\n${heading("Budgets")} ${dim(`${monthPct}% through the month`)}\n`);

  for (const b of budgets) {
    const label = categoryLabel(b.category).padEnd(20);
    const spent = rawFormatMoney(b.spent).padStart(10);
    const limit = rawFormatMoney(b.budget);
    const bar = progressBar(b.pct_used, 15);
    const over = b.over_budget ? chalk.red(` ${rawFormatMoney(Math.abs(b.remaining))} over`) : "";
    console.log(`  ${label} ${spent} / ${limit}  ${bar}${over}`);
  }
  console.log();
}

export function showGoals(): void {
  const db = getDb();
  const goals = getGoals(db);

  if (goals.length === 0) {
    console.log("\nNo goals set up. Use the chat to create goals (e.g., 'set a goal for emergency fund at $10000').");
    return;
  }

  console.log(`\n${heading("Goals")}\n`);
  for (const g of goals) {
    console.log(`  ${chalk.bold(g.name)}`);
    console.log(`    ${rawFormatMoney(g.current)} / ${rawFormatMoney(g.target)}  ${progressBar(g.progress_pct, 20)}`);
    if (g.target_date) console.log(dim(`    Target: ${g.target_date}`));
    if (g.monthly_needed > 0) console.log(dim(`    Need: ${rawFormatMoney(g.monthly_needed)}/mo`));
  }
  console.log();
}

export function showScore(): void {
  const db = getDb();
  const score = getLatestScore(db);
  const achievements = getAchievements(db);

  if (!score) {
    console.log("\nNo daily scores yet. Run 'ray sync' first.");
    return;
  }

  console.log(`\n${heading("Daily Score")} ${dim(score.date)}\n`);
  console.log(`  Score: ${chalk.bold(String(score.score))}/100  ${progressBar(score.score, 25)}`);
  console.log(`  Spend: ${rawFormatMoney(score.total_spend)}${score.zero_spend ? chalk.green("  Zero-spend day!") : ""}`);
  console.log(`  Restaurants: ${score.restaurant_count}  Shopping: ${score.shopping_count}`);
  console.log();
  console.log(`  ${heading("Streaks")}`);
  console.log(`    No restaurants: ${chalk.bold(String(score.no_restaurant_streak))} days`);
  console.log(`    No shopping:    ${chalk.bold(String(score.no_shopping_streak))} days`);
  console.log(`    On pace:        ${chalk.bold(String(score.on_pace_streak))} days`);

  if (achievements.length > 0) {
    console.log(`\n  ${heading("Achievements")}`);
    for (const a of achievements) {
      console.log(`    🏆 ${chalk.bold(a.name)} — ${a.description}`);
    }
  }
  console.log();
}

export function showAlerts(): void {
  const db = getDb();
  const alerts = generateAlerts(db);

  if (alerts.length === 0) {
    console.log("\nNo active alerts. Everything looks good!");
    return;
  }

  console.log(`\n${heading("Alerts")}\n`);
  for (const a of alerts) {
    const icon = a.severity === "critical" ? chalk.red("●") : a.severity === "warning" ? chalk.yellow("●") : chalk.blue("●");
    console.log(`  ${icon} ${a.message}`);
  }
  console.log();
}
