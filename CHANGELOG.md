# Changelog

## Unreleased

### Added
- `ray import-apple <path>` — import Apple Card transactions from Apple's CSV export. Apple Card isn't supported by Plaid; this creates a manual account, maps Apple's categories to Ray's taxonomy so transactions participate in spending/scoring/budgets, and is safe to re-run monthly via hash-based deduplication (or `--replace-range` for authoritative overwrites of a date window).

### Changed
- `ray remove` now labels institutions by source in its listing — `(1 account, manual)` vs `(2 accounts, linked)` — instead of tagging every non-`manual-assets` institution as "linked". Matters when a manual-imported account (e.g. Apple Card) and a Plaid-linked account share a name.
- `ray import-apple` now applies your configured auto-recategorization rules immediately after a successful import, so Apple Card rows pick up the same categorization you'd get after the next `ray sync`. Dry-run (`--dry-run`) still previews only.
- Internal: extracted the auto-recategorization pass from `runDailySync` into `applyRecategorizationRules(db)` (new module `src/recategorization.ts`); shared by daily sync and Apple Card import.

### Fixed
- `ray import-apple` no longer hides manually-added debts (`ray add … liability`) from `ray status`, debt views, and AI debt advice. `getDebts()` previously returned only `liabilities`-table rows when that table was non-empty; importing Apple Card populated `liabilities` and silently dropped manual car loans / mortgages that live only in `accounts`. Now unions both sources, keyed by `account_id`.
- Auto-recategorization rules now fire for subcategory-only refinements. Previously, a rule like "Starbucks → `FOOD_AND_DRINK_COFFEE`" silently never ran if the transaction was already tagged `FOOD_AND_DRINK` at the top level — the `WHERE category != target_category` guard excluded it. Rules now fire whenever either `category` or `subcategory` differs from the target.
- `categoryLabel()` no longer crashes on null/undefined categories — previously threw `Cannot read properties of null (reading 'split')` when the AI chat tool encountered a transaction with a null category.

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
