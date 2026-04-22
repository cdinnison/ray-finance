import type BetterSqlite3 from "libsql";
import type { SyncLogger } from "./daily-sync.js";
import { escapeLikePattern } from "./queries/index.js";
type Database = BetterSqlite3.Database;

export interface RecategorizationResult {
  rulesEvaluated: number;
  rulesSkipped: number;
  transactionsUpdated: number;
  /**
   * Earliest date (YYYY-MM-DD) among transactions this run actually updated,
   * or null when no rows were updated. Callers (runImportApple,
   * runDailySync) use this to widen their daily_scores rescore window so
   * older transactions that newly matched a rule get their scored days
   * refreshed — without this, a rule that newly matches transactions
   * predating the CSV range leaves stale daily_scores rows for the old
   * dates.
   */
  earliestAffectedDate: string | null;
}

// Only known column names are allowed in `match_field` — the value flows into
// the UPDATE statement via string interpolation (rest of the query is
// parametrized). The map deliberately uses explicit literal SQL column strings
// rather than passing `rule.match_field` through, so a malformed DB row or a
// future contributor widening the allowlist cannot introduce SQL injection:
// the value interpolated into the query is always one of these hand-written
// string constants. Do NOT add entries that forward arbitrary input.
const MATCH_FIELD_SQL: Record<string, string> = {
  name: "name",
  merchant_name: "merchant_name",
  category: "category",
  subcategory: "subcategory",
} as const;

/**
 * Apply every row in `recategorization_rules` as an UPDATE against
 * `transactions`. Called from both `runDailySync` and `runImportApple`; owns
 * its own log output so both callers produce identical per-rule lines and the
 * grand-total summary. Emits a per-rule logger.error for any rule with an
 * invalid match_field; otherwise silent when no rules match a transaction.
 * Accepts an optional SyncLogger so background sync under Ink can route
 * output away from stdout.
 */
export function applyRecategorizationRules(db: Database, logger: SyncLogger = console): RecategorizationResult {
  const rules = db.prepare(
    `SELECT match_field, match_pattern, target_category, target_subcategory, label FROM recategorization_rules`
  ).all() as {
    match_field: string;
    match_pattern: string;
    target_category: string;
    target_subcategory: string | null;
    label: string | null;
  }[];

  let rulesSkipped = 0;
  let transactionsUpdated = 0;
  // Track the earliest date among rows this run actually updated so
  // runImportApple's backfill window can widen to cover older transactions
  // that newly matched a rule. Accumulated across all rules; stays null
  // when nothing matched.
  let earliestAffectedDate: string | null = null;

  // Atomicity: either all rules apply or none apply per run. Without this
  // wrapper, each UPDATE autocommits, so a mid-loop throw (SQLITE_BUSY, disk
  // error, a future contributor widening MATCH_FIELD_SQL with a typo) would
  // leave rules 0..N-1 persisted while the caller surfaces "post-import steps
  // failed". Matches the db.transaction idiom at property.ts:76 and
  // apple-import.ts:566.
  //
  // Nested-call safety: libsql's db.transaction() issues raw BEGIN/COMMIT
  // (not SAVEPOINT) so it cannot nest. When a caller has already opened a
  // transaction (runImportApple's post-import wrap, runDailySync's tail
  // wrap), we inherit that outer transaction's atomicity by running the loop
  // directly instead of opening an inner one. db.inTransaction is the exact
  // discriminator libsql exposes for this.
  const runLoop = () => {
    for (const rule of rules) {
      const col = MATCH_FIELD_SQL[rule.match_field];
      if (!col) {
        logger.error(`  Skipping recat rule with invalid match_field: ${rule.match_field}`);
        rulesSkipped++;
        continue;
      }

      // Guard fires whenever the row isn't "already at target". COALESCE is
      // load-bearing on any nullable field we compare with `!=`: plain `!=`
      // against NULL yields NULL (falsy in SQLite three-valued logic) and
      // would silently exclude rows whose category or subcategory is NULL.
      // Apple imports produce such rows for "Other" and any unmapped Apple
      // category.
      //
      // target_subcategory semantics:
      //   - non-NULL: force (category, subcategory) to (target_category,
      //     target_subcategory). Row matches when either column diverges.
      //   - NULL ("unspecified"): leave subcategory alone UNLESS category is
      //     actually changing, in which case we reset subcategory so a stale
      //     child doesn't follow the row into its new parent (e.g. an
      //     "Amazon -> GENERAL_MERCHANDISE" rule on a row tagged
      //     FOOD_AND_DRINK / FOOD_AND_DRINK_GROCERIES should not keep the
      //     grocery subcategory). This matches the "leave alone when
      //     unspecified" convention used by the single-txn recat path in
      //     src/ai/tools.ts and the AI-tool schema hint.
      //
      // Capture MIN(date) of rows this rule WILL update BEFORE the UPDATE
      // runs — after the UPDATE those rows already match the target and
      // are no longer in the candidate set. Callers (runImportApple) use
      // the aggregated earliest date to widen their rescore window so
      // daily_scores for old transactions that newly matched a rule get
      // refreshed.
      //
      // Escape LIKE wildcards (%/_/\\) in rule.match_pattern, wrap the
      // escaped substring in %..%, and append ESCAPE '\\' to every LIKE
      // clause. Without escaping, a malicious or mistaken rule whose
      // match_pattern is `%` (or contains `%`/`_`) mass-recategorizes the
      // whole database — add_recat_rule validates match_field but not
      // match_pattern, so this is the authoritative defense. Matches the
      // convention used everywhere else LIKE runs against user-supplied
      // input (queries/index.ts: getTransactionsFiltered merchant filter,
      // searchTransactions query).
      //
      // Semantic change vs. pre-F024: match_pattern is now a LITERAL
      // substring (add_recat_rule schema description matches). Existing
      // user rules that explicitly included %..% wrappers are escaped and
      // wrapped by the engine, so they become "match literal %..%" — which
      // won't fire on any real transaction name. Callers MUST drop any
      // explicit %..% wrapping from stored rule patterns.
      const likePattern = `%${escapeLikePattern(rule.match_pattern)}%`;
      const minSql = rule.target_subcategory
        ? `SELECT MIN(date) as d FROM transactions WHERE ${col} LIKE ? ESCAPE '\\' AND (COALESCE(category, '') != ? OR COALESCE(subcategory, '') != ?)`
        : `SELECT MIN(date) as d FROM transactions WHERE ${col} LIKE ? ESCAPE '\\' AND COALESCE(category, '') != ?`;
      const minRow = rule.target_subcategory
        ? (db.prepare(minSql).get(likePattern, rule.target_category, rule.target_subcategory) as { d: string | null })
        : (db.prepare(minSql).get(likePattern, rule.target_category) as { d: string | null });

      const result = rule.target_subcategory
        ? db.prepare(
            `UPDATE transactions SET category = ?, subcategory = ? WHERE ${col} LIKE ? ESCAPE '\\' AND (COALESCE(category, '') != ? OR COALESCE(subcategory, '') != ?)`
          ).run(rule.target_category, rule.target_subcategory, likePattern, rule.target_category, rule.target_subcategory)
        : db.prepare(
            `UPDATE transactions SET category = ?, subcategory = NULL WHERE ${col} LIKE ? ESCAPE '\\' AND COALESCE(category, '') != ?`
          ).run(rule.target_category, likePattern, rule.target_category);

      if (result.changes > 0) {
        logger.log(`  Recategorized ${result.changes} txn(s): ${rule.label || rule.match_pattern}`);
        transactionsUpdated += Number(result.changes);
        if (minRow.d !== null && (earliestAffectedDate === null || minRow.d < earliestAffectedDate)) {
          earliestAffectedDate = minRow.d;
        }
      }
    }
  };

  if (db.inTransaction) {
    runLoop();
  } else {
    const work = db.transaction(runLoop);
    work();
  }

  if (transactionsUpdated > 0) {
    logger.log(`  Auto-recategorized ${transactionsUpdated} transaction(s).`);
  }

  return {
    rulesEvaluated: rules.length,
    rulesSkipped,
    transactionsUpdated,
    earliestAffectedDate,
  };
}
