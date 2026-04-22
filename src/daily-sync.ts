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
  // Partial-failure signals: populated when the post-sync derivation tail
  // (net-worth snapshot + recat + backfill + yesterday's score) or the
  // achievement check threw. Per-institution transaction pulls commit
  // independently above, so we don't rethrow from runDailySync — but callers
  // need a way to distinguish "sync finished cleanly" from "transactions
  // landed but derived state may be stale" so the spinner/UX can warn
  // instead of falsely reporting success. See src/cli/commands.ts:runSync
  // and src/cli/setup.ts for the branch, mirrored on runImportApple.
  derivationError?: string;
  achievementError?: string;
}

export interface SyncLogger {
  log(...args: any[]): void;
  error(...args: any[]): void;
}

export const SILENT_LOGGER: SyncLogger = { log: () => {}, error: () => {} };

/**
 * Snapshot today's net worth into net_worth_history.
 *
 * Computes assets - liabilities across all accounts and upserts a row for
 * today. Idempotent per-date (ON CONFLICT UPSERT), so safe to call from
 * multiple entry points (ray sync, ray import-apple, etc.) on the same day.
 *
 * Returns the computed totals for callers that want to display them.
 */
export function snapshotNetWorth(db: Database): { assets: number; liabilities: number; netWorth: number } {
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

  return { assets: assets.total, liabilities: liabs.total, netWorth };
}

/** Run the daily sync for a single database */
export async function runDailySync(
  db: Database,
  logger: SyncLogger = console,
): Promise<SyncResult> {
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

    // Decrypt the stored access token
    let accessToken: string;
    try {
      if (!config.plaidTokenSecret) {
        logger.error(`  Skipping ${inst.name}: no plaidTokenSecret configured`);
        continue;
      }
      accessToken = decryptPlaidToken(inst.access_token, config.plaidTokenSecret);
    } catch {
      logger.error(`  Skipping ${inst.name}: failed to decrypt access token (wrong key or corrupt data)`);
      continue;
    }

    let products: string[] = JSON.parse(inst.products);

    // Refresh products list from Plaid if needed
    try {
      products = await refreshProducts(db, inst.item_id, accessToken);
    } catch {
      // Non-fatal — use stored products
    }

    logger.log(`Syncing: ${institutionName(inst.name, inst.primary_color)} (${products.join(", ")})`);

    try {
      instSynced++;

      // Always sync balances
      const accountCount = await syncBalances(db, accessToken);
      logger.log(`  Accounts: ${accountCount}`);

      // Sync transactions if available
      if (products.includes("transactions")) {
        const txResult = await syncTransactions(
          db,
          inst.item_id,
          accessToken,
          inst.cursor
        );
        totalAdded += txResult.added;
        logger.log(
          `  Transactions: +${txResult.added} ~${txResult.modified} -${txResult.removed}`
        );
      }

      // Sync investments
      if (products.includes("investments")) {
        try {
          const invResult = await syncInvestments(db, accessToken);
          logger.log(
            `  Investments: ${invResult.holdings} holdings, ${invResult.securities} securities`
          );
        } catch (e) {
          if (!isProductNotSupported(e)) logger.error(`  Investments error: ${(e as Error).message}`);
        }

        try {
          const invTxResult = await syncInvestmentTransactions(db, accessToken);
          logger.log(`  Investment transactions: ${invTxResult.transactions}`);
        } catch (e) {
          if (!isProductNotSupported(e)) logger.error(`  Investment transactions error: ${(e as Error).message}`);
        }
      }

      // Sync liabilities
      if (products.includes("liabilities")) {
        try {
          await syncLiabilities(db, accessToken);
          logger.log(`  Liabilities: synced`);
        } catch (e) {
          if (!isProductNotSupported(e)) logger.error(`  Liabilities error: ${(e as Error).message}`);
        }
      }

      // Sync recurring transaction streams
      if (products.includes("transactions")) {
        try {
          const recResult = await syncRecurring(db, accessToken);
          logger.log(`  Recurring: ${recResult.outflows} outflows, ${recResult.inflows} inflows`);
        } catch (e) {
          if (!isProductNotSupported(e)) logger.error(`  Recurring error: ${(e as Error).message}`);
        }
      }
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

  // Atomicity: wrap the derivation tail (net-worth snapshot + recat +
  // backfill + yesterday's score) in a single db.transaction so a mid-loop
  // failure (e.g. calculateDailyScore throwing on a long backfill after a
  // gap) rolls back the whole derivation rather than leaving partial
  // daily_scores rows + a stale net-worth snapshot behind. The throw is
  // caught at the call site and degraded to logger.error so runSync's
  // catch doesn't mispresent a successful Plaid pull (transactions already
  // committed per-institution above) as "Sync failed" just because the
  // tail failed. Matches the cleanupDerivedAfterRemove pattern in
  // cli/commands.ts and the post-import wrap in runImportApple.
  const work = db.transaction(() => {
    // Snapshot net worth
    const { assets, liabilities, netWorth } = snapshotNetWorth(db);
    logger.log(
      `Net worth snapshot: $${netWorth.toLocaleString()} (assets: $${assets.toLocaleString()}, liabilities: $${liabilities.toLocaleString()})`
    );

    // Apply user-configured recat rules BEFORE computing yesterday's score (and
    // any backfilled days) — the score reads category/subcategory directly from
    // transactions, so rules the user cares about (e.g. Amazon -> ONLINE_SHOPPING)
    // should shape the score they see on the same day the sync ran, not the
    // following day's.
    const recat = applyRecategorizationRules(db, logger);

    // Calculate daily score for yesterday. Also backfill any un-scored calendar
    // days between the newest daily_scores row and yesterday so a single skipped
    // sync cannot permanently break streak chains — calculateDailyScore only
    // chains from the immediately prior calendar day, so resumption after a gap
    // without backfill would silently reset every streak to 1.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const newestScored = db
      .prepare(`SELECT MAX(date) as date FROM daily_scores`)
      .get() as { date: string | null };
    const backfillDates: string[] = [];
    if (newestScored.date && newestScored.date < yesterday) {
      // Start the day after the newest scored row; stop before yesterday (which
      // is scored below unconditionally).
      let cursor = new Date(new Date(newestScored.date).getTime() + 24 * 60 * 60 * 1000);
      const yesterdayMs = new Date(yesterday).getTime();
      while (cursor.getTime() < yesterdayMs) {
        backfillDates.push(cursor.toISOString().slice(0, 10));
        cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
      }
    }

    // If the recat pass newly updated transactions dated BEFORE the gap-backfill
    // range (a rule the user added mid-life that happened to also match older
    // transactions already sitting in the DB), widen the rescore to cover those
    // older dates too. Otherwise their existing daily_scores rows survive stale
    // with the pre-recat category breakdown. Mirrors the widening runImportApple
    // applies at cli/commands.ts — F034 "fix the class, not the instance".
    //
    // Lower bound is clamped against MIN(transactions.date) so the widening
    // can't synthesize daily_scores for dates before any recorded activity.
    // calculateDailyScore's hasPriorActivity guard (scoring/index.ts, ±30-day
    // window) no-ops on far-before-firstTxn dates, but its +1-day lookahead
    // still inserts a zero-context row for the day immediately before
    // firstTxn — the clamp prevents that and keeps the "recat-widened" log
    // output honest.
    const widenedDates: string[] = [];
    if (recat.earliestAffectedDate !== null) {
      // The rescore range the code below already covers starts at the day
      // after newestScored (if any scored rows exist) and runs through
      // yesterday; when no scored rows exist, only yesterday is scored.
      // Cap at yesterday so the widened loop doesn't double-score yesterday
      // (the unconditional calculateDailyScore(db, yesterday) call below
      // re-scores it anyway; daily_scores PK-UPSERT makes that idempotent,
      // but a duplicate logger.log line would be noisy).
      const gapStart = newestScored.date
        ? new Date(new Date(newestScored.date).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        : yesterday;
      const currentStart = gapStart < yesterday ? gapStart : yesterday;
      if (recat.earliestAffectedDate < currentStart) {
        const firstTxn = db.prepare(`SELECT MIN(date) as d FROM transactions`).get() as { d: string | null };
        // Clamp against MIN(transactions.date). If transactions is empty,
        // recat.earliestAffectedDate couldn't be non-null in the first place
        // (nothing to update), so this guard is defensive.
        if (firstTxn.d != null) {
          const widenStart =
            recat.earliestAffectedDate > firstTxn.d ? recat.earliestAffectedDate : firstTxn.d;
          if (widenStart < currentStart) {
            let cursor = new Date(widenStart);
            const stopMs = new Date(currentStart).getTime();
            while (cursor.getTime() < stopMs) {
              widenedDates.push(cursor.toISOString().slice(0, 10));
              cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
            }
          }
        }
      }
    }

    for (const d of widenedDates) {
      const score = calculateDailyScore(db, d);
      logger.log(`  Daily score (${d}, recat-widened): ${score.score}/100`);
    }
    for (const d of backfillDates) {
      const score = calculateDailyScore(db, d);
      logger.log(`  Daily score (${d}, backfilled): ${score.score}/100`);
    }
    const dailyScore = calculateDailyScore(db, yesterday);
    logger.log(`  Daily score (${yesterday}): ${dailyScore.score}/100`);
  });
  let derivationError: string | undefined;
  let achievementError: string | undefined;

  try {
    work();
  } catch (err: any) {
    // Transactions were still pulled and saved to the DB by the per-institution
    // loop above — those commits ran independently of this derivation tail.
    // Degrade to logger.error so runSync's outer catch doesn't convert a
    // post-sync derivation failure into a "Sync failed" + process.exit(1)
    // that falsely implies the Plaid pull itself failed. Surface the message
    // via SyncResult.derivationError so callers can warn on a half-synced
    // state instead of reporting "Sync complete." unconditionally.
    derivationError = (err && err.message) || String(err);
    logger.error(`Post-sync derivation failed: ${derivationError}`);
    logger.error(`  (Transactions were still pulled and saved.)`);
  }

  // checkAchievements is non-fatal bonus output — keep it OUTSIDE the
  // transaction above so a throw here neither silently commits nor
  // spuriously rolls back the derivation. A failed achievement check must
  // not make "Sync complete." look like "Sync failed" to runSync's catch.
  try {
    const newAchievements = checkAchievements(db);
    if (newAchievements.length > 0) {
      for (const a of newAchievements) {
        logger.log(`  Achievement unlocked: ${a.name} — ${a.description}`);
      }
    }
  } catch (err: any) {
    achievementError = (err && err.message) || String(err);
    logger.error(`  Achievement check failed: ${achievementError}`);
  }

  // Explicit success/partial-failure signal in the logs so the success path
  // is distinguishable from "never ran" — callers branch on the returned
  // derivationError/achievementError for UX (spinner.warn vs spinner.succeed).
  if (derivationError || achievementError) {
    logger.log("Sync complete (with post-sync warnings).");
  } else {
    logger.log("Sync complete.");
  }
  return {
    transactionsAdded: totalAdded,
    institutionsSynced: instSynced,
    derivationError,
    achievementError,
  };
}

/** Run daily sync (cron / CLI entry point) */
export async function runDailySyncAll() {
  const { getDb } = await import("./db/connection.js");
  const db = getDb();
  await runDailySync(db);
}
