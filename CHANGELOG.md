# Changelog

## Unreleased

### Added
- `ray import-apple <path>` — import Apple Card transactions from Apple's CSV export. Apple Card isn't supported by Plaid; this creates a manual account, maps Apple's categories to Ray's taxonomy so transactions participate in spending/scoring/budgets, and is safe to re-run monthly via hash-based deduplication (or `--replace-range` for authoritative overwrites of a date window).

### Changed
- `ray import-apple` now stores Apple `Payment` rows as `LOAN_PAYMENTS`, matching Plaid's shape for credit-card payments (was `TRANSFER_IN` as a workaround for a pre-existing income-query bug). The root bug was fixed upstream in #12 — `INCOME_EXCLUDED_CATEGORIES` now covers `LOAN_PAYMENTS` everywhere, so Apple and Plaid both flow through the same code path with no special-casing. Users who already imported Apple CSVs on the prior branch should re-run `ray import-apple --replace-range <start> <end>` to rewrite those rows. Per-category displays will now show Apple Card payments under "Loan Payments" instead of "Transfer In" — more accurate, not a regression.
- `ray remove` now labels institutions by source in its listing — `(1 account, manual)` vs `(2 accounts, linked)` — instead of tagging every non-`manual-assets` institution as "linked". Matters when a manual-imported account (e.g. Apple Card) and a Plaid-linked account share a name.
- `ray import-apple` now applies your configured auto-recategorization rules immediately after a successful import, so Apple Card rows pick up the same categorization you'd get after the next `ray sync`. Dry-run (`--dry-run`) still previews only.
- Internal: extracted the auto-recategorization pass from `runDailySync` into `applyRecategorizationRules(db)` (new module `src/recategorization.ts`); shared by daily sync and Apple Card import.
- Internal: Debt Crusher achievement reverted to its pre-Apple query (`category != 'TRANSFER_IN'` on credit accounts), now that Apple payments land in `LOAN_PAYMENTS` alongside Plaid. Removes the label-based compensator that was added when Apple payments were remapped to `TRANSFER_IN`.
- Streak chaining (`no_restaurant_streak`, `no_shopping_streak`, `on_pace_streak`) now requires the most recent prior `daily_scores` row to be from the immediately preceding calendar day; any gap resets the streak to 1. Previously the prev-row lookup used `WHERE date < ? ORDER BY date DESC LIMIT 1`, which silently chained across multi-month gaps (e.g. a Dec 31 row with streak=7 would make the next scored day report streak=8 months later). To keep a single skipped sync from permanently breaking streaks, `ray sync` now backfills `daily_scores` for any un-scored calendar days between the newest scored row and yesterday before scoring yesterday itself.

### Fixed
- `ray import-apple` no longer hides manually-added debts (`ray add … liability`) from `ray status`, debt views, and AI debt advice. `getDebts()` previously returned only `liabilities`-table rows when that table was non-empty; importing Apple Card populated `liabilities` and silently dropped manual car loans / mortgages that live only in `accounts`. Now unions both sources, keyed by `account_id`.
- `ray import-apple` now computes a daily score and checks achievements after a successful import, matching what `ray sync` does. Previously `ray status` / `ray score` showed no score data for Apple-only users (no Plaid institutions), because scoring was only wired into `runDailySync` which short-circuits on zero institutions.
- Auto-recategorization rules now fire for subcategory-only refinements. Previously, a rule like "Starbucks → `FOOD_AND_DRINK_COFFEE`" silently never ran if the transaction was already tagged `FOOD_AND_DRINK` at the top level — the `WHERE category != target_category` guard excluded it. Rules now fire whenever either `category` or `subcategory` differs from the target.
- Auto-recategorization rules with no `target_subcategory` now clear any stale subcategory on matched rows (e.g. a rule "Amazon → `GENERAL_MERCHANDISE`" applied to a row tagged `FOOD_AND_DRINK / FOOD_AND_DRINK_GROCERIES` now produces `GENERAL_MERCHANDISE / NULL`, not the inconsistent pair `GENERAL_MERCHANDISE / FOOD_AND_DRINK_GROCERIES`).
- Auto-recategorization rules now fire on rows with a NULL `category` (Apple Card's `Other` and any unmapped Apple category produce these). The `WHERE` guard wasn't null-safe — `NULL != target_category` yields NULL (falsy in SQLite's three-valued logic), silently excluding truly-uncategorized rows. Fixed with `COALESCE(category, '')`.
- `ray sync` now applies auto-recategorization rules *before* computing today's daily score, so a rule like "Amazon → `GENERAL_MERCHANDISE_ONLINE`" influences the same-day `shopping_count` and scoring. Previously the score reflected pre-rule categories and wouldn't catch up until the next sync. The score result is unchanged for users with no rules. Aligns `ray sync` with `ray import-apple`, which was already recat-first.
- `ray score` and the AI's `get_score` tool now suggest `ray import-apple` alongside `ray sync` when no daily scores exist yet. Previously both only mentioned `ray sync`, which is stale guidance for Apple-only users.
- `ray import-apple` now backfills daily scores across the full imported date range instead of scoring only yesterday. Streaks (no-restaurant, no-shopping, on-pace) now accumulate properly and streak-based achievements (Kitchen Hero, Detoxed, etc.) can unlock on first import. Previously, scoring one day produced streak=1 regardless of how many consecutive streak-qualifying days the CSV contained.
- `--replace-range` now covers the full CSV date window even when a boundary row has too few columns. Previously the delete window narrowed when the first or last row was malformed, leaving stale previously-imported rows at that boundary date.
- `ray accounts` heading changed from "Linked Accounts" to "Accounts" and empty state now mentions `ray add` and `ray import-apple` alongside `ray link`.
- `ray import` (backup restore) no longer silently drops recategorization rules that differ only by `target_subcategory`. The duplicate check now includes the subcategory with NULL-safe comparison.
- `getDebts()` no longer drops Plaid-synced mortgages and student loans from debt views. These liability types store `current_balance = NULL` in the `liabilities` table (actual balance is in `accounts`); the recent getDebts union fix filtered `WHERE l.current_balance > 0`, excluding them. Now uses `COALESCE(l.current_balance, a.current_balance)`.
- `categoryLabel()` no longer crashes on null/undefined categories — previously threw `Cannot read properties of null (reading 'split')` when the AI chat tool encountered a transaction with a null category.

### Known limitations
- Apple Card statements do not yet appear in `ray bills`. The bills view reads `liabilities.next_payment_due` + `minimum_payment`, which `ray import-apple` doesn't populate (Apple's CSV doesn't include statement schedule data). Follow-up: add optional `--due-day` / `--min-payment` flags to the import command.

## 0.4.0

- **Bring your own model** — use any AI provider: Anthropic (Claude), OpenAI (GPT), Ollama (local), or any OpenAI-compatible endpoint (DeepSeek, Groq, vLLM, etc.). Model list fetched from models.dev during setup.
- Setup flow improvements: provider picker, dynamic model list, masked key input, skip re-linking on reconfigure
- Max tool step guard (10 iterations) to prevent runaway loops
- Dashboard colors updated from red to amber

## 0.2.0

Initial open source release.

- CLI interface with 13 commands (`ray`, `setup`, `sync`, `link`, `status`, `transactions`, `spending`, `budgets`, `goals`, `score`, `alerts`, `export`, `import`)
- AI financial advisor powered by Claude with 13+ tools
- Plaid integration for bank sync (checking, savings, credit cards, investments, loans)
- Encrypted local SQLite database (AES-256)
- Daily financial scoring (0-100) with streaks and 14 achievements
- Budget tracking with overage alerts
- Financial goal tracking
- Transaction auto-recategorization via user-defined rules
- Conversation memory and persistent financial context
- Data export/import for backup and restore
