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
  // Annual percentage rate (APR) on the Apple Card. Apple's CSV doesn't carry
  // APR, so we let the user supply it via `--apr`. Persisted into
  // `liabilities.interest_rate` on first import; re-imports without --apr
  // preserve the prior stored rate via COALESCE (see upsertLiability).
  apr?: number;
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
  /**
   * --replace-range only: count of snapshotted user-field rows successfully
   * restored onto the freshly-inserted rows (either by transaction_id exact
   * match or by a unique (date, amount, merchant) fallback). Null under
   * regular inserts (no snapshot pass runs).
   */
  preservedCount: number | null;
  /**
   * --replace-range only: count of snapshotted rows that couldn't be
   * re-applied — either because the row isn't in the re-import (semantic
   * transaction gone) or the fallback match was ambiguous (multiple
   * candidates with the same date/amount/merchant but the snapshot's
   * transaction_id no longer exists). Each dropped row produces one
   * entry in `warnings`. Null under regular inserts.
   */
  droppedCount: number | null;
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
  // Credit (negative): a refund. TRANSFER_IN keeps it out of income AND spending totals.
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

  // Unterminated quoted field at EOF means the file was truncated or a quote
  // is missing — silently pushing partial content would let downstream parsing
  // accept a corrupted row as truth. Fail loudly so the caller can surface it.
  if (inQuotes) {
    throw new Error("CSV parse error: unterminated quoted field — file may be truncated or a quote is missing.");
  }

  // Final field / row (no trailing newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * Parse Apple's MM/DD/YYYY export format and return a well-formed
 * YYYY-MM-DD ISO string, or null for anything malformed.
 *
 * Strict calendar validation: the regex shape-check alone would accept
 * `13/40/2026` or `02/31/2026` as structurally valid, producing ISO
 * strings like `2026-13-40`. Downstream consumers propagate those bad
 * values with silent corruption (JS `Date` normalizes 2026-02-31 to
 * 2026-03-03; scoring's cursor math produces NaN on a truly impossible
 * date and throws RangeError in runDailySync) or amplify the damage
 * (--replace-range's lexical-sorted BETWEEN clause with a bogus boundary
 * date nukes a wider window than the CSV actually covered). Round-trip
 * verification via Date.UTC rejects calendar-impossible dates (Feb 31,
 * Apr 31, etc.) and leap-year mismatches (Feb 29 2025) while accepting
 * legitimate leap-year dates (Feb 29 2024).
 */
function parseDate(mdy: string): string | null {
  const m = mdy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  // Fast pre-check: Date.UTC silently normalizes month=0 or month=13 into
  // adjacent years rather than rejecting them, so catch out-of-range values
  // before constructing the Date. Zero day would also normalize to the
  // previous month's last day.
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  // Round-trip verification: if the constructed UTC date's fields don't
  // match the inputs, the JS Date normalized an invalid date (e.g.
  // Feb 31 → Mar 3, Apr 31 → May 1, Feb 29 in a non-leap year → Mar 1).
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return `${m[3]}-${m[1]}-${m[2]}`;
}

function parseAmount(s: string): number | null {
  // Strict parse: reject partial matches like "12.34abc" that parseFloat would
  // silently accept. Apple's export emits bare numerics; anything else is
  // malformed and should route to the caller's skip-with-warning path.
  const cleaned = String(s ?? "").trim();
  if (!/^-?\d+(\.\d+)?$|^-?\.\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function transactionId(
  date: string,
  amount: number,
  merchant: string,
  description: string,
  category: string,
  type: string,
  occurrence: number
): string {
  // All row fields that distinguish Apple transactions are in the key. If
  // Apple retroactively refines description/category/type, the new row hashes
  // to a different id — so re-imports don't silently reshuffle occurrence
  // indices and carry user-applied edits (labels/notes, tied to
  // transaction_id) onto the wrong semantic row.
  const key = `${date}|${amount}|${merchant}|${description}|${category}|${type}|${occurrence}`;
  return "apple-" + createHash("sha256").update(key).digest("hex").slice(0, 16);
}

/**
 * Assigns a stable occurrence index to rows sharing the same full-content key
 * (date, amount, merchant, description, category, type). Only rows that tie
 * on ALL of those fields are genuinely indistinguishable events (e.g. two
 * $2.40 subway swipes on the same day) and need occurrence disambiguation.
 *
 * Stability requirement: the same CSV exported twice must produce the same
 * indices so re-imports stay idempotent. Sort is restricted to the same
 * fields that make up the hash key — tiebreakers on other fields would let
 * mid-stream refinements of unrelated rows silently reshuffle indices.
 */
function assignOccurrenceIndices(rows: ParsedRow[]): (ParsedRow & { occurrence: number })[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.transactionDate !== b.transactionDate) return a.transactionDate < b.transactionDate ? -1 : 1;
    if (a.amount !== b.amount) return a.amount - b.amount;
    if (a.merchant !== b.merchant) return a.merchant < b.merchant ? -1 : 1;
    return 0;
  });

  const counts: Record<string, number> = {};
  return sorted.map(r => {
    const key = `${r.transactionDate}|${r.amount}|${r.merchant}|${r.description}|${r.category}|${r.type}`;
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
  /**
   * Count of rows that were actually DROPPED from the import (bad column
   * count, bad date, bad amount). Strictly a subset of `warnings.length`:
   * `warnings` also contains non-fatal notices (e.g. one-per-unique unmapped
   * category) for rows that WERE imported, so conflating them under a single
   * "N rows skipped" count is materially misleading. Consumers that want to
   * show "skipped" and "other notices" separately should read this field
   * rather than warnings.length.
   */
  skippedCount: number;
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
  let skippedCount = 0;
  // Count rows per unmapped Apple category so we can emit one warning per
  // unique value rather than one per row. 'Other' is Apple's explicit
  // miscellaneous bucket (mapped to {null, null} on purpose) and is excluded.
  const unmappedCategoryCounts = new Map<string, number>();
  // Every row whose Transaction Date parsed AND has a full column count,
  // including rows later skipped for a bad amount. `--replace-range` must
  // delete across the *full* CSV window — narrowing to surviving rows would
  // leave stale rows at the edges when a boundary row has a bad amount.
  // We deliberately do NOT widen the window based on truncated (too-few
  // columns) rows: a row missing most of its fields is most likely corrupted
  // CSV (e.g. a partial line from an unterminated quote recovery) and
  // trusting its first-column date could silently amplify --replace-range's
  // DELETE into neighboring days of otherwise-healthy data.
  const allParsedDates: string[] = [];
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i];
    if (r.length === 1 && r[0] === "") continue;

    const date = r.length >= 1 ? parseDate(r[0]) : null;

    if (r.length < EXPECTED_HEADER.length) {
      warnings.push(`Row ${i + 1}: expected ${EXPECTED_HEADER.length} columns, got ${r.length} — skipped`);
      skippedCount++;
      continue;
    }
    if (!date) {
      warnings.push(`Row ${i + 1}: unparseable Transaction Date "${r[0]}" — skipped`);
      skippedCount++;
      continue;
    }

    // Record the date only after we've confirmed the row has a full column
    // count AND a parseable date. Rows that clear this bar may still be
    // skipped below (e.g. bad amount) but their date legitimately belongs in
    // the replace-range window.
    allParsedDates.push(date);

    const amount = parseAmount(r[6]);
    if (amount === null) {
      warnings.push(`Row ${i + 1}: unparseable Amount "${r[6]}" — skipped`);
      skippedCount++;
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
  // summary isn't flooded. Message names the category and row count and
  // points the user at the AI assistant for recategorization.
  for (const [cat, count] of unmappedCategoryCounts) {
    warnings.push(`Unknown Apple category "${cat}" (${count} rows) — imported without category. To recategorize, run \`ray\` and ask the assistant (e.g. "recategorize transactions where the source category is X to Y").`);
  }

  let replaceWindow: { first: string; last: string } | null = null;
  if (allParsedDates.length > 0) {
    const sorted = [...allParsedDates].sort();
    replaceWindow = { first: sorted[0], last: sorted[sorted.length - 1] };
  }

  return { rows, warnings, skippedCount, replaceWindow };
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

/**
 * Returns the stored APR for the Apple Card liabilities row, or null if no
 * APR has been set yet. Used by the CLI prompt/flag layer so re-runs can
 * show the user the current value (and skip re-prompting) without clobbering
 * it on a bare re-import.
 */
export function getAppleAccountApr(db: Database): number | null {
  const r = db
    .prepare(`SELECT interest_rate FROM liabilities WHERE account_id = ? AND type = 'credit'`)
    .get(ACCOUNT_ID) as { interest_rate: number | null } | undefined;
  return r?.interest_rate ?? null;
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

/**
 * Split the `amount` column of Apple Card rows in a date range into positives
 * (purchases) and absolute-value negatives (payments/credits). The legacy
 * `sumAppleRowsInRange` returns the *net* of both, which can be near-zero or
 * negative when a typical month contains both purchases and a payment — a
 * misleading number for a "rows you're about to delete" prompt. This returns
 * gross dollars moved on each side so the confirmation can display both.
 * sumAppleRowsInRange is left exported for any other callers that depend on
 * the net.
 */
export function splitAppleRowsInRange(db: Database, first: string, last: string): { purchases: number; payments: number } {
  const r = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS purchases,
         COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS payments
       FROM transactions WHERE account_id = ? AND date BETWEEN ? AND ?`
    )
    .get(ACCOUNT_ID, first, last) as { purchases: number; payments: number };
  return { purchases: r.purchases, payments: r.payments };
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
      preservedCount: null,
      droppedCount: null,
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
        const id = transactionId(
          row.transactionDate,
          row.amount,
          row.merchant,
          row.description,
          row.category,
          row.type,
          row.occurrence
        );
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
      preservedCount: null,
      droppedCount: null,
    };
  }

  const accountCreated = !appleAccountExists(db);

  let rowsDeleted = 0;
  let rowsInserted = 0;
  let rowsSkipped = 0;
  let preservedCount = 0;
  let droppedCount = 0;

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
  // APR: Apple's CSV doesn't expose interest_rate, so we accept it via the
  // optional --apr flag. When supplied, it's persisted on first import;
  // on re-imports without --apr, the COALESCE in the DO UPDATE clause
  // preserves the previously-stored rate (a bare re-run must not clobber a
  // user-supplied APR with NULL). Downstream consumers (getDebts,
  // ai/tools.ts get_debts, ai/insights.ts) distinguish NULL (unknown APR)
  // from 0 (promotional / genuinely 0%) so the model never silently treats
  // an Apple Card at rate=NULL as if it were 0% APR.
  // min-payment / next-due are still not populated — see CHANGELOG known
  // limitations; follow-up flags are tracked there.
  // type='credit' matches Plaid's syncLiabilities convention (src/plaid/sync.ts)
  // — keeps debt-view labels consistent across import sources.
  const upsertLiability = db.prepare(
    `INSERT INTO liabilities (account_id, type, current_balance, interest_rate, updated_at)
     SELECT ?, 'credit', current_balance, ?, datetime('now')
     FROM accounts WHERE account_id = ? AND current_balance IS NOT NULL
     ON CONFLICT(account_id, type) DO UPDATE SET
       current_balance = excluded.current_balance,
       interest_rate   = COALESCE(excluded.interest_rate, interest_rate),
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

  // Snapshot user-applied edits (note/label/category/subcategory) on rows we
  // are about to DELETE under --replace-range so we can re-apply them onto
  // the newly inserted rows. The primary match is by transaction_id (exact
  // re-import of the same row), with a fallback by (account_id, date,
  // amount, merchant_name) within the replace window: Apple sometimes
  // retroactively refines a row's description, which changes the hashed
  // transaction_id but leaves the semantic event identical. Without the
  // fallback, every description refinement silently drops the user's note /
  // label / manual recategorization — exactly the case `--replace-range`
  // is supposed to handle per CHANGELOG.md. We also snapshot the shape
  // fields (date/amount/merchant) so the fallback can run in JS after the
  // DELETE has already removed the old row.
  interface PreservedRow {
    transaction_id: string;
    date: string;
    amount: number;
    merchant_name: string | null;
    note: string | null;
    label: string | null;
    category: string | null;
    subcategory: string | null;
  }
  let preserved: PreservedRow[] = [];
  if (opts.replaceRange) {
    preserved = db.prepare(
      `SELECT transaction_id, date, amount, merchant_name, note, label, category, subcategory FROM transactions
       WHERE account_id = ? AND date BETWEEN ? AND ?
         AND (note IS NOT NULL OR label IS NOT NULL OR category IS NOT NULL OR subcategory IS NOT NULL)`
    ).all(ACCOUNT_ID, replaceFirst, replaceLast) as PreservedRow[];
  }

  // Uniform "snapshot wins" semantics for all four user-editable columns:
  // if the user set a value before --replace-range, that value survives the
  // re-import; otherwise the freshly-inserted Apple-source value (or NULL)
  // remains. Each `COALESCE(?, col)` reads as "prefer the snapshot; fall
  // back to whatever the fresh INSERT wrote". Applies to all four columns
  // so the rule is easy to verify — note is NULL-on-insert today (so
  // direction is functionally equivalent), but label is NON-NULL on
  // Credit/Debit/Installment rows via TYPE_LABELS, and category/subcategory
  // are non-NULL whenever CATEGORY_MAP has an entry for the Apple category,
  // so "snapshot wins" is the only direction that preserves user intent
  // across every row shape.
  const restoreUserFields = db.prepare(
    `UPDATE transactions
        SET note        = COALESCE(?, note),
            label       = COALESCE(?, label),
            category    = COALESCE(?, category),
            subcategory = COALESCE(?, subcategory)
      WHERE transaction_id = ?`
  );

  // Candidate lookup for the (date, amount, merchant) fallback path:
  // Apple sometimes refines a row's description between exports, which
  // changes the hashed transaction_id even though the semantic event is
  // the same. Exact-id match will miss those rows, so this query pulls
  // any freshly-inserted rows that share the shape fields; we apply
  // the snapshot only when exactly one candidate matches (ambiguous
  // matches emit a warning and skip).
  const findCandidates = db.prepare(
    `SELECT transaction_id FROM transactions
     WHERE account_id = ? AND date = ? AND amount = ?
       AND ((merchant_name IS NULL AND ? IS NULL) OR merchant_name = ?)`
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
    // Pass APR only when the caller supplied one; otherwise NULL propagates
    // and the DO UPDATE's COALESCE preserves any previously-stored rate.
    upsertLiability.run(ACCOUNT_ID, opts.apr ?? null, ACCOUNT_ID);

    if (opts.replaceRange) {
      const info = deleteRange.run(ACCOUNT_ID, replaceFirst, replaceLast);
      rowsDeleted = Number(info.changes);
    }

    const indexed = assignOccurrenceIndices(rows);
    for (const row of indexed) {
      const mapping = mapCategory(row.category);
      const id = transactionId(
        row.transactionDate,
        row.amount,
        row.merchant,
        row.description,
        row.category,
        row.type,
        row.occurrence
      );
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

    // Re-apply snapshotted user fields onto the freshly-inserted rows.
    // Two-pass strategy (order-independent) with a `claimed` Set tracking
    // transaction_ids already bound to a preserved row:
    //   Pass 1: Exact transaction_id match for every preserved row (fast
    //           path; covers unchanged descriptions). Every success is
    //           added to `claimed` so Pass 2 can't pick the same row.
    //   Pass 2: For preserved rows that missed exact-match, fall back to
    //           (account_id, date, amount, merchant_name) — Apple's
    //           description refinements change the hashed id but leave
    //           those shape fields identical. Filter candidates through
    //           `claimed` before counting, then apply the restore only
    //           when exactly one UNCLAIMED candidate matches; on success
    //           add that id to `claimed` too. 0 unclaimed matches means
    //           the semantic row is gone from the re-import (user's
    //           edit is dropped), >1 unclaimed means indistinguishable
    //           same-day/same-merchant/same-amount events where we can't
    //           know which one the note/label belongs to.
    //   Each dropped or ambiguous row produces a warning entry so the
    //   user can re-apply manually.
    // Why two passes (not one loop): a single-loop design is
    // SELECT-row-order dependent. If two preserved rows share
    // (date, amount, merchant) and only one exact-id-matches in the
    // re-import, the preserved row whose id still exists MUST bind first
    // so Pass 2's fallback sees exactly one unclaimed candidate for the
    // other. Separating the phases guarantees this regardless of the
    // order preserved was SELECTed.
    // Why track `claimed` (not just re-query): without it, a row an
    // exact-match already consumed still appears in the fallback's
    // candidates list, inflating length from 1→2 and triggering a
    // spurious "ambiguous" drop. It also prevents the COALESCE(?, col)
    // UPDATE from silently overwriting an earlier restore on the same
    // target row when two preserved snapshots collide on shape.
    // `restoreUserFields` uses snapshot-wins COALESCE for every column —
    // a user edit on any of note/label/category/subcategory made before
    // --replace-range survives the re-import, and rows the user never
    // touched keep whatever the fresh INSERT wrote.
    if (opts.replaceRange && preserved.length > 0) {
      const claimed = new Set<string>();
      const needsFallback: PreservedRow[] = [];

      // Pass 1: exact transaction_id match for every preserved row.
      for (const p of preserved) {
        const exact = restoreUserFields.run(
          p.note,
          p.label,
          p.category,
          p.subcategory,
          p.transaction_id
        );
        if (Number(exact.changes) === 1) {
          claimed.add(p.transaction_id);
          preservedCount++;
          continue;
        }
        needsFallback.push(p);
      }

      // Pass 2: shape-based fallback for rows that missed Pass 1.
      // merchant_name can be NULL, so the prepared statement uses a
      // double-binding trick: both `?` positions receive the same value
      // (for the IS NULL branch and the equality branch respectively).
      for (const p of needsFallback) {
        const candidates = (findCandidates.all(
          ACCOUNT_ID,
          p.date,
          p.amount,
          p.merchant_name,
          p.merchant_name
        ) as { transaction_id: string }[]).filter(
          c => !claimed.has(c.transaction_id)
        );
        if (candidates.length === 1) {
          restoreUserFields.run(
            p.note,
            p.label,
            p.category,
            p.subcategory,
            candidates[0].transaction_id
          );
          claimed.add(candidates[0].transaction_id);
          preservedCount++;
          continue;
        }
        // 0 or >1 unclaimed candidates — can't safely re-apply. Record
        // the loss so the caller can surface it.
        droppedCount++;
        const merchantLabel = p.merchant_name ?? "(no merchant)";
        const reason = candidates.length === 0
          ? "no matching row after re-import"
          : `${candidates.length} ambiguous matches`;
        warnings.push(
          `Preserved note/label for ${p.date} ${merchantLabel} ${p.amount} dropped: ${reason}.`
        );
      }
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
    preservedCount: opts.replaceRange ? preservedCount : null,
    droppedCount: opts.replaceRange ? droppedCount : null,
  };
}
