import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "libsql";
import { migrate } from "./db/schema.js";
import { encryptPlaidToken } from "./db/encryption.js";

// Mock Plaid sync functions
vi.mock("./plaid/sync.js", () => ({
  syncBalances: vi.fn().mockResolvedValue(3),
  syncTransactions: vi.fn().mockResolvedValue({ added: 5, modified: 0, removed: 0 }),
  syncInvestments: vi.fn().mockResolvedValue({ holdings: 2, securities: 2 }),
  syncInvestmentTransactions: vi.fn().mockResolvedValue({ transactions: 5 }),
  syncLiabilities: vi.fn().mockResolvedValue(undefined),
  syncRecurring: vi.fn().mockResolvedValue({ outflows: 3, inflows: 1 }),
  refreshProducts: vi.fn().mockImplementation((_db: any, _itemId: any, _token: any) => {
    // Return whatever products are stored in the DB for this item
    return Promise.resolve(["transactions"]);
  }),
  isProductNotSupported: vi.fn().mockReturnValue(false),
}));

// Mock scoring
vi.mock("./scoring/index.js", () => ({
  calculateDailyScore: vi.fn().mockReturnValue({ score: 75 }),
  checkAchievements: vi.fn().mockReturnValue([]),
}));

// Mock config
vi.mock("./config.js", () => ({
  config: { plaidTokenSecret: "test-secret" },
}));

import { runDailySync } from "./daily-sync.js";
import { syncBalances, syncTransactions } from "./plaid/sync.js";
import { calculateDailyScore } from "./scoring/index.js";

type DB = InstanceType<typeof Database>;

function createTestDb(): DB {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function seedInstitution(db: DB, opts: { id: string; token: string; products: string[]; name?: string }) {
  db.prepare(`INSERT INTO institutions (item_id, access_token, name, products) VALUES (?, ?, ?, ?)`)
    .run(opts.id, opts.token, opts.name || "Test Bank", JSON.stringify(opts.products));
}

describe("runDailySync", () => {
  let db: DB;

  beforeEach(() => {
    db = createTestDb();
    vi.clearAllMocks();
  });

  it("returns early with no institutions", async () => {
    await runDailySync(db);
    expect(syncBalances).not.toHaveBeenCalled();
  });

  it("skips manual institutions", async () => {
    seedInstitution(db, { id: "i1", token: "manual", products: ["transactions"] });
    await runDailySync(db);
    expect(syncBalances).not.toHaveBeenCalled();
  });

  it("skips institutions with bad encrypted token", async () => {
    seedInstitution(db, { id: "i1", token: "not:valid:encrypted:data", products: ["transactions"] });
    // Should not throw — logs error and continues
    await runDailySync(db);
    expect(syncBalances).not.toHaveBeenCalled();
  });

  it("syncs institution with valid encrypted token", async () => {
    const encrypted = encryptPlaidToken("access-sandbox-123", "test-secret");
    seedInstitution(db, { id: "i1", token: encrypted, products: ["transactions"] });
    await runDailySync(db);
    expect(syncBalances).toHaveBeenCalledTimes(1);
    expect(syncTransactions).toHaveBeenCalledTimes(1);
  });

  it("writes net worth snapshot", async () => {
    // Seed accounts so net worth is computed
    db.prepare(`INSERT INTO institutions (item_id, access_token, name, products) VALUES (?, 'manual', ?, '[]')`)
      .run("i1", "Bank");
    db.prepare(`INSERT INTO accounts (account_id, item_id, name, type, current_balance) VALUES (?, ?, ?, ?, ?)`)
      .run("a1", "i1", "Checking", "depository", 5000);
    db.prepare(`INSERT INTO accounts (account_id, item_id, name, type, current_balance) VALUES (?, ?, ?, ?, ?)`)
      .run("a2", "i1", "CC", "credit", 1000);

    await runDailySync(db);

    const row = db.prepare(`SELECT * FROM net_worth_history`).get() as any;
    expect(row.total_assets).toBe(5000);
    expect(row.total_liabilities).toBe(1000);
    expect(row.net_worth).toBe(4000);
  });

  it("upserts net worth on same day", async () => {
    db.prepare(`INSERT INTO institutions (item_id, access_token, name, products) VALUES (?, 'manual', ?, '[]')`)
      .run("i1", "Bank");
    db.prepare(`INSERT INTO accounts (account_id, item_id, name, type, current_balance) VALUES (?, ?, ?, ?, ?)`)
      .run("a1", "i1", "Checking", "depository", 5000);

    await runDailySync(db);
    // Update balance and sync again
    db.prepare(`UPDATE accounts SET current_balance = 6000 WHERE account_id = 'a1'`).run();
    await runDailySync(db);

    const rows = db.prepare(`SELECT * FROM net_worth_history`).all();
    expect(rows.length).toBe(1); // upsert, not duplicate
    expect((rows[0] as any).net_worth).toBe(6000);
  });
});

describe("recategorization rules", () => {
  let db: DB;

  beforeEach(() => {
    db = createTestDb();
    vi.clearAllMocks();
    // Need at least a manual institution so sync reaches recat logic
    db.prepare(`INSERT INTO institutions (item_id, access_token, name, products) VALUES (?, 'manual', ?, '[]')`)
      .run("i1", "Bank");
  });

  it("applies matching rules", async () => {
    db.prepare(`INSERT INTO accounts (account_id, item_id, name, type, current_balance) VALUES (?, ?, ?, ?, ?)`)
      .run("a1", "i1", "Checking", "depository", 1000);
    db.prepare(`INSERT INTO transactions (transaction_id, account_id, amount, date, name, category) VALUES (?, ?, ?, ?, ?, ?)`)
      .run("t1", "a1", 50, "2025-01-15", "AMAZON MARKETPLACE", "GENERAL_MERCHANDISE");
    db.prepare(`INSERT INTO recategorization_rules (match_field, match_pattern, target_category, label) VALUES (?, ?, ?, ?)`)
      .run("name", "%AMAZON%", "GENERAL_MERCHANDISE_ONLINE", "Amazon → Online Shopping");

    await runDailySync(db);

    const txn = db.prepare(`SELECT category FROM transactions WHERE transaction_id = 't1'`).get() as any;
    expect(txn.category).toBe("GENERAL_MERCHANDISE_ONLINE");
  });

  it("skips rules with invalid match_field", async () => {
    db.prepare(`INSERT INTO accounts (account_id, item_id, name, type, current_balance) VALUES (?, ?, ?, ?, ?)`)
      .run("a1", "i1", "Checking", "depository", 1000);
    db.prepare(`INSERT INTO transactions (transaction_id, account_id, amount, date, name, category) VALUES (?, ?, ?, ?, ?, ?)`)
      .run("t1", "a1", 50, "2025-01-15", "Test", "OTHER");
    // Inject an invalid field name
    db.prepare(`INSERT INTO recategorization_rules (match_field, match_pattern, target_category, label) VALUES (?, ?, ?, ?)`)
      .run("transaction_id; DROP TABLE transactions --", "%", "HACKED", "Bad rule");

    await runDailySync(db);

    // Transaction should be unchanged
    const txn = db.prepare(`SELECT category FROM transactions WHERE transaction_id = 't1'`).get() as any;
    expect(txn.category).toBe("OTHER");
  });

  it("widens rescore window to cover older transactions newly matched by a recat rule (F034)", async () => {
    // Regression: when a rule newly matches transactions older than the
    // newest daily_scores row, those older dates must also be re-scored so
    // daily_scores reflects the post-recat category breakdown. Without the
    // widening, only [newestScored.date+1 .. yesterday] gets re-scored and
    // the old dates remain stale.
    db.prepare(`INSERT INTO accounts (account_id, item_id, name, type, current_balance) VALUES (?, ?, ?, ?, ?)`)
      .run("a1", "i1", "Checking", "depository", 1000);

    // Compute dates relative to today so the test doesn't drift against
    // runDailySync's `yesterday` and `newestScored`.
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const oldDate = new Date(today.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Seed an old transaction (~120 days ago) that's about to be recategorized.
    db.prepare(`INSERT INTO transactions (transaction_id, account_id, amount, date, name, merchant_name, category) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run("t_old", "a1", 25, oldDate, "AMAZON MARKETPLACE #123", "Amazon Marketplace", "GENERAL_MERCHANDISE");
    // Seed a recent transaction so there's nothing to gap-backfill (newestScored
    // == two days ago, yesterday is scored unconditionally, no gap between).
    db.prepare(`INSERT INTO transactions (transaction_id, account_id, amount, date, name, category) VALUES (?, ?, ?, ?, ?, ?)`)
      .run("t_recent", "a1", 10, twoDaysAgo, "COFFEE", "FOOD_AND_DRINK");

    // Seed a daily_scores row for two-days-ago so the gap-backfill loop's
    // cursor starts at yesterday — no existing backfill work, only the
    // recat widening should push older dates into the rescore list.
    db.prepare(
      `INSERT INTO daily_scores (date, score, restaurant_count, shopping_count, food_spend, total_spend, zero_spend, no_restaurant_streak, no_shopping_streak, on_pace_streak)
       VALUES (?, 80, 0, 0, 0, 0, 0, 1, 1, 1)`
    ).run(twoDaysAgo);

    // Recat rule that will match the old Amazon transaction (it's currently
    // GENERAL_MERCHANDISE; the rule upgrades it to GENERAL_MERCHANDISE_ONLINE).
    db.prepare(`INSERT INTO recategorization_rules (match_field, match_pattern, target_category, label) VALUES (?, ?, ?, ?)`)
      .run("merchant_name", "%amazon%", "GENERAL_MERCHANDISE_ONLINE", "Amazon → Online Shopping");

    await runDailySync(db);

    // Rule fired.
    const txn = db.prepare(`SELECT category FROM transactions WHERE transaction_id = 't_old'`).get() as any;
    expect(txn.category).toBe("GENERAL_MERCHANDISE_ONLINE");

    // calculateDailyScore was called with the old date (the whole point of F034):
    // the recat widening prepended it to the rescore list so its daily_scores
    // row reflects the post-recat category.
    const scoredDates = (calculateDailyScore as any).mock.calls.map((c: any[]) => c[1]) as string[];
    expect(scoredDates).toContain(oldDate);
    expect(scoredDates).toContain(yesterday);
  });

  it("does not synthesize scores for dates before MIN(transactions.date) (F034 clamp)", async () => {
    // Regression: the widening must clamp against MIN(transactions.date) so
    // a recat that reaches an old row doesn't cause calculateDailyScore to
    // be invoked with dates predating the first-ever transaction. Mirrors
    // the clamp runImportApple applies at commands.ts:1297-1300.
    db.prepare(`INSERT INTO accounts (account_id, item_id, name, type, current_balance) VALUES (?, ?, ?, ?, ?)`)
      .run("a1", "i1", "Checking", "depository", 1000);

    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    // firstTxn sits between earliestAffected and currentStart — the clamp
    // must push widenStart up to firstTxn so earlier dates aren't synthesized.
    const firstTxnDate = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    db.prepare(`INSERT INTO transactions (transaction_id, account_id, amount, date, name, merchant_name, category) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run("t1", "a1", 25, firstTxnDate, "AMAZON PURCHASE", "Amazon", "GENERAL_MERCHANDISE");

    // No prior daily_scores rows — currentStart defaults to `yesterday`.
    db.prepare(`INSERT INTO recategorization_rules (match_field, match_pattern, target_category, label) VALUES (?, ?, ?, ?)`)
      .run("merchant_name", "%amazon%", "GENERAL_MERCHANDISE_ONLINE", "Amazon → Online Shopping");

    await runDailySync(db);

    const scoredDates = (calculateDailyScore as any).mock.calls.map((c: any[]) => c[1]) as string[];
    // Every scored date should be >= firstTxnDate (clamp) and <= yesterday (end).
    for (const d of scoredDates) {
      expect(d >= firstTxnDate).toBe(true);
      expect(d <= yesterday).toBe(true);
    }
    // The clamp should have pushed widenStart to firstTxnDate (the earliest
    // affected date equals firstTxnDate here, so the clamp is a no-op; but the
    // range start must never go below firstTxnDate).
    expect(scoredDates).toContain(firstTxnDate);
  });
});
