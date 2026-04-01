import type BetterSqlite3 from "libsql";
type Database = BetterSqlite3.Database;
import {
  syncTransactions,
  syncBalances,
  syncInvestments,
  syncLiabilities,
  syncRecurring,
  isProductNotSupported,
} from "./plaid/sync.js";
import { calculateDailyScore, checkAchievements } from "./scoring/index.js";
import { decryptPlaidToken } from "./db/encryption.js";
import { config } from "./config.js";

export interface SyncResult {
  transactionsAdded: number;
  institutionsSynced: number;
}

/** Run the daily sync for a single database */
export async function runDailySync(db: Database): Promise<SyncResult> {
  const institutions = db
    .prepare(`SELECT item_id, access_token, name, products, cursor FROM institutions`)
    .all() as {
    item_id: string;
    access_token: string;
    name: string;
    products: string;
    cursor: string | null;
  }[];

  if (institutions.length === 0) {
    console.log("No linked institutions.");
    return { transactionsAdded: 0, institutionsSynced: 0 };
  }

  let totalAdded = 0;
  let instSynced = 0;

  for (const inst of institutions) {
    if (inst.access_token === "manual") {
      console.log(`Skipping ${inst.name} (manual entry)`);
      continue;
    }

    // Decrypt the stored access token
    let accessToken: string;
    try {
      if (!config.plaidTokenSecret) {
        console.error(`  Skipping ${inst.name}: no plaidTokenSecret configured`);
        continue;
      }
      accessToken = decryptPlaidToken(inst.access_token, config.plaidTokenSecret);
    } catch {
      console.error(`  Skipping ${inst.name}: failed to decrypt access token (wrong key or corrupt data)`);
      continue;
    }

    const products: string[] = JSON.parse(inst.products);
    console.log(`Syncing: ${inst.name} (${products.join(", ")})`);

    try {
      instSynced++;

      // Always sync balances
      const accountCount = await syncBalances(db, accessToken);
      console.log(`  Accounts: ${accountCount}`);

      // Sync transactions if available
      if (products.includes("transactions")) {
        const txResult = await syncTransactions(
          db,
          inst.item_id,
          accessToken,
          inst.cursor
        );
        totalAdded += txResult.added;
        console.log(
          `  Transactions: +${txResult.added} ~${txResult.modified} -${txResult.removed}`
        );
      }

      // Sync investments
      try {
        const invResult = await syncInvestments(db, accessToken);
        console.log(
          `  Investments: ${invResult.holdings} holdings, ${invResult.securities} securities`
        );
      } catch (e) {
        if (!isProductNotSupported(e)) console.error(`  Investments error: ${(e as Error).message}`);
      }

      // Sync liabilities
      try {
        await syncLiabilities(db, accessToken);
        console.log(`  Liabilities: synced`);
      } catch (e) {
        if (!isProductNotSupported(e)) console.error(`  Liabilities error: ${(e as Error).message}`);
      }

      // Sync recurring transaction streams
      if (products.includes("transactions")) {
        try {
          const recResult = await syncRecurring(db, accessToken);
          console.log(`  Recurring: ${recResult.outflows} outflows, ${recResult.inflows} inflows`);
        } catch (e) {
          if (!isProductNotSupported(e)) console.error(`  Recurring error: ${(e as Error).message}`);
        }
      }
    } catch (err: any) {
      console.error(`  Error syncing ${inst.name}: ${err.message}`);
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

  console.log(
    `Net worth snapshot: $${netWorth.toLocaleString()} (assets: $${assets.total.toLocaleString()}, liabilities: $${liabs.total.toLocaleString()})`
  );

  // Calculate daily score for yesterday
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dailyScore = calculateDailyScore(db, yesterday);
  console.log(`  Daily score (${yesterday}): ${dailyScore.score}/100`);

  const newAchievements = checkAchievements(db);
  if (newAchievements.length > 0) {
    for (const a of newAchievements) {
      console.log(`  Achievement unlocked: ${a.name} — ${a.description}`);
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
      console.error(`  Skipping recat rule with invalid match_field: ${rule.match_field}`);
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
      console.log(`  Recategorized ${result.changes} txn(s): ${rule.label}`);
      totalRecat += result.changes;
    }
  }
  if (totalRecat > 0) {
    console.log(`Auto-recategorized ${totalRecat} transaction(s).`);
  }

  console.log("Sync complete.");
  return { transactionsAdded: totalAdded, institutionsSynced: instSynced };
}

/** Run daily sync (cron / CLI entry point) */
export async function runDailySyncAll() {
  const { getDb } = await import("./db/connection.js");
  const db = getDb();
  await runDailySync(db);
}
