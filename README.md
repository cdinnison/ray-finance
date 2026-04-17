<p align="center">
  <img src=".github/ray-logo.png" alt="Ray" width="108" />
</p>

<p align="center">
  An open-source AI financial advisor that learns your situation and gets smarter every conversation.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/ray-finance"><img src="https://img.shields.io/npm/v/ray-finance.svg" alt="npm version" /></a>
  <a href="https://github.com/cdinnison/ray-finance/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://github.com/cdinnison/ray-finance/stargazers"><img src="https://img.shields.io/github/stars/cdinnison/ray-finance.svg?style=social" alt="GitHub stars" /></a>
</p>

<br />

<p align="center">
  <img src=".github/ray-demo.png" alt="Ray demo" width="100%" />
</p>

Tell Ray about your family, goals, and financial strategy once. From then on, every answer is grounded in your real situation — not generic advice. It connects to your bank, tracks your net worth and spending, and gives you a financial briefing before you type a word. Open source. Local-first. Encrypted.

## Features

### It gets smarter every conversation

- **Your situation, always loaded** — Every conversation starts with your financial profile: family, income, goals, strategy, key decisions, and open items. Ray reads it all before you type a word.
- **Self-updating context** — Got a raise? Had a baby? Decided to pay off debt aggressively? Ray updates your profile automatically when your situation changes.
- **Long-term memory** — Mention you're saving for a house or that you cancelled a subscription. Ray remembers across every future conversation.

### Stay on track without trying

- **CFO personality** — Ray doesn't list options. It tells you what it would do and why, references your goals, and flags problems you haven't noticed yet.
- **Daily scoring** — A 0-100 behavior score with streaks and 14 unlockable achievements. No restaurants for a week? That's Kitchen Hero. Five zero-spend days? Monk Mode.
- **Budgets and goals** — Track spending limits by category and progress toward financial goals.
- **Smart alerts** — Large transactions, low balances, budget overruns.

### Your data never leaves your machine

- **Encrypted local database** — All data stays on your machine in an AES-256 encrypted SQLite database.
- **PII masking** — Names, account numbers, and identifying details are scrubbed before anything reaches the AI. Your data is analyzed, not exposed.

### Set it and forget it

- **Bank sync via Plaid** — Connect checking, savings, credit cards, investments, and loans. Supports 🇺🇸 United States, 🇬🇧 United Kingdom, and 🇨🇦 Canada.
- **Scheduled daily sync** — Automatic bank sync via launchd (macOS) or cron (Linux).
- **Auto-recategorization** — Define rules to automatically re-label transactions.
- **Export/import** — Back up and restore your financial data.

## Install

```bash
npm install -g ray-finance
```

## Try It

Explore Ray with realistic fake data — no bank accounts needed.

```bash
ray demo                # seed a demo database
ray --demo status       # financial overview
ray --demo accounts     # linked accounts with balances
ray --demo spending     # spending breakdown by category
ray --demo budgets      # budget tracking
ray --demo goals        # financial goal progress
ray --demo score        # daily score, streaks, achievements
ray --demo alerts       # financial alerts
ray --demo transactions # recent transactions
```

The dashboard commands work with no setup at all. To also try the AI chat with demo data, run `ray setup` first and add an API key (Anthropic, OpenAI, or any OpenAI-compatible provider) — then `ray --demo` will start an interactive session where you can ask questions about the fake portfolio.

When you're ready to connect real accounts, run `ray link`.

## Quick Start

```bash
ray setup
```

The setup wizard offers two modes:

### Pro (quick setup)

We handle the API keys. Your data stays local. $10/mo.

1. Enter your name
2. Get a Ray API key (opens Stripe checkout)
3. Link your accounts — checking, savings, credit cards, investments, loans, mortgage
4. Done — daily sync auto-scheduled at 6am

### Bring your own keys

Bring your own AI and Plaid credentials. Free forever.

1. Pick your AI provider — Anthropic, OpenAI, Ollama (local), or any OpenAI-compatible endpoint
2. Enter your API key and pick a model
3. Enter your Plaid credentials ([get free keys](https://dashboard.plaid.com/signup))
4. Link your accounts — checking, savings, credit cards, investments, loans, mortgage
5. Done

## Commands

Run `ray --help` to see all available commands.

| Command | Description |
|---------|-------------|
| `ray` | Interactive AI chat with your financial advisor |
| `ray demo` | Seed a demo database with realistic fake data |
| `ray --demo <cmd>` | Run any command against demo data |
| `ray setup` | Configure API keys and preferences |
| `ray link` | Connect a new bank account |
| `ray add` | Add a manual account (home, car, crypto, etc.) |
| `ray remove` | Remove a linked bank or manual account |
| `ray sync` | Pull latest transactions and balances |
| `ray status` | Quick financial dashboard |
| `ray accounts` | Linked accounts with balances |
| `ray transactions` | Recent transactions (filterable by category, merchant) |
| `ray spending [period]` | Spending breakdown by category |
| `ray budgets` | Budget status and overruns |
| `ray goals` | Financial goal progress |
| `ray bills` | Upcoming bills |
| `ray recap [period]` | Monthly spending recap |
| `ray score` | Daily score, streaks, and achievements |
| `ray alerts` | Active financial alerts |
| `ray export [path]` | Export data to a backup file |
| `ray import <path>` | Restore from a backup file |
| `ray billing` | Manage your Ray subscription (managed mode only) |
| `ray update` | Update Ray to the latest version |
| `ray doctor` | Check system health |

## How It Works

```
  Checking · Savings · Credit · Investments · Loans · Mortgage
                            │
                        Plaid API
                            │
                 ┌──────────▼──────────┐
                 │   Local SQLite DB    │
                 │  (AES-256 encrypted) │
                 └──────────┬──────────┘
                            │
                 ┌──────────▼──────────┐
                 │      ray CLI         │
                 │  insights · tools   │
                 │  scoring · alerts   │
                 └──────────┬──────────┘
                            │
                       LLM API
                     (PII-masked)
```

Two outbound calls: Plaid (bank sync) and your AI provider (PII-masked). Supports Anthropic, OpenAI, Ollama, and any OpenAI-compatible endpoint. Your financial data is never stored off your machine. No telemetry. No analytics.

## Security & Privacy

- All financial data stored locally in `~/.ray/data/finance.db`
- Database encrypted with AES-256 (SQLCipher)
- Plaid access tokens encrypted at rest with AES-256-GCM
- Config file stored with `0600` permissions
- PII redacted before sending to any AI provider
- No data leaves your machine — only API calls to Plaid and your AI provider

## Configuration

Ray stores everything in `~/.ray/`:

```
~/.ray/
  config.json          # API keys and preferences (0600 permissions)
  context.md           # Persistent financial context for AI
  data/
    finance.db         # Encrypted SQLite database
    demo.db            # Demo database (created by `ray demo`)
  sync.log             # Daily sync output
```

### Environment Variables

You can also configure Ray via environment variables or a `.env` file:

```bash
ANTHROPIC_API_KEY=          # Anthropic API key (if using Anthropic)
OPENAI_COMPATIBLE_KEY=      # API key for OpenAI or compatible provider
OPENAI_COMPATIBLE_BASE_URL= # Base URL (e.g. https://api.openai.com/v1, http://localhost:11434/v1)
RAY_PROVIDER=               # "anthropic" or "openai-compatible"
RAY_MODEL=                  # Model name (e.g. claude-sonnet-4-6, gpt-4o, llama3.1)
PLAID_CLIENT_ID=            # Plaid client ID
PLAID_SECRET=               # Plaid secret key
PLAID_ENV=production        # Plaid environment
DB_ENCRYPTION_KEY=          # Database encryption key
PLAID_TOKEN_SECRET=         # Key for encrypting stored Plaid tokens
RAY_API_KEY=                # Ray API key (managed mode, replaces the above)
```

## Claude Code (MCP)

Ray exposes its 31 tools as an [MCP](https://modelcontextprotocol.io) server over stdio. Any MCP client — Claude Code, Cursor, etc. — can call Ray tools directly.

### Setup

```bash
claude mcp add ray -- ray mcp
```

That's it. Claude Code can now read your accounts, spending, goals, and more.

### Available tools

All tools are prefixed `ray_` (e.g. `ray_get_accounts`, `ray_get_spending_summary`).

**Read tools** (always available): `get_net_worth`, `get_accounts`, `get_transactions`, `get_spending_summary`, `get_budgets`, `get_goals`, `get_score`, `get_recurring`, `get_alerts`, `get_memories`, `get_income`, `search_transactions`, `cash_flow`, `forecast_balance`, `compare_spending`, `get_net_worth_trend`, `get_monthly_savings`, `get_portfolio`, `investment_performance`, `get_debts`, `calculate_debt_payoff`

**Mutation tools** (opt-in): `set_budget`, `delete_budget`, `set_goal`, `delete_goal`, `update_goal_progress`, `categorize_transaction`, `label_transaction`, `add_recat_rule`, `save_memory`, `update_context`

### Enable mutations

Edit `~/.ray/config.json`:

```json
{
  "mcpMutations": true
}
```

Or set `RAY_MCP_MUTATIONS=true` in your environment.

### Example prompts

**Read-only (default):**
- "What's my net worth?"
- "How much did I spend on food this month?"
- "Show me my budget status"

**With mutations enabled:**
- "Set a $500/month grocery budget"
- "Create a goal to save $10k for a vacation by December"

## Roadmap

- [x] Bring your own model — use any LLM provider (OpenAI, Ollama, open-source models, etc.)
- [ ] Daily digest email — morning summary of your finances

Have an idea? [Open a PR](https://github.com/cdinnison/ray-finance/pulls).

## Support

Questions, feedback, or need help getting set up? Email [clark@rayfinance.app](mailto:clark@rayfinance.app) or [open an issue](https://github.com/cdinnison/ray-finance/issues).

## Contributing

```bash
git clone https://github.com/cdinnison/ray-finance.git
cd ray-finance
npm install
npm run build
npm link   # Makes 'ray' available globally
```

PRs welcome. Please open an issue first for large changes.

## License

[MIT](LICENSE)
