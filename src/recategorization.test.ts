import { describe, it, expect, beforeEach } from "vitest";
import Database from "libsql";
import { migrate } from "./db/schema.js";
import { applyRecategorizationRules } from "./recategorization.js";
import { SILENT_LOGGER } from "./daily-sync.js";

type DB = InstanceType<typeof Database>;

function createTestDb(): DB {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  db.prepare(`INSERT INTO institutions (item_id, access_token, name, products) VALUES (?, ?, ?, ?)`)
    .run("i1", "manual", "Test", "[]");
  db.prepare(`INSERT INTO accounts (account_id, item_id, name, type, current_balance) VALUES (?, ?, ?, ?, ?)`)
    .run("a1", "i1", "Card", "credit", 0);
  return db;
}

function seedTxn(db: DB, opts: { id: string; name: string; category: string | null; subcategory: string | null }) {
  db.prepare(
    `INSERT INTO transactions (transaction_id, account_id, amount, date, name, category, subcategory) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(opts.id, "a1", 10, "2026-01-01", opts.name, opts.category, opts.subcategory);
}

function seedRule(
  db: DB,
  opts: { pattern: string; target_category: string; target_subcategory: string | null; label?: string }
) {
  db.prepare(
    `INSERT INTO recategorization_rules (match_field, match_pattern, target_category, target_subcategory, label) VALUES (?, ?, ?, ?, ?)`
  ).run("name", opts.pattern, opts.target_category, opts.target_subcategory, opts.label ?? "rule");
}

function readTxn(db: DB, id: string): { category: string | null; subcategory: string | null } {
  return db
    .prepare(`SELECT category, subcategory FROM transactions WHERE transaction_id = ?`)
    .get(id) as { category: string | null; subcategory: string | null };
}

describe("applyRecategorizationRules — target_subcategory NULL semantics", () => {
  let db: DB;

  beforeEach(() => {
    db = createTestDb();
  });

  it("preserves a valid child subcategory when category already matches", () => {
    // Amazon rule with NULL target_subcategory. The row is already tagged
    // GENERAL_MERCHANDISE with a correct child subcategory. The rule should
    // be a no-op for this row, not a subcategory wipe.
    seedTxn(db, {
      id: "t1",
      name: "AMAZON MARKETPLACE",
      category: "GENERAL_MERCHANDISE",
      subcategory: "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES",
    });
    seedRule(db, {
      pattern: "%AMAZON%",
      target_category: "GENERAL_MERCHANDISE",
      target_subcategory: null,
      label: "Amazon → General Merchandise",
    });

    const result = applyRecategorizationRules(db, SILENT_LOGGER);

    expect(result.transactionsUpdated).toBe(0);
    const row = readTxn(db, "t1");
    expect(row.category).toBe("GENERAL_MERCHANDISE");
    expect(row.subcategory).toBe("GENERAL_MERCHANDISE_ONLINE_MARKETPLACES");
  });

  it("wipes subcategory when category is actually changing (cross-category drift)", () => {
    // Same Amazon rule, but the row is currently tagged under a different
    // top-level category with a subcategory that belongs to that old parent.
    // Keeping the stale subcategory would be wrong — e.g. a
    // "FOOD_AND_DRINK_GROCERIES" child under a new GENERAL_MERCHANDISE
    // parent. Wipe it so the row is left with just the new category.
    seedTxn(db, {
      id: "t1",
      name: "AMAZON MARKETPLACE",
      category: "FOOD_AND_DRINK",
      subcategory: "FOOD_AND_DRINK_GROCERIES",
    });
    seedRule(db, {
      pattern: "%AMAZON%",
      target_category: "GENERAL_MERCHANDISE",
      target_subcategory: null,
    });

    const result = applyRecategorizationRules(db, SILENT_LOGGER);

    expect(result.transactionsUpdated).toBe(1);
    const row = readTxn(db, "t1");
    expect(row.category).toBe("GENERAL_MERCHANDISE");
    expect(row.subcategory).toBeNull();
  });

  it("still applies when category is NULL on the row (COALESCE guard)", () => {
    // Apple imports produce rows with NULL category for "Other" / unmapped.
    // A NULL-subcategory rule should still match and set the category.
    seedTxn(db, {
      id: "t1",
      name: "AMAZON MARKETPLACE",
      category: null,
      subcategory: null,
    });
    seedRule(db, {
      pattern: "%AMAZON%",
      target_category: "GENERAL_MERCHANDISE",
      target_subcategory: null,
    });

    const result = applyRecategorizationRules(db, SILENT_LOGGER);

    expect(result.transactionsUpdated).toBe(1);
    const row = readTxn(db, "t1");
    expect(row.category).toBe("GENERAL_MERCHANDISE");
    expect(row.subcategory).toBeNull();
  });

  it("explicit target_subcategory still forces both fields", () => {
    // Sanity-check that narrowing the NULL branch didn't regress the
    // non-NULL branch.
    seedTxn(db, {
      id: "t1",
      name: "STARBUCKS",
      category: "FOOD_AND_DRINK",
      subcategory: "FOOD_AND_DRINK_RESTAURANT",
    });
    seedRule(db, {
      pattern: "%STARBUCKS%",
      target_category: "FOOD_AND_DRINK",
      target_subcategory: "FOOD_AND_DRINK_COFFEE",
    });

    const result = applyRecategorizationRules(db, SILENT_LOGGER);

    expect(result.transactionsUpdated).toBe(1);
    const row = readTxn(db, "t1");
    expect(row.category).toBe("FOOD_AND_DRINK");
    expect(row.subcategory).toBe("FOOD_AND_DRINK_COFFEE");
  });
});

describe("applyRecategorizationRules — empty-pattern defense-in-depth (F052)", () => {
  it("schema CHECK rejects empty match_pattern on fresh DB", () => {
    // New DBs created after the CHECK landed block empty/whitespace
    // patterns at the storage layer — the first line of defense.
    const db = createTestDb();
    expect(() =>
      db.prepare(
        `INSERT INTO recategorization_rules (match_field, match_pattern, target_category, target_subcategory, label) VALUES (?, ?, ?, ?, ?)`
      ).run("name", "", "FOOD_AND_DRINK", null, "empty")
    ).toThrow();
    expect(() =>
      db.prepare(
        `INSERT INTO recategorization_rules (match_field, match_pattern, target_category, target_subcategory, label) VALUES (?, ?, ?, ?, ?)`
      ).run("name", "   ", "FOOD_AND_DRINK", null, "whitespace")
    ).toThrow();
  });

  it("applyRecategorizationRules skips empty-pattern rules on pre-CHECK DBs", () => {
    // Existing user DBs created before the CHECK don't get retroactively
    // constrained (no migration). The app-layer guard in the rule loop is
    // what protects them — simulate that state by rebuilding the table
    // without the CHECK, insert an empty rule, then verify the loop
    // skips it with a loud error instead of running '%' / '%   %' mass-
    // recategorization SQL.
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);
    db.prepare(`INSERT INTO institutions (item_id, access_token, name, products) VALUES (?, ?, ?, ?)`)
      .run("i1", "manual", "Test", "[]");
    db.prepare(`INSERT INTO accounts (account_id, item_id, name, type, current_balance) VALUES (?, ?, ?, ?, ?)`)
      .run("a1", "i1", "Card", "credit", 0);
    // Drop + recreate without CHECK to simulate a pre-CHECK DB.
    db.prepare(`DROP TABLE recategorization_rules`).run();
    db.prepare(
      `CREATE TABLE recategorization_rules (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         match_field TEXT NOT NULL,
         match_pattern TEXT NOT NULL,
         target_category TEXT NOT NULL,
         target_subcategory TEXT,
         label TEXT
       )`
    ).run();

    // Seed a transaction that would match '%' (catches mass-rewrite
    // behavior if the guard fails).
    db.prepare(
      `INSERT INTO transactions (transaction_id, account_id, amount, date, name, category) VALUES (?, ?, ?, ?, ?, ?)`
    ).run("t1", "a1", 10, "2026-01-01", "AMAZON", "GENERAL_MERCHANDISE");

    // Bypass the CHECK — direct INSERT with empty pattern.
    db.prepare(
      `INSERT INTO recategorization_rules (match_field, match_pattern, target_category, target_subcategory, label) VALUES (?, ?, ?, ?, ?)`
    ).run("name", "", "HACKED", null, "empty-pattern");
    db.prepare(
      `INSERT INTO recategorization_rules (match_field, match_pattern, target_category, target_subcategory, label) VALUES (?, ?, ?, ?, ?)`
    ).run("name", "   ", "HACKED", null, "whitespace-pattern");

    const result = applyRecategorizationRules(db, SILENT_LOGGER);

    // Both rules must skip; no transactions touched.
    expect(result.rulesSkipped).toBe(2);
    expect(result.transactionsUpdated).toBe(0);
    const row = readTxn(db, "t1");
    expect(row.category).toBe("GENERAL_MERCHANDISE");
  });
});

describe("add_recat_rule AI tool — empty-pattern rejection (F052)", () => {
  it("rejects empty match_pattern with a clear error", async () => {
    const { executeTool } = await import("./ai/tools.js");
    const db = createTestDb();
    const result = await executeTool(db, "add_recat_rule", {
      match_field: "name",
      match_pattern: "",
      target_category: "FOOD_AND_DRINK",
    });
    expect(result).toMatch(/cannot be empty/i);
    // Nothing got persisted.
    const count: any = db.prepare(`SELECT COUNT(*) as n FROM recategorization_rules`).get();
    expect(count.n).toBe(0);
  });

  it("rejects whitespace-only match_pattern", async () => {
    const { executeTool } = await import("./ai/tools.js");
    const db = createTestDb();
    const result = await executeTool(db, "add_recat_rule", {
      match_field: "name",
      match_pattern: "   ",
      target_category: "FOOD_AND_DRINK",
    });
    expect(result).toMatch(/cannot be empty/i);
    const count: any = db.prepare(`SELECT COUNT(*) as n FROM recategorization_rules`).get();
    expect(count.n).toBe(0);
  });
});
