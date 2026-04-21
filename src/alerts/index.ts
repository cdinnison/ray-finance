import type BetterSqlite3 from "libsql";
import { sanitizeForPrompt } from "../ai/insights.js";
type Database = BetterSqlite3.Database;

export interface Alert {
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  data?: any;
}

/** Generate alerts based on current financial data */
export function generateAlerts(db: Database): Alert[] {
  const alerts: Alert[] = [];

  // Large transactions (>$500) in last 24h
  const large = db
    .prepare(
      `SELECT t.name, t.merchant_name, t.amount, t.date, a.name as account_name
       FROM transactions t JOIN accounts a ON t.account_id = a.account_id
       WHERE t.date >= date('now', '-1 day') AND t.amount > 500 AND t.pending = 0`
    )
    .all() as any[];

  for (const tx of large) {
    // Alerts flow into the LLM via get_alerts — merchant/name/account_name
    // are all user-controllable (CSV import merchant fields, institution-
    // supplied names). Sanitize before interpolating.
    alerts.push({
      type: "large_transaction",
      severity: "warning",
      message: `Large charge: $${tx.amount} at ${sanitizeForPrompt(tx.merchant_name || tx.name)} (${sanitizeForPrompt(tx.account_name)})`,
      data: tx,
    });
  }

  // Low balances (<$1000) on checking/savings
  const lowBal = db
    .prepare(
      `SELECT name, current_balance, type FROM accounts
       WHERE type = 'depository' AND current_balance < 1000`
    )
    .all() as any[];

  for (const acct of lowBal) {
    alerts.push({
      type: "low_balance",
      severity: acct.current_balance < 500 ? "critical" : "warning",
      message: `Low balance: ${sanitizeForPrompt(acct.name)} has $${acct.current_balance.toFixed(2)}`,
      data: acct,
    });
  }

  // Budget overruns (this month)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const budgets = db
    .prepare(`SELECT category, monthly_limit FROM budgets`)
    .all() as { category: string; monthly_limit: number }[];

  for (const b of budgets) {
    const spent = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
         WHERE category = ? AND date BETWEEN ? AND ? AND amount > 0 AND pending = 0`
      )
      .get(b.category, monthStart, today) as { total: number };

    if (spent.total > b.monthly_limit) {
      alerts.push({
        type: "budget_overrun",
        severity: "warning",
        message: `Over budget: ${b.category} — spent $${spent.total.toFixed(2)} of $${b.monthly_limit} limit`,
        data: { category: b.category, spent: spent.total, limit: b.monthly_limit },
      });
    } else if (spent.total > b.monthly_limit * 0.9) {
      alerts.push({
        type: "budget_warning",
        severity: "info",
        message: `Nearing budget: ${b.category} — $${spent.total.toFixed(2)} of $${b.monthly_limit} (${Math.round((spent.total / b.monthly_limit) * 100)}%)`,
        data: { category: b.category, spent: spent.total, limit: b.monthly_limit },
      });
    }
  }

  // Subscription price changes — uses Plaid's recurring transaction streams
  const recurring = db
    .prepare(
      `SELECT merchant_name, description, avg_amount, last_amount, frequency, status
       FROM recurring
       WHERE is_active = 1 AND stream_type = 'outflow' AND status = 'MATURE'
         AND last_amount IS NOT NULL AND avg_amount IS NOT NULL`
    )
    .all() as { merchant_name: string | null; description: string; avg_amount: number; last_amount: number; frequency: string; status: string }[];

  for (const r of recurring) {
    if (r.avg_amount === 0) continue;
    const diff = Math.abs(r.last_amount - r.avg_amount);
    if (diff > 0.5 && diff / Math.abs(r.avg_amount) > 0.05) {
      const rawName = r.merchant_name || r.description;
      const name = sanitizeForPrompt(rawName);
      alerts.push({
        type: "price_change",
        severity: "info",
        message: `Price change: ${name} went from $${Math.abs(r.avg_amount).toFixed(2)} to $${Math.abs(r.last_amount).toFixed(2)} (${r.frequency.toLowerCase()})`,
        data: { merchant: rawName, previous: r.avg_amount, current: r.last_amount, frequency: r.frequency },
      });
    }
  }

  return alerts;
}
