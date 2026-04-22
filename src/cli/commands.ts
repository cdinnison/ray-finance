import chalk from "chalk";
import { getDb } from "../db/connection.js";
import {
  getNetWorth, getAccountBalances, getTransactionsFiltered,
  getBudgetStatuses, getGoals, getCashFlowThisMonth,
  compareSpending, getNetWorthTrend,
  formatMoney as rawFormatMoney, categoryLabel,
} from "../queries/index.js";
import { getLatestScore, getAchievements, getMonthlySavings, calculateDailyScore, checkAchievements } from "../scoring/index.js";
import { generateAlerts } from "../alerts/index.js";
import { runDailySync, snapshotNetWorth } from "../daily-sync.js";
import { startLinkServer } from "../server.js";
import { addManualAccount, getManualAccounts, removeManualAccount, scrapeRedfinEstimate } from "../property.js";
import { applyRecategorizationRules } from "../recategorization.js";
import {
  runAppleImport,
  appleAccountExists,
  getAppleAccountBalance,
  getAppleAccountLimit,
  getAppleAccountApr,
  countAppleRowsInRange,
  splitAppleRowsInRange,
  parseAppleCsv,
} from "../apple-import.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";
import { heading, progressBar, formatMoney, formatMoneyColored, padColumns, dim, formatDuration, formatError, renderLogo, institutionName } from "./format.js";
import { getUpcomingBills } from "../db/bills.js";

/**
 * Shared strict money parser used by BOTH the exit-on-error CLI-flag wrapper
 * (`parseMoneyStrict`) and inquirer prompt validators. Returns the parsed
 * number on success and `null` on any non-numeric input. Accepts `$` and `,`
 * as purely cosmetic (e.g. "$1,200.50") and supports an optional leading `-`
 * so negative amounts survive if a caller ever allows them. A bare empty
 * string after stripping whitespace is treated as "absent" and returns null;
 * callers (e.g. the prompt validators) decide whether empty means "skip" or
 * "error".
 */
export function tryParseMoney(v: string): number | null {
  const cleaned = String(v ?? "").replace(/[$,]/g, "").trim();
  if (cleaned === "") return null;
  // Require pure numeric (optional leading `-`, optional single decimal point).
  if (!/^-?\d+(\.\d+)?$|^-?\.\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Like `tryParseMoney`, but additionally enforces optional inclusive min/max
 * bounds. Returns `null` for values outside the range (with no error output;
 * inquirer validators turn the null into a user-visible validation error).
 *
 * Used by the interactive prompt validators for import-apple fields where
 * out-of-range values are semantically meaningless (APR < 0 or > 100; limit
 * or balance < 0) and would otherwise produce junk downstream (negative
 * available_balance, inverted payoff simulations, etc.).
 */
export function tryParseMoneyInRange(
  v: string,
  range: { min?: number; max?: number } = {}
): number | null {
  const n = tryParseMoney(v);
  if (n === null) return null;
  if (range.min !== undefined && n < range.min) return null;
  if (range.max !== undefined && n > range.max) return null;
  return n;
}

/**
 * Strict money parser for CLI flags. Returns `undefined` only when the flag is
 * truly absent or an empty string — any other non-numeric input is a hard
 * error so that `--balance=123abc` fails fast instead of silently parsing to
 * 123 (the old `parseFloat` behavior) or falling through to the interactive
 * prompt path under scripted/CI use.
 *
 * Accepts `$` and `,` as purely cosmetic (e.g. "$1,200.50") and supports an
 * optional leading `-` so negative amounts survive if a caller ever allows
 * them. Out-of-range values (per the optional `range.min`/`range.max`
 * bounds, inclusive) are also rejected as a hard error — the CLI layer is
 * the right boundary to enforce per-field semantic ranges (APR ∈ [0, 100],
 * limits ≥ 0, import-apple balance ≥ 0) so junk never reaches liabilities /
 * accounts tables or downstream payoff / utilization math.
 *
 * When `exitOnError` is true (the default for CLI use) the function prints a
 * red error naming the flag and exits with code 1; when false it returns
 * `null` so unit tests can assert rejection without terminating the process.
 */
export function parseMoneyStrict(
  flagName: string,
  v: string | undefined,
  exitOnError = true,
  range: { min?: number; max?: number } = {}
): number | undefined | null {
  if (v === undefined || v === "") return undefined;
  const n = tryParseMoney(v);
  if (n === null) {
    console.error(chalk.red(`Error: --${flagName} must be a number (got "${v}")`));
    if (exitOnError) process.exit(1);
    return null;
  }
  if (range.min !== undefined && n < range.min) {
    console.error(chalk.red(`Error: --${flagName} must be >= ${range.min} (got ${n})`));
    if (exitOnError) process.exit(1);
    return null;
  }
  if (range.max !== undefined && n > range.max) {
    console.error(chalk.red(`Error: --${flagName} must be <= ${range.max} (got ${n})`));
    if (exitOnError) process.exit(1);
    return null;
  }
  return n;
}

export function getImportAppleBackfillWindow(
  result: { dateRange: { first: string; last: string } | null; replaceWindow: { first: string; last: string } | null },
  opts: { replaceRange?: boolean },
  now = new Date()
): { start: string; end: string } | null {
  if (!result.dateRange) return null;

  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  const earliestAffectedDate = opts.replaceRange
    ? (result.replaceWindow?.first ?? result.dateRange.first)
    : result.dateRange.first;

  return {
    start: earliestAffectedDate <= yesterday ? earliestAffectedDate : yesterday,
    end: yesterday,
  };
}

export async function runSync(): Promise<void> {
  const ora = (await import("ora")).default;
  const spinner = ora("Syncing transactions...").start();
  const startTime = Date.now();
  // Isolate sync failure: catch here so the spinner.fail message names the sync error, not any future post-sync step.
  let result;
  try {
    const db = getDb();
    result = await runDailySync(db);
  } catch (err: any) {
    spinner.fail(formatError(err, "Sync failed"));
    process.exit(1);
  }
  const elapsed = formatDuration(Date.now() - startTime);
  const parts = [elapsed];
  if (result.transactionsAdded > 0) parts.push(`${result.transactionsAdded} new transactions`);
  // Post-sync partial-failure signal: per-institution Plaid pulls committed
  // independently above, but the derivation tail (net-worth snapshot + recat
  // + backfill + yesterday's score) or the achievement check may have
  // thrown. Mirror runImportApple's pattern (spinner.warn on post-import
  // failure) so the user sees derived state may be stale instead of a
  // falsely-clean "Sync complete."
  const postWarns: string[] = [];
  if (result.derivationError) postWarns.push(`derivation failed: ${result.derivationError}`);
  if (result.achievementError) postWarns.push(`achievement check failed: ${result.achievementError}`);
  if (postWarns.length > 0) {
    spinner.warn(
      `Sync complete, but post-sync steps failed: ${postWarns.join("; ")} ${chalk.dim(`(${parts.join(", ")})`)}`,
    );
  } else {
    spinner.succeed(`Sync complete. ${chalk.dim(`(${parts.join(", ")})`)}`);
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
  // Discriminate manual institutions (Apple Card today, any future CSV-import
  // source tomorrow) via the unified `access_token = 'manual' AND item_id !=
  // 'manual-assets'` rule so showAccounts and runRemove stay in sync. The
  // manual-assets institution (home/car/etc. added via `ray add`) also uses
  // access_token='manual' but surfaces under its own 'Manual Accounts' header
  // below, so we exclude it from the `(manual)` suffix to avoid a redundant
  // tag on that header.
  const institutions = db.prepare(
    `SELECT i.name as institution, i.item_id, i.created_at, i.logo, i.primary_color,
            CASE WHEN i.access_token = 'manual' AND i.item_id != 'manual-assets' THEN 1 ELSE 0 END AS is_manual,
            a.name, a.type, a.subtype, a.mask, a.current_balance, a.currency
     FROM institutions i
     LEFT JOIN accounts a ON a.item_id = i.item_id AND a.hidden = 0
     ORDER BY i.created_at, a.type, a.current_balance DESC`
  ).all() as { institution: string; item_id: string; created_at: string; logo: string | null; primary_color: string | null; is_manual: number; name: string | null; type: string | null; subtype: string | null; mask: string | null; current_balance: number | null; currency: string | null }[];

  if (institutions.length === 0) {
    console.log("\nNo accounts yet. Run 'ray link', 'ray add', or 'ray import-apple' to get started.\n");
    return;
  }

  console.log(`\n${heading("Accounts")}\n`);

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
    const manualLabel = first.is_manual === 1 ? dim(" (manual)") : "";
    console.log(`${logoStr}${institutionName(first.institution, first.primary_color)}${manualLabel}`);

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

  const rawRows = db.prepare(
    `SELECT category, SUM(amount) as total, COUNT(*) as count FROM transactions
     WHERE amount > 0 AND date BETWEEN ? AND ? AND pending = 0
     AND (category IS NULL OR category NOT IN ('TRANSFER_OUT', 'TRANSFER_IN', 'LOAN_PAYMENTS'))
     GROUP BY category ORDER BY total DESC`
  ).all(start, end) as { category: string | null; total: number; count: number }[];

  if (rawRows.length === 0) {
    console.log("\nNo spending found for that period.");
    return;
  }

  // Merge NULL and literal 'OTHER' into a single "Other" bucket so a month
  // with both Apple-unmapped (NULL) and Plaid PFC fallback ('OTHER') rows
  // doesn't surface two duplicate "Other" lines. Sum totals AND counts
  // across the merged bucket so the "N txns" trailer reflects every row.
  const rowMap = new Map<string | null, { total: number; count: number }>();
  for (const r of rawRows) {
    const key = r.category == null || r.category === "OTHER" ? null : r.category;
    const prev = rowMap.get(key) ?? { total: 0, count: 0 };
    rowMap.set(key, { total: prev.total + r.total, count: prev.count + r.count });
  }
  const rows = [...rowMap.entries()]
    .map(([category, agg]) => ({ category, ...agg }))
    .sort((a, b) => b.total - a.total);

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
    console.log("\nNo daily scores yet. Run 'ray sync' or 'ray import-apple' first.");
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
        return tryParseMoney(v) === null ? "Enter a number" : true;
      },
    }]);
    finalBalance = tryParseMoney(balance) ?? 0;
  }

  addManualAccount(db, name.trim(), type, finalBalance, listingUrl);
  const label = type === "asset" ? chalk.green("asset") : chalk.red("liability");
  console.log(`\n  ${chalk.green("+")} ${chalk.bold(name.trim())}  ${rawFormatMoney(finalBalance)}  ${label}\n`);
}

export async function runRemove(): Promise<void> {
  const readline = await import("readline");
  const ora = (await import("ora")).default;
  const db = getDb();

  type Entry = { kind: "institution"; item_id: string; name: string; manual: boolean } | { kind: "manual"; account_id: string; name: string; balance: number; type: string; listing_url: string | null };

  const entries: Entry[] = [];

  // Institutions (Plaid-linked and non-property manual, e.g. Apple Card).
  // Excludes manual-assets, whose accounts are surfaced per-account below.
  // Least-exposure: derive `is_manual` in SQL instead of hydrating the
  // encrypted Plaid access token into JS memory — runRemove only needs the
  // manual/linked boolean for the listing label.
  // Discriminator: `access_token = 'manual' AND item_id != 'manual-assets'`
  // matches the unified rule used in showAccounts so the two commands label
  // the same institution consistently. The outer WHERE already filters out
  // manual-assets, so the AND clause here is defensive-redundant but keeps
  // the rule self-documenting.
  const institutions = db.prepare(
    `SELECT item_id, name,
            CASE WHEN access_token = 'manual' AND item_id != 'manual-assets' THEN 1 ELSE 0 END AS is_manual
     FROM institutions WHERE item_id != 'manual-assets' ORDER BY created_at`
  ).all() as { item_id: string; name: string; is_manual: number }[];
  for (const inst of institutions) {
    entries.push({ kind: "institution", item_id: inst.item_id, name: inst.name, manual: inst.is_manual === 1 });
  }

  // Manual accounts
  const manuals = getManualAccounts(db);
  for (const a of manuals) {
    entries.push({ kind: "manual", account_id: a.account_id, name: a.name, balance: a.current_balance, type: a.type, listing_url: a.listing_url });
  }

  if (entries.length === 0) {
    console.log("\nNo accounts to remove. Use 'ray link', 'ray add', or 'ray import-apple' to add one.");
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
  let removedAccountIds: string[] = [];
  if (entry.kind === "manual") {
    removedAccountIds = [entry.account_id];
    removeManualAccount(db, entry.account_id);
  } else {
    // Remove all data for this institution. The DELETE chain must be atomic
    // so a mid-chain failure (Ctrl+C, SQLITE_BUSY, disk error) can't leave
    // the account half-removed — e.g. transactions gone but the account row
    // still listed. cleanupDerivedAfterRemove runs after the commit and has
    // its own transaction, so the 90-day rescore never holds the write lock.
    const accounts = db.prepare(`SELECT account_id FROM accounts WHERE item_id = ?`).all(entry.item_id) as { account_id: string }[];
    removedAccountIds = accounts.map(a => a.account_id);
    const removeInstitution = db.transaction(() => {
      for (const acct of accounts) {
        db.prepare(`DELETE FROM transactions WHERE account_id = ?`).run(acct.account_id);
        db.prepare(`DELETE FROM holdings WHERE account_id = ?`).run(acct.account_id);
        db.prepare(`DELETE FROM investment_transactions WHERE account_id = ?`).run(acct.account_id);
        db.prepare(`DELETE FROM liabilities WHERE account_id = ?`).run(acct.account_id);
        db.prepare(`DELETE FROM recurring WHERE account_id = ?`).run(acct.account_id);
      }
      db.prepare(`DELETE FROM accounts WHERE item_id = ?`).run(entry.item_id);
      db.prepare(`DELETE FROM institutions WHERE item_id = ?`).run(entry.item_id);
    });
    removeInstitution();
  }
  // Refresh derived state so daily_scores and net_worth_history aren't left
  // referencing rows we just deleted. Covers both removal paths (Plaid
  // institution and manual asset) because either can move net worth or shift
  // historical spending that participated in daily-score calculations.
  //
  // Wrapped in an ora spinner because the 90-day rescore loop inside
  // cleanupDerivedAfterRemove can take several seconds on large transaction
  // histories — without progress output the terminal stalls silently after
  // the user's input and before "Removed <name>." prints. Spinner is kept
  // OUTSIDE cleanupDerivedAfterRemove's internal db.transaction so the
  // spinner lifecycle (start/succeed/fail) is independent of transaction
  // boundaries.
  //
  // On throw: the institution/account DELETE already committed above, so a
  // derivation-tail failure here must not report "Remove failed" — that
  // would wrongly suggest the primary removal itself failed. Degrade to
  // spinner.warn and continue, matching runDailySync's post-sync derivation
  // handling and runImportApple's post-import derivation handling.
  const spinner = ora("Recomputing derived data...").start();
  try {
    cleanupDerivedAfterRemove(db, removedAccountIds);
    spinner.succeed(chalk.green(`Removed ${entry.name}.`));
  } catch (err: any) {
    spinner.warn(
      `Removed ${entry.name}; post-remove cleanup failed: ${(err && err.message) || String(err)}`
    );
  }
  console.log();
}

/**
 * After an account is removed, daily_scores rows and the latest
 * net_worth_history row may still reference transactions / balances that no
 * longer exist. Rescore from ~90 days ago through yesterday (matching the
 * runDailySync / getImportAppleBackfillWindow convention of never writing
 * a partial today row) and take a fresh net-worth snapshot.
 *
 * Rescore semantics: calculateDailyScore's hasPriorActivity guard requires
 * transaction activity within the scored day's local window (±30 days), so
 * the rescore loop only re-creates daily_scores rows for dates that have
 * legitimate nearby activity in the surviving transaction set. Quiet gaps
 * (e.g., post-remove with only old Apple CSV data and nothing recent) are
 * left empty rather than padded with synthetic zero_spend rows.
 * `removedAccountIds` is reserved for future per-account rescoping — today
 * calculateDailyScore reads the full transactions table, so we simply
 * re-score the window.
 */
export function cleanupDerivedAfterRemove(db: ReturnType<typeof getDb>, _removedAccountIds: string[]): void {
  const now = new Date();
  // 90 days covers the typical streak/score-window span without blowing up
  // on very old data. Stop at yesterday — writing a partial today row would
  // seed the next runDailySync's streak chain with mid-day data, and
  // runDailySync's own backfill loop is strict-less-than yesterday so it
  // would never overwrite a stale partial row on the next sync.
  const start = new Date(now.getTime() - 90 * 86400000);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  let d = startStr;
  const work = db.transaction(() => {
    // Purge stale daily_scores rows in the 90-day window BEFORE rescoring.
    // calculateDailyScore's hasPriorActivity guard returns without writing
    // for dates that have no transaction activity in the ±30-day local
    // window — so if removing the only transaction source (e.g. the user's
    // sole Plaid institution) empties the transactions table, or if the
    // only surviving transactions are older than 30 days, every rescore
    // loop iteration in that dead zone is a no-op and the pre-existing
    // stale daily_scores rows (referencing the now-deleted account's
    // spending) survive unchanged. Deleting first makes cleanup
    // self-contained: calculateDailyScore then re-creates only days with
    // transaction activity within the scored day's local window, and
    // achievement checks that scan MAX(*_streak) / COUNT(zero_spend=1) over
    // daily_scores won't see phantom rows from the removed account's
    // historical data.
    db.prepare(`DELETE FROM daily_scores WHERE date BETWEEN ? AND ?`).run(startStr, endStr);
    while (d <= endStr) {
      calculateDailyScore(db, d);
      const [y, mo, dy] = d.split("-").map(Number);
      const next = new Date(Date.UTC(y, mo - 1, dy + 1));
      d = next.toISOString().slice(0, 10);
    }
    snapshotNetWorth(db);
  });
  work();
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
  const bills = getUpcomingBills(db, days);

  if (bills.length === 0) {
    console.log(`\nNo upcoming bills in the next ${days} days.`);
    return;
  }

  console.log(`\n${heading("Upcoming Bills")} ${dim(`next ${days} days`)}\n`);

  const maxName = Math.max(...bills.map(b => b.name.length));
  let total = 0;

  for (const b of bills) {
    const dateStr = b.date.toLocaleDateString("en-US", {
      month: "short", day: "numeric", timeZone: "UTC",
    });
    const amountStr = rawFormatMoney(b.amount);
    const noteStr = b.note ? dim(` ${b.note}`) : "";
    const tag = dim(`[${b.source}]`);
    console.log(
      `  ${dim(dateStr.padEnd(8))}${b.name.padEnd(maxName + 2)}${amountStr.padStart(10)}${noteStr}  ${tag}`
    );
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

  // Spending this period. NULL-safe category filter (see apple-import.ts for
  // the NULL-category rows this must include in the total). compareSpending
  // (used below for the prior-month comparison) is also NULL-inclusive now
  // and coalesces NULL into the 'Other' bucket in JS, so totalSpent and
  // cmp.pctChange reference the same row set.
  const spending = db.prepare(
    `SELECT SUM(amount) as total, COUNT(*) as count FROM transactions
     WHERE amount > 0 AND date BETWEEN ? AND ? AND pending = 0
     AND (category IS NULL OR category NOT IN ('TRANSFER_OUT', 'TRANSFER_IN', 'LOAN_PAYMENTS'))`
  ).get(start, end) as { total: number | null; count: number };

  // Income this period. Plain `NOT IN` (NULL-excluding) is the right choice
  // on the income side: a NULL-category negative amount is almost always an
  // Apple refund or a pre-mapping TRANSFER_IN, not real income.
  const income = db.prepare(
    `SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM transactions
     WHERE amount < 0 AND date BETWEEN ? AND ? AND pending = 0
     AND category NOT IN ('TRANSFER_IN', 'LOAN_PAYMENTS', 'LOAN_PAYMENTS_CAR_PAYMENT', 'LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT')`
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
  // Pull the full set (no SQL LIMIT) so the JS-side bucket merge below can't
  // drop half of a NULL+'OTHER' merge by having one bucket fall outside the
  // top 5 before merging. categoryLabel(null) and categoryLabel('OTHER')
  // both render as "Other" — merging both into a single logical bucket keyed
  // on the RENDERED label prevents duplicate "Other" lines when a month has
  // both Apple-unmapped (NULL) and Plaid PFC fallback ('OTHER') rows. Keeps
  // any non-Other category as its own bucket by keying on raw category.
  const topCatRows = db.prepare(
    `SELECT category, SUM(amount) as total FROM transactions
     WHERE amount > 0 AND date BETWEEN ? AND ? AND pending = 0
     AND (category IS NULL OR category NOT IN ('TRANSFER_OUT', 'TRANSFER_IN', 'LOAN_PAYMENTS'))
     GROUP BY category ORDER BY total DESC`
  ).all(start, end) as { category: string | null; total: number }[];

  const topCatMap = new Map<string | null, number>();
  for (const r of topCatRows) {
    // Normalize the two "Other" producers (NULL and literal 'OTHER') onto
    // a single key; keep everything else keyed on its raw category string.
    const key = r.category == null || r.category === "OTHER" ? null : r.category;
    topCatMap.set(key, (topCatMap.get(key) ?? 0) + r.total);
  }
  const topCats = [...topCatMap.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

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
  opts: { balance?: string; limit?: string; apr?: string; replaceRange?: boolean; dryRun?: boolean; yes?: boolean } = {}
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
  let parsePreview: {
    rowCount: number;
    first: string;
    last: string;
    // Authoritative window `--replace-range` will delete across — wider than
    // `first`/`last` when rows at the edges were skipped for bad amount/columns.
    replaceFirst: string;
    replaceLast: string;
    warnings: string[];
    skippedCount: number;
  };
  let parsed: ReturnType<typeof parseAppleCsv>;
  try {
    parsed = parseAppleCsv(readFileSync(csvPath, "utf-8"));
    const { rows, warnings, skippedCount, replaceWindow } = parsed;
    if (rows.length === 0) {
      // parseAppleCsv throws on a bad header, so zero rows + zero warnings
      // means the file had a valid header and no data rows (header-only
      // export). Point the user at the actual cause rather than leaving
      // them to wonder whether their CSV format is wrong.
      if (warnings.length > 0) {
        console.error(chalk.red("  CSV contained no valid rows — every row was rejected:"));
        for (const w of warnings) console.error(dim("    " + w));
      } else {
        console.error(chalk.red("  CSV had a valid header but no data rows."));
        console.error(dim("    Export from https://card.apple.com/ (the web portal, not the Wallet app)."));
      }
      process.exit(1);
    }
    const dates = rows.map(r => r.transactionDate).sort();
    const first = dates[0];
    const last = dates[dates.length - 1];
    parsePreview = {
      rowCount: rows.length,
      first,
      last,
      replaceFirst: replaceWindow?.first ?? first,
      replaceLast: replaceWindow?.last ?? last,
      warnings,
      skippedCount,
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
  if (opts.replaceRange) {
    console.log(dim(`  Replace window: ${parsePreview.replaceFirst} → ${parsePreview.replaceLast}`));
  }
  // Separate the two classes of warnings: rows that were actually DROPPED
  // from the import (bad column count, bad date, bad amount) vs. non-fatal
  // notices for rows that WERE imported (e.g. one-per-unique unmapped
  // category). Conflating them under a single "N rows skipped" count is
  // materially misleading — a user with 100 imported rows under "Groceries"
  // should not be told 1 row was skipped just because "Groceries" is an
  // unmapped category name.
  if (parsePreview.skippedCount > 0) {
    console.log(chalk.yellow(`  ${parsePreview.skippedCount} rows skipped`));
  }
  const otherWarnings = parsePreview.warnings.length - parsePreview.skippedCount;
  if (otherWarnings > 0) {
    console.log(chalk.yellow(`  ${otherWarnings} warning${otherWarnings === 1 ? "" : "s"}`));
  }
  console.log("");

  // --- Balance ---
  // CLI flags go through `parseMoneyStrict` (which hard-exits on junk like
  // `--balance 123abc` instead of silently discarding the tail). Prompt
  // answers share the same strict parser via `tryParseMoney`, which is also
  // what the `validate` hook uses — so a value that passes `validate` is
  // guaranteed to parse non-null here.
  // Range-enforced at the CLI boundary: a negative Apple Card balance makes
  // no sense (you owe >= 0 on a credit card) and would corrupt
  // available_balance = balance_limit - current_balance, inverted utilization,
  // etc. Manual-asset runAdd remains unbounded (negative equity legitimate).
  let balance = parseMoneyStrict("balance", opts.balance, true, { min: 0 }) as number | undefined;
  // Dry-run skips prompts but the real import will require a balance on first
  // run — surface that now so the preview isn't misleading.
  if (opts.dryRun && !existed && balance === undefined) {
    console.log(chalk.yellow(`  Note: real import will prompt for current balance (first-run requirement).`));
    console.log("");
  }
  if (balance === undefined && !opts.dryRun) {
    // Non-TTY (scripted / CI / piped) must never block on inquirer. For first
    // runs the balance is required, so exit with a clear error naming the
    // flag. For re-imports we can safely leave balance undefined because the
    // `ON CONFLICT ... COALESCE(excluded.current_balance, current_balance)` in
    // insertAcc preserves the prior value.
    if (!process.stdin.isTTY) {
      if (!existed) {
        console.error(chalk.red("Error: --balance is required in non-interactive mode."));
        console.error(chalk.red("  Example: ray import-apple <csv> --balance 1234.56"));
        process.exit(1);
      } else {
        console.log(
          chalk.yellow(
            "  Non-interactive mode: --balance not provided; keeping existing balance on Apple Card."
          )
        );
      }
    } else {
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
          return tryParseMoneyInRange(v, { min: 0 }) === null
            ? (existed ? "Enter a non-negative number or leave blank" : "Enter a non-negative number")
            : true;
        },
      }]);
      balance = answer.trim() === "" ? undefined : (tryParseMoneyInRange(answer, { min: 0 }) ?? undefined);
    }
  }

  // --- Credit limit (optional) ---
  // Credit limit must be non-negative — a negative limit would produce a
  // junk available_balance and corrupt the downstream utilization display.
  let limit = parseMoneyStrict("limit", opts.limit, true, { min: 0 }) as number | undefined;
  if (limit === undefined && !opts.dryRun) {
    // Limit is optional — in non-TTY mode we just skip the prompt and proceed
    // with `undefined`, rather than failing the whole import.
    if (!process.stdin.isTTY) {
      console.log(
        chalk.yellow(
          "  Non-interactive mode: skipping credit-limit prompt. Pass --limit <amount> to set one."
        )
      );
      limit = undefined;
    } else {
      const existingLimit = getAppleAccountLimit(db);
      const { answer } = await inquirer.prompt([{theme,
        type: "input",
        name: "answer",
        message: `Credit limit ${dim("(optional, blank to skip)")}`,
        default: existingLimit != null ? String(existingLimit) : undefined,
        validate: (v: string) => {
          if (v.trim() === "") return true;
          return tryParseMoneyInRange(v, { min: 0 }) === null
            ? "Enter a non-negative number or leave blank"
            : true;
        },
      }]);
      limit = answer.trim() === "" ? undefined : (tryParseMoneyInRange(answer, { min: 0 }) ?? undefined);
    }
  }

  // --- APR (optional) ---
  // Apple's CSV doesn't carry interest_rate, so we let the user supply it via
  // --apr. Persisted across re-imports via COALESCE in upsertLiability — a
  // re-run without --apr preserves the prior stored rate rather than
  // clobbering it with NULL. Without an APR, downstream consumers (AI debt
  // tools / insights) render the card as "APR unknown" rather than 0%.
  // APR is a percentage, inclusive in [0, 100]. A negative rate or a
  // >100% rate would break simulatePayoff (negative monthlyRate principal
  // decreases faster than payment; 1000% monthlyRate overstates timelines).
  // 0 is a genuinely promotional rate so is inclusive; 100% covers the
  // retail-card tail.
  let apr = parseMoneyStrict("apr", opts.apr, true, { min: 0, max: 100 }) as number | undefined;
  if (apr === undefined && !opts.dryRun) {
    if (!process.stdin.isTTY) {
      console.log(
        chalk.yellow(
          "  Non-interactive mode: skipping APR prompt. Pass --apr <percent> to set one — otherwise the AI treats the card's APR as unknown."
        )
      );
      apr = undefined;
    } else {
      const existingApr = getAppleAccountApr(db);
      const { answer } = await inquirer.prompt([{theme,
        type: "input",
        name: "answer",
        message: `APR ${dim("(optional, percent — e.g. 22.24, blank to skip)")}`,
        default: existingApr != null ? String(existingApr) : undefined,
        validate: (v: string) => {
          if (v.trim() === "") return true;
          return tryParseMoneyInRange(v, { min: 0, max: 100 }) === null
            ? "Enter a percent between 0 and 100, or leave blank"
            : true;
        },
      }]);
      apr = answer.trim() === "" ? undefined : (tryParseMoneyInRange(answer, { min: 0, max: 100 }) ?? undefined);
    }
  }

  // --- Confirm --replace-range ---
  if (opts.replaceRange && !opts.dryRun) {
    const existing = countAppleRowsInRange(db, parsePreview.replaceFirst, parsePreview.replaceLast);
    if (existing > 0) {
      // Show gross purchases vs payments rather than the net: a typical
      // month containing both purchases and a card payment can net to ~$0
      // or even negative, which misrepresents the volume the user is about
      // to delete.
      const { purchases, payments } = splitAppleRowsInRange(db, parsePreview.replaceFirst, parsePreview.replaceLast);
      if (!process.stdin.isTTY && !opts.yes) {
        // Non-TTY (scripted / CI / piped) must never block on inquirer.
        // Row count and date range are already in the summary above, so the
        // error stays terse.
        console.error(chalk.red("Error: --yes is required in non-interactive mode to confirm --replace-range."));
        process.exit(1);
      }
      if (!opts.yes) {
        const { confirm } = await inquirer.prompt([{theme,
          type: "confirm",
          name: "confirm",
          message: `Delete ${chalk.bold(String(existing))} existing Apple Card rows in range ${parsePreview.replaceFirst} → ${parsePreview.replaceLast}?\n  Purchases: ${rawFormatMoney(purchases)}\n  Payments:  ${rawFormatMoney(payments)}`,
          default: false,
        }]);
        if (!confirm) {
          console.log(dim("  Aborted."));
          return;
        }
      }
    } else {
      console.log(dim("  No existing Apple rows found in range; proceeding as insert-only."));
    }
  }

  // --- Run ---
  // Split the try/catch at the commit boundary so a post-import derivation
  // failure (recat, net-worth snapshot, daily-score backfill) can't make a
  // successful import appear to have failed. Pre-commit failure => "Import
  // failed" + exit 1. Post-commit failure => warn the user that the import
  // itself succeeded but the follow-up derivation didn't, then continue to
  // the summary so they still see what was written.
  const spinner = ora(opts.dryRun ? "Previewing import..." : "Importing...").start();
  let result;
  const recatBuf: string[] = [];
  let recat: { rulesEvaluated: number; rulesSkipped: number; transactionsUpdated: number; earliestAffectedDate: string | null } | null = null;
  let daysScored = 0;
  let scoredRange: { start: string; end: string } | null = null;
  let netWorthSnapshot: number | null = null;
  let postImportError: Error | null = null;
  try {
    result = runAppleImport(db, {
      csvPath,
      balance,
      limit,
      apr,
      replaceRange: opts.replaceRange,
      dryRun: opts.dryRun,
      preParsed: parsed,
    });
  } catch (err: any) {
    spinner.fail(formatError(err, "Import failed"));
    process.exit(1);
  }

  // Post-commit derivation: recat, net-worth snapshot, daily-score backfill.
  // Skipped on dry-run. Failures here must not masquerade as import failures
  // — rows are already committed by runAppleImport.
  //
  // Atomicity: wrap the whole derivation block in a single db.transaction so
  // a mid-block failure (e.g. calculateDailyScore throwing partway through a
  // long backfill) rolls back EVERYTHING — recat, net-worth snapshot, and
  // partial daily_scores rows — rather than leaving the user with a
  // "post-import steps failed" warning alongside half-applied derived state
  // that subsequent `ray sync` / `ray status` reads assume is self-consistent.
  // Matches cleanupDerivedAfterRemove's pattern.
  if (!opts.dryRun) {
    // Route BOTH log and error through recatBuf so neither writes to the
    // TTY while the ora spinner is still animating (which would mangle the
    // frame) and both get flushed in order after spinner.succeed(). Errors
    // render red so they're still distinguishable in the post-spinner flush.
    const bufLogger = { log: (m: string) => recatBuf.push(m), error: (m: string) => recatBuf.push(chalk.red(m)) };
    // Explicit return from the transaction callback so TS flow analysis can
    // reason about assignment possibilities (closure writes to enclosing
    // `let`s are treated as "may not happen" and leave the union narrowed
    // to `null`, breaking the `scoredRange.start` deref below).
    type WorkOut = {
      recat: { rulesEvaluated: number; rulesSkipped: number; transactionsUpdated: number; earliestAffectedDate: string | null } | null;
      daysScored: number;
      scoredRange: { start: string; end: string } | null;
      netWorthSnapshot: number | null;
    };
    const work = db.transaction((): WorkOut => {
      // Run the same post-ingest derivation ray sync runs — recategorization +
      // daily score + achievement checks — so Apple-only users (no Plaid
      // institutions) don't get an empty daily_scores table forever, and
      // `ray status` / `ray score` have a fresh row to show. Skipped on dry-run.
      // Recat runs BEFORE backfill so daily_scores reflects recat'd categories.
      const localRecat = applyRecategorizationRules(db, bufLogger);
      let localDaysScored = 0;
      let localScoredRange: { start: string; end: string } | null = null;
      let localNetWorthSnapshot: number | null = null;

      if (result.dateRange) {
        // Snapshot net worth so Apple-only users (no Plaid institutions, never
        // run `ray sync`) still get net_worth_history rows — otherwise the
        // "from yesterday" delta and net-worth trend queries stay empty/stale.
        const { netWorth: nw } = snapshotNetWorth(db);
        localNetWorthSnapshot = nw;

        const baseWindow = getImportAppleBackfillWindow(result, opts);
        // If the recat pass newly updated transactions dated BEFORE the
        // CSV range (a rule that happened to also match older transactions
        // elsewhere in the DB), widen the start of the backfill window to
        // cover them. Otherwise their old daily_scores rows survive stale
        // with the pre-recat category breakdown. Clamping against
        // MIN(transactions.date) happens below, so the widening is safe
        // even if earliestAffectedDate predates any recorded activity.
        const backfillWindow = baseWindow && localRecat.earliestAffectedDate !== null
          ? {
              start: localRecat.earliestAffectedDate < baseWindow.start
                ? localRecat.earliestAffectedDate
                : baseWindow.start,
              end: baseWindow.end,
            }
          : baseWindow;

        // Backfill daily scores across the imported date range so streaks
        // accumulate properly (each day reads the prior day's daily_scores row)
        // and streak-based achievements (Kitchen Hero, Detoxed, etc.) can unlock.
        // daily_scores has date-PK UPSERT, so re-scoring dates that already have
        // rows is idempotent. Performance: ~5 queries per day, acceptable for
        // typical CSV ranges (a 6-month backfill is ~900 queries, ~2s).
        // Always score through yesterday — not just through dateRange.last —
        // because (a) the "fresh score row" users see must reflect today's
        // knowledge, and (b) calculateDailyScore chains streaks off the prior
        // day's daily_scores row, so any retroactive import requires re-scoring
        // every subsequent day to rebuild the streak chain. Under
        // `--replace-range`, rescore from the full deleted window rather than
        // only from the first successfully imported row, or stale daily_scores
        // can survive for boundary dates that were deleted due to malformed rows.
        if (backfillWindow) {
          // Clamp the loop's start to MIN(transactions.date) so the
          // widening can't synthesize daily_scores for dates before any
          // recorded activity. calculateDailyScore's hasPriorActivity
          // guard (scoring/index.ts, ±30-day window) no-ops on far-
          // before-firstTxn dates, but its +1-day lookahead still inserts
          // a zero-context row for the day immediately before firstTxn.
          // Without the clamp, localDaysScored and the "Scored N day(s),
          // start -> end" summary would inflate; a CSV beginning long
          // before any Plaid history would otherwise show "Scored 90
          // days" when the DB only gained a handful of rows.
          const firstTxn = db.prepare(`SELECT MIN(date) as d FROM transactions`).get() as { d: string | null };
          if (firstTxn.d != null) {
            const { start: origStart, end } = backfillWindow;
            const start = origStart > firstTxn.d ? origStart : firstTxn.d;
            spinner.text = `Backfilling daily scores (${start} \u2192 ${end})...`;
            let d = start;
            while (d <= end) {
              calculateDailyScore(db, d);
              localDaysScored++;
              const [y, mo, dy] = d.split("-").map(Number);
              const next = new Date(Date.UTC(y, mo - 1, dy + 1));
              d = next.toISOString().slice(0, 10);
            }
            localScoredRange = { start, end };
          }
          // If firstTxn.d is null, the transactions table is empty --
          // leave localDaysScored=0 and localScoredRange=null so the
          // summary doesn't report scored days that were never persisted.
        }
      }
      return {
        recat: localRecat,
        daysScored: localDaysScored,
        scoredRange: localScoredRange,
        netWorthSnapshot: localNetWorthSnapshot,
      };
    });
    try {
      const out = work() as WorkOut;
      recat = out.recat;
      daysScored = out.daysScored;
      scoredRange = out.scoredRange;
      netWorthSnapshot = out.netWorthSnapshot;
    } catch (err: any) {
      // Rollback already happened inside db.transaction on throw. The
      // closure-local counters were never assigned to the outer-scope
      // accumulators, so they retain their initial zero/null values and
      // the post-spinner summary won't report derivations that were
      // rolled back.
      postImportError = err;
      // recatBuf is a JS array captured by bufLogger's closure — it was
      // populated BEFORE the throw as applyRecategorizationRules emitted
      // per-rule success lines, but sqlite's rollback only reverts DB
      // state, not JS-heap mutations. Clear it so the post-summary
      // Recategorization flush doesn't print "Recategorized N txn(s)"
      // lines for UPDATEs that were actually rolled back alongside the
      // spinner.warn('post-import steps failed'). Legitimate invalid-rule
      // error messages (routed through bufLogger.error) are also in this
      // buffer — accepting their loss is the trade for the simple clear;
      // a follow-up could split success/error buffers to preserve them.
      recatBuf.length = 0;
    }
  }

  // Incorporate the scored-day count into the succeed message so a long
  // backfill can't feel like a silent stall. Post-import-step failures are
  // surfaced as a warning (not a failure) since the rows are already committed.
  if (postImportError) {
    const msg = (postImportError && postImportError.message) || String(postImportError);
    spinner.warn(`Imported successfully, but post-import steps failed: ${msg}`);
  } else {
    const succeedMsg = opts.dryRun
      ? "Preview complete."
      : daysScored > 0
        ? `Import complete. ${chalk.dim(`(${daysScored} day${daysScored === 1 ? "" : "s"} scored)`)}`
        : "Import complete.";
    spinner.succeed(succeedMsg);
  }

  // --- Warnings (printed first so they can't be missed below the summary) ---
  if (result.warnings.length > 0) {
    // When warnings exceed the terminal-truncation threshold, dump all of
    // them to a timestamped log file under ~/.ray/logs so the user has a
    // way to inspect the tail. Skip the file write when everything fits
    // on-screen — no log file needed.
    let logPath: string | null = null;
    if (result.warnings.length > 10) {
      const logDir = resolve(homedir(), ".ray", "logs");
      mkdirSync(logDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
      logPath = resolve(logDir, `import-apple-warnings-${stamp}.log`);
      writeFileSync(logPath, result.warnings.join("\n") + "\n");
    }
    console.log(`\n  ${chalk.yellow("Warnings:")}`);
    for (const w of result.warnings.slice(0, 10)) console.log(dim("    " + w));
    if (result.warnings.length > 10 && logPath) {
      console.log(dim(`    ... and ${result.warnings.length - 10} more — full list at ${logPath}`));
    }
  }

  // --- Summary ---
  console.log("");
  if (opts.dryRun) {
    console.log(dim("  (dry run — no changes written)"));
  }
  const verb = opts.dryRun
    ? dim(result.accountCreated ? "would create" : "would update")
    : (result.accountCreated ? chalk.green("created") : dim("updated"));
  console.log(`  Account:       Apple Card ${verb}`);
  if (result.balance != null) {
    console.log(`  Balance:       ${rawFormatMoney(result.balance)}`);
  }
  if (result.dateRange) {
    console.log(`  Date range:    ${result.dateRange.first} → ${result.dateRange.last}`);
  }
  if (opts.replaceRange && result.replaceWindow) {
    console.log(`  Replace window: ${result.replaceWindow.first} → ${result.replaceWindow.last}`);
  }
  console.log(`  Rows parsed:   ${result.rowsParsed}`);
  const deleteLabel = opts.dryRun ? "Would delete: " : "Rows deleted: ";
  if (result.rowsDeleted > 0) console.log(`  ${deleteLabel} ${chalk.yellow(String(result.rowsDeleted))}`);
  const insertLabel = opts.dryRun ? "Would insert: " : "Rows inserted:";
  const skipLabel = opts.dryRun ? "Would skip:   " : "Rows skipped: ";
  console.log(`  ${insertLabel} ${chalk.green(String(result.rowsInserted))}`);
  if (result.rowsSkipped > 0) {
    // Without --replace-range, skips are expected on re-runs (transaction_id
    // already in DB). Under --replace-range the prior range was deleted first
    // AND occurrence indexing disambiguates same-day/same-merchant/same-amount
    // rows, so a skip here signals an unexpected insert conflict worth
    // surfacing rather than normal duplication.
    if (opts.replaceRange) {
      console.log(`  ${skipLabel} ${chalk.yellow(String(result.rowsSkipped) + " (unexpected insert conflict)")}`);
    } else {
      console.log(`  ${skipLabel} ${dim(String(result.rowsSkipped) + " (already in DB)")}`);
    }
  }

  // Under --replace-range, surface the preserved/dropped-user-edits counts so
  // a user who manually labelled transactions before re-importing can see
  // whether their edits survived. preservedCount/droppedCount are null
  // outside --replace-range (dry-run also returns null, so this block stays
  // silent there). Preserved line only prints when >0 (no line when nothing
  // to report); dropped line only prints when >0 in red to flag data loss.
  if (opts.replaceRange && result.preservedCount !== null) {
    if (result.preservedCount > 0) {
      console.log(dim(`  Edits preserved: ${result.preservedCount}`));
    }
    if (result.droppedCount !== null && result.droppedCount > 0) {
      console.log(chalk.red(`  Edits LOST:      ${result.droppedCount}`));
    }
  }

  // --- Recategorization (post-succeed, buffered for a clean heading) ---
  // Flush the buffered output — both per-rule success lines and any error
  // messages (e.g. skipped invalid-match_field rules, which bufLogger.error
  // routes into this same buffer) — under a Recategorization heading
  // whenever the buffer has any content. Gating on recatBuf.length (not on
  // recat.transactionsUpdated) prevents both the empty-heading eyesore
  // (nothing to print) and the suppressed-error regression (rules were
  // skipped but no rule actually updated rows). Dry-run never prints
  // because recat is skipped under --dry-run. Runs even if
  // applyRecategorizationRules threw — errors buffered before the throw
  // still reach the user.
  if (!opts.dryRun && recatBuf.length > 0) {
    console.log(`\n${heading("Recategorization")}`);
    for (const line of recatBuf) console.log(line);
  }

  // --- Scoring + achievements (outputs that come after the summary) ---
  if (!opts.dryRun) {
    if (netWorthSnapshot !== null) {
      console.log(dim(`  Net worth snapshot: ${rawFormatMoney(netWorthSnapshot)}`));
    }
    if (scoredRange && daysScored > 0) {
      console.log(dim(`  Scored ${daysScored} day(s), ${scoredRange.start} \u2192 ${scoredRange.end}`));
    }

    // checkAchievements is non-fatal bonus output — a failure here must not
    // crash the command after the spinner already succeeded. Swallow + log a
    // dim warning so the user still sees the import summary. Deliberately
    // outside the post-import db.transaction boundary: swallowing a throw
    // inside a transaction would either silently commit or quietly roll back
    // derivation writes, both wrong.
    try {
      const newAchievements = checkAchievements(db);
      for (const a of newAchievements) {
        console.log(`    \u{1F3C6} ${chalk.bold(a.name)} \u2014 ${a.description}`);
      }
    } catch (err: any) {
      console.log(dim(`  (achievement check failed: ${(err && err.message) || String(err)})`));
    }
  }

  console.log("");
}
