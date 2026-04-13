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
  config: {
    plaidTokenSecret: "test-secret",
    plaidClientId: "plaid-client-id",
    plaidSecret: "plaid-secret",
    rayApiKey: "",
    bridgeClientId: "",
    bridgeClientSecret: "",
  },
  useManaged: vi.fn().mockReturnValue(false),
}));

import { runDailySync } from "./daily-sync.js";
import { syncBalances, syncTransactions } from "./plaid/sync.js";

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
});
