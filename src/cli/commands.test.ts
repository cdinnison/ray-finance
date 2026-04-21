import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "libsql";
import { getImportAppleBackfillWindow, parseMoneyStrict, cleanupDerivedAfterRemove, tryParseMoney } from "./commands.js";
import { migrate } from "../db/schema.js";

describe("getImportAppleBackfillWindow", () => {
  it("backs up to yesterday for same-day-only imports", () => {
    const window = getImportAppleBackfillWindow(
      {
        dateRange: { first: "2026-04-16", last: "2026-04-16" },
        replaceWindow: { first: "2026-04-16", last: "2026-04-16" },
      },
      {},
      new Date("2026-04-16T12:00:00Z")
    );

    expect(window).toEqual({ start: "2026-04-15", end: "2026-04-15" });
  });

  it("uses the wider replace window when replace-range is enabled", () => {
    const window = getImportAppleBackfillWindow(
      {
        dateRange: { first: "2026-04-10", last: "2026-04-10" },
        replaceWindow: { first: "2026-04-08", last: "2026-04-10" },
      },
      { replaceRange: true },
      new Date("2026-04-16T12:00:00Z")
    );

    expect(window).toEqual({ start: "2026-04-08", end: "2026-04-15" });
  });

  it("returns null when there is no imported date range", () => {
    const window = getImportAppleBackfillWindow(
      {
        dateRange: null,
        replaceWindow: null,
      },
      { replaceRange: true },
      new Date("2026-04-16T12:00:00Z")
    );

    expect(window).toBeNull();
  });
});

describe("parseMoneyStrict", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("returns undefined for a missing flag", () => {
    expect(parseMoneyStrict("balance", undefined, false)).toBeUndefined();
  });

  it("returns undefined for an empty string (falls through to prompt path)", () => {
    expect(parseMoneyStrict("balance", "", false)).toBeUndefined();
  });

  it("parses a plain integer", () => {
    expect(parseMoneyStrict("balance", "1234", false)).toBe(1234);
  });

  it("parses a decimal", () => {
    expect(parseMoneyStrict("balance", "1234.56", false)).toBe(1234.56);
  });

  it("strips $ and , from formatted input", () => {
    expect(parseMoneyStrict("balance", "$1,200.50", false)).toBe(1200.5);
  });

  it("accepts a negative value", () => {
    expect(parseMoneyStrict("balance", "-100", false)).toBe(-100);
  });

  it("rejects trailing junk (e.g. 123abc)", () => {
    expect(parseMoneyStrict("balance", "123abc", false)).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('--balance must be a number (got "123abc")')
    );
  });

  it("rejects leading junk (e.g. abc123)", () => {
    expect(parseMoneyStrict("limit", "abc123", false)).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('--limit must be a number (got "abc123")')
    );
  });

  it("rejects pure garbage", () => {
    expect(parseMoneyStrict("balance", "foo", false)).toBeNull();
  });

  it("rejects a double decimal", () => {
    expect(parseMoneyStrict("balance", "1.2.3", false)).toBeNull();
  });

  it("names the correct flag in the error message", () => {
    parseMoneyStrict("limit", "not-a-number", false);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('--limit must be a number (got "not-a-number")')
    );
  });
});

describe("tryParseMoney", () => {
  it("parses plain, decimal, formatted, and negative values", () => {
    expect(tryParseMoney("1234")).toBe(1234);
    expect(tryParseMoney("1234.56")).toBe(1234.56);
    expect(tryParseMoney("$1,200.50")).toBe(1200.5);
    expect(tryParseMoney("-100")).toBe(-100);
  });

  it("returns null for empty/garbage/trailing-junk", () => {
    expect(tryParseMoney("")).toBeNull();
    expect(tryParseMoney("   ")).toBeNull();
    expect(tryParseMoney("foo")).toBeNull();
    expect(tryParseMoney("123abc")).toBeNull();
    expect(tryParseMoney("1.2.3")).toBeNull();
  });
});

describe("cleanupDerivedAfterRemove", () => {
  it("refreshes daily_scores through yesterday (not today) and writes a net_worth_history snapshot", () => {
    // Regression for F023: removing an account left stale daily_scores and
    // net_worth_history rows referencing the now-deleted account. Calling
    // cleanupDerivedAfterRemove after the DELETE must repopulate both.
    //
    // Boundary invariant (bug_001, ultrareview 2026-04): the rescore loop
    // must stop at yesterday, matching runDailySync and
    // getImportAppleBackfillWindow. Writing a partial today row would seed
    // the next sync's streak chain with mid-day data, and runDailySync's
    // own backfill loop is strict-less-than yesterday so a stale today row
    // would never get overwritten.
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);

    // Seed a small account with one transaction so daily_scores has
    // something to score against.
    db.prepare(
      `INSERT INTO institutions (item_id, access_token, name, products)
       VALUES ('test-inst', 'manual', 'Test', '[]')`
    ).run();
    db.prepare(
      `INSERT INTO accounts (account_id, item_id, name, type, current_balance)
       VALUES ('test-acct', 'test-inst', 'Test', 'depository', 500)`
    ).run();

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    db.prepare(
      `INSERT INTO transactions (transaction_id, account_id, amount, date, name, pending, iso_currency_code)
       VALUES ('t1', 'test-acct', 10, ?, 'Coffee', 0, 'USD')`
    ).run(yesterday);

    // Run cleanup — this should produce a daily_scores row for yesterday and
    // a net_worth_history snapshot, but NOT a row for today (partial day).
    cleanupDerivedAfterRemove(db as any, ["test-acct"]);

    const yesterdayRows = db.prepare(`SELECT COUNT(*) as c FROM daily_scores WHERE date = ?`).get(yesterday) as { c: number };
    expect(yesterdayRows.c).toBe(1);

    const todayRows = db.prepare(`SELECT COUNT(*) as c FROM daily_scores WHERE date = ?`).get(today) as { c: number };
    expect(todayRows.c).toBe(0);

    const nwRows = db.prepare(`SELECT COUNT(*) as c FROM net_worth_history`).get() as { c: number };
    expect(nwRows.c).toBeGreaterThan(0);
  });
});
