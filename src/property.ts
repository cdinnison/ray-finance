import type BetterSqlite3 from "libsql";
type Database = BetterSqlite3.Database;
import { createHash } from "crypto";

const MANUAL_ITEM_ID = "manual-assets";
const LISTING_URL_PREFIX = "listing_url:";

function accountId(name: string): string {
  const hash = createHash("sha256").update(name).digest("hex").slice(0, 8);
  return `manual-${hash}`;
}

/** Scrape the Redfin Estimate from a Redfin listing URL */
export async function scrapeRedfinEstimate(url: string): Promise<number | null> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "text/html",
    },
  });
  if (!resp.ok) return null;
  const html = await resp.text();

  // Prefer Redfin Estimate (current market value) over sold/list price
  const match = html.match(/EstimateValueHeader[^>]*>.*?class="price[^"]*">\$([\d,]+)/) ||
    html.match(/statsValue price[^>]*>[^$]*\$([\d,]+)/) ||
    html.match(/Redfin Estimate[^$]*\$([\d,]+)/) ||
    html.match(/"estimatedValue":\s*([\d.]+)/);

  if (!match) return null;
  const value = parseFloat(match[1].replace(/,/g, ""));
  return isNaN(value) ? null : value;
}

/** Ensure the manual institution exists */
function ensureManualInstitution(db: Database): void {
  db.prepare(
    `INSERT INTO institutions (item_id, access_token, name, products) VALUES (?, 'manual', 'Manual Accounts', '[]')
     ON CONFLICT(item_id) DO NOTHING`
  ).run(MANUAL_ITEM_ID);
}

/** Add a manual account */
export function addManualAccount(
  db: Database,
  name: string,
  type: "asset" | "liability",
  balance: number,
  listingUrl?: string,
): { accountId: string } {
  ensureManualInstitution(db);
  const id = accountId(name);
  const dbType = type === "asset" ? "other" : "loan";
  const subtype = listingUrl ? "property" : (type === "asset" ? "other" : "other");

  db.prepare(
    `INSERT INTO accounts (account_id, item_id, name, type, subtype, current_balance, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(account_id) DO UPDATE SET current_balance = excluded.current_balance, updated_at = datetime('now')`
  ).run(id, MANUAL_ITEM_ID, name, dbType, subtype, balance);

  if (listingUrl) {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(LISTING_URL_PREFIX + id, listingUrl);
  }

  return { accountId: id };
}

/** Remove a manual account */
export function removeManualAccount(db: Database, id: string): void {
  // Wrap both DELETEs so a mid-chain failure can't leave the account row
  // deleted but the settings listing_url behind (or vice versa). Symmetric
  // with the institution-removal DELETE chain in src/cli/commands.ts.
  const work = db.transaction(() => {
    db.prepare(`DELETE FROM accounts WHERE account_id = ?`).run(id);
    db.prepare(`DELETE FROM settings WHERE key = ?`).run(LISTING_URL_PREFIX + id);
  });
  work();
}

/** List all manual accounts */
export function getManualAccounts(db: Database): { account_id: string; name: string; type: string; current_balance: number; listing_url: string | null }[] {
  const rows = db.prepare(
    `SELECT account_id, name, type, current_balance FROM accounts WHERE item_id = ?`
  ).all(MANUAL_ITEM_ID) as { account_id: string; name: string; type: string; current_balance: number }[];

  return rows.map(r => {
    const urlRow = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(LISTING_URL_PREFIX + r.account_id) as { value: string } | undefined;
    return { ...r, listing_url: urlRow?.value ?? null };
  });
}

/** Refresh all property values from stored listing URLs (called during daily sync) */
export async function refreshPropertyValues(db: Database): Promise<void> {
  const urls = db.prepare(
    `SELECT key, value FROM settings WHERE key LIKE ?`
  ).all(LISTING_URL_PREFIX + "%") as { key: string; value: string }[];

  for (const { key, value: url } of urls) {
    const id = key.slice(LISTING_URL_PREFIX.length);
    try {
      const val = await scrapeRedfinEstimate(url);
      if (val) {
        db.prepare(`UPDATE accounts SET current_balance = ?, updated_at = datetime('now') WHERE account_id = ?`).run(val, id);
      }
    } catch {
      // Non-fatal
    }
  }
}

/** Check if any listing URLs are configured */
export function hasListingUrls(db: Database): boolean {
  return !!(db.prepare(`SELECT 1 FROM settings WHERE key LIKE ? LIMIT 1`).get(LISTING_URL_PREFIX + "%"));
}
