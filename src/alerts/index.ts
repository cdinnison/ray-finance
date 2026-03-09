import type BetterSqlite3 from "libsql";
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
    alerts.push({
      type: "large_transaction",
      severity: "warning",
      message: `Large charge: $${tx.amount} at ${tx.merchant_name || tx.name} (${tx.account_name})`,
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
      message: `Low balance: ${acct.name} has $${acct.current_balance.toFixed(2)}`,
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

  // Subscription price changes (compare last 2 occurrences of recurring merchants)
  const recurring = db
    .prepare(
      `SELECT merchant_name, amount, date FROM transactions
       WHERE merchant_name IN (
         SELECT merchant_name FROM transactions
         WHERE merchant_name IS NOT NULL AND amount > 0
         GROUP BY merchant_name HAVING COUNT(*) >= 2
       )
       AND amount > 0 AND pending = 0
       ORDER BY merchant_name, date DESC`
    )
    .all() as { merchant_name: string; amount: number; date: string }[];

  const byMerchant: Record<string, { amount: number; date: string }[]> = {};
  for (const r of recurring) {
    if (!byMerchant[r.merchant_name]) byMerchant[r.merchant_name] = [];
    if (byMerchant[r.merchant_name].length < 2) {
      byMerchant[r.merchant_name].push({ amount: r.amount, date: r.date });
    }
  }

  for (const [merchant, charges] of Object.entries(byMerchant)) {
    if (charges.length === 2) {
      const diff = Math.abs(charges[0].amount - charges[1].amount);
      if (diff > 0.5 && diff / charges[1].amount > 0.05) {
        alerts.push({
          type: "price_change",
          severity: "info",
          message: `Price change: ${merchant} went from $${charges[1].amount} to $${charges[0].amount}`,
          data: { merchant, previous: charges[1].amount, current: charges[0].amount },
        });
      }
    }
  }

  return alerts;
}
