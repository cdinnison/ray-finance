import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "libsql";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { migrate } from "./db/schema.js";
import {
  parseCsv,
  parseAppleCsv,
  runAppleImport,
  appleAccountExists,
} from "./apple-import.js";
import { applyRecategorizationRules } from "./recategorization.js";
import { calculateDailyScore } from "./scoring/index.js";

function freshDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

const VALID_HEADER =
  "Transaction Date,Clearing Date,Description,Merchant,Category,Type,Amount (USD),Purchased By";

function writeCsv(lines: string[]): string {
  const path = join(tmpdir(), `apple-import-test-${Date.now()}-${Math.random()}.csv`);
  writeFileSync(path, lines.join("\n"));
  return path;
}

function sampleCsv(extraRows: string[] = []): string[] {
  return [
    VALID_HEADER,
    `04/13/2026,04/14/2026,"SQ *POKI TIKI COSTA ME2801 HARBOR BLVD STE A","Poke Tiki Costa Mesa","Restaurants","Purchase","22.79","Adam Miller"`,
    `04/12/2026,04/13/2026,"TST* THE BUTCHERY, COSTA MESA","The Butchery","Grocery","Purchase","17.65","Adam Miller"`,
    `03/31/2026,03/31/2026,"ACH DEPOSIT INTERNET TRANSFER","Ach Deposit","Payment","Payment","-1496.16","Adam Miller"`,
    `04/02/2026,04/03/2026,"SQ *VACANCY COFFEE (RETURN)","Sq Vacancy Coffee (return)","Credit","Credit","-5.50","Adam Miller"`,
    `03/31/2026,03/31/2026,"MONTHLY INSTALLMENTS (19 OF 24)","Monthly Installments","Installment","Installment","11.20","Adam Miller"`,
    ...extraRows,
  ];
}

describe("parseCsv", () => {
  it("handles quoted fields with embedded commas", () => {
    const rows = parseCsv(`a,"b,c",d\n1,"2,3",4`);
    expect(rows).toEqual([
      ["a", "b,c", "d"],
      ["1", "2,3", "4"],
    ]);
  });

  it("handles escaped quotes (double-quote sequence)", () => {
    const rows = parseCsv(`name\n"George ""Ace"" Miller"`);
    expect(rows[1][0]).toBe(`George "Ace" Miller`);
  });

  it("strips BOM", () => {
    const rows = parseCsv(`\uFEFFa,b\n1,2`);
    expect(rows[0]).toEqual(["a", "b"]);
  });

  it("handles CRLF line endings", () => {
    const rows = parseCsv(`a,b\r\n1,2\r\n`);
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseAppleCsv", () => {
  it("rejects a CSV with the wrong header row", () => {
    const wrong = [
      `"date","name","amount","status","category","parent category","excluded","tags","type","account"`,
      `"2026-04-13","Poke Tiki",22.79,"posted","Restaurants","Food & Drink",false,,"regular","Apple Card"`,
    ].join("\n");
    expect(() => parseAppleCsv(wrong)).toThrow(/doesn't look like an Apple Card CSV/);
  });

  it("accepts a well-formed Apple CSV", () => {
    const { rows, warnings } = parseAppleCsv(sampleCsv().join("\n"));
    expect(rows).toHaveLength(5);
    expect(warnings).toHaveLength(0);
  });

  it("collects warnings for unparseable rows without crashing", () => {
    const bad = [
      VALID_HEADER,
      `04/13/2026,04/14/2026,"Good row","Poke","Restaurants","Purchase","22.79","Adam"`,
      `not-a-date,04/13/2026,"Bad date","M","Other","Purchase","5.00","Adam"`,
      `04/14/2026,04/14/2026,"Bad amount","M","Other","Purchase","not-a-number","Adam"`,
    ].join("\n");
    const { rows, warnings } = parseAppleCsv(bad);
    expect(rows).toHaveLength(1);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/unparseable Transaction Date/);
    expect(warnings[1]).toMatch(/unparseable Amount/);
  });

  it("converts MM/DD/YYYY to YYYY-MM-DD", () => {
    const { rows } = parseAppleCsv(sampleCsv().join("\n"));
    expect(rows[0].transactionDate).toBe("2026-04-13");
  });
});

describe("runAppleImport", () => {
  let path: string;

  beforeEach(() => {
    path = writeCsv(sampleCsv());
  });

  afterEach(() => {
    try { unlinkSync(path); } catch {}
  });

  it("creates the institution and account on first run", () => {
    const db = freshDb();
    expect(appleAccountExists(db)).toBe(false);

    const result = runAppleImport(db, { csvPath: path, balance: 1847.32 });

    expect(result.accountCreated).toBe(true);
    expect(appleAccountExists(db)).toBe(true);

    const inst = db.prepare(`SELECT item_id, name, access_token FROM institutions WHERE item_id = 'manual-apple'`).get();
    expect(inst).toMatchObject({ item_id: "manual-apple", name: "Apple", access_token: "manual" });

    const acc: any = db.prepare(
      `SELECT name, type, subtype, current_balance FROM accounts WHERE account_id = 'manual-apple-card'`
    ).get();
    expect(acc.name).toBe("Apple Card");
    expect(acc.type).toBe("credit");
    expect(acc.subtype).toBe("credit card");
    expect(acc.current_balance).toBe(1847.32);
  });

  it("sets balance_limit when --limit provided", () => {
    const db = freshDb();
    runAppleImport(db, { csvPath: path, balance: 100, limit: 5000 });
    const acc: any = db.prepare(`SELECT balance_limit FROM accounts WHERE account_id = 'manual-apple-card'`).get();
    expect(acc.balance_limit).toBe(5000);
  });

  it("derives available_balance from balance + limit so utilization queries see the card", () => {
    const db = freshDb();
    runAppleImport(db, { csvPath: path, balance: 1500, limit: 5000 });
    const acc: any = db.prepare(
      `SELECT current_balance, balance_limit, available_balance FROM accounts WHERE account_id = 'manual-apple-card'`
    ).get();
    expect(acc.available_balance).toBe(3500);
  });

  it("recomputes available_balance on re-run with new balance, prior limit preserved", () => {
    const db = freshDb();
    runAppleImport(db, { csvPath: path, balance: 1500, limit: 5000 });
    runAppleImport(db, { csvPath: path, balance: 2000 });  // limit omitted
    const acc: any = db.prepare(
      `SELECT current_balance, balance_limit, available_balance FROM accounts WHERE account_id = 'manual-apple-card'`
    ).get();
    expect(acc.balance_limit).toBe(5000);
    expect(acc.current_balance).toBe(2000);
    expect(acc.available_balance).toBe(3000);
  });

  it("mirrors balance into liabilities so getDebts() reports Apple Card debt even when other liabilities exist", () => {
    const db = freshDb();
    runAppleImport(db, { csvPath: path, balance: 1500 });
    const liab: any = db.prepare(
      `SELECT type, current_balance FROM liabilities WHERE account_id = 'manual-apple-card'`
    ).get();
    expect(liab).toBeDefined();
    expect(liab.type).toBe("credit");
    expect(liab.current_balance).toBe(1500);
  });

  it("updates the liabilities row on re-import with a new balance", () => {
    const db = freshDb();
    runAppleImport(db, { csvPath: path, balance: 1500 });
    runAppleImport(db, { csvPath: path, balance: 2200 });
    const liab: any = db.prepare(
      `SELECT current_balance FROM liabilities WHERE account_id = 'manual-apple-card'`
    ).get();
    expect(liab.current_balance).toBe(2200);
  });

  it("updates existing balance on re-run without replacing it with null", () => {
    const db = freshDb();
    runAppleImport(db, { csvPath: path, balance: 1000 });
    runAppleImport(db, { csvPath: path });  // no balance this run
    const acc: any = db.prepare(`SELECT current_balance FROM accounts WHERE account_id = 'manual-apple-card'`).get();
    expect(acc.current_balance).toBe(1000);  // preserved via COALESCE
  });

  it("applies category mapping for key types", () => {
    const db = freshDb();
    runAppleImport(db, { csvPath: path, balance: 0 });

    const poke: any = db.prepare(`SELECT category, subcategory FROM transactions WHERE merchant_name = 'Poke Tiki Costa Mesa'`).get();
    expect(poke.category).toBe("FOOD_AND_DRINK");
    expect(poke.subcategory).toBe("FOOD_AND_DRINK_RESTAURANT");

    // Card payments map to TRANSFER_IN (not LOAN_PAYMENTS) so they don't pass
    // through Ray's `amount < 0 AND category NOT IN ('TRANSFER_IN')` income
    // filters and inflate cash-flow numbers.
    const payment: any = db.prepare(`SELECT category FROM transactions WHERE merchant_name = 'Ach Deposit'`).get();
    expect(payment.category).toBe("TRANSFER_IN");

    const refund: any = db.prepare(`SELECT category FROM transactions WHERE merchant_name = 'Sq Vacancy Coffee (return)'`).get();
    expect(refund.category).toBe("TRANSFER_IN");

    const installment: any = db.prepare(`SELECT category FROM transactions WHERE merchant_name = 'Monthly Installments'`).get();
    expect(installment.category).toBe("LOAN_PAYMENTS");
  });

  it("sets pending=0 and preserves sign convention (purchases positive, payments negative)", () => {
    const db = freshDb();
    runAppleImport(db, { csvPath: path, balance: 0 });
    const poke: any = db.prepare(`SELECT amount, pending FROM transactions WHERE merchant_name = 'Poke Tiki Costa Mesa'`).get();
    expect(poke.amount).toBe(22.79);
    expect(poke.pending).toBe(0);

    const payment: any = db.prepare(`SELECT amount FROM transactions WHERE merchant_name = 'Ach Deposit'`).get();
    expect(payment.amount).toBe(-1496.16);
  });

  it("is idempotent on re-import (same CSV, 0 new rows)", () => {
    const db = freshDb();
    const first = runAppleImport(db, { csvPath: path, balance: 100 });
    expect(first.rowsInserted).toBe(5);

    const second = runAppleImport(db, { csvPath: path, balance: 100 });
    expect(second.rowsInserted).toBe(0);
    expect(second.rowsSkipped).toBe(5);

    const count: any = db.prepare(`SELECT COUNT(*) as n FROM transactions`).get();
    expect(count.n).toBe(5);
  });

  it("--replace-range deletes existing rows only within the CSV date range", () => {
    const db = freshDb();

    // Seed an initial import covering Mar 31 → Apr 13
    runAppleImport(db, { csvPath: path, balance: 0 });

    // Manually insert an out-of-range row to verify it survives the replace
    db.prepare(
      `INSERT INTO transactions (transaction_id, account_id, amount, date, name, pending, iso_currency_code)
       VALUES ('apple-outside-001', 'manual-apple-card', 9.99, '2025-12-15', 'Old purchase', 0, 'USD')`
    ).run();
    db.prepare(
      `INSERT INTO transactions (transaction_id, account_id, amount, date, name, pending, iso_currency_code)
       VALUES ('apple-inside-001', 'manual-apple-card', 5.00, '2026-04-01', 'Other row', 0, 'USD')`
    ).run();

    const result = runAppleImport(db, { csvPath: path, balance: 0, replaceRange: true });

    expect(result.rowsDeleted).toBeGreaterThan(0);
    // Out-of-range row is untouched
    const outside: any = db.prepare(`SELECT COUNT(*) as n FROM transactions WHERE transaction_id = 'apple-outside-001'`).get();
    expect(outside.n).toBe(1);
    // In-range non-CSV row was deleted along with prior CSV rows
    const insideExtra: any = db.prepare(`SELECT COUNT(*) as n FROM transactions WHERE transaction_id = 'apple-inside-001'`).get();
    expect(insideExtra.n).toBe(0);
    // CSV rows re-inserted
    const csvRows: any = db.prepare(`SELECT COUNT(*) as n FROM transactions WHERE account_id = 'manual-apple-card' AND date BETWEEN '2026-03-31' AND '2026-04-13'`).get();
    expect(csvRows.n).toBe(5);
  });

  it("--dry-run writes nothing to the database but previews would-insert/would-skip", () => {
    const db = freshDb();
    const result = runAppleImport(db, { csvPath: path, balance: 500, dryRun: true });

    expect(result.rowsParsed).toBe(5);
    // All 5 are new on a fresh DB → would-insert previews 5
    expect(result.rowsInserted).toBe(5);
    expect(result.rowsSkipped).toBe(0);
    expect(appleAccountExists(db)).toBe(false);
    const count: any = db.prepare(`SELECT COUNT(*) as n FROM transactions`).get();
    expect(count.n).toBe(0);
  });

  it("--dry-run after a real import previews 0 inserts, 5 skips", () => {
    const db = freshDb();
    runAppleImport(db, { csvPath: path, balance: 500 });
    const result = runAppleImport(db, { csvPath: path, balance: 500, dryRun: true });
    expect(result.rowsInserted).toBe(0);
    expect(result.rowsSkipped).toBe(5);
  });

  it("reports the date range from the CSV", () => {
    const db = freshDb();
    const result = runAppleImport(db, { csvPath: path, balance: 0 });
    expect(result.dateRange).toEqual({ first: "2026-03-31", last: "2026-04-13" });
  });

  it("preserves same-day same-merchant same-amount duplicates via occurrence index", () => {
    // Two $2.40 MBTA subway swipes on the same day — real separate events,
    // indistinguishable by (date, amount, merchant) alone.
    const dupPath = writeCsv([
      VALID_HEADER,
      `12/21/2025,12/22/2025,"MBTA-550032884086","Mbta-550032884086","Transportation","Purchase","2.40","Adam"`,
      `12/21/2025,12/22/2025,"MBTA-550032884086","Mbta-550032884086","Transportation","Purchase","2.40","Adam"`,
      `12/22/2025,12/22/2025,"Different merchant","Other","Other","Purchase","5.00","Adam"`,
    ]);

    const db = freshDb();
    const result = runAppleImport(db, { csvPath: dupPath, balance: 0 });
    expect(result.rowsInserted).toBe(3);
    expect(result.rowsSkipped).toBe(0);

    const mbtaCount: any = db.prepare(
      `SELECT COUNT(*) as n FROM transactions WHERE merchant_name = 'Mbta-550032884086'`
    ).get();
    expect(mbtaCount.n).toBe(2);

    // Re-import must remain idempotent: same CSV → 0 new rows
    const second = runAppleImport(db, { csvPath: dupPath, balance: 0 });
    expect(second.rowsInserted).toBe(0);
    expect(second.rowsSkipped).toBe(3);

    try { unlinkSync(dupPath); } catch {}
  });

  it("auto-recategorizes freshly imported rows, clearing the stale subcategory", () => {
    const db = freshDb();
    // Apple maps Poke's "Restaurants" -> FOOD_AND_DRINK / FOOD_AND_DRINK_RESTAURANT.
    // A category-only rule (null target_subcategory) must change the top-level
    // category AND clear the stale subcategory, not leave an inconsistent pair.
    db.prepare(
      `INSERT INTO recategorization_rules (match_field, match_pattern, target_category, target_subcategory, label)
       VALUES (?, ?, ?, ?, ?)`
    ).run("merchant_name", "%Poke%", "GENERAL_MERCHANDISE", null, "Poke -> general");

    runAppleImport(db, { csvPath: path, balance: 0 });
    const recat = applyRecategorizationRules(db);

    expect(recat).toEqual({ rulesEvaluated: 1, rulesSkipped: 0, transactionsUpdated: 1 });
    const poke: any = db.prepare(
      `SELECT category, subcategory FROM transactions WHERE merchant_name = 'Poke Tiki Costa Mesa'`
    ).get();
    expect(poke.category).toBe("GENERAL_MERCHANDISE");
    expect(poke.subcategory).toBeNull();

    // Idempotent: second run fires nothing (row already at target with cleared subcategory).
    const recat2 = applyRecategorizationRules(db);
    expect(recat2.transactionsUpdated).toBe(0);
  });

  it("applies a subcategory-only refinement rule (same top-level category)", () => {
    const db = freshDb();
    // Apple maps Poke's "Restaurants" -> FOOD_AND_DRINK / FOOD_AND_DRINK_RESTAURANT.
    // This rule refines only the subcategory — same top-level category — which
    // an earlier version of the helper silently excluded via its WHERE clause.
    db.prepare(
      `INSERT INTO recategorization_rules (match_field, match_pattern, target_category, target_subcategory, label)
       VALUES (?, ?, ?, ?, ?)`
    ).run("merchant_name", "%Poke%", "FOOD_AND_DRINK", "FOOD_AND_DRINK_FAST_FOOD", "Poke -> fast food");

    runAppleImport(db, { csvPath: path, balance: 0 });
    const recat = applyRecategorizationRules(db);

    expect(recat).toEqual({ rulesEvaluated: 1, rulesSkipped: 0, transactionsUpdated: 1 });
    const poke: any = db.prepare(
      `SELECT category, subcategory FROM transactions WHERE merchant_name = 'Poke Tiki Costa Mesa'`
    ).get();
    expect(poke.category).toBe("FOOD_AND_DRINK");
    expect(poke.subcategory).toBe("FOOD_AND_DRINK_FAST_FOOD");

    // Idempotent — second run fires nothing (row already at target).
    const recat2 = applyRecategorizationRules(db);
    expect(recat2.transactionsUpdated).toBe(0);
  });

  it("is a no-op when recategorization_rules is empty", () => {
    const db = freshDb();
    runAppleImport(db, { csvPath: path, balance: 0 });
    const recat = applyRecategorizationRules(db);
    expect(recat).toEqual({ rulesEvaluated: 0, rulesSkipped: 0, transactionsUpdated: 0 });
  });

  it("daily score can be computed after a non-dry-run import (empty start)", () => {
    // Regression test for a bug where Apple-only users (no Plaid institutions)
    // ended up with an empty daily_scores table forever because scoring was
    // only wired into runDailySync. runImportApple now mirrors the sync's
    // scoring pass — this test asserts the post-import scoring path works.
    const db = freshDb();
    const before = db.prepare(`SELECT COUNT(*) as n FROM daily_scores`).get() as { n: number };
    expect(before.n).toBe(0);

    runAppleImport(db, { csvPath: path, balance: 0 });
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    calculateDailyScore(db, yesterday);

    const after = db.prepare(`SELECT COUNT(*) as n FROM daily_scores`).get() as { n: number };
    expect(after.n).toBe(1);
  });

  it("skips a rule with invalid match_field without throwing or touching data", () => {
    const db = freshDb();
    db.prepare(
      `INSERT INTO recategorization_rules (match_field, match_pattern, target_category, target_subcategory, label)
       VALUES (?, ?, ?, ?, ?)`
    ).run("transaction_id; DROP TABLE transactions --", "%anything%", "FOOD_AND_DRINK", null, "evil");

    runAppleImport(db, { csvPath: path, balance: 0 });
    const recat = applyRecategorizationRules(db);

    expect(recat.rulesSkipped).toBe(1);
    expect(recat.transactionsUpdated).toBe(0);
    const count: any = db.prepare(`SELECT COUNT(*) as n FROM transactions`).get();
    expect(count.n).toBeGreaterThan(0);
  });
});
