import { describe, it, expect, beforeEach } from "vitest";
import Database from "libsql";
import { migrate } from "../db/schema.js";
import {
  formatMoney,
  categoryLabel,
  getNetWorth,
  getAccountBalances,
  getBudgetStatuses,
  getGoals,
  getCashFlowThisMonth,
  getTransactionsFiltered,
  searchTransactions,
  compareSpending,
  getNetWorthTrend,
  forecastBalance,
  getPortfolio,
  getInvestmentPerformance,
  getDebts,
  getCashFlow,
  getIncome,
  INCOME_EXCLUDED_CATEGORIES,
} from "./index.js";

type DB = InstanceType<typeof Database>;

function createTestDb(): DB {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

// Seed helpers
function seedInstitution(db: DB, id = "inst-1") {
  db.prepare(`INSERT OR IGNORE INTO institutions (item_id, access_token, name) VALUES (?, 'tok', ?)`).run(id, "Test Bank");
}

function seedAccount(db: DB, opts: { id: string; type: string; balance: number; subtype?: string; itemId?: string; name?: string }) {
  seedInstitution(db, opts.itemId || "inst-1");
  db.prepare(
    `INSERT OR REPLACE INTO accounts (account_id, item_id, name, type, subtype, current_balance) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(opts.id, opts.itemId || "inst-1", opts.name || opts.id, opts.type, opts.subtype || null, opts.balance);
}

function seedTransaction(db: DB, opts: { id: string; accountId: string; amount: number; date: string; name: string; category?: string; merchant?: string; pending?: number; subcategory?: string }) {
  db.prepare(
    `INSERT OR REPLACE INTO transactions (transaction_id, account_id, amount, date, name, merchant_name, category, subcategory, pending) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(opts.id, opts.accountId, opts.amount, opts.date, opts.name, opts.merchant || null, opts.category || "OTHER", opts.subcategory || null, opts.pending ?? 0);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

// ─── Pure functions ───

describe("formatMoney", () => {
  it("formats positive", () => expect(formatMoney(1234.5)).toBe("$1,234.50"));
  it("formats negative as absolute", () => expect(formatMoney(-99)).toBe("$99.00"));
  it("formats zero", () => expect(formatMoney(0)).toBe("$0.00"));
});

describe("categoryLabel", () => {
  it("maps known categories", () => {
    expect(categoryLabel("FOOD_AND_DRINK")).toBe("Food & Drink");
    expect(categoryLabel("ENTERTAINMENT")).toBe("Entertainment");
  });
  it("title-cases unknown categories", () => {
    expect(categoryLabel("CUSTOM_CAT")).toBe("Custom Cat");
  });
});

// ─── Database query functions ───

let db: DB;

beforeEach(() => {
  db = createTestDb();
});

describe("getNetWorth", () => {
  it("returns zeros with no accounts", () => {
    const nw = getNetWorth(db);
    expect(nw.net_worth).toBe(0);
    expect(nw.assets).toBe(0);
    expect(nw.liabilities).toBe(0);
  });

  it("computes assets - liabilities", () => {
    seedAccount(db, { id: "checking", type: "depository", balance: 5000 });
    seedAccount(db, { id: "invest", type: "investment", balance: 10000 });
    seedAccount(db, { id: "cc", type: "credit", balance: 2000 });

    const nw = getNetWorth(db);
    expect(nw.assets).toBe(15000);
    expect(nw.liabilities).toBe(2000);
    expect(nw.net_worth).toBe(13000);
    expect(nw.cash).toBe(5000);
    expect(nw.investments).toBe(10000);
    expect(nw.credit_debt).toBe(2000);
  });

  it("computes home equity", () => {
    seedAccount(db, { id: "home", type: "other", subtype: "property", balance: 400000 });
    seedAccount(db, { id: "mort", type: "loan", subtype: "mortgage", balance: 300000 });

    const nw = getNetWorth(db);
    expect(nw.home_value).toBe(400000);
    expect(nw.home_equity).toBe(100000);
    expect(nw.mortgage).toBe(300000);
  });

  it("returns prev_net_worth from history", () => {
    seedAccount(db, { id: "a", type: "depository", balance: 1000 });
    db.prepare(`INSERT INTO net_worth_history (date, total_assets, total_liabilities, net_worth) VALUES (?, ?, ?, ?)`)
      .run(daysAgo(2), 900, 0, 900);

    const nw = getNetWorth(db);
    expect(nw.prev_net_worth).toBe(900);
  });

  it("returns null prev_net_worth when no history", () => {
    const nw = getNetWorth(db);
    expect(nw.prev_net_worth).toBeNull();
  });
});

describe("getAccountBalances", () => {
  it("returns depository and credit accounts sorted", () => {
    seedAccount(db, { id: "a", type: "credit", balance: 500, name: "CC" });
    seedAccount(db, { id: "b", type: "depository", balance: 3000, name: "Checking" });
    seedAccount(db, { id: "c", type: "depository", balance: 1000, name: "Savings" });
    seedAccount(db, { id: "d", type: "investment", balance: 9999, name: "Brokerage" });

    const balances = getAccountBalances(db);
    // all non-hidden accounts included
    expect(balances.length).toBe(4);
    expect(balances.map((b) => b.name)).toContain("Brokerage");
  });
});

describe("getBudgetStatuses", () => {
  it("tracks spending against budget", () => {
    seedAccount(db, { id: "a", type: "depository", balance: 1000 });
    db.prepare(`INSERT INTO budgets (category, monthly_limit) VALUES (?, ?)`).run("FOOD_AND_DRINK", 500);

    // Spend $300 this month
    seedTransaction(db, { id: "t1", accountId: "a", amount: 200, date: today(), name: "Restaurant", category: "FOOD_AND_DRINK" });
    seedTransaction(db, { id: "t2", accountId: "a", amount: 100, date: today(), name: "Groceries", category: "FOOD_AND_DRINK" });

    const [budget] = getBudgetStatuses(db);
    expect(budget.category).toBe("FOOD_AND_DRINK");
    expect(budget.budget).toBe(500);
    expect(budget.spent).toBe(300);
    expect(budget.remaining).toBe(200);
    expect(budget.pct_used).toBe(60);
    expect(budget.over_budget).toBe(false);
  });

  it("flags over budget", () => {
    seedAccount(db, { id: "a", type: "depository", balance: 1000 });
    db.prepare(`INSERT INTO budgets (category, monthly_limit) VALUES (?, ?)`).run("ENTERTAINMENT", 100);
    seedTransaction(db, { id: "t1", accountId: "a", amount: 150, date: today(), name: "Concert", category: "ENTERTAINMENT" });

    const [budget] = getBudgetStatuses(db);
    expect(budget.over_budget).toBe(true);
    expect(budget.remaining).toBe(-50);
  });
});

describe("getGoals", () => {
  it("computes progress and monthly needed", () => {
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 6);
    const targetDate = futureDate.toISOString().slice(0, 10);

    db.prepare(`INSERT INTO goals (name, target_amount, current_amount, target_date) VALUES (?, ?, ?, ?)`)
      .run("Emergency Fund", 10000, 4000, targetDate);

    const [goal] = getGoals(db);
    expect(goal.name).toBe("Emergency Fund");
    expect(goal.target).toBe(10000);
    expect(goal.current).toBe(4000);
    expect(goal.remaining).toBe(6000);
    expect(goal.progress_pct).toBe(40);
    // monthly_needed depends on exact month boundary; just verify it's reasonable
    expect(goal.monthly_needed).toBeGreaterThanOrEqual(1000);
    expect(goal.monthly_needed).toBeLessThanOrEqual(1500);
  });
});

describe("getCashFlowThisMonth", () => {
  it("separates income and expenses", () => {
    seedAccount(db, { id: "a", type: "depository", balance: 5000 });

    // Income: negative amounts in Plaid convention
    seedTransaction(db, { id: "t1", accountId: "a", amount: -3000, date: today(), name: "Paycheck", category: "INCOME" });
    // Expense: positive amounts
    seedTransaction(db, { id: "t2", accountId: "a", amount: 50, date: today(), name: "Coffee", category: "FOOD_AND_DRINK" });
    seedTransaction(db, { id: "t3", accountId: "a", amount: 200, date: today(), name: "Gas", category: "TRANSPORTATION" });

    const cf = getCashFlowThisMonth(db);
    expect(cf.income).toBe(3000);
    expect(cf.expenses).toBe(250);
    expect(cf.net).toBe(2750);
  });

  it("excludes transfers", () => {
    seedAccount(db, { id: "a", type: "depository", balance: 5000 });
    seedTransaction(db, { id: "t1", accountId: "a", amount: -500, date: today(), name: "Transfer", category: "TRANSFER_IN" });
    seedTransaction(db, { id: "t2", accountId: "a", amount: 500, date: today(), name: "Transfer", category: "TRANSFER_OUT" });

    const cf = getCashFlowThisMonth(db);
    expect(cf.income).toBe(0);
    expect(cf.expenses).toBe(0);
  });
});

describe("getTransactionsFiltered", () => {
  beforeEach(() => {
    seedAccount(db, { id: "a", type: "depository", balance: 1000 });
    seedTransaction(db, { id: "t1", accountId: "a", amount: 50, date: "2025-01-15", name: "Coffee Shop", merchant: "Starbucks", category: "FOOD_AND_DRINK" });
    seedTransaction(db, { id: "t2", accountId: "a", amount: 200, date: "2025-02-10", name: "Electronics", merchant: "Best Buy", category: "GENERAL_MERCHANDISE" });
    seedTransaction(db, { id: "t3", accountId: "a", amount: 15, date: "2025-02-20", name: "Snack", merchant: "7-Eleven", category: "FOOD_AND_DRINK" });
  });

  it("filters by date range", () => {
    const txns = getTransactionsFiltered(db, { startDate: "2025-02-01", endDate: "2025-02-28" });
    expect(txns.length).toBe(2);
  });

  it("filters by category", () => {
    const txns = getTransactionsFiltered(db, { category: "FOOD_AND_DRINK" });
    expect(txns.length).toBe(2);
  });

  it("filters by merchant (LIKE match)", () => {
    const txns = getTransactionsFiltered(db, { merchant: "Star" });
    expect(txns.length).toBe(1);
    expect(txns[0].name).toBe("Coffee Shop");
  });

  it("filters by amount range", () => {
    const txns = getTransactionsFiltered(db, { minAmount: 20, maxAmount: 100 });
    expect(txns.length).toBe(1);
    expect(txns[0].amount).toBe(50);
  });

  it("respects limit", () => {
    const txns = getTransactionsFiltered(db, { limit: 1 });
    expect(txns.length).toBe(1);
  });

  it("filters by account name (partial match)", () => {
    seedAccount(db, { id: "b", type: "depository", balance: 500, name: "Free to Spend" });
    seedTransaction(db, { id: "t4", accountId: "b", amount: 100, date: "2025-02-15", name: "Target", category: "GENERAL_MERCHANDISE" });
    const txns = getTransactionsFiltered(db, { account: "Free" });
    expect(txns.length).toBe(1);
    expect(txns[0].transaction_id).toBe("t4");
  });

  it("filters by label (partial match on label or note)", () => {
    db.prepare(`UPDATE transactions SET label = 'tax-deductible' WHERE transaction_id = 't2'`).run();
    db.prepare(`UPDATE transactions SET note = 'business dinner' WHERE transaction_id = 't1'`).run();
    expect(getTransactionsFiltered(db, { label: "tax" }).length).toBe(1);
    expect(getTransactionsFiltered(db, { label: "business" }).length).toBe(1);
  });

  it("excludes pending when excludePending is true", () => {
    seedTransaction(db, { id: "tp", accountId: "a", amount: 25, date: "2025-02-25", name: "Pending", category: "OTHER", pending: 1 });
    expect(getTransactionsFiltered(db, {}).length).toBe(4); // includes pending by default
    expect(getTransactionsFiltered(db, { excludePending: true }).length).toBe(3);
  });
});

describe("searchTransactions", () => {
  beforeEach(() => {
    seedAccount(db, { id: "a", type: "depository", balance: 1000 });
    seedTransaction(db, { id: "t1", accountId: "a", amount: 50, date: "2025-01-15", name: "Uber Eats", category: "FOOD_AND_DRINK" });
    seedTransaction(db, { id: "t2", accountId: "a", amount: 30, date: "2025-01-16", name: "Uber Ride", category: "TRANSPORTATION" });
  });

  it("matches on name", () => {
    const results = searchTransactions(db, "Uber");
    expect(results.length).toBe(2);
  });

  it("matches on category", () => {
    const results = searchTransactions(db, "TRANSPORT");
    expect(results.length).toBe(1);
  });

  it("scopes search to a named account when account arg provided", () => {
    seedAccount(db, { id: "b", type: "depository", balance: 500, name: "Free to Spend" });
    seedTransaction(db, { id: "t3", accountId: "b", amount: 40, date: "2025-01-17", name: "Uber One", category: "FOOD_AND_DRINK" });
    expect(searchTransactions(db, "Uber").length).toBe(3);
    expect(searchTransactions(db, "Uber", 30, "Free").length).toBe(1);
  });
});

describe("compareSpending", () => {
  it("computes period differences by category", () => {
    seedAccount(db, { id: "a", type: "depository", balance: 5000 });
    // Period 1: Jan
    seedTransaction(db, { id: "t1", accountId: "a", amount: 200, date: "2025-01-15", name: "Food", category: "FOOD_AND_DRINK" });
    // Period 2: Feb - more food spending
    seedTransaction(db, { id: "t2", accountId: "a", amount: 350, date: "2025-02-15", name: "Food", category: "FOOD_AND_DRINK" });

    const result = compareSpending(db, "2025-01-01", "2025-01-31", "2025-02-01", "2025-02-28");
    expect(result.period1Total).toBe(200);
    expect(result.period2Total).toBe(350);
    expect(result.difference).toBe(150);
    expect(result.categories.length).toBe(1);
    expect(result.categories[0].diff).toBe(150);
  });
});

describe("getNetWorthTrend", () => {
  it("returns history in chronological order", () => {
    db.prepare(`INSERT INTO net_worth_history (date, total_assets, total_liabilities, net_worth) VALUES (?, ?, ?, ?)`)
      .run("2025-01-01", 1000, 100, 900);
    db.prepare(`INSERT INTO net_worth_history (date, total_assets, total_liabilities, net_worth) VALUES (?, ?, ?, ?)`)
      .run("2025-01-02", 1100, 100, 1000);

    const trend = getNetWorthTrend(db);
    expect(trend.length).toBe(2);
    expect(trend[0].date).toBe("2025-01-01");
    expect(trend[1].date).toBe("2025-01-02");
  });

  it("respects limit", () => {
    for (let i = 1; i <= 5; i++) {
      db.prepare(`INSERT INTO net_worth_history (date, total_assets, total_liabilities, net_worth) VALUES (?, ?, ?, ?)`)
        .run(`2025-01-0${i}`, 1000 * i, 0, 1000 * i);
    }
    expect(getNetWorthTrend(db, 3).length).toBe(3);
  });
});

describe("forecastBalance", () => {
  it("projects future balances", () => {
    seedAccount(db, { id: "a", type: "depository", balance: 10000 });

    // Seed 3 months of transactions for averaging
    for (let m = 1; m <= 3; m++) {
      const date = daysAgo(m * 30);
      seedTransaction(db, { id: `inc-${m}`, accountId: "a", amount: -5000, date, name: "Paycheck" });
      seedTransaction(db, { id: `exp-${m}`, accountId: "a", amount: 3000, date, name: "Rent" });
    }

    const forecast = forecastBalance(db);
    expect(forecast.currentBalance).toBe(10000);
    expect(forecast.projections.length).toBe(6);
    // Net positive cash flow → projections should increase
    expect(forecast.projections[5].projected).toBeGreaterThan(forecast.currentBalance);
  });
});

describe("getPortfolio", () => {
  it("returns holdings with gain/loss", () => {
    seedAccount(db, { id: "brok", type: "investment", balance: 10000 });
    db.prepare(`INSERT INTO securities (security_id, name, ticker) VALUES (?, ?, ?)`).run("sec-1", "Apple Inc", "AAPL");
    db.prepare(`INSERT INTO holdings (account_id, security_id, quantity, value, cost_basis) VALUES (?, ?, ?, ?, ?)`)
      .run("brok", "sec-1", 10, 1500, 1000);

    const portfolio = getPortfolio(db);
    expect(portfolio.totalValue).toBe(1500);
    expect(portfolio.totalCostBasis).toBe(1000);
    expect(portfolio.totalGainLoss).toBe(500);
    expect(portfolio.holdings[0].ticker).toBe("AAPL");
    expect(portfolio.holdings[0].gainLoss).toBe(500);
  });
});

describe("getDebts", () => {
  it("returns liabilities sorted by rate", () => {
    seedAccount(db, { id: "cc", type: "credit", balance: 1000 });
    db.prepare(`INSERT INTO liabilities (account_id, type, interest_rate, current_balance, minimum_payment) VALUES (?, ?, ?, ?, ?)`)
      .run("cc", "credit", 24.99, 1000, 25);

    const result = getDebts(db);
    expect(result.totalDebt).toBe(1000);
    expect(result.debts[0].rate).toBe(24.99);
  });

  it("falls back to credit accounts when no liabilities", () => {
    seedAccount(db, { id: "cc", type: "credit", balance: 500 });
    const result = getDebts(db);
    expect(result.totalDebt).toBe(500);
  });
});

describe("getCashFlow", () => {
  it("computes savings rate", () => {
    seedAccount(db, { id: "a", type: "depository", balance: 5000 });
    seedTransaction(db, { id: "t1", accountId: "a", amount: -5000, date: "2025-01-15", name: "Salary", category: "INCOME" });
    seedTransaction(db, { id: "t2", accountId: "a", amount: 2000, date: "2025-01-20", name: "Rent", category: "RENT_AND_UTILITIES" });

    const cf = getCashFlow(db, "2025-01-01", "2025-01-31");
    expect(cf.income).toBe(5000);
    expect(cf.expenses).toBe(2000);
    expect(cf.net).toBe(3000);
    expect(cf.savingsRate).toBe(60);
    expect(cf.monthly.length).toBe(1);
  });
});

describe("getIncome", () => {
  it("groups income by source", () => {
    seedAccount(db, { id: "a", type: "depository", balance: 5000 });
    seedTransaction(db, { id: "t1", accountId: "a", amount: -3000, date: "2025-01-10", name: "Payroll", merchant: "Acme Corp", category: "INCOME" });
    seedTransaction(db, { id: "t2", accountId: "a", amount: -500, date: "2025-01-15", name: "Freelance", merchant: "Client LLC", category: "INCOME" });

    const income = getIncome(db, "2025-01-01", "2025-01-31");
    expect(income.length).toBe(2);
    expect(income[0].total).toBe(3000); // sorted desc
    expect(income[0].source).toBe("Acme Corp");
  });

  it("excludes negative LOAN_PAYMENTS (CC payment)", () => {
    seedAccount(db, { id: "a", type: "depository", balance: 5000 });
    seedTransaction(db, { id: "t1", accountId: "a", amount: -3000, date: "2025-01-10", name: "Payroll", merchant: "Acme Corp", category: "INCOME" });
    seedTransaction(db, { id: "t2", accountId: "a", amount: -1500, date: "2025-01-12", name: "Chase CC Payment", category: "LOAN_PAYMENTS" });

    const income = getIncome(db, "2025-01-01", "2025-01-31");
    expect(income.length).toBe(1);
    expect(income[0].total).toBe(3000);
  });

  it("excludes negative LOAN_PAYMENTS_CAR_PAYMENT", () => {
    seedAccount(db, { id: "a", type: "depository", balance: 5000 });
    seedTransaction(db, { id: "t1", accountId: "a", amount: -3000, date: "2025-01-10", name: "Payroll", merchant: "Acme Corp", category: "INCOME" });
    seedTransaction(db, { id: "t2", accountId: "a", amount: -400, date: "2025-01-15", name: "Car Payment", category: "LOAN_PAYMENTS_CAR_PAYMENT" });

    const income = getIncome(db, "2025-01-01", "2025-01-31");
    expect(income.length).toBe(1);
    expect(income[0].total).toBe(3000);
  });
});

// ─── LOAN_PAYMENTS income exclusion regressions ───

describe("getCashFlow excludes LOAN_PAYMENTS from income", () => {
  it("net and savingsRate exclude CC payment", () => {
    seedAccount(db, { id: "a", type: "depository", balance: 5000 });
    seedTransaction(db, { id: "t1", accountId: "a", amount: -5000, date: "2025-01-15", name: "Salary", category: "INCOME" });
    seedTransaction(db, { id: "t2", accountId: "a", amount: -1500, date: "2025-01-16", name: "CC Payment", category: "LOAN_PAYMENTS" });
    seedTransaction(db, { id: "t3", accountId: "a", amount: 2000, date: "2025-01-20", name: "Rent", category: "RENT_AND_UTILITIES" });

    const cf = getCashFlow(db, "2025-01-01", "2025-01-31");
    expect(cf.income).toBe(5000); // not 6500
    expect(cf.expenses).toBe(2000);
    expect(cf.net).toBe(3000);
    expect(cf.savingsRate).toBe(60);
  });
});

describe("getCashFlowThisMonth excludes LOAN_PAYMENTS from income", () => {
  it("does not count CC payment as income", () => {
    seedAccount(db, { id: "a", type: "depository", balance: 5000 });
    seedTransaction(db, { id: "t1", accountId: "a", amount: -3000, date: today(), name: "Paycheck", category: "INCOME" });
    seedTransaction(db, { id: "t2", accountId: "a", amount: -1200, date: today(), name: "CC Payment", category: "LOAN_PAYMENTS" });

    const cf = getCashFlowThisMonth(db);
    expect(cf.income).toBe(3000); // not 4200
  });
});

describe("forecastBalance excludes LOAN_PAYMENTS from inflow", () => {
  it("avgMonthlyInflow excludes LOAN_PAYMENTS and TRANSFER_IN", () => {
    seedAccount(db, { id: "a", type: "depository", balance: 10000 });

    for (let m = 1; m <= 3; m++) {
      const date = daysAgo(m * 30);
      seedTransaction(db, { id: `inc-${m}`, accountId: "a", amount: -5000, date, name: "Paycheck", category: "INCOME" });
      seedTransaction(db, { id: `lp-${m}`, accountId: "a", amount: -1000, date, name: "CC Payment", category: "LOAN_PAYMENTS" });
      seedTransaction(db, { id: `xfr-${m}`, accountId: "a", amount: -500, date, name: "Transfer", category: "TRANSFER_IN" });
      seedTransaction(db, { id: `exp-${m}`, accountId: "a", amount: 3000, date, name: "Rent" });
    }

    const forecast = forecastBalance(db);
    // avgMonthlyInflow should be ~5000, not 6500 (with LOAN_PAYMENTS) or 7000 (with both)
    expect(forecast.avgMonthlyInflow).toBeCloseTo(5000, -2);
  });
});
