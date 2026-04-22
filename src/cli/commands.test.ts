import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "libsql";
import { getImportAppleBackfillWindow, parseMoneyStrict, cleanupDerivedAfterRemove, tryParseMoney, tryParseMoneyInRange } from "./commands.js";
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

  it("accepts a negative value in permissive mode (no range)", () => {
    // Permissive default preserves runAdd's unbounded manual-account balance
    // semantics (negative equity on an underwater property is legitimate).
    expect(parseMoneyStrict("balance", "-100", false)).toBe(-100);
  });

  it("rejects a negative APR when range.min=0 is enforced", () => {
    // Range-enforcement at the CLI boundary prevents junk values from
    // reaching liabilities.interest_rate → simulatePayoff. APR 0 is a
    // genuine promotional rate; < 0 is nonsensical.
    expect(parseMoneyStrict("apr", "-5", false, { min: 0, max: 100 })).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("--apr must be >= 0 (got -5)")
    );
  });

  it("rejects an APR above 100 when range.max=100 is enforced", () => {
    expect(parseMoneyStrict("apr", "1000", false, { min: 0, max: 100 })).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("--apr must be <= 100 (got 1000)")
    );
  });

  it("accepts APR 0 and 100 inclusively", () => {
    expect(parseMoneyStrict("apr", "0", false, { min: 0, max: 100 })).toBe(0);
    expect(parseMoneyStrict("apr", "100", false, { min: 0, max: 100 })).toBe(100);
  });

  it("rejects a negative limit when range.min=0 is enforced", () => {
    expect(parseMoneyStrict("limit", "-500", false, { min: 0 })).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("--limit must be >= 0 (got -500)")
    );
  });

  it("rejects a negative balance when range.min=0 is enforced", () => {
    expect(parseMoneyStrict("balance", "-100", false, { min: 0 })).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("--balance must be >= 0 (got -100)")
    );
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

describe("tryParseMoneyInRange", () => {
  it("accepts in-range values (inclusive bounds)", () => {
    expect(tryParseMoneyInRange("22.24", { min: 0, max: 100 })).toBe(22.24);
    expect(tryParseMoneyInRange("0", { min: 0, max: 100 })).toBe(0);
    expect(tryParseMoneyInRange("100", { min: 0, max: 100 })).toBe(100);
  });

  it("returns null for out-of-range values", () => {
    expect(tryParseMoneyInRange("150", { min: 0, max: 100 })).toBeNull();
    expect(tryParseMoneyInRange("-1", { min: 0, max: 100 })).toBeNull();
    expect(tryParseMoneyInRange("-100", { min: 0 })).toBeNull();
  });

  it("returns null for non-numeric input regardless of range", () => {
    expect(tryParseMoneyInRange("foo", { min: 0, max: 100 })).toBeNull();
    expect(tryParseMoneyInRange("", { min: 0, max: 100 })).toBeNull();
  });

  it("permissive when no range supplied", () => {
    expect(tryParseMoneyInRange("-500")).toBe(-500);
    expect(tryParseMoneyInRange("1000000")).toBe(1000000);
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

  it("purges stale daily_scores in the 90-day window even when no transactions remain", () => {
    // Regression for F004: removing the user's only transaction source (e.g.
    // solo Plaid institution) empties the transactions table. Without a
    // DELETE step, calculateDailyScore's hasPriorActivity guard returns
    // without writing for every date in the window and pre-existing stale
    // rows (referencing the removed account's historical spending) survive
    // unchanged — exactly the regression cleanupDerivedAfterRemove was
    // meant to clear. The cleanup must purge daily_scores in the window
    // BEFORE the rescore loop so stale rows are gone even when no new rows
    // get written.
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);

    // No accounts, no transactions — simulate post-remove state with the
    // only institution already deleted by removeInstitution's transaction.
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    // Seed a stale daily_scores row that would have referenced the now-
    // deleted account's spending. This row must not survive the cleanup.
    db.prepare(
      `INSERT INTO daily_scores (date, score, restaurant_count, shopping_count, food_spend, total_spend, zero_spend, no_restaurant_streak, no_shopping_streak, on_pace_streak)
       VALUES (?, 85, 0, 0, 0, 0, 1, 7, 7, 7)`
    ).run(thirtyDaysAgo);

    const before = db.prepare(`SELECT COUNT(*) as c FROM daily_scores WHERE date = ?`).get(thirtyDaysAgo) as { c: number };
    expect(before.c).toBe(1);

    cleanupDerivedAfterRemove(db as any, []);

    // Row must be gone — no remaining transactions means hasPriorActivity
    // returns false for every day, so the rescore loop never re-creates it.
    const after = db.prepare(`SELECT COUNT(*) as c FROM daily_scores WHERE date = ?`).get(thirtyDaysAgo) as { c: number };
    expect(after.c).toBe(0);

    // Also verify: no daily_scores rows at all for the 90-day window.
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const windowRows = db.prepare(
      `SELECT COUNT(*) as c FROM daily_scores WHERE date BETWEEN ? AND ?`
    ).get(ninetyDaysAgo, yesterday) as { c: number };
    expect(windowRows.c).toBe(0);
  });

  it("does not fabricate daily_scores rows when only far-in-the-past transactions remain (F006 mixed-source regression)", () => {
    // Regression: post-remove cleanup previously synthesized zero_spend=1
    // rows for every day in the 90-day window whenever ANY transaction
    // existed on-or-before the scored date. An Apple-only user whose CSV
    // data sat 6+ months in the past could therefore see 90 fabricated
    // rows spike no_restaurant_streak / no_shopping_streak / zero_spend
    // counts and falsely unlock Monk Mode / Detoxed / Home Chef on remove.
    // The tightened hasPriorActivity (±30-day window) closes this path;
    // stale rows get DELETEd, and no new rows are written for the gap.
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);

    db.prepare(
      `INSERT INTO institutions (item_id, access_token, name, products)
       VALUES ('manual-apple', 'manual', 'Apple', '[]')`
    ).run();
    db.prepare(
      `INSERT INTO accounts (account_id, item_id, name, type, current_balance)
       VALUES ('apple-card', 'manual-apple', 'Apple Card', 'credit', 0)`
    ).run();
    // Seed a transaction ~200 days in the past — well outside the 90-day
    // cleanup window AND outside the ±30-day hasPriorActivity window for
    // every day in that cleanup range.
    const oldDate = new Date(Date.now() - 200 * 86400000).toISOString().slice(0, 10);
    db.prepare(
      `INSERT INTO transactions (transaction_id, account_id, amount, date, name, pending, iso_currency_code)
       VALUES ('old-t', 'apple-card', 10, ?, 'Old Coffee', 0, 'USD')`
    ).run(oldDate);

    cleanupDerivedAfterRemove(db as any, []);

    // No daily_scores rows should be fabricated in the 90-day rescore
    // window — every day in that window is >30 days from the only surviving
    // transaction, so hasPriorActivity must skip persistence.
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const windowRows = db.prepare(
      `SELECT COUNT(*) as c FROM daily_scores WHERE date BETWEEN ? AND ?`
    ).get(ninetyDaysAgo, yesterday) as { c: number };
    expect(windowRows.c).toBe(0);

    // And the streak peaks that would drive achievement unlocks stay at 0.
    const peak = db.prepare(
      `SELECT MAX(no_restaurant_streak) as nr, MAX(no_shopping_streak) as ns, MAX(on_pace_streak) as op FROM daily_scores`
    ).get() as { nr: number | null; ns: number | null; op: number | null };
    expect(peak.nr ?? 0).toBe(0);
    expect(peak.ns ?? 0).toBe(0);
    expect(peak.op ?? 0).toBe(0);
  });
});
