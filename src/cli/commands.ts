import chalk from "chalk";
import { getDb } from "../db/connection.js";
import {
  getNetWorth, getAccountBalances, getTransactionsFiltered,
  getBudgetStatuses, getGoals, getCashFlowThisMonth,
  compareSpending, getNetWorthTrend,
  formatMoney as rawFormatMoney, categoryLabel,
} from "../queries/index.js";
import { getLatestScore, getAchievements, getMonthlySavings } from "../scoring/index.js";
import { generateAlerts } from "../alerts/index.js";
import { runDailySync } from "../daily-sync.js";
import { startLinkServer } from "../server.js";
import { addManualAccount, getManualAccounts, removeManualAccount, scrapeRedfinEstimate } from "../property.js";
import {
  runAppleImport,
  appleAccountExists,
  getAppleAccountBalance,
  getAppleAccountLimit,
  countAppleRowsInRange,
  parseAppleCsv,
} from "../apple-import.js";
import { existsSync, readFileSync } from "fs";
import { heading, progressBar, formatMoney, formatMoneyColored, padColumns, dim, formatDuration, formatError, renderLogo, institutionName } from "./format.js";

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
  const readline = await import("readline");

  const { url, waitForComplete, stop } = startLinkServer();
  console.log(`\n${heading("Link Account")}\n`);
  console.log(`Opening Plaid Link in your browser...\n`);
  console.log(dim(`  ${url}\n`));

  await open(url);

  const spinner = ora("Waiting for bank connection...").start();
  await waitForComplete();
  stop();
  spinner.succeed("Bank account linked successfully!");

  // Check if a mortgage was linked and we don't already have a property account
  const db = getDb();
  const hasMortgage = db.prepare(
    `SELECT 1 FROM accounts WHERE type = 'loan' AND subtype = 'mortgage' LIMIT 1`
  ).get();
  const hasProperty = db.prepare(
    `SELECT 1 FROM accounts WHERE type = 'other' AND subtype = 'property' LIMIT 1`
  ).get();

  if (hasMortgage && !hasProperty) {
    console.log(`\n${dim("Mortgage detected.")} Track your home value for accurate net worth.`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string) => new Promise<string>(resolve => rl.question(q, resolve));

    const listingUrl = (await ask(`${dim("Paste a Redfin URL (or press Enter to skip):")} `)).trim();
    if (listingUrl) {
      const name = (await ask(`${dim("Name (e.g. Primary Residence):")} `)).trim() || "Primary Residence";
      rl.close();
      const propSpinner = ora("Fetching home value...").start();
      try {
        const value = await scrapeRedfinEstimate(listingUrl);
        if (value) {
          addManualAccount(db, name, "asset", value, listingUrl);
          propSpinner.succeed(`${name}: ${rawFormatMoney(value)} — updates automatically on sync.`);
        } else {
          propSpinner.fail("Could not determine home value from that URL. Try 'ray add' later.");
        }
      } catch {
        propSpinner.fail("Failed to fetch home value. Try 'ray add' later.");
      }
    } else {
      rl.close();
    }
  }
}

export async function showAccounts(): Promise<void> {
  const db = getDb();
  const institutions = db.prepare(
    `SELECT i.name as institution, i.item_id, i.created_at, i.logo, i.primary_color,
            a.name, a.type, a.subtype, a.mask, a.current_balance, a.currency
     FROM institutions i
     LEFT JOIN accounts a ON a.item_id = i.item_id AND a.hidden = 0
     ORDER BY i.created_at, a.type, a.current_balance DESC`
  ).all() as { institution: string; item_id: string; created_at: string; logo: string | null; primary_color: string | null; name: string | null; type: string | null; subtype: string | null; mask: string | null; current_balance: number | null; currency: string | null }[];

  if (institutions.length === 0) {
    console.log("\nNo accounts linked. Run 'ray link' to connect one.\n");
    return;
  }

  console.log(`\n${heading("Linked Accounts")}\n`);

  // Group rows by institution
  const groups = new Map<string, typeof institutions>();
  for (const row of institutions) {
    const key = row.item_id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  // Compute column widths across all accounts for alignment
  const allAccounts = institutions.filter(r => r.name);
  const maxName = Math.max(...allAccounts.map(r => `${r.name}${r.mask ? ` ••${r.mask}` : ""}`.length), 0);
  const maxLabel = Math.max(...allAccounts.map(r => (r.subtype || r.type || "").length), 0);

  for (const [, rows] of groups) {
    const first = rows[0];
    // Logo inline with institution name
    let logoStr = "";
    if (first.logo) {
      const logo = await renderLogo(first.logo);
      if (logo) logoStr = logo.replace(/\n/g, "") + " ";
    }
    console.log(`${logoStr}${institutionName(first.institution, first.primary_color)}`);

    for (const row of rows) {
      if (!row.name) {
        console.log(dim("  No accounts found"));
        continue;
      }
      const nameWithMask = `${row.name}${row.mask ? ` ••${row.mask}` : ""}`;
      const label = row.subtype || row.type || "";
      const balance = row.current_balance != null ? rawFormatMoney(row.current_balance) : "—";
      const namePad = nameWithMask.padEnd(maxName + 2);
      const labelPad = label.padEnd(maxLabel + 2);
      console.log(`  ${namePad}${dim(labelPad)}${balance}`);
    }
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
  let start: string, end: string;
  try {
    ({ start, end } = resolvePeriod(period));
  } catch {
    console.log(`\nUnknown period "${period}". Use: this_month, last_month, last_30, last_90, or START:END`);
    return;
  }

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

export async function runAdd(): Promise<void> {
  const ora = (await import("ora")).default;
  const inquirer = (await import("inquirer")).default;
  const db = getDb();

  const theme = {
    prefix: { idle: " ", done: chalk.green(" ✓") },
    style: { highlight: (text: string) => chalk.yellowBright(text) },
  };

  console.log(`\n${heading("Add Account")}`);
  console.log(dim("  Track something not linked via Plaid — a home, car, crypto, loan, etc.\n"));

  const { name } = await inquirer.prompt([{theme,
    type: "input",
    name: "name",
    message: "Name",
    validate: (v: string) => v.trim() ? true : "Required",
  }]);

  const { type } = await inquirer.prompt([{theme,
    type: "list",
    name: "type",
    message: "Type",
    choices: [
      { name: "Asset — something you own (adds to net worth)", value: "asset" as const },
      { name: "Liability — something you owe (subtracts from net worth)", value: "liability" as const },
    ],
  }]);

  let finalBalance = 0;
  let listingUrl: string | undefined;

  // For assets: offer Redfin auto-tracking
  if (type === "asset") {
    const { redfin } = await inquirer.prompt([{theme,
      type: "input",
      name: "redfin",
      message: `Redfin URL ${dim("(optional — auto-tracks home value)")}`,
    }]);

    const url = redfin.trim();
    if (url) {
      try {
        const parsed = new URL(url);
        if (!parsed.hostname.includes("redfin")) {
          console.log(chalk.yellow("  Only Redfin URLs are supported."));
        } else {
          listingUrl = url;
          const spinner = ora("Fetching Redfin Estimate...").start();
          const scraped = await scrapeRedfinEstimate(url);
          if (scraped) {
            finalBalance = scraped;
            spinner.succeed(`Redfin Estimate: ${chalk.bold(rawFormatMoney(scraped))} ${dim("— updates on each sync")}`);
          } else {
            spinner.warn("Could not fetch estimate.");
            listingUrl = undefined;
          }
        }
      } catch {
        console.log(chalk.yellow("  Invalid URL."));
      }
    }
  }

  // Manual value if no Redfin
  if (!listingUrl) {
    const { balance } = await inquirer.prompt([{theme,
      type: "input",
      name: "balance",
      message: "Current value ($)",
      validate: (v: string) => {
        const n = parseFloat(v.replace(/[$,]/g, ""));
        return isNaN(n) ? "Enter a number" : true;
      },
    }]);
    finalBalance = parseFloat(balance.replace(/[$,]/g, ""));
  }

  addManualAccount(db, name.trim(), type, finalBalance, listingUrl);
  const label = type === "asset" ? chalk.green("asset") : chalk.red("liability");
  console.log(`\n  ${chalk.green("+")} ${chalk.bold(name.trim())}  ${rawFormatMoney(finalBalance)}  ${label}\n`);
}

export async function runRemove(): Promise<void> {
  const readline = await import("readline");
  const db = getDb();

  type Entry = { kind: "institution"; item_id: string; name: string; manual: boolean } | { kind: "manual"; account_id: string; name: string; balance: number; type: string; listing_url: string | null };

  const entries: Entry[] = [];

  // Linked institutions (exclude manual-assets, which is surfaced per-account below)
  const institutions = db.prepare(
    `SELECT item_id, name, access_token FROM institutions WHERE item_id != 'manual-assets' ORDER BY created_at`
  ).all() as { item_id: string; name: string; access_token: string }[];
  for (const inst of institutions) {
    entries.push({ kind: "institution", item_id: inst.item_id, name: inst.name, manual: inst.access_token === "manual" });
  }

  // Manual accounts
  const manuals = getManualAccounts(db);
  for (const a of manuals) {
    entries.push({ kind: "manual", account_id: a.account_id, name: a.name, balance: a.current_balance, type: a.type, listing_url: a.listing_url });
  }

  if (entries.length === 0) {
    console.log("\nNo accounts to remove. Use 'ray link' or 'ray add' to add one.");
    return;
  }

  console.log(`\n${heading("Accounts")}\n`);
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.kind === "institution") {
      const acctCount = (db.prepare(`SELECT COUNT(*) as c FROM accounts WHERE item_id = ?`).get(e.item_id) as { c: number }).c;
      const sourceLabel = e.manual ? "manual" : "linked";
      console.log(`  ${dim(`${i + 1}.`)} ${e.name}  ${dim(`(${acctCount} account${acctCount !== 1 ? "s" : ""}, ${sourceLabel})`)}`);
    } else {
      const typeLabel = e.type === "loan" || e.type === "credit" ? "liability" : "asset";
      const url = e.listing_url ? dim(` — ${e.listing_url}`) : "";
      console.log(`  ${dim(`${i + 1}.`)} ${e.name}  ${rawFormatMoney(e.balance)} (${typeLabel})${url}`);
    }
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await new Promise<string>(resolve => rl.question(`\n  Remove which? (number, or Enter to cancel): `, resolve))).trim();
  rl.close();

  const idx = parseInt(answer, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= entries.length) return;

  const entry = entries[idx];
  if (entry.kind === "manual") {
    removeManualAccount(db, entry.account_id);
  } else {
    // Remove all data for this institution
    const accounts = db.prepare(`SELECT account_id FROM accounts WHERE item_id = ?`).all(entry.item_id) as { account_id: string }[];
    for (const acct of accounts) {
      db.prepare(`DELETE FROM transactions WHERE account_id = ?`).run(acct.account_id);
      db.prepare(`DELETE FROM holdings WHERE account_id = ?`).run(acct.account_id);
      db.prepare(`DELETE FROM investment_transactions WHERE account_id = ?`).run(acct.account_id);
      db.prepare(`DELETE FROM liabilities WHERE account_id = ?`).run(acct.account_id);
      db.prepare(`DELETE FROM recurring WHERE account_id = ?`).run(acct.account_id);
    }
    db.prepare(`DELETE FROM accounts WHERE item_id = ?`).run(entry.item_id);
    db.prepare(`DELETE FROM institutions WHERE item_id = ?`).run(entry.item_id);
  }
  console.log(chalk.green(`\n  Removed ${entry.name}.`));
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

export function showBills(days = 7): void {
  const db = getDb();
  const now = new Date();
  const todayDay = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const endDay = todayDay + days;

  type Bill = { name: string; amount: number; day_of_month: number };
  let bills: Bill[] = [];

  if (endDay <= daysInMonth) {
    bills = db.prepare(
      `SELECT name, amount, day_of_month FROM recurring_bills WHERE day_of_month BETWEEN ? AND ? ORDER BY day_of_month`
    ).all(todayDay + 1, endDay) as Bill[];
  } else {
    // Wraparound into next month
    const thisMonth = db.prepare(
      `SELECT name, amount, day_of_month FROM recurring_bills WHERE day_of_month BETWEEN ? AND ? ORDER BY day_of_month`
    ).all(todayDay + 1, daysInMonth) as Bill[];
    const nextMonth = db.prepare(
      `SELECT name, amount, day_of_month FROM recurring_bills WHERE day_of_month BETWEEN 1 AND ? ORDER BY day_of_month`
    ).all(endDay - daysInMonth) as Bill[];
    bills = [...thisMonth, ...nextMonth];
  }

  if (bills.length === 0) {
    console.log(`\nNo upcoming bills in the next ${days} days.`);
    return;
  }

  console.log(`\n${heading("Upcoming Bills")} ${dim(`next ${days} days`)}\n`);

  const maxName = Math.max(...bills.map(b => b.name.length));
  let total = 0;

  for (const b of bills) {
    // Calculate the actual date for this bill
    let billDate: Date;
    if (b.day_of_month > todayDay) {
      billDate = new Date(now.getFullYear(), now.getMonth(), b.day_of_month);
    } else {
      billDate = new Date(now.getFullYear(), now.getMonth() + 1, b.day_of_month);
    }
    const dateStr = billDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    console.log(`  ${dim(dateStr.padEnd(8))}${b.name.padEnd(maxName + 2)}${rawFormatMoney(b.amount).padStart(10)}`);
    total += b.amount;
  }

  console.log(`\n  ${dim("Total due:".padEnd(maxName + 10))}${chalk.bold(rawFormatMoney(total))}`);
  console.log();
}

export function showRecap(period = "last_month"): void {
  const db = getDb();
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  let start: string, end: string, label: string;
  let prevStart: string, prevEnd: string;

  if (period === "this_month") {
    start = new Date(y, m, 1).toISOString().slice(0, 10);
    end = now.toISOString().slice(0, 10);
    label = now.toLocaleDateString("en-US", { month: "long", year: "numeric" }) + " (so far)";
    prevStart = new Date(y, m - 1, 1).toISOString().slice(0, 10);
    prevEnd = new Date(y, m, 0).toISOString().slice(0, 10);
  } else {
    // last_month
    start = new Date(y, m - 1, 1).toISOString().slice(0, 10);
    end = new Date(y, m, 0).toISOString().slice(0, 10);
    const lastMonth = new Date(y, m - 1, 1);
    label = lastMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    prevStart = new Date(y, m - 2, 1).toISOString().slice(0, 10);
    prevEnd = new Date(y, m - 1, 0).toISOString().slice(0, 10);
  }

  // Spending this period
  const spending = db.prepare(
    `SELECT SUM(amount) as total, COUNT(*) as count FROM transactions
     WHERE amount > 0 AND date BETWEEN ? AND ? AND pending = 0
     AND category NOT IN ('TRANSFER_OUT', 'TRANSFER_IN', 'LOAN_PAYMENTS')`
  ).get(start, end) as { total: number | null; count: number };

  // Income this period
  const income = db.prepare(
    `SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM transactions
     WHERE amount < 0 AND date BETWEEN ? AND ? AND pending = 0
     AND category NOT IN ('TRANSFER_IN')`
  ).get(start, end) as { total: number };

  const totalSpent = spending.total || 0;
  const txnCount = spending.count || 0;

  if (txnCount === 0) {
    console.log(`\nNo transaction data for ${label}.`);
    return;
  }

  console.log(`\n${heading("Recap")} ${dim(label)}\n`);

  // ── Spending summary with comparison ──
  const cmp = compareSpending(db, prevStart, prevEnd, start, end);
  let spendLine = `  Spent ${chalk.bold(rawFormatMoney(totalSpent))} across ${txnCount} transactions`;
  if (cmp.period1Total > 0) {
    const pct = Math.abs(cmp.pctChange);
    const dir = cmp.pctChange <= 0 ? chalk.green(`${pct}% less`) : chalk.red(`${pct}% more`);
    spendLine += ` — ${dir} than prior month`;
  }
  console.log(spendLine);

  // ── Income ──
  if (income.total > 0) {
    const net = income.total - totalSpent;
    const savingsRate = Math.round((net / income.total) * 100);
    console.log(`  Earned ${chalk.bold(rawFormatMoney(income.total))}  Net: ${formatMoneyColored(net)}  ${dim(`(${savingsRate}% savings rate)`)}`);
  }

  // ── Biggest movers ──
  const movers = cmp.categories.filter(c => Math.abs(c.diff) >= 10).slice(0, 3);
  if (movers.length > 0) {
    console.log(`\n  ${heading("Biggest Movers")}`);
    for (const mv of movers) {
      const arrow = mv.diff > 0 ? chalk.red("↑") : chalk.green("↓");
      const diffStr = mv.diff > 0 ? chalk.red("+" + rawFormatMoney(mv.diff)) : chalk.green("-" + rawFormatMoney(Math.abs(mv.diff)));
      console.log(`    ${arrow} ${categoryLabel(mv.category).padEnd(18)} ${rawFormatMoney(mv.period2).padStart(10)}  ${diffStr}`);
    }
  }

  // ── Top categories ──
  const topCats = db.prepare(
    `SELECT category, SUM(amount) as total FROM transactions
     WHERE amount > 0 AND date BETWEEN ? AND ? AND pending = 0
     AND category NOT IN ('TRANSFER_OUT', 'TRANSFER_IN', 'LOAN_PAYMENTS')
     GROUP BY category ORDER BY total DESC LIMIT 5`
  ).all(start, end) as { category: string; total: number }[];

  if (topCats.length > 0) {
    console.log(`\n  ${heading("Top Categories")}`);
    for (const c of topCats) {
      const pct = Math.round((c.total / totalSpent) * 100);
      console.log(`    ${categoryLabel(c.category).padEnd(18)} ${rawFormatMoney(c.total).padStart(10)}  ${dim(`${pct}%`)}`);
    }
  }

  // ── Net worth change over the period ──
  const nwTrend = getNetWorthTrend(db, 60);
  const nwAtStart = nwTrend.find(d => d.date >= start);
  const nwAtEnd = [...nwTrend].reverse().find(d => d.date <= end);
  if (nwAtStart && nwAtEnd) {
    const nwChange = nwAtEnd.net_worth - nwAtStart.net_worth;
    const arrow = nwChange >= 0 ? chalk.green("↑") : chalk.red("↓");
    console.log(`\n  ${heading("Net Worth")}`);
    console.log(`    ${rawFormatMoney(nwAtStart.net_worth)} → ${chalk.bold(rawFormatMoney(nwAtEnd.net_worth))}  ${arrow} ${formatMoneyColored(nwChange)}`);
  }

  // ── Goals progress ──
  const goals = getGoals(db);
  const activeGoals = goals.filter(g => g.progress_pct < 100);
  if (activeGoals.length > 0) {
    console.log(`\n  ${heading("Goals")}`);
    for (const g of activeGoals) {
      console.log(`    ${g.name.padEnd(20)} ${progressBar(g.progress_pct, 12)}  ${dim(rawFormatMoney(g.current) + " / " + rawFormatMoney(g.target))}`);
    }
  }

  console.log();
}

export async function runImportApple(
  csvPath: string,
  opts: { balance?: string; limit?: string; replaceRange?: boolean; dryRun?: boolean } = {}
): Promise<void> {
  const inquirer = (await import("inquirer")).default;
  const ora = (await import("ora")).default;
  const db = getDb();

  const theme = {
    prefix: { idle: " ", done: chalk.green(" ✓") },
    style: { highlight: (text: string) => chalk.yellowBright(text) },
  };

  console.log(`\n${heading("Import Apple Card")}\n`);

  if (!existsSync(csvPath)) {
    console.error(chalk.red(`  File not found: ${csvPath}`));
    process.exit(1);
  }

  // Parse up-front so we can surface header/parse errors before any prompts
  let parsePreview: { rowCount: number; first: string; last: string; warnings: string[] };
  try {
    const { rows, warnings } = parseAppleCsv(readFileSync(csvPath, "utf-8"));
    if (rows.length === 0) {
      console.error(chalk.red("  CSV contained no valid rows."));
      if (warnings.length > 0) {
        for (const w of warnings) console.error(dim("    " + w));
      }
      process.exit(1);
    }
    const dates = rows.map(r => r.transactionDate).sort();
    parsePreview = {
      rowCount: rows.length,
      first: dates[0],
      last: dates[dates.length - 1],
      warnings,
    };
  } catch (err: any) {
    console.error(chalk.red("  " + err.message));
    process.exit(1);
  }

  const existed = appleAccountExists(db);
  console.log(
    `  ${existed ? dim("Updating existing account") : chalk.green("Creating new account")}: ${chalk.bold("Apple Card")}`
  );
  console.log(dim(`  ${parsePreview.rowCount} rows, ${parsePreview.first} → ${parsePreview.last}`));
  if (parsePreview.warnings.length > 0) {
    console.log(chalk.yellow(`  ${parsePreview.warnings.length} rows skipped (see warnings below)`));
  }
  console.log("");

  // --- Balance ---
  const parseMoney = (v: string | undefined): number | undefined => {
    if (v === undefined || v === "") return undefined;
    const n = parseFloat(String(v).replace(/[$,]/g, ""));
    return isNaN(n) ? undefined : n;
  };

  let balance = parseMoney(opts.balance);
  if (balance === undefined && !opts.dryRun) {
    const existingBalance = getAppleAccountBalance(db);
    const { answer } = await inquirer.prompt([{theme,
      type: "input",
      name: "answer",
      message: existed
        ? `Current balance on Apple Card ${dim("(what you owe, blank to keep existing)")}`
        : `Current balance on Apple Card ${dim("(what you owe)")}`,
      default: existingBalance != null ? String(existingBalance) : undefined,
      validate: (v: string) => {
        if (v.trim() === "") return existed ? true : "Required — enter your current balance";
        const n = parseFloat(v.replace(/[$,]/g, ""));
        return isNaN(n) ? (existed ? "Enter a number or leave blank" : "Enter a number") : true;
      },
    }]);
    balance = parseMoney(answer);
  }

  // --- Credit limit (optional) ---
  let limit = parseMoney(opts.limit);
  if (limit === undefined && !opts.dryRun) {
    const existingLimit = getAppleAccountLimit(db);
    const { answer } = await inquirer.prompt([{theme,
      type: "input",
      name: "answer",
      message: `Credit limit ${dim("(optional, blank to skip)")}`,
      default: existingLimit != null ? String(existingLimit) : undefined,
      validate: (v: string) => {
        if (v.trim() === "") return true;
        const n = parseFloat(v.replace(/[$,]/g, ""));
        return isNaN(n) ? "Enter a number or leave blank" : true;
      },
    }]);
    limit = parseMoney(answer);
  }

  // --- Confirm --replace-range ---
  if (opts.replaceRange && !opts.dryRun) {
    const existing = countAppleRowsInRange(db, parsePreview.first, parsePreview.last);
    if (existing > 0) {
      const { confirm } = await inquirer.prompt([{theme,
        type: "confirm",
        name: "confirm",
        message: `Delete ${chalk.bold(String(existing))} existing Apple Card rows in range ${parsePreview.first} → ${parsePreview.last}?`,
        default: false,
      }]);
      if (!confirm) {
        console.log(dim("  Aborted."));
        return;
      }
    }
  }

  // --- Run ---
  const spinner = ora(opts.dryRun ? "Previewing import..." : "Importing...").start();
  let result;
  try {
    result = runAppleImport(db, {
      csvPath,
      balance,
      limit,
      replaceRange: opts.replaceRange,
      dryRun: opts.dryRun,
    });
    spinner.succeed(opts.dryRun ? "Preview complete." : "Import complete.");
  } catch (err: any) {
    spinner.fail(formatError(err, "Import failed"));
    process.exit(1);
  }

  // --- Warnings (printed first so they can't be missed below the summary) ---
  if (result.warnings.length > 0) {
    console.log(`\n  ${chalk.yellow("Warnings:")}`);
    for (const w of result.warnings.slice(0, 10)) console.log(dim("    " + w));
    if (result.warnings.length > 10) {
      console.log(dim(`    ... and ${result.warnings.length - 10} more`));
    }
  }

  // --- Summary ---
  console.log("");
  if (opts.dryRun) {
    console.log(dim("  (dry run — no changes written)"));
  }
  const verb = result.accountCreated ? chalk.green("created") : dim("updated");
  console.log(`  Account:       Apple Card ${verb}`);
  if (result.balance != null) {
    console.log(`  Balance:       ${rawFormatMoney(result.balance)}`);
  }
  if (result.dateRange) {
    console.log(`  Date range:    ${result.dateRange.first} → ${result.dateRange.last}`);
  }
  console.log(`  Rows parsed:   ${result.rowsParsed}`);
  if (result.rowsDeleted > 0) console.log(`  Rows deleted:  ${chalk.yellow(String(result.rowsDeleted))}`);
  const insertLabel = opts.dryRun ? "Would insert: " : "Rows inserted:";
  const skipLabel = opts.dryRun ? "Would skip:   " : "Rows skipped: ";
  console.log(`  ${insertLabel} ${chalk.green(String(result.rowsInserted))}`);
  if (result.rowsSkipped > 0) {
    console.log(`  ${skipLabel} ${dim(String(result.rowsSkipped) + " (already in DB)")}`);
  }

  console.log("");
}
