import type Database from "libsql";
import chalk from "chalk";
import {
  getNetWorth, getAccountBalances, getDebts, getBudgetStatuses,
  getGoals, compareSpending, formatMoney, categoryLabel,
} from "../queries/index.js";
import { getLatestScore } from "../scoring/index.js";
import { getUpcomingBills } from "../db/bills.js";
import { formatCurrencyAmount } from "../currency.js";

const MAX_CHARS = 6000;

export function computeInsights(db: Database.Database): string {
  // Fresh install guard
  const txCount = db.prepare(`SELECT COUNT(*) as cnt FROM transactions`).get() as { cnt: number };
  if (txCount.cnt === 0) {
    return `## Current Financial Briefing\nAccounts connected — run \`ray sync\` to pull transactions. No financial data to analyze yet.`;
  }

  const sections: { priority: number; text: string }[] = [];

  // 1. Financial Snapshot (priority 1 — always kept)
  sections.push({ priority: 1, text: buildSnapshot(db) });

  // 2. Spending Intelligence (priority 2 — always kept)
  sections.push({ priority: 2, text: buildSpending(db) });

  // 3. Goal & Savings Pace (priority 4)
  const goals = buildGoals(db);
  if (goals) sections.push({ priority: 4, text: goals });

  // 4. Upcoming & Proactive (priority 5)
  const upcoming = buildUpcoming(db);
  if (upcoming) sections.push({ priority: 5, text: upcoming });

  // 5. Anomaly Detection (priority 6 — nice to have)
  const anomalies = buildAnomalies(db);
  if (anomalies) sections.push({ priority: 6, text: anomalies });

  // 6. Behavioral Score (priority 7 — nice to have)
  const score = buildScore(db);
  if (score) sections.push({ priority: 7, text: score });

  // Token budget: drop lowest-priority sections first if over budget
  sections.sort((a, b) => a.priority - b.priority);
  let combined = "";
  const included: string[] = [];
  for (const s of sections) {
    if ((combined + s.text).length > MAX_CHARS && s.priority > 2) break;
    included.push(s.text);
    combined = included.join("\n\n");
  }

  return `## Current Financial Briefing (auto-generated)\n\n${combined}`;
}

function buildSnapshot(db: Database.Database): string {
  const nw = getNetWorth(db);
  const lines: string[] = [];

  let nwLine = `Net worth: ${formatMoney(nw.net_worth)}`;
  if (nw.prev_net_worth !== null) {
    const change = nw.net_worth - nw.prev_net_worth;
    nwLine += ` (${change >= 0 ? "+" : "-"}${formatMoney(Math.abs(change))} today)`;
  }
  lines.push(nwLine);

  // Account balances — cap at 5
  const accounts = getAccountBalances(db).slice(0, 5);
  if (accounts.length > 0) {
    lines.push(accounts.map(a =>
      `${a.name} (${a.type}): ${["credit", "loan"].includes(a.type) ? "-" : ""}${formatMoney(a.balance)}`
    ).join(" | "));
  }

  // Debt summary
  const debts = getDebts(db);
  if (debts.totalDebt > 0) {
    const rates = debts.debts.filter(d => d.rate > 0);
    let debtLine = `Total debt: ${formatMoney(debts.totalDebt)}`;
    if (rates.length > 0) {
      const weightedRate = rates.reduce((s, d) => s + d.rate * d.balance, 0) / rates.reduce((s, d) => s + d.balance, 0);
      debtLine += ` (avg ${weightedRate.toFixed(1)}% APR)`;
    }
    lines.push(debtLine);
  }

  return lines.join("\n");
}

function buildSpending(db: Database.Database): string {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const today = now.toISOString().slice(0, 10);
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - dayOfMonth;

  // This month's total spending
  const thisMonthSpend = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
     WHERE amount > 0 AND date BETWEEN ? AND ? AND pending = 0
     AND category NOT IN ('TRANSFER_OUT', 'TRANSFER_IN', 'LOAN_PAYMENTS')`
  ).get(monthStart.toISOString().slice(0, 10), today) as { total: number };

  const lines: string[] = [];
  let spendLine = `SPENDING: ${formatMoney(thisMonthSpend.total)} this month`;

  // Compare to last month (same day-of-month)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthSameDay = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(dayOfMonth, new Date(now.getFullYear(), now.getMonth(), 0).getDate()));

  // Only compare if we have >30 days of history
  const oldestTx = db.prepare(`SELECT MIN(date) as d FROM transactions`).get() as { d: string | null };
  const hasEnoughHistory = oldestTx.d && (new Date(today).getTime() - new Date(oldestTx.d).getTime()) > 30 * 24 * 60 * 60 * 1000;

  if (hasEnoughHistory) {
    const cmp = compareSpending(
      db,
      lastMonthStart.toISOString().slice(0, 10),
      lastMonthSameDay.toISOString().slice(0, 10),
      monthStart.toISOString().slice(0, 10),
      today
    );

    if (cmp.period1Total > 0) {
      const pctStr = cmp.pctChange >= 0 ? `${cmp.pctChange}% above` : `${Math.abs(cmp.pctChange)}% below`;
      spendLine += ` (${pctStr} last month`;

      // Top driver
      const topDrivers = cmp.categories.filter(c => c.diff > 0).slice(0, 3);
      if (topDrivers.length > 0 && cmp.pctChange > 0) {
        spendLine += `, driven by ${topDrivers.map(d => `${categoryLabel(d.category)} +${formatMoney(d.diff)}`).join(", ")}`;
      }
      spendLine += ")";
    }
  }
  lines.push(spendLine);

  // Budget status
  const budgets = getBudgetStatuses(db);
  const alertBudgets = budgets.filter(b => b.pct_used >= 80).slice(0, 3);
  for (const b of alertBudgets) {
    if (b.over_budget) {
      lines.push(`Budget OVER: ${categoryLabel(b.category)} — ${formatMoney(b.spent)} / ${formatMoney(b.budget)} (${formatMoney(Math.abs(b.remaining))} over)`);
    } else {
      lines.push(`Budget alert: ${categoryLabel(b.category)} at ${b.pct_used}% of limit with ${daysLeft} days remaining`);
    }
  }

  // Daily discretionary remaining
  if (daysLeft > 0) {
    const totalBudget = budgets.reduce((s, b) => s + b.budget, 0);
    if (totalBudget > 0) {
      const totalRemaining = budgets.reduce((s, b) => s + Math.max(0, b.remaining), 0);
      lines.push(`Daily discretionary budget remaining: ${formatMoney(totalRemaining / daysLeft)}/day`);
    }
  }

  return lines.join("\n");
}

function buildGoals(db: Database.Database): string | null {
  const goals = getGoals(db);
  const active = goals.filter(g => g.progress_pct < 100);
  if (active.length === 0) return null;

  const lines = active.slice(0, 3).map(g => {
    let line = `${g.name}: ${formatMoney(g.current)} / ${formatMoney(g.target)} (${g.progress_pct}%)`;
    if (g.target_date) {
      line += ` — need ${formatMoney(g.monthly_needed)}/mo`;
    }
    return line;
  });

  return `GOALS: ${lines.join(" | ")}`;
}

function buildUpcoming(db: Database.Database): string | null {
  const parts: string[] = [];

  const bills = getUpcomingBills(db, 7);
  const today = startOfUtcDay(new Date());
  if (bills.length > 0) {
    const billStrs = bills.slice(0, 5).map(b => {
      const daysUntil = Math.round((b.date.getTime() - today.getTime()) / 86400000);
      const amt = formatMoney(b.amount);
      const extra = b.note ? ` ${b.note}` : "";
      return `${b.name} (${amt}${extra}) due in ${daysUntil} days`;
    });
    parts.push(`UPCOMING: ${billStrs.join(", ")}`);
  }

  // Low balance warning
  const avgMonthlyExpenses = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) / 3.0 as avg FROM transactions
     WHERE amount > 0 AND date > date('now', '-90 days') AND pending = 0
     AND category NOT IN ('TRANSFER_OUT', 'TRANSFER_IN')`
  ).get() as { avg: number };

  const lowAccounts = db.prepare(
    `SELECT name, current_balance FROM accounts WHERE type = 'depository' AND current_balance < ?`
  ).all(avgMonthlyExpenses.avg) as { name: string; current_balance: number }[];

  for (const a of lowAccounts.slice(0, 2)) {
    parts.push(`LOW BALANCE: ${a.name} at ${formatMoney(a.current_balance)} (below 1 month of avg expenses)`);
  }

  // Credit utilization
  const creditCards = db.prepare(
    `SELECT name, current_balance, available_balance FROM accounts
     WHERE type = 'credit' AND current_balance > 0 AND available_balance IS NOT NULL`
  ).all() as { name: string; current_balance: number; available_balance: number }[];

  for (const card of creditCards) {
    const limit = card.current_balance + card.available_balance;
    if (limit > 0) {
      const utilization = card.current_balance / limit;
      if (utilization > 0.3) {
        parts.push(`CREDIT: ${card.name} at ${Math.round(utilization * 100)}% utilization (${formatMoney(card.current_balance)} / ${formatMoney(limit)} limit)`);
      }
    }
  }

  return parts.length > 0 ? parts.join("\n") : null;
}

function buildAnomalies(db: Database.Database): string | null {
  const parts: string[] = [];

  // Large transactions in last 7 days (>$200)
  const largeTx = db.prepare(
    `SELECT name, merchant_name, amount, date FROM transactions
     WHERE amount > 200 AND date > date('now', '-7 days') AND pending = 0
     AND category NOT IN ('TRANSFER_OUT', 'TRANSFER_IN', 'LOAN_PAYMENTS', 'RENT_AND_UTILITIES')
     ORDER BY amount DESC LIMIT 3`
  ).all() as { name: string; merchant_name: string | null; amount: number; date: string }[];

  for (const tx of largeTx) {
    parts.push(`Large charge: ${formatMoney(tx.amount)} at ${tx.merchant_name || tx.name} (${tx.date})`);
  }

  // Spending velocity (only after day 5)
  const now = new Date();
  const dayOfMonth = now.getDate();
  if (dayOfMonth >= 5) {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    const thisMonth = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
       WHERE amount > 0 AND date BETWEEN ? AND ? AND pending = 0
       AND category NOT IN ('TRANSFER_OUT', 'TRANSFER_IN', 'LOAN_PAYMENTS')`
    ).get(monthStart, today) as { total: number };

    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);

    const lastMonth = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
       WHERE amount > 0 AND date BETWEEN ? AND ? AND pending = 0
       AND category NOT IN ('TRANSFER_OUT', 'TRANSFER_IN', 'LOAN_PAYMENTS')`
    ).get(lastMonthStart, lastMonthEnd) as { total: number };

    if (lastMonth.total > 0) {
      const projected = (thisMonth.total / dayOfMonth) * daysInMonth;
      const velocity = projected / lastMonth.total;
      if (velocity > 1.2) {
        parts.push(`PACE ALERT: On track to spend ${formatMoney(projected)} this month (${Math.round((velocity - 1) * 100)}% above last month's ${formatMoney(lastMonth.total)})`);
      }
    }
  }

  return parts.length > 0 ? parts.join("\n") : null;
}

// ─── CLI Briefing (colored, for terminal display on launch) ─── //

export function cliBriefing(db: Database.Database): string | null {
  const txCount = db.prepare(`SELECT COUNT(*) as cnt FROM transactions`).get() as { cnt: number };
  if (txCount.cnt === 0) return null;

  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - dayOfMonth;
  const lines: string[] = [];

  // Net worth headline
  const nw = getNetWorth(db);
  const nwStr = nw.net_worth < 0 ? `-${fmtMoney(nw.net_worth)}` : fmtMoney(nw.net_worth);
  let nwLine = chalk.white(`  ${nwStr}`);
  if (nw.prev_net_worth !== null) {
    const change = nw.net_worth - nw.prev_net_worth;
    nwLine += change >= 0
      ? chalk.green(` +${fmtMoney(change)}`)
      : chalk.hex("#FF9F43")(` -${fmtMoney(Math.abs(change))}`);
  }
  lines.push(chalk.dim("  net worth") + nwLine);

  // Account balances
  const accounts = getAccountBalances(db);
  if (accounts.length > 0) {
    const acctStrs = accounts.slice(0, 5).map(a => {
      const bal = a.type === "credit" ? `-${fmtMoney(a.balance)}` : fmtMoney(a.balance);
      return `${chalk.dim(a.name.toLowerCase())} ${chalk.white(bal)}`;
    });
    lines.push("  " + acctStrs.join(chalk.dim("  ·  ")));
  }
  lines.push("");

  // Spending vs last month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const today = now.toISOString().slice(0, 10);
  const thisMonthSpend = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
     WHERE amount > 0 AND date BETWEEN ? AND ? AND pending = 0
     AND category NOT IN ('TRANSFER_OUT', 'TRANSFER_IN', 'LOAN_PAYMENTS')`
  ).get(monthStart.toISOString().slice(0, 10), today) as { total: number };

  const oldestTx = db.prepare(`SELECT MIN(date) as d FROM transactions`).get() as { d: string | null };
  const hasHistory = oldestTx.d && (new Date(today).getTime() - new Date(oldestTx.d).getTime()) > 30 * 24 * 60 * 60 * 1000;

  if (hasHistory) {
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthSameDay = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(dayOfMonth, new Date(now.getFullYear(), now.getMonth(), 0).getDate()));
    const cmp = compareSpending(
      db,
      lastMonthStart.toISOString().slice(0, 10),
      lastMonthSameDay.toISOString().slice(0, 10),
      monthStart.toISOString().slice(0, 10),
      today
    );

    if (cmp.period1Total > 0) {
      const diff = cmp.period2Total - cmp.period1Total;
      const arrow = diff <= 0 ? chalk.green(`${fmtMoney(Math.abs(diff))} less`) : chalk.hex("#FF9F43")(`${fmtMoney(diff)} more`);
      lines.push(chalk.dim("  spending") + chalk.white(`  ${fmtMoney(thisMonthSpend.total)} this month`) + chalk.dim(` · `) + arrow + chalk.dim(` than this point last month`));

      // Top movers (up to 3, show both ups and downs)
      const movers = cmp.categories
        .filter(c => Math.abs(c.diff) > 10)
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
        .slice(0, 4);
      if (movers.length > 0) {
        const moverStrs = movers.map(m => {
          const label = categoryLabel(m.category).toLowerCase();
          const color = m.diff <= 0 ? chalk.green : chalk.hex("#FF9F43");
          const sign = m.diff <= 0 ? "-" : "+";
          return `${chalk.dim(label)} ${color(`${sign}${fmtMoney(Math.abs(m.diff))}`)}`;
        });
        lines.push("  " + moverStrs.join(chalk.dim("  ·  ")));
      }
    }
  } else {
    lines.push(chalk.dim("  spending") + chalk.white(`  ${fmtMoney(thisMonthSpend.total)} this month`) + chalk.dim(` · ${daysLeft} days left`));
  }

  // Budget alerts (only if something is hot)
  const budgets = getBudgetStatuses(db);
  const hot = budgets.filter(b => b.pct_used >= 90).slice(0, 2);
  if (hot.length > 0) {
    lines.push("");
    for (const b of hot) {
      const pct = Math.round(b.pct_used);
      const color = b.over_budget ? chalk.hex("#FF9F43") : chalk.yellow;
      const bar = miniBar(b.pct_used);
      lines.push(`  ${bar}  ${color(categoryLabel(b.category).toLowerCase())} ${chalk.dim(`${pct}%`)}`);
    }
  }

  // Goals (compact)
  const goals = getGoals(db).filter(g => g.progress_pct < 100).slice(0, 2);
  if (goals.length > 0) {
    lines.push("");
    for (const g of goals) {
      const bar = miniBar(g.progress_pct);
      const pace = g.target_date
        ? chalk.dim(` · need ${fmtMoney(g.monthly_needed)}/mo`)
        : "";
      lines.push(`  ${bar}  ${chalk.white(g.name)} ${chalk.dim(`${fmtMoney(g.current)}/${fmtMoney(g.target)}`)}${pace}`);
    }
  }

  // Upcoming bills
  const bills = getUpcomingBills(db, 7);
  if (bills.length > 0) {
    lines.push("");
    const today = startOfUtcDay(new Date());
    const billStrs = bills.slice(0, 3).map(b => {
      const daysUntil = Math.round((b.date.getTime() - today.getTime()) / 86400000);
      return chalk.dim(`${b.name} ${fmtMoney(b.amount)}`) + chalk.dim(` in ${daysUntil}d`);
    });
    lines.push(`  ${chalk.dim("upcoming")}  ${billStrs.join(chalk.dim("  ·  "))}`);
  }

  // Score
  const score = getLatestScore(db);
  if (score) {
    lines.push("");
    const scoreColor = score.score >= 70 ? chalk.green : score.score >= 40 ? chalk.yellow : chalk.hex("#FF9F43");
    let scoreLine = `  ${chalk.dim("score")}     ${scoreColor(String(score.score))}${chalk.dim("/100")}`;
    const streaks: string[] = [];
    if (score.no_restaurant_streak > 0) streaks.push(`${score.no_restaurant_streak}d no dining`);
    if (score.on_pace_streak > 0) streaks.push(`${score.on_pace_streak}d on pace`);
    if (streaks.length > 0) scoreLine += chalk.dim(`  ·  ${streaks.join("  ·  ")}`);
    lines.push(scoreLine);
  }

  return lines.join("\n");
}

function fmtMoney(n: number): string {
  return formatCurrencyAmount(n, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function miniBar(pct: number): string {
  const width = 8;
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  const color = pct > 100 ? chalk.hex("#FF9F43") : pct > 80 ? chalk.yellow : chalk.green;
  return color("▓".repeat(filled)) + chalk.dim("░".repeat(empty));
}

function buildScore(db: Database.Database): string | null {
  const score = getLatestScore(db);
  if (!score) return null;

  let line = `SCORE: ${score.score}/100`;

  const streaks: string[] = [];
  if (score.no_restaurant_streak > 0) streaks.push(`${score.no_restaurant_streak}-day no-restaurant streak`);
  if (score.no_shopping_streak > 0) streaks.push(`${score.no_shopping_streak}-day no-shopping streak`);
  if (score.on_pace_streak > 0) streaks.push(`${score.on_pace_streak}-day on-pace streak`);
  if (streaks.length > 0) line += ` — ${streaks.join(", ")}`;

  // Recent achievements
  const achievements = db.prepare(
    `SELECT name FROM achievements ORDER BY unlocked_at DESC LIMIT 3`
  ).all() as { name: string }[];
  if (achievements.length > 0) {
    line += ` | Recent: ${achievements.map(a => a.name).join(", ")}`;
  }

  return line;
}

function timeAgo(past: Date, now: Date): string {
  const diffMs = now.getTime() - past.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
