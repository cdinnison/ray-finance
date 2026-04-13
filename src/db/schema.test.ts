import { describe, it, expect } from "vitest";
import Database from "libsql";
import { migrate } from "./schema.js";

function freshDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  return db;
}

describe("migrate", () => {
  it("creates all 18 tables", () => {
    const db = freshDb();
    migrate(db);

    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
      .all()
      .map((r: any) => r.name);

    const expected = [
      "accounts",
      "achievements",
      "ai_audit_log",
      "budgets",
      "conversation_history",
      "daily_scores",
      "goals",
      "holdings",
      "institutions",
      "liabilities",
      "memories",
      "milestones",
      "net_worth_history",
      "recategorization_rules",
      "recurring",
      "recurring_bills",
      "securities",
      "settings",
      "transactions",
    ];

    for (const t of expected) {
      expect(tables, `missing table: ${t}`).toContain(t);
    }
  });

  it("is idempotent", () => {
    const db = freshDb();
    migrate(db);
    expect(() => migrate(db)).not.toThrow();
  });

  it("adds provider-aware institution columns to fresh databases", () => {
    const db = freshDb();
    migrate(db);

    const columns = db.prepare(`PRAGMA table_info(institutions)`).all() as { name: string }[];
    const names = columns.map(column => column.name);

    expect(names).toContain("provider");
    expect(names).toContain("provider_user_id");
    expect(names).toContain("provider_state");
  });

  it("migrates legacy institutions table to include provider columns", () => {
    const db = freshDb();
    db.exec(`
      CREATE TABLE institutions (
        item_id TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        name TEXT NOT NULL,
        products TEXT NOT NULL DEFAULT '[]',
        cursor TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    migrate(db);

    const columns = db.prepare(`PRAGMA table_info(institutions)`).all() as { name: string }[];
    const names = columns.map(column => column.name);

    expect(names).toContain("provider");
    expect(names).toContain("provider_user_id");
    expect(names).toContain("provider_state");
  });
});
