import type Database from "libsql";

export type BillSource = "card" | "recurring" | "manual";

export type UpcomingBill = {
  date: Date;
  name: string;
  amount: number;
  source: BillSource;
  /** Optional secondary amount shown in parens, e.g. minimum payment for credit cards. */
  note?: string;
};

export type PlaidFrequency =
  | "WEEKLY"
  | "BIWEEKLY"
  | "SEMI_MONTHLY"
  | "MONTHLY"
  | "ANNUALLY"
  | "UNKNOWN"
  | string;

/**
 * Predict the next occurrence after `lastDate` given Plaid's reported frequency.
 * Returns null for UNKNOWN/unsupported frequencies.
 */
export function predictNextBillDate(lastDate: string, frequency: PlaidFrequency): Date | null {
  const last = new Date(lastDate + "T00:00:00Z");
  if (isNaN(last.getTime())) return null;

  switch (frequency) {
    case "WEEKLY":
      return addDays(last, 7);
    case "BIWEEKLY":
      return addDays(last, 14);
    case "SEMI_MONTHLY": {
      // Paychecks/bills on the 1st and 15th of the month.
      const d = last.getUTCDate();
      if (d < 15) return new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 15));
      return new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1));
    }
    case "MONTHLY":
      return addMonths(last, 1);
    case "ANNUALLY":
      return addMonths(last, 12);
    default:
      return null;
  }
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

/** Add months, clamping to the last day of the target month (Jan 31 + 1mo → Feb 28/29). */
function addMonths(d: Date, n: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const day = d.getUTCDate();
  const daysInTarget = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, daysInTarget)));
}

/**
 * Collect upcoming outflows from Plaid recurring streams, credit/mortgage/student
 * liability due dates, and manual recurring_bills. Sorted by date ascending.
 * Returns bills whose predicted date is between tomorrow and today+`days` inclusive.
 */
export function getUpcomingBills(db: Database.Database, days: number): UpcomingBill[] {
  const now = new Date();
  const today = startOfUtcDay(now);
  const windowStart = addDays(today, 1);
  const windowEnd = addDays(today, days);

  const bills: UpcomingBill[] = [];

  // 1. Plaid recurring streams (outflows only)
  const streams = db.prepare(
    `SELECT description, merchant_name, frequency, avg_amount, last_amount, last_date
     FROM recurring
     WHERE is_active = 1 AND stream_type = 'outflow' AND last_date IS NOT NULL`
  ).all() as {
    description: string;
    merchant_name: string | null;
    frequency: string;
    avg_amount: number;
    last_amount: number | null;
    last_date: string;
  }[];

  for (const s of streams) {
    const next = predictNextBillDate(s.last_date, s.frequency);
    if (!next) continue;
    if (next < windowStart || next > windowEnd) continue;
    const amount = Math.abs(s.last_amount ?? s.avg_amount ?? 0);
    if (amount === 0) continue;
    bills.push({
      date: next,
      name: s.merchant_name || s.description,
      amount,
      source: "recurring",
    });
  }

  // 2. Liabilities with a scheduled due date
  const liabs = db.prepare(
    `SELECT l.type, l.current_balance, l.minimum_payment, l.next_payment_due, a.name as account_name
     FROM liabilities l
     JOIN accounts a ON a.account_id = l.account_id
     WHERE l.next_payment_due IS NOT NULL`
  ).all() as {
    type: string;
    current_balance: number | null;
    minimum_payment: number | null;
    next_payment_due: string;
    account_name: string;
  }[];

  for (const l of liabs) {
    const due = new Date(l.next_payment_due + "T00:00:00Z");
    if (isNaN(due.getTime())) continue;
    if (due < windowStart || due > windowEnd) continue;

    if (l.type === "credit") {
      const stmt = l.current_balance ?? 0;
      if (stmt <= 0) continue;
      bills.push({
        date: due,
        name: l.account_name,
        amount: stmt,
        source: "card",
        note: l.minimum_payment != null ? `min ${formatShortMoney(l.minimum_payment)}` : undefined,
      });
    } else {
      const min = l.minimum_payment ?? 0;
      if (min <= 0) continue;
      bills.push({
        date: due,
        name: l.account_name,
        amount: min,
        source: "card",
      });
    }
  }

  // 3. Manual recurring_bills (month/day schedule)
  const manual = db.prepare(
    `SELECT name, amount, day_of_month FROM recurring_bills WHERE day_of_month IS NOT NULL`
  ).all() as { name: string; amount: number; day_of_month: number }[];

  for (const m of manual) {
    const next = nextDayOfMonthDate(today, m.day_of_month);
    if (next < windowStart || next > windowEnd) continue;
    bills.push({ date: next, name: m.name, amount: m.amount, source: "manual" });
  }

  bills.sort((a, b) => a.date.getTime() - b.date.getTime());
  return bills;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Next calendar date matching the given day-of-month, clamping to month length. */
function nextDayOfMonthDate(today: Date, dayOfMonth: number): Date {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const daysThisMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const clampedThisMonth = Math.min(dayOfMonth, daysThisMonth);
  const candidate = new Date(Date.UTC(y, m, clampedThisMonth));
  if (candidate > today) return candidate;
  const daysNextMonth = new Date(Date.UTC(y, m + 2, 0)).getUTCDate();
  return new Date(Date.UTC(y, m + 1, Math.min(dayOfMonth, daysNextMonth)));
}

function formatShortMoney(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}
