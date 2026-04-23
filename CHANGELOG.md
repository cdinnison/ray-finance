# Changelog

## 0.5.0

- **AI can now scope questions to an account.** "What's my biggest expense in Free to Spend?" works — previously the AI had no way to filter transactions by account name.
- **Transaction filters in AI chat:** label/note (find anything you tagged "tax-deductible"), account name, and pending.
- **Spending summary by account or merchant** — break down "where did the Bills account money go" by category.
- **Credit utilization** surfaced when you list accounts (e.g. "15% of $5,000 limit").
- **New AI tools:** `get_achievements` (list unlocks), `get_score_trend` (daily score history), `get_investment_transactions` (buy/sell activity), `list_recat_rules` + `delete_recat_rule` (audit and remove auto-recategorization rules).
- **Recurring now merges manual bills** alongside Plaid-detected streams — previously manually-added bills were invisible to the AI.

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
