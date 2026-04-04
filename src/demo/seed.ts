import Database from "libsql";
import { resolve, dirname } from "path";
import { mkdirSync, existsSync, unlinkSync } from "fs";
import { migrate } from "../db/schema.js";
import {
  institutions, accounts, transactions, securities, holdings,
  liabilities, recurring, budgets, goals, dailyScores, achievements,
  netWorthHistory, investmentTransactions, recurringBills, memories,
} from "./data.js";

export function seedDemoDb(dbPath: string, encryptionKey?: string): void {
  const resolved = resolve(dbPath);
  const dir = dirname(resolved);
  mkdirSync(dir, { recursive: true });

  // Remove existing demo DB for a clean slate
  for (const suffix of ["", "-wal", "-shm"]) {
    const f = resolved + suffix;
    if (existsSync(f)) unlinkSync(f);
  }

  const opts: Record<string, string> = {};
  if (encryptionKey) {
    opts.encryptionCipher = "aes256cbc";
    opts.encryptionKey = encryptionKey;
  }

  const db = new Database(dbPath, opts);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);

  const seed = db.transaction(() => {

    // Institutions
    const instStmt = db.prepare(
      `INSERT INTO institutions (item_id, access_token, name, products, logo, primary_color) VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const i of institutions) {
      instStmt.run(i.item_id, i.access_token, i.name, i.products, i.logo, i.primary_color);
    }

    // Accounts
    const acctStmt = db.prepare(
      `INSERT INTO accounts (account_id, item_id, name, official_name, type, subtype, mask, current_balance, available_balance, currency, balance_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const a of accounts) {
      acctStmt.run(a.account_id, a.item_id, a.name, a.official_name, a.type, a.subtype, a.mask, a.current_balance, a.available_balance, a.currency, a.balance_limit);
    }

    // Transactions
    const txStmt = db.prepare(
      `INSERT INTO transactions (transaction_id, account_id, amount, date, name, merchant_name, category, subcategory, pending, payment_channel) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const t of transactions) {
      txStmt.run(t.transaction_id, t.account_id, t.amount, t.date, t.name, t.merchant_name, t.category, t.subcategory, t.pending, t.payment_channel);
    }

    // Securities
    const secStmt = db.prepare(
      `INSERT INTO securities (security_id, name, ticker, type, close_price, close_price_as_of) VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const s of securities) {
      secStmt.run(s.security_id, s.name, s.ticker, s.type, s.close_price, s.close_price_as_of);
    }

    // Holdings
    const holdStmt = db.prepare(
      `INSERT INTO holdings (account_id, security_id, quantity, value, cost_basis, price, price_as_of, vested_value, vested_quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const h of holdings) {
      holdStmt.run(h.account_id, h.security_id, h.quantity, h.value, h.cost_basis, h.price, h.price_as_of, h.vested_value, h.vested_quantity);
    }

    // Liabilities
    const liabStmt = db.prepare(
      `INSERT INTO liabilities (account_id, type, interest_rate, origination_date, original_balance, current_balance, minimum_payment, next_payment_due, last_payment_amount, last_payment_date, credit_limit, last_statement_issue_date, is_overdue, apr_type, maturity_date, loan_type, property_address, escrow_balance, loan_status, loan_name, repayment_plan, expected_payoff_date, ytd_interest_paid, ytd_principal_paid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const l of liabilities) {
      liabStmt.run(l.account_id, l.type, l.interest_rate, l.origination_date, l.original_balance, l.current_balance, l.minimum_payment, l.next_payment_due, l.last_payment_amount, l.last_payment_date, l.credit_limit, l.last_statement_issue_date, l.is_overdue, l.apr_type, l.maturity_date, l.loan_type, l.property_address, l.escrow_balance, l.loan_status, l.loan_name, l.repayment_plan, l.expected_payoff_date, l.ytd_interest_paid, l.ytd_principal_paid);
    }

    // Recurring
    const recStmt = db.prepare(
      `INSERT INTO recurring (stream_id, account_id, merchant_name, description, frequency, category, subcategory, avg_amount, last_amount, first_date, last_date, is_active, status, stream_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const r of recurring) {
      recStmt.run(r.stream_id, r.account_id, r.merchant_name, r.description, r.frequency, r.category, r.subcategory, r.avg_amount, r.last_amount, r.first_date, r.last_date, r.is_active, r.status, r.stream_type);
    }

    // Budgets
    const budgetStmt = db.prepare(
      `INSERT INTO budgets (category, monthly_limit, period) VALUES (?, ?, ?)`
    );
    for (const b of budgets) {
      budgetStmt.run(b.category, b.monthly_limit, b.period);
    }

    // Goals
    const goalStmt = db.prepare(
      `INSERT INTO goals (name, target_amount, current_amount, target_date, status) VALUES (?, ?, ?, ?, ?)`
    );
    for (const g of goals) {
      goalStmt.run(g.name, g.target_amount, g.current_amount, g.target_date, g.status);
    }

    // Daily Scores
    const scoreStmt = db.prepare(
      `INSERT INTO daily_scores (date, score, restaurant_count, shopping_count, food_spend, total_spend, zero_spend, no_restaurant_streak, no_shopping_streak, on_pace_streak) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const s of dailyScores) {
      scoreStmt.run(s.date, s.score, s.restaurant_count, s.shopping_count, s.food_spend, s.total_spend, s.zero_spend, s.no_restaurant_streak, s.no_shopping_streak, s.on_pace_streak);
    }

    // Achievements
    const achStmt = db.prepare(
      `INSERT INTO achievements (key, name, description, unlocked_at) VALUES (?, ?, ?, ?)`
    );
    for (const a of achievements) {
      achStmt.run(a.key, a.name, a.description, a.unlocked_at);
    }

    // Net Worth History
    const nwStmt = db.prepare(
      `INSERT INTO net_worth_history (date, total_assets, total_liabilities, net_worth) VALUES (?, ?, ?, ?)`
    );
    for (const nw of netWorthHistory) {
      nwStmt.run(nw.date, nw.total_assets, nw.total_liabilities, nw.net_worth);
    }

    // Investment Transactions
    const invTxStmt = db.prepare(
      `INSERT INTO investment_transactions (investment_transaction_id, account_id, security_id, date, name, quantity, amount, price, fees, type, subtype, iso_currency_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const it of investmentTransactions) {
      invTxStmt.run(it.investment_transaction_id, it.account_id, it.security_id, it.date, it.name, it.quantity, it.amount, it.price, it.fees, it.type, it.subtype, it.iso_currency_code);
    }

    // Recurring Bills
    const billStmt = db.prepare(
      `INSERT INTO recurring_bills (name, amount, day_of_month, type, account_id) VALUES (?, ?, ?, ?, ?)`
    );
    for (const b of recurringBills) {
      billStmt.run(b.name, b.amount, b.day_of_month, b.type, b.account_id);
    }

    // Memories
    const memStmt = db.prepare(
      `INSERT INTO memories (content, category) VALUES (?, ?)`
    );
    for (const m of memories) {
      memStmt.run(m.content, m.category);
    }
  });

  seed();

  console.log("Demo database seeded successfully!\n");
  console.log(`  Institutions:    ${institutions.length}`);
  console.log(`  Accounts:        ${accounts.length}`);
  console.log(`  Transactions:    ${transactions.length}`);
  console.log(`  Securities:      ${securities.length}`);
  console.log(`  Holdings:        ${holdings.length}`);
  console.log(`  Liabilities:     ${liabilities.length}`);
  console.log(`  Recurring:       ${recurring.length}`);
  console.log(`  Budgets:         ${budgets.length}`);
  console.log(`  Goals:           ${goals.length}`);
  console.log(`  Daily Scores:    ${dailyScores.length}`);
  console.log(`  Achievements:    ${achievements.length}`);
  console.log(`  Net Worth Days:  ${netWorthHistory.length}`);
  console.log(`  Invest. Txns:    ${investmentTransactions.length}`);
  console.log(`  Recurring Bills: ${recurringBills.length}`);
  console.log(`  Memories:        ${memories.length}`);
  console.log(`\n  Database: ${resolve(dbPath)}`);
  console.log(`\n  Try it out:`);
  console.log(`    ray --demo status`);
  console.log(`    ray --demo accounts`);
  console.log(`    ray --demo spending`);

  db.close();
}
