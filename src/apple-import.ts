import type BetterSqlite3 from "libsql";
type Database = BetterSqlite3.Database;
import { createHash } from "crypto";
import { readFileSync } from "fs";

const INSTITUTION_ID = "manual-apple";
const INSTITUTION_NAME = "Apple";
const ACCOUNT_ID = "manual-apple-card";
const ACCOUNT_NAME = "Apple Card";

const EXPECTED_HEADER = [
  "Transaction Date",
  "Clearing Date",
  "Description",
  "Merchant",
  "Category",
  "Type",
  "Amount (USD)",
  "Purchased By",
];

export interface AppleImportOptions {
  csvPath: string;
  balance?: number;
  limit?: number;
  replaceRange?: boolean;
  dryRun?: boolean;
  // Parsed CSV payload. When supplied, runAppleImport skips its own
  // readFileSync + parseAppleCsv and uses this instead — the caller has
  // already done the work (e.g. runImportApple parses once for the preview
  // banner, then passes the result through so the authoritative insert
  // path and the preview can't disagree if the file is edited mid-prompt).
  preParsed?: ReturnType<typeof parseAppleCsv>;
}

export interface AppleImportResult {
  accountId: string;
  accountCreated: boolean;
  rowsParsed: number;
  rowsInserted: number;
  rowsSkipped: number;
  rowsDeleted: number;
  warnings: string[];
  dateRange: { first: string; last: string } | null;
  replaceWindow: { first: string; last: string } | null;
  balance: number | null;
}

interface ParsedRow {
  transactionDate: string;  // YYYY-MM-DD
  description: string;
  merchant: string;
  category: string;
  type: string;
  amount: number;
}

interface CategoryMapping {
  category: string | null;
  subcategory: string | null;
}

// Apple exports Title Case categories; Ray's scoring and spending queries expect
// Plaid UPPERCASE_SNAKE_CASE codes. Mapping here so Apple transactions participate
// in restaurant/shopping counts, budget checks, and spending totals.
export const CATEGORY_MAP: Record<string, CategoryMapping> = {
  Restaurants: { category: "FOOD_AND_DRINK", subcategory: "FOOD_AND_DRINK_RESTAURANT" },
  "Food & Drinks": { category: "FOOD_AND_DRINK", subcategory: null },
  Grocery: { category: "FOOD_AND_DRINK", subcategory: "FOOD_AND_DRINK_GROCERIES" },
  Alcohol: { category: "FOOD_AND_DRINK", subcategory: "FOOD_AND_DRINK_ALCOHOL_AND_BARS" },
  Shopping: { category: "GENERAL_MERCHANDISE", subcategory: null },
  Services: { category: "GENERAL_SERVICES", subcategory: null },
  Gas: { category: "TRANSPORTATION", subcategory: "TRANSPORTATION_GAS" },
  Transportation: { category: "TRANSPORTATION", subcategory: null },
  Tolls: { category: "TRANSPORTATION", subcategory: "TRANSPORTATION_TOLLS" },
  Airlines: { category: "TRAVEL", subcategory: "TRAVEL_FLIGHTS" },
  Hotels: { category: "TRAVEL", subcategory: "TRAVEL_LODGING" },
  Travel: { category: "TRAVEL", subcategory: null },
  Entertainment: { category: "ENTERTAINMENT", subcategory: null },
  Medical: { category: "MEDICAL", subcategory: null },
  Health: { category: "MEDICAL", subcategory: null },
  Utilities: { category: "RENT_AND_UTILITIES", subcategory: null },
  "Govt-services-parking": { category: "GOVERNMENT_AND_NON_PROFIT", subcategory: null },
  // Payment (negative): card payment from your bank. Matches Plaid's shape
  // for CC payments; INCOME_EXCLUDED_CATEGORIES keeps it out of income totals.
  Payment: { category: "LOAN_PAYMENTS", subcategory: null },
  // Installment (positive): Apple Card monthly financing charge (e.g., iPhone).
  Installment: { category: "LOAN_PAYMENTS", subcategory: null },
  // Credit (negative): a refund. TRANSFER_IN keeps it out of income totals.
  Credit: { category: "TRANSFER_IN", subcategory: null },
  // Debit (positive): Apple Daily Cash clawback, the mirror of Credit.
  // TRANSFER_IN keeps it out of income AND spending totals (same rationale
  // as Credit) — these are cash-reward corrections, not real transactions.
  Debit: { category: "TRANSFER_IN", subcategory: null },
  Other: { category: null, subcategory: null },
};

const TYPE_LABELS: Record<string, string | null> = {
  Credit: "refund",
  Debit: "adjustment",
  Installment: "installment",
};

/** Parse RFC 4180 CSV: handles quoted fields, embedded commas, and escaped quotes ("") */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  // Strip BOM if present
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }

  // Final field / row (no trailing newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function parseDate(mdy: string): string | null {
  const m = mdy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1]}-${m[2]}`;
}

function parseAmount(s: string): number | null {
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function transactionId(date: string, amount: number, merchant: string, occurrence: number): string {
  const key = `${date}|${amount}|${merchant}|${occurrence}`;
  return "apple-" + createHash("sha256").update(key).digest("hex").slice(0, 16);
}

/**
 * Assigns a stable occurrence index to rows sharing the same (date, amount, merchant).
 * Without this, genuinely separate same-day same-merchant same-amount transactions
 * (e.g. two $2.40 subway swipes) would collapse into one via hash collision.
 *
 * Stability requirement: the same CSV exported twice must produce the same indices
 * so re-imports stay idempotent. We sort rows by every field before numbering so
 * the order doesn't depend on Apple's export order.
 */
function assignOccurrenceIndices(rows: ParsedRow[]): (ParsedRow & { occurrence: number })[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.transactionDate !== b.transactionDate) return a.transactionDate < b.transactionDate ? -1 : 1;
    if (a.amount !== b.amount) return a.amount - b.amount;
    if (a.merchant !== b.merchant) return a.merchant < b.merchant ? -1 : 1;
    if (a.description !== b.description) return a.description < b.description ? -1 : 1;
    if (a.category !== b.category) return a.category < b.category ? -1 : 1;
    if (a.type !== b.type) return a.type < b.type ? -1 : 1;
    return 0;
  });

  const counts: Record<string, number> = {};
  return sorted.map(r => {
    const key = `${r.transactionDate}|${r.amount}|${r.merchant}`;
    const occurrence = counts[key] ?? 0;
    counts[key] = occurrence + 1;
    return { ...r, occurrence };
  });
}

function mapCategory(appleCat: string): CategoryMapping {
  return CATEGORY_MAP[appleCat] ?? { category: null, subcategory: null };
}

/** Parse CSV text. Returns parsed rows + warnings for malformed rows. Throws on bad header. */
export function parseAppleCsv(text: string): {
  rows: ParsedRow[];
  warnings: string[];
  replaceWindow: { first: string; last: string } | null;
} {
  const raw = parseCsv(text);
  if (raw.length === 0) throw new Error("CSV file is empty.");

  const header = raw[0];
  const headerMismatch =
    header.length !== EXPECTED_HEADER.length ||
    EXPECTED_HEADER.some((col, i) => header[i] !== col);
  if (headerMismatch) {
    throw new Error(
      `This doesn't look like an Apple Card CSV export.\n` +
      `  Expected columns: ${EXPECTED_HEADER.join(", ")}\n` +
      `  Got:              ${header.join(", ")}\n` +
      `  Export from https://card.apple.com/ (the web portal, not the Wallet app).`
    );
  }

  const rows: ParsedRow[] = [];
  const warnings: string[] = [];
  // Count rows per unmapped Apple category so we can emit one warning per
  // unique value rather than one per row. 'Other' is Apple's explicit
  // miscellaneous bucket (mapped to {null, null} on purpose) and is excluded.
  const unmappedCategoryCounts = new Map<string, number>();
  // Every row whose Transaction Date parsed, including rows later skipped for
  // bad amount/columns. `--replace-range` must delete across the *full* CSV
  // window — narrowing to surviving rows would leave stale rows at the edges
  // when a boundary row has a bad amount.
  const allParsedDates: string[] = [];
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];
    if (r.length === 1 && r[0] === "") continue;

    // Parse date first — recorded in allParsedDates regardless of later
    // column/amount failures, so --replace-range covers the full CSV window
    // even when a boundary row has too few columns.
    const date = r.length >= 1 ? parseDate(r[0]) : null;
    if (date) allParsedDates.push(date);

    if (r.length < EXPECTED_HEADER.length) {
      warnings.push(`Row ${i + 1}: expected ${EXPECTED_HEADER.length} columns, got ${r.length} — skipped`);
      continue;
    }
    if (!date) {
      warnings.push(`Row ${i + 1}: unparseable Transaction Date "${r[0]}" — skipped`);
      continue;
    }

    const amount = parseAmount(r[6]);
    if (amount === null) {
      warnings.push(`Row ${i + 1}: unparseable Amount "${r[6]}" — skipped`);
      continue;
    }

    const category = r[4];
    if (category && category !== "Other" && !(category in CATEGORY_MAP)) {
      unmappedCategoryCounts.set(category, (unmappedCategoryCounts.get(category) ?? 0) + 1);
    }

    rows.push({
      transactionDate: date,
      description: r[2],
      merchant: r[3],
      category,
      type: r[5],
      amount,
    });
  }

  // One warning per unique unmapped category (not per row) so the post-import
  // summary isn't flooded. Message names the category, row count, and how to
  // fix via a recat rule — the same shape commands.ts already prints.
  for (const [cat, count] of unmappedCategoryCounts) {
    warnings.push(`Unknown Apple category "${cat}" (${count} rows) — imported without category. Add a recat rule: ray recat 'category:${cat}' → <PLAID_BUCKET>`);
  }

  let replaceWindow: { first: string; last: string } | null = null;
  if (allParsedDates.length > 0) {
    const sorted = [...allParsedDates].sort();
    replaceWindow = { first: sorted[0], last: sorted[sorted.length - 1] };
  }

  return { rows, warnings, replaceWindow };
}

/** True if the Apple Card account row already exists in the DB */
export function appleAccountExists(db: Database): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM accounts WHERE account_id = ?`).get(ACCOUNT_ID));
}

/** Returns the current balance of the Apple Card account, or null if it doesn't exist */
export function getAppleAccountBalance(db: Database): number | null {
  const r = db.prepare(`SELECT current_balance FROM accounts WHERE account_id = ?`).get(ACCOUNT_ID) as
    | { current_balance: number | null }
    | undefined;
  return r?.current_balance ?? null;
}

/** Returns the current credit limit of the Apple Card account, or null if unset */
export function getAppleAccountLimit(db: Database): number | null {
  const r = db.prepare(`SELECT balance_limit FROM accounts WHERE account_id = ?`).get(ACCOUNT_ID) as
    | { balance_limit: number | null }
    | undefined;
  return r?.balance_limit ?? null;
}

/** Count of existing Apple Card rows within a date range (for --replace-range preview) */
export function countAppleRowsInRange(db: Database, first: string, last: string): number {
  const r = db
    .prepare(`SELECT COUNT(*) as n FROM transactions WHERE account_id = ? AND date BETWEEN ? AND ?`)
    .get(ACCOUNT_ID, first, last) as { n: number };
  return r.n;
}

/** Net amount of existing Apple Card rows within a date range (for --replace-range confirmation) */
export function sumAppleRowsInRange(db: Database, first: string, last: string): number {
  const r = db
    .prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE account_id = ? AND date BETWEEN ? AND ?`)
    .get(ACCOUNT_ID, first, last) as { total: number };
  return r.total;
}

/** Run the import end-to-end. Returns a result struct for the CLI layer to format. */
export function runAppleImport(db: Database, opts: AppleImportOptions): AppleImportResult {
  const { rows, warnings, replaceWindow } =
    opts.preParsed ?? parseAppleCsv(readFileSync(opts.csvPath, "utf-8"));

  if (rows.length === 0) {
    return {
      accountId: ACCOUNT_ID,
      accountCreated: false,
      rowsParsed: 0,
      rowsInserted: 0,
      rowsSkipped: 0,
      rowsDeleted: 0,
      warnings,
      dateRange: null,
      replaceWindow: null,
      balance: null,
    };
  }

  const dates = rows.map(r => r.transactionDate).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];

  const replaceFirst = replaceWindow?.first ?? first;
  const replaceLast = replaceWindow?.last ?? last;

  if (opts.dryRun) {
    const rowsDeletedPreview = opts.replaceRange ? countAppleRowsInRange(db, replaceFirst, replaceLast) : 0;
    // With --replace-range, every CSV row is a fresh insert (the prior rows are
    // deleted first). Without it, count which transaction_ids already exist so
    // the user sees a real would-insert vs would-skip breakdown — the whole
    // point of --dry-run.
    let wouldInsert = rows.length;
    let wouldSkip = 0;
    if (!opts.replaceRange) {
      const exists = db.prepare(`SELECT 1 FROM transactions WHERE transaction_id = ?`);
      const indexed = assignOccurrenceIndices(rows);
      wouldInsert = 0;
      for (const row of indexed) {
        const id = transactionId(row.transactionDate, row.amount, row.merchant, row.occurrence);
        if (exists.get(id)) wouldSkip++;
        else wouldInsert++;
      }
    }
    return {
      accountId: ACCOUNT_ID,
      accountCreated: !appleAccountExists(db),
      rowsParsed: rows.length,
      rowsInserted: wouldInsert,
      rowsSkipped: wouldSkip,
      rowsDeleted: rowsDeletedPreview,
      warnings,
      dateRange: { first, last },
      replaceWindow: { first: replaceFirst, last: replaceLast },
      balance: opts.balance ?? getAppleAccountBalance(db),
    };
  }

  const accountCreated = !appleAccountExists(db);

  let rowsDeleted = 0;
  let rowsInserted = 0;
  let rowsSkipped = 0;

  const insertInst = db.prepare(
    `INSERT INTO institutions (item_id, access_token, name, products)
     VALUES (?, 'manual', ?, '[]')
     ON CONFLICT(item_id) DO NOTHING`
  );

  const insertAcc = db.prepare(
    `INSERT INTO accounts (account_id, item_id, name, type, subtype, currency, current_balance, balance_limit, updated_at)
     VALUES (?, ?, ?, 'credit', 'credit card', 'USD', ?, ?, datetime('now'))
     ON CONFLICT(account_id) DO UPDATE SET
       current_balance = COALESCE(excluded.current_balance, current_balance),
       balance_limit   = COALESCE(excluded.balance_limit, balance_limit),
       updated_at      = datetime('now')`
  );

  // Derive available_balance = limit - current_balance after the upsert resolves
  // both fields (so re-runs that omit one of --balance/--limit still produce a
  // correct value using the prior stored side). Without this, ai/insights.ts
  // skips the card from utilization (it requires available_balance IS NOT NULL).
  const updateAvailable = db.prepare(
    `UPDATE accounts
     SET available_balance = balance_limit - current_balance
     WHERE account_id = ?
       AND balance_limit IS NOT NULL
       AND current_balance IS NOT NULL`
  );

  // Mirror the resolved balance into the liabilities table. getDebts()
  // prefers l.current_balance (via COALESCE(NULLIF(l.current_balance, 0),
  // a.current_balance)) when a liabilities row exists, and uses l.type for
  // the debt-view type label. Without this upsert, Apple Card debt would
  // still appear via the accounts-only fallback path, but with a
  // less-specific type label and no balance-routing through the liabilities
  // table.
  // Note: rate/min-payment/next-due are NOT populated here — Apple's CSV
  // doesn't expose them. Those columns stay NULL, which getDebts renders as
  // rate=0/min_payment=0/next_due=null. If/when we add a user-prompt path
  // for rate and min-payment (analogous to the balance prompt), this upsert
  // should be extended.
  // type='credit' matches Plaid's syncLiabilities convention (src/plaid/sync.ts)
  // — keeps debt-view labels consistent across import sources.
  const upsertLiability = db.prepare(
    `INSERT INTO liabilities (account_id, type, current_balance, updated_at)
     SELECT ?, 'credit', current_balance, datetime('now')
     FROM accounts WHERE account_id = ? AND current_balance IS NOT NULL
     ON CONFLICT(account_id, type) DO UPDATE SET
       current_balance = excluded.current_balance,
       updated_at      = datetime('now')`
  );

  const deleteRange = db.prepare(
    `DELETE FROM transactions WHERE account_id = ? AND date BETWEEN ? AND ?`
  );

  const insertTx = db.prepare(
    `INSERT OR IGNORE INTO transactions
       (transaction_id, account_id, amount, date, name, merchant_name, category, subcategory,
        pending, iso_currency_code, payment_channel, label, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'USD', NULL, ?, NULL)`
  );

  const work = db.transaction(() => {
    insertInst.run(INSTITUTION_ID, INSTITUTION_NAME);
    insertAcc.run(
      ACCOUNT_ID,
      INSTITUTION_ID,
      ACCOUNT_NAME,
      opts.balance ?? null,
      opts.limit ?? null
    );
    updateAvailable.run(ACCOUNT_ID);
    upsertLiability.run(ACCOUNT_ID, ACCOUNT_ID);

    if (opts.replaceRange) {
      const info = deleteRange.run(ACCOUNT_ID, replaceFirst, replaceLast);
      rowsDeleted = Number(info.changes);
    }

    const indexed = assignOccurrenceIndices(rows);
    for (const row of indexed) {
      const mapping = mapCategory(row.category);
      const id = transactionId(row.transactionDate, row.amount, row.merchant, row.occurrence);
      const label = TYPE_LABELS[row.type] ?? null;
      const info = insertTx.run(
        id,
        ACCOUNT_ID,
        row.amount,
        row.transactionDate,
        row.description || row.merchant,
        row.merchant || null,
        mapping.category,
        mapping.subcategory,
        label
      );
      if (Number(info.changes) === 1) rowsInserted++;
      else rowsSkipped++;
    }
  });
  work();

  return {
    accountId: ACCOUNT_ID,
    accountCreated,
    rowsParsed: rows.length,
    rowsInserted,
    rowsSkipped,
    rowsDeleted,
    warnings,
    dateRange: { first, last },
    replaceWindow: { first: replaceFirst, last: replaceLast },
    balance: opts.balance ?? getAppleAccountBalance(db),
  };
}
