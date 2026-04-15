import type BetterSqlite3 from "libsql";
type Database = BetterSqlite3.Database;
import {
  syncTransactions,
  syncBalances,
  syncInvestments,
  syncInvestmentTransactions,
  syncLiabilities,
  syncRecurring,
  isProductNotSupported,
  refreshProducts,
} from "./plaid/sync.js";
import { calculateDailyScore, checkAchievements } from "./scoring/index.js";
import { applyRecategorizationRules } from "./recategorization.js";
import { decryptPlaidToken } from "./db/encryption.js";
import { config } from "./config.js";
import { institutionName } from "./cli/format.js";
import { refreshPropertyValues, hasListingUrls } from "./property.js";

export interface SyncResult {
  transactionsAdded: number;
  institutionsSynced: number;
}

/** Run the daily sync for a single database */
export async function runDailySync(db: Database): Promise<SyncResult> {
  const institutions = db
    .prepare(`SELECT item_id, access_token, name, products, cursor, primary_color FROM institutions`)
    .all() as {
    item_id: string;
    access_token: string;
    name: string;
    products: string;
    cursor: string | null;
    primary_color: string | null;
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

    let products: string[] = JSON.parse(inst.products);

    // Refresh products list from Plaid if needed
    try {
      products = await refreshProducts(db, inst.item_id, accessToken);
    } catch {
      // Non-fatal — use stored products
    }

    console.log(`Syncing: ${institutionName(inst.name, inst.primary_color)} (${products.join(", ")})`);

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
      if (products.includes("investments")) {
        try {
          const invResult = await syncInvestments(db, accessToken);
          console.log(
            `  Investments: ${invResult.holdings} holdings, ${invResult.securities} securities`
          );
        } catch (e) {
          if (!isProductNotSupported(e)) console.error(`  Investments error: ${(e as Error).message}`);
        }

        try {
          const invTxResult = await syncInvestmentTransactions(db, accessToken);
          console.log(`  Investment transactions: ${invTxResult.transactions}`);
        } catch (e) {
          if (!isProductNotSupported(e)) console.error(`  Investment transactions error: ${(e as Error).message}`);
        }
      }

      // Sync liabilities
      if (products.includes("liabilities")) {
        try {
          await syncLiabilities(db, accessToken);
          console.log(`  Liabilities: synced`);
        } catch (e) {
          if (!isProductNotSupported(e)) console.error(`  Liabilities error: ${(e as Error).message}`);
        }
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

  console.log(
    `Net worth snapshot: $${netWorth.toLocaleString()} (assets: $${assets.total.toLocaleString()}, liabilities: $${liabs.total.toLocaleString()})`
  );

  // Apply user-configured recat rules BEFORE computing today's score — the
  // score reads category/subcategory directly from transactions, so rules
  // that the user cares about (e.g. Amazon -> ONLINE_SHOPPING) should shape
  // the score they see on the same day the sync ran, not tomorrow's.
  applyRecategorizationRules(db);

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

  console.log("Sync complete.");
  return { transactionsAdded: totalAdded, institutionsSynced: instSynced };
}

/** Run daily sync (cron / CLI entry point) */
export async function runDailySyncAll() {
  const { getDb } = await import("./db/connection.js");
  const db = getDb();
  await runDailySync(db);
}
