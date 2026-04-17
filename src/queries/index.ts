import type BetterSqlite3 from "libsql";
type Database = BetterSqlite3.Database;
import { formatCurrencyAmount } from "../currency.js";

/** Categories excluded from income/inflow calculations (negative amounts that aren't real income). */
export const INCOME_EXCLUDED_CATEGORIES = [
  'TRANSFER_IN',
  'LOAN_PAYMENTS',
  'LOAN_PAYMENTS_CAR_PAYMENT',
  'LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT',
] as const;

const INCOME_EXCLUDED_SQL = INCOME_EXCLUDED_CATEGORIES.map(c => `'${c}'`).join(', ');

export interface BudgetStatus {
  category: string;
  budget: number;
  spent: number;
  remaining: number;
  pct_used: number;
  over_budget: boolean;
}

export interface GoalStatus {
  name: string;
  target: number;
  current: number;
  remaining: number;
  progress_pct: number;
  target_date: string | null;
  monthly_needed: number;
}

export interface TransactionFilters {
  startDate?: string;
  endDate?: string;
  category?: string;
  merchant?: string;
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
}

export function getNetWorth(db: Database): {
  net_worth: number;
  assets: number;
  liabilities: number;
  home_value: number;
  home_equity: number;
  investments: number;
  cash: number;
  credit_debt: number;
  mortgage: number;
  prev_net_worth: number | null;
} {
  const home = db
    .prepare(`SELECT COALESCE(SUM(current_balance), 0) as value FROM accounts WHERE type = 'other' AND subtype = 'property'`)
    .get() as { value: number };
  const mortgage = db
    .prepare(`SELECT COALESCE(SUM(current_balance), 0) as value FROM accounts WHERE type = 'loan' AND subtype = 'mortgage'`)
    .get() as { value: number };
  const investments = db
    .prepare(`SELECT COALESCE(SUM(current_balance), 0) as total FROM accounts WHERE type = 'investment'`)
    .get() as { total: number };
  const cash = db
    .prepare(`SELECT COALESCE(SUM(current_balance), 0) as total FROM accounts WHERE type = 'depository'`)
    .get() as { total: number };
  const credit = db
    .prepare(`SELECT COALESCE(SUM(current_balance), 0) as total FROM accounts WHERE type = 'credit'`)
    .get() as { total: number };
  const assets = db
    .prepare(`SELECT COALESCE(SUM(current_balance), 0) as total FROM accounts WHERE type IN ('depository', 'investment', 'other')`)
    .get() as { total: number };
  const liabilities = db
    .prepare(`SELECT COALESCE(SUM(current_balance), 0) as total FROM accounts WHERE type IN ('credit', 'loan')`)
    .get() as { total: number };

  // Previous day's net worth
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const prev = db
    .prepare(`SELECT net_worth FROM net_worth_history WHERE date <= ? ORDER BY date DESC LIMIT 1`)
    .get(yesterday) as { net_worth: number } | undefined;

  const homeVal = home.value;
  const mortgageVal = mortgage.value;

  return {
    net_worth: assets.total - liabilities.total,
    assets: assets.total,
    liabilities: liabilities.total,
    home_value: homeVal,
    home_equity: homeVal - mortgageVal,
    investments: investments.total,
    cash: cash.total,
    credit_debt: credit.total,
    mortgage: mortgageVal,
    prev_net_worth: prev?.net_worth ?? null,
  };
}

export function getAccountBalances(db: Database): { name: string; balance: number; type: string }[] {
  return db
    .prepare(
      `SELECT name, current_balance as balance, type FROM accounts
       WHERE hidden = 0 ORDER BY type, current_balance DESC`
    )
    .all() as any[];
}

export function getBudgetStatuses(db: Database): BudgetStatus[] {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const budgets = db
    .prepare(`SELECT category, monthly_limit FROM budgets`)
    .all() as { category: string; monthly_limit: number }[];

  return budgets.map((b) => {
    const spent = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
         WHERE category = ? AND date BETWEEN ? AND ? AND amount > 0 AND pending = 0`
      )
      .get(b.category, monthStart, today) as { total: number };

    const remaining = b.monthly_limit - spent.total;
    return {
      category: b.category,
      budget: b.monthly_limit,
      spent: Math.round(spent.total * 100) / 100,
      remaining: Math.round(remaining * 100) / 100,
      pct_used: Math.round((spent.total / b.monthly_limit) * 100),
      over_budget: spent.total > b.monthly_limit,
    };
  });
}

export function getGoals(db: Database): GoalStatus[] {
  const goals = db.prepare(`SELECT * FROM goals`).all() as any[];
  const now = new Date();

  return goals.map((g) => {
    const remaining = g.target_amount - g.current_amount;
    const progress = Math.round((g.current_amount / g.target_amount) * 1000) / 10;
    let monthsLeft = 1;
    if (g.target_date) {
      const target = new Date(g.target_date);
      monthsLeft = Math.max(
        1,
        (target.getFullYear() - now.getFullYear()) * 12 +
          (target.getMonth() - now.getMonth())
      );
    }
    return {
      name: g.name,
      target: g.target_amount,
      current: g.current_amount,
      remaining,
      progress_pct: progress,
      target_date: g.target_date,
      monthly_needed: Math.round((remaining / monthsLeft) * 100) / 100,
    };
  });
}

export function getCashFlowThisMonth(db: Database): { income: number; expenses: number; net: number } {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const income = db
    .prepare(
      `SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM transactions
       WHERE amount < 0 AND date BETWEEN ? AND ? AND pending = 0
       AND category NOT IN (${INCOME_EXCLUDED_SQL})`
    )
    .get(monthStart, today) as { total: number };

  const expenses = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
       WHERE amount > 0 AND date BETWEEN ? AND ? AND pending = 0
       AND category NOT IN ('TRANSFER_OUT')`
    )
    .get(monthStart, today) as { total: number };

  return {
    income: Math.round(income.total * 100) / 100,
    expenses: Math.round(expenses.total * 100) / 100,
    net: Math.round((income.total - expenses.total) * 100) / 100,
  };
}

export function getRecentSpending(db: Database): { category: string; total: number }[] {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  return db
    .prepare(
      `SELECT category, SUM(amount) as total FROM transactions
       WHERE amount > 0 AND date IN (?, ?)
       AND category NOT IN ('TRANSFER_OUT', 'TRANSFER_IN', 'LOAN_PAYMENTS', 'LOAN_PAYMENTS_CAR_PAYMENT', 'LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT')
       GROUP BY category ORDER BY total DESC`
    )
    .all(yesterday, today) as any[];
}

export function getRecentTransactions(
  db: Database,
  limit: number = 10
): { name: string; amount: number; category: string; date: string; pending: number }[] {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  return db
    .prepare(
      `SELECT name, amount, category, date, pending FROM transactions
       WHERE amount > 0 AND date IN (?, ?)
       AND category NOT IN ('TRANSFER_OUT', 'TRANSFER_IN', 'LOAN_PAYMENTS', 'LOAN_PAYMENTS_CAR_PAYMENT', 'LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT', 'RENT_AND_UTILITIES_RENT')
       ORDER BY amount DESC LIMIT ?`
    )
    .all(yesterday, today, limit) as any[];
}

export function getTransactionsFiltered(
  db: Database,
  filters: TransactionFilters
): { transaction_id: string; name: string; merchant_name: string | null; amount: number; category: string; date: string; pending: number }[] {
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.startDate) {
    conditions.push(`date >= ?`);
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push(`date <= ?`);
    params.push(filters.endDate);
  }
  if (filters.category) {
    conditions.push(`(category = ? OR subcategory = ?)`);
    params.push(filters.category, filters.category);
  }
  if (filters.merchant) {
    conditions.push(`(merchant_name LIKE ? OR name LIKE ?)`);
    params.push(`%${filters.merchant}%`, `%${filters.merchant}%`);
  }
  if (filters.minAmount !== undefined) {
    conditions.push(`amount >= ?`);
    params.push(filters.minAmount);
  }
  if (filters.maxAmount !== undefined) {
    conditions.push(`amount <= ?`);
    params.push(filters.maxAmount);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit || 50;

  return db
    .prepare(
      `SELECT transaction_id, name, merchant_name, amount, category, date, pending
       FROM transactions ${where}
       ORDER BY date DESC, amount DESC LIMIT ?`
    )
    .all(...params, limit) as any[];
}

// --- Income ---

export function getIncome(db: Database, startDate: string, endDate: string): { source: string; total: number; count: number }[] {
  return db.prepare(
    `SELECT COALESCE(merchant_name, name) as source, SUM(ABS(amount)) as total, COUNT(*) as count
     FROM transactions
     WHERE amount < 0 AND date BETWEEN ? AND ? AND pending = 0
     AND category NOT IN (${INCOME_EXCLUDED_SQL})
     GROUP BY source ORDER BY total DESC`
  ).all(startDate, endDate) as any[];
}

// --- Full-text search ---

export function searchTransactions(db: Database, query: string, limit = 30): { transaction_id: string; name: string; merchant_name: string | null; amount: number; category: string; date: string }[] {
  return db.prepare(
    `SELECT transaction_id, name, merchant_name, amount, category, date
     FROM transactions
     WHERE (name LIKE ? OR merchant_name LIKE ? OR category LIKE ?)
     ORDER BY date DESC LIMIT ?`
  ).all(`%${query}%`, `%${query}%`, `%${query}%`, limit) as any[];
}

// --- Cash flow analysis ---

export function getCashFlow(db: Database, startDate: string, endDate: string): {
  income: number; expenses: number; net: number; savingsRate: number;
  monthly: { month: string; income: number; expenses: number; net: number }[];
} {
  const income = db.prepare(
    `SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM transactions
     WHERE amount < 0 AND date BETWEEN ? AND ? AND pending = 0
     AND category NOT IN (${INCOME_EXCLUDED_SQL})`
  ).get(startDate, endDate) as { total: number };

  const expenses = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
     WHERE amount > 0 AND date BETWEEN ? AND ? AND pending = 0
     AND category NOT IN ('TRANSFER_OUT')`
  ).get(startDate, endDate) as { total: number };

  const net = income.total - expenses.total;
  const savingsRate = income.total > 0 ? (net / income.total) * 100 : 0;

  // Monthly breakdown
  const rows = db.prepare(
    `SELECT strftime('%Y-%m', date) as month,
       SUM(CASE WHEN amount < 0 AND category NOT IN (${INCOME_EXCLUDED_SQL}) THEN ABS(amount) ELSE 0 END) as income,
       SUM(CASE WHEN amount > 0 AND category NOT IN ('TRANSFER_OUT') THEN amount ELSE 0 END) as expenses
     FROM transactions
     WHERE date BETWEEN ? AND ? AND pending = 0
     GROUP BY month ORDER BY month`
  ).all(startDate, endDate) as { month: string; income: number; expenses: number }[];

  return {
    income: Math.round(income.total * 100) / 100,
    expenses: Math.round(expenses.total * 100) / 100,
    net: Math.round(net * 100) / 100,
    savingsRate: Math.round(savingsRate * 10) / 10,
    monthly: rows.map(r => ({ ...r, net: Math.round((r.income - r.expenses) * 100) / 100 })),
  };
}

// --- Balance forecast ---

export function forecastBalance(db: Database, accountId?: string, months = 6): {
  currentBalance: number; projections: { month: string; projected: number }[];
  avgMonthlyInflow: number; avgMonthlyOutflow: number;
} {
  // Get current balance
  let balanceQuery = `SELECT COALESCE(SUM(current_balance), 0) as total FROM accounts WHERE type = 'depository'`;
  const balanceParams: any[] = [];
  if (accountId) {
    balanceQuery = `SELECT current_balance as total FROM accounts WHERE account_id = ?`;
    balanceParams.push(accountId);
  }
  const bal = db.prepare(balanceQuery).get(...balanceParams) as { total: number };

  // Calculate 3-month average flows
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const startDate = threeMonthsAgo.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  let flowCondition = "";
  const flowParams: any[] = [startDate, today];
  if (accountId) {
    flowCondition = " AND account_id = ?";
    flowParams.push(accountId);
  }

  const inflow = db.prepare(
    `SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM transactions
     WHERE amount < 0 AND date BETWEEN ? AND ? AND pending = 0
     AND category NOT IN (${INCOME_EXCLUDED_SQL})${flowCondition}`
  ).get(...flowParams) as { total: number };

  const outflow = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
     WHERE amount > 0 AND date BETWEEN ? AND ? AND pending = 0${flowCondition}`
  ).get(...flowParams) as { total: number };

  const avgInflow = inflow.total / 3;
  const avgOutflow = outflow.total / 3;
  const monthlyNet = avgInflow - avgOutflow;

  const projections: { month: string; projected: number }[] = [];
  let running = bal.total;
  for (let i = 1; i <= months; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    running += monthlyNet;
    projections.push({
      month: d.toISOString().slice(0, 7),
      projected: Math.round(running * 100) / 100,
    });
  }

  return {
    currentBalance: bal.total,
    projections,
    avgMonthlyInflow: Math.round(avgInflow * 100) / 100,
    avgMonthlyOutflow: Math.round(avgOutflow * 100) / 100,
  };
}

// --- Portfolio ---

export function getPortfolio(db: Database): {
  totalValue: number; totalCostBasis: number; totalGainLoss: number;
  holdings: { account: string; security: string; ticker: string; quantity: number; value: number; costBasis: number; gainLoss: number }[];
} {
  const rows = db.prepare(
    `SELECT a.name as account, s.name as security, s.ticker,
       h.quantity, h.value, h.cost_basis,
       (h.value - COALESCE(h.cost_basis, h.value)) as gain_loss
     FROM holdings h
     JOIN accounts a ON h.account_id = a.account_id
     LEFT JOIN securities s ON h.security_id = s.security_id
     ORDER BY h.value DESC`
  ).all() as any[];

  const totalValue = rows.reduce((s: number, r: any) => s + (r.value || 0), 0);
  const totalCostBasis = rows.reduce((s: number, r: any) => s + (r.cost_basis || 0), 0);

  return {
    totalValue: Math.round(totalValue * 100) / 100,
    totalCostBasis: Math.round(totalCostBasis * 100) / 100,
    totalGainLoss: Math.round((totalValue - totalCostBasis) * 100) / 100,
    holdings: rows.map((r: any) => ({
      account: r.account,
      security: r.security || "Unknown",
      ticker: r.ticker || "",
      quantity: r.quantity,
      value: r.value || 0,
      costBasis: r.cost_basis || 0,
      gainLoss: r.gain_loss || 0,
    })),
  };
}

// --- Investment performance ---

export function getInvestmentPerformance(db: Database): {
  totalReturn: number; totalReturnPct: number;
  holdings: { security: string; ticker: string; value: number; costBasis: number; returnPct: number }[];
} {
  const rows = db.prepare(
    `SELECT s.name as security, s.ticker,
       h.value, h.cost_basis
     FROM holdings h
     LEFT JOIN securities s ON h.security_id = s.security_id
     WHERE h.value IS NOT NULL
     ORDER BY h.value DESC`
  ).all() as any[];

  const totalValue = rows.reduce((s: number, r: any) => s + (r.value || 0), 0);
  const totalCost = rows.reduce((s: number, r: any) => s + (r.cost_basis || r.value || 0), 0);
  const totalReturn = totalValue - totalCost;
  const totalReturnPct = totalCost > 0 ? (totalReturn / totalCost) * 100 : 0;

  return {
    totalReturn: Math.round(totalReturn * 100) / 100,
    totalReturnPct: Math.round(totalReturnPct * 10) / 10,
    holdings: rows.map((r: any) => {
      const cost = r.cost_basis || r.value || 0;
      const ret = (r.value || 0) - cost;
      return {
        security: r.security || "Unknown",
        ticker: r.ticker || "",
        value: r.value || 0,
        costBasis: cost,
        returnPct: cost > 0 ? Math.round((ret / cost) * 1000) / 10 : 0,
      };
    }),
  };
}

// --- Debts ---

export function getDebts(db: Database): {
  totalDebt: number;
  debts: { name: string; balance: number; rate: number; minPayment: number; type: string; nextDue: string | null }[];
} {
  // Try liabilities table first
  const liabilities = db.prepare(
    `SELECT a.name, l.current_balance as balance, l.interest_rate as rate,
       l.minimum_payment as min_payment, l.type, l.next_payment_due as next_due
     FROM liabilities l
     JOIN accounts a ON l.account_id = a.account_id
     WHERE l.current_balance > 0
     ORDER BY l.interest_rate DESC`
  ).all() as any[];

  if (liabilities.length > 0) {
    const totalDebt = liabilities.reduce((s: number, r: any) => s + (r.balance || 0), 0);
    return {
      totalDebt,
      debts: liabilities.map((r: any) => ({
        name: r.name,
        balance: r.balance || 0,
        rate: r.rate || 0,
        minPayment: r.min_payment || 0,
        type: r.type || "unknown",
        nextDue: r.next_due || null,
      })),
    };
  }

  // Fallback: credit accounts
  const credits = db.prepare(
    `SELECT name, current_balance as balance, type FROM accounts
     WHERE type IN ('credit', 'loan') AND current_balance > 0
     ORDER BY current_balance DESC`
  ).all() as any[];

  const totalDebt = credits.reduce((s: number, r: any) => s + (r.balance || 0), 0);
  return {
    totalDebt,
    debts: credits.map((r: any) => ({
      name: r.name,
      balance: r.balance || 0,
      rate: 0,
      minPayment: 0,
      type: r.type,
      nextDue: null,
    })),
  };
}

// --- Spending comparison ---

export function compareSpending(db: Database, period1Start: string, period1End: string, period2Start: string, period2End: string): {
  period1Total: number; period2Total: number; difference: number; pctChange: number;
  categories: { category: string; period1: number; period2: number; diff: number }[];
} {
  const getByCategory = (start: string, end: string) => {
    return db.prepare(
      `SELECT category, SUM(amount) as total FROM transactions
       WHERE amount > 0 AND date BETWEEN ? AND ? AND pending = 0
       AND category NOT IN ('TRANSFER_OUT', 'TRANSFER_IN', 'LOAN_PAYMENTS')
       GROUP BY category`
    ).all(start, end) as { category: string; total: number }[];
  };

  const p1 = getByCategory(period1Start, period1End);
  const p2 = getByCategory(period2Start, period2End);

  const p1Map = new Map(p1.map(r => [r.category, r.total]));
  const p2Map = new Map(p2.map(r => [r.category, r.total]));
  const allCats = new Set([...p1Map.keys(), ...p2Map.keys()]);

  const categories = [...allCats].map(cat => ({
    category: cat,
    period1: Math.round((p1Map.get(cat) || 0) * 100) / 100,
    period2: Math.round((p2Map.get(cat) || 0) * 100) / 100,
    diff: Math.round(((p2Map.get(cat) || 0) - (p1Map.get(cat) || 0)) * 100) / 100,
  })).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const period1Total = p1.reduce((s, r) => s + r.total, 0);
  const period2Total = p2.reduce((s, r) => s + r.total, 0);
  const difference = period2Total - period1Total;

  return {
    period1Total: Math.round(period1Total * 100) / 100,
    period2Total: Math.round(period2Total * 100) / 100,
    difference: Math.round(difference * 100) / 100,
    pctChange: period1Total > 0 ? Math.round((difference / period1Total) * 1000) / 10 : 0,
    categories,
  };
}

// --- Net worth trend ---

export function getNetWorthTrend(db: Database, limit = 30): { date: string; net_worth: number; assets: number; liabilities: number }[] {
  return db.prepare(
    `SELECT date, net_worth, total_assets as assets, total_liabilities as liabilities
     FROM net_worth_history ORDER BY date DESC LIMIT ?`
  ).all(limit).reverse() as any[];
}

export function formatMoney(n: number): string {
  return formatCurrencyAmount(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    FOOD_AND_DRINK: "Food & Drink",
    GENERAL_MERCHANDISE: "Shopping",
    PERSONAL_CARE: "Personal Care",
    ENTERTAINMENT: "Entertainment",
    TRANSPORTATION: "Transportation",
    GENERAL_SERVICES: "Services",
    RENT_AND_UTILITIES: "Rent & Utilities",
    LOAN_PAYMENTS: "Loan Payments",
    GOVERNMENT_AND_NON_PROFIT: "Gov/Nonprofit",
    MEDICAL: "Medical",
    BANK_FEES: "Bank Fees",
    EDUCATION: "Education",
    INSURANCE: "Insurance",
    BUSINESS: "Business",
    INCOME: "Income",
    TRANSFER_IN: "Transfer In",
    TRANSFER_OUT: "Transfer Out",
    HOME_IMPROVEMENT: "Home Improvement",
    TRAVEL: "Travel",
    OTHER: "Other",
  };
  return labels[cat] || cat.split("_").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
}
