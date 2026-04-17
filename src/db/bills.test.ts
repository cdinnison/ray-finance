import { describe, it, expect } from "vitest";
import Database from "libsql";
import { migrate } from "./schema.js";
import { predictNextBillDate, getUpcomingBills } from "./bills.js";

type DB = InstanceType<typeof Database>;

function freshDb(): DB {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

describe("predictNextBillDate", () => {
  it("WEEKLY adds 7 days", () => {
    expect(iso(predictNextBillDate("2026-04-01", "WEEKLY")!)).toBe("2026-04-08");
  });

  it("BIWEEKLY adds 14 days", () => {
    expect(iso(predictNextBillDate("2026-04-01", "BIWEEKLY")!)).toBe("2026-04-15");
  });

  it("SEMI_MONTHLY jumps from early month to the 15th", () => {
    expect(iso(predictNextBillDate("2026-04-01", "SEMI_MONTHLY")!)).toBe("2026-04-15");
  });

  it("SEMI_MONTHLY jumps from mid-month to the 1st of next month", () => {
    expect(iso(predictNextBillDate("2026-04-15", "SEMI_MONTHLY")!)).toBe("2026-05-01");
  });

  it("MONTHLY adds one calendar month", () => {
    expect(iso(predictNextBillDate("2026-04-10", "MONTHLY")!)).toBe("2026-05-10");
  });

  it("MONTHLY clamps Jan 31 into Feb", () => {
    // 2026 is not a leap year — Feb has 28 days.
    expect(iso(predictNextBillDate("2026-01-31", "MONTHLY")!)).toBe("2026-02-28");
  });

  it("MONTHLY clamps Jan 31 into Feb (leap year)", () => {
    expect(iso(predictNextBillDate("2024-01-31", "MONTHLY")!)).toBe("2024-02-29");
  });

  it("ANNUALLY adds twelve months and clamps Feb 29 to Feb 28", () => {
    expect(iso(predictNextBillDate("2024-02-29", "ANNUALLY")!)).toBe("2025-02-28");
  });

  it("ANNUALLY passes through a normal date", () => {
    expect(iso(predictNextBillDate("2025-06-15", "ANNUALLY")!)).toBe("2026-06-15");
  });

  it("UNKNOWN returns null", () => {
    expect(predictNextBillDate("2026-04-01", "UNKNOWN")).toBeNull();
  });

  it("unknown frequency string returns null", () => {
    expect(predictNextBillDate("2026-04-01", "FORTNIGHTLY")).toBeNull();
  });

  it("invalid date returns null", () => {
    expect(predictNextBillDate("not-a-date", "MONTHLY")).toBeNull();
  });
});

describe("getUpcomingBills", () => {
  function seedInstitution(db: DB) {
    db.prepare(`INSERT INTO institutions (item_id, access_token, name) VALUES ('i1', 'tok', 'Test')`).run();
  }
  function seedAccount(db: DB, id: string, name: string, type = "credit") {
    db.prepare(
      `INSERT INTO accounts (account_id, item_id, name, type) VALUES (?, 'i1', ?, ?)`
    ).run(id, name, type);
  }

  function todayPlus(days: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function todayMinus(days: number): string {
    return todayPlus(-days);
  }

  it("pulls active Plaid outflow streams within the window", () => {
    const db = freshDb();
    // Monthly charge 20 days ago → next charge ~10 days out
    db.prepare(
      `INSERT INTO recurring (stream_id, description, frequency, avg_amount, last_amount, last_date, is_active, stream_type)
       VALUES ('s1', 'Netflix', 'MONTHLY', 15.99, 15.99, ?, 1, 'outflow')`
    ).run(todayMinus(20));

    const bills = getUpcomingBills(db, 14);
    expect(bills).toHaveLength(1);
    expect(bills[0].source).toBe("recurring");
    expect(bills[0].name).toBe("Netflix");
    expect(bills[0].amount).toBeCloseTo(15.99);
  });

  it("prefers merchant_name over description and last_amount over avg_amount", () => {
    const db = freshDb();
    db.prepare(
      `INSERT INTO recurring (stream_id, merchant_name, description, frequency, avg_amount, last_amount, last_date, is_active, stream_type)
       VALUES ('s1', 'Spotify', 'SPOTIFY USA XYZ', 'MONTHLY', 10.99, 11.99, ?, 1, 'outflow')`
    ).run(todayMinus(25));

    const bills = getUpcomingBills(db, 14);
    expect(bills[0].name).toBe("Spotify");
    expect(bills[0].amount).toBeCloseTo(11.99);
  });

  it("excludes inflows, inactive streams, and UNKNOWN frequency", () => {
    const db = freshDb();
    db.prepare(
      `INSERT INTO recurring (stream_id, description, frequency, avg_amount, last_amount, last_date, is_active, stream_type)
       VALUES ('in', 'Paycheck', 'BIWEEKLY', -2000, -2000, ?, 1, 'inflow'),
              ('off', 'Old Gym', 'MONTHLY', 30, 30, ?, 0, 'outflow'),
              ('unk', 'Odd', 'UNKNOWN', 10, 10, ?, 1, 'outflow')`
    ).run(todayMinus(1), todayMinus(5), todayMinus(1));

    expect(getUpcomingBills(db, 30)).toHaveLength(0);
  });

  it("surfaces credit card statement balance with minimum as a note", () => {
    const db = freshDb();
    seedInstitution(db);
    seedAccount(db, "acc-cc", "Chase Freedom", "credit");
    db.prepare(
      `INSERT INTO liabilities (account_id, type, current_balance, minimum_payment, next_payment_due)
       VALUES ('acc-cc', 'credit', 2400, 35, ?)`
    ).run(todayPlus(10));

    const bills = getUpcomingBills(db, 14);
    expect(bills).toHaveLength(1);
    expect(bills[0].source).toBe("card");
    expect(bills[0].name).toBe("Chase Freedom");
    expect(bills[0].amount).toBe(2400);
    expect(bills[0].note).toContain("min");
    expect(bills[0].note).toContain("35");
  });

  it("uses minimum_payment as amount for mortgages and student loans", () => {
    const db = freshDb();
    seedInstitution(db);
    seedAccount(db, "acc-m", "Mortgage", "loan");
    db.prepare(
      `INSERT INTO liabilities (account_id, type, minimum_payment, next_payment_due)
       VALUES ('acc-m', 'mortgage', 2100, ?)`
    ).run(todayPlus(5));

    const bills = getUpcomingBills(db, 14);
    expect(bills).toHaveLength(1);
    expect(bills[0].amount).toBe(2100);
    expect(bills[0].note).toBeUndefined();
  });

  it("skips credit cards with zero statement balance (paid off)", () => {
    const db = freshDb();
    seedInstitution(db);
    seedAccount(db, "acc-cc", "Amex", "credit");
    db.prepare(
      `INSERT INTO liabilities (account_id, type, current_balance, minimum_payment, next_payment_due)
       VALUES ('acc-cc', 'credit', 0, 0, ?)`
    ).run(todayPlus(10));

    expect(getUpcomingBills(db, 14)).toHaveLength(0);
  });

  it("includes manual bills tagged as manual", () => {
    const db = freshDb();
    const d = new Date();
    const day = Math.min(28, ((d.getUTCDate() + 3 - 1) % 28) + 1); // 3 days from now-ish
    db.prepare(
      `INSERT INTO recurring_bills (name, amount, day_of_month) VALUES ('Rent', 1800, ?)`
    ).run(day);

    const bills = getUpcomingBills(db, 31);
    const rent = bills.find(b => b.name === "Rent");
    expect(rent).toBeDefined();
    expect(rent!.source).toBe("manual");
    expect(rent!.amount).toBe(1800);
  });

  it("sorts the final list by date ascending", () => {
    const db = freshDb();
    seedInstitution(db);
    seedAccount(db, "acc-cc", "Visa", "credit");
    db.prepare(
      `INSERT INTO liabilities (account_id, type, current_balance, minimum_payment, next_payment_due)
       VALUES ('acc-cc', 'credit', 500, 25, ?)`
    ).run(todayPlus(10));
    db.prepare(
      `INSERT INTO recurring (stream_id, description, frequency, avg_amount, last_amount, last_date, is_active, stream_type)
       VALUES ('s1', 'Netflix', 'MONTHLY', 15.99, 15.99, ?, 1, 'outflow')`
    ).run(todayMinus(27));

    const bills = getUpcomingBills(db, 14);
    expect(bills.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < bills.length; i++) {
      expect(bills[i].date.getTime()).toBeGreaterThanOrEqual(bills[i - 1].date.getTime());
    }
  });
});
