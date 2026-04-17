import type BetterSqlite3 from "libsql";
type Database = BetterSqlite3.Database;
import { calculateDailyScore, checkAchievements } from "./scoring/index.js";
import { institutionName } from "./cli/format.js";
import { refreshPropertyValues, hasListingUrls } from "./property.js";
import { getProvider } from "./providers/index.js";
import type { InstitutionRecord, ProviderKey } from "./providers/types.js";

export interface SyncResult {
  transactionsAdded: number;
  institutionsSynced: number;
}

export interface SyncLogger {
  log(...args: any[]): void;
  error(...args: any[]): void;
}

export const SILENT_LOGGER: SyncLogger = { log: () => {}, error: () => {} };

/** Run the daily sync for a single database */
export async function runDailySync(
  db: Database,
  logger: SyncLogger = console,
): Promise<SyncResult> {
  const institutions = db
    .prepare(
      `SELECT item_id, provider, access_token, provider_user_id, provider_state, name, products, cursor, primary_color, logo, created_at
       FROM institutions`,
    )
    .all() as {
      item_id: string;
      provider?: ProviderKey;
      access_token: string;
      provider_user_id: string | null;
      provider_state: string;
      name: string;
      products: string;
      cursor: string | null;
      primary_color: string | null;
      logo: string | null;
      created_at: string | null;
    }[];

  if (institutions.length === 0) {
    logger.log("No linked institutions.");
    return { transactionsAdded: 0, institutionsSynced: 0 };
  }

  let totalAdded = 0;
  let instSynced = 0;

  for (const inst of institutions) {
    if (inst.access_token === "manual") {
      logger.log(`Skipping ${inst.name} (manual entry)`);
      continue;
    }

    const providerKey = inst.provider || "plaid";
    const provider = getProvider(providerKey);

    if (!provider.isConfigured()) {
      logger.error(`  Skipping ${inst.name}: ${provider.missingConfigMessage()}`);
      continue;
    }

    logger.log(`Syncing: ${institutionName(inst.name, inst.primary_color)} (${provider.displayName})`);

    try {
      const result = await provider.syncInstitution(db, inst as InstitutionRecord);
      instSynced += result.synced ? 1 : 0;
      totalAdded += result.transactionsAdded;

      if (result.message) logger.log(`  ${result.message}`);
    } catch (err: any) {
      logger.error(`  Error syncing ${inst.name}: ${err.message}`);
    }
  }

  // Refresh property values from listing URLs if configured
  if (hasListingUrls(db)) {
    try {
      await refreshPropertyValues(db);
    } catch {
      // Non-fatal
    }
  }

  // Snapshot net worth
  const assets = db
    .prepare(
      `SELECT COALESCE(SUM(current_balance), 0) as total FROM accounts WHERE type IN ('depository', 'investment', 'other')`
    )
    .get() as { total: number };
  const liabs = db
    .prepare(
      `SELECT COALESCE(SUM(current_balance), 0) as total FROM accounts WHERE type IN ('credit', 'loan')`
    )
    .get() as { total: number };

  const netWorth = assets.total - liabs.total;
  const today = new Date().toISOString().slice(0, 10);

  db.prepare(
    `INSERT INTO net_worth_history (date, total_assets, total_liabilities, net_worth)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET total_assets=excluded.total_assets, total_liabilities=excluded.total_liabilities, net_worth=excluded.net_worth`
  ).run(today, assets.total, liabs.total, netWorth);

  logger.log(
    `Net worth snapshot: $${netWorth.toLocaleString()} (assets: $${assets.total.toLocaleString()}, liabilities: $${liabs.total.toLocaleString()})`
  );

  // Calculate daily score for yesterday
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dailyScore = calculateDailyScore(db, yesterday);
  logger.log(`  Daily score (${yesterday}): ${dailyScore.score}/100`);

  const newAchievements = checkAchievements(db);
  if (newAchievements.length > 0) {
    for (const a of newAchievements) {
      logger.log(`  Achievement unlocked: ${a.name} — ${a.description}`);
    }
  }

  // Auto-recategorize using rules from recategorization_rules table
  const rules = db.prepare(
    `SELECT match_field, match_pattern, target_category, target_subcategory, label FROM recategorization_rules`
  ).all() as {
    match_field: string;
    match_pattern: string;
    target_category: string;
    target_subcategory: string | null;
    label: string;
  }[];

  let totalRecat = 0;
  for (const rule of rules) {
    // Validate match_field to prevent SQL injection — only allow known column names
    const allowedFields = ["name", "merchant_name", "category", "subcategory"];
    if (!allowedFields.includes(rule.match_field)) {
      logger.error(`  Skipping recat rule with invalid match_field: ${rule.match_field}`);
      continue;
    }

    const result = rule.target_subcategory
      ? db.prepare(
          `UPDATE transactions SET category = ?, subcategory = ? WHERE ${rule.match_field} LIKE ? AND category != ?`
        ).run(rule.target_category, rule.target_subcategory, rule.match_pattern, rule.target_category)
      : db.prepare(
          `UPDATE transactions SET category = ? WHERE ${rule.match_field} LIKE ? AND category != ?`
        ).run(rule.target_category, rule.match_pattern, rule.target_category);

    if (result.changes > 0) {
      logger.log(`  Recategorized ${result.changes} txn(s): ${rule.label || rule.match_pattern}`);
      totalRecat += result.changes;
    }
  }
  if (totalRecat > 0) {
    logger.log(`Auto-recategorized ${totalRecat} transaction(s).`);
  }

  logger.log("Sync complete.");
  return { transactionsAdded: totalAdded, institutionsSynced: instSynced };
}

/** Run daily sync (cron / CLI entry point) */
export async function runDailySyncAll() {
  const { getDb } = await import("./db/connection.js");
  const db = getDb();
  await runDailySync(db);
}
