import type BetterSqlite3 from "libsql";
import type { SyncLogger } from "./daily-sync.js";
type Database = BetterSqlite3.Database;

export interface RecategorizationResult {
  rulesEvaluated: number;
  rulesSkipped: number;
  transactionsUpdated: number;
}

// Only known column names are allowed in `match_field` — the value flows into
// the UPDATE statement via string interpolation (rest of the query is
// parametrized). Anything else is rejected to prevent SQL injection.
const ALLOWED_MATCH_FIELDS = ["name", "merchant_name", "category", "subcategory"];

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
    label: string;
  }[];

  let rulesSkipped = 0;
  let transactionsUpdated = 0;

  for (const rule of rules) {
    if (!ALLOWED_MATCH_FIELDS.includes(rule.match_field)) {
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
    const result = rule.target_subcategory
      ? db.prepare(
          `UPDATE transactions SET category = ?, subcategory = ? WHERE ${rule.match_field} LIKE ? AND (COALESCE(category, '') != ? OR COALESCE(subcategory, '') != ?)`
        ).run(rule.target_category, rule.target_subcategory, rule.match_pattern, rule.target_category, rule.target_subcategory)
      : db.prepare(
          `UPDATE transactions SET category = ?, subcategory = NULL WHERE ${rule.match_field} LIKE ? AND COALESCE(category, '') != ?`
        ).run(rule.target_category, rule.match_pattern, rule.target_category);

    if (result.changes > 0) {
      logger.log(`  Recategorized ${result.changes} txn(s): ${rule.label || rule.match_pattern}`);
      transactionsUpdated += Number(result.changes);
    }
  }

  if (transactionsUpdated > 0) {
    logger.log(`  Auto-recategorized ${transactionsUpdated} transaction(s).`);
  }

  return {
    rulesEvaluated: rules.length,
    rulesSkipped,
    transactionsUpdated,
  };
}
