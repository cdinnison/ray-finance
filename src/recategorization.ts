import type BetterSqlite3 from "libsql";
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
 * its own console output so both callers produce identical per-rule lines
 * and the grand-total summary. Silent when no rules fire.
 */
export function applyRecategorizationRules(db: Database): RecategorizationResult {
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
      console.error(`  Skipping recat rule with invalid match_field: ${rule.match_field}`);
      rulesSkipped++;
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
      console.log(`  Recategorized ${result.changes} txn(s): ${rule.label || rule.match_pattern}`);
      transactionsUpdated += Number(result.changes);
    }
  }

  if (transactionsUpdated > 0) {
    console.log(`Auto-recategorized ${transactionsUpdated} transaction(s).`);
  }

  return {
    rulesEvaluated: rules.length,
    rulesSkipped,
    transactionsUpdated,
  };
}
