<p align="center">
  <img src=".github/ray-logo.png" alt="Ray" width="120" />
</p>

<p align="center">
  An open-source CLI that connects to your bank and already knows your finances before you ask.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/ray-finance"><img src="https://img.shields.io/npm/v/ray-finance.svg" alt="npm version" /></a>
  <a href="https://github.com/cdinnison/ray-finance/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://github.com/cdinnison/ray-finance/stargazers"><img src="https://img.shields.io/github/stars/cdinnison/ray-finance.svg?style=social" alt="GitHub stars" /></a>
</p>

<br />

```
  Friday, Mar 28

  net worth  $45,230 +$120

  spending   $2,340 this month · $340 less vs last month
             Dining -$114  ·  Shopping -$142  ·  Groceries -$73

  ▓▓▓▓▓▓▓░  Dining 92%

  ▓▓▓▓░░░░  Emergency fund $18,200/$40,000

  upcoming   Netflix $16 in 3d  ·  Comcast $142 in 6d

  score      72/100  ·  5d no dining  ·  3d on pace

  ──────────────────────────────────────────────────

  ❯ if I quit my job to freelance, how long can I survive?

  Based on your last 3 months: you burn $4,820/mo after
  fixed costs. With $18,200 in savings, that's
  3.8 months of runway at current spend.

  Cut dining and shopping to last-month levels and
  you stretch to 5.1 months. Land one $8k contract
  in that window and you never dip below $10k.
```

Open Ray and it shows your net worth, spending vs last month, budget pacing, and upcoming bills — before you type a word. Ask a question and it answers from your real data, not guesses. Local-first. Encrypted. Open source.

## Features

- **It already knows** — Every conversation starts with a real-time financial briefing. Net worth, spending velocity, budget alerts, goal pace, upcoming bills, and your daily score. No "let me look that up."
- **Bank sync via Plaid** — Connect checking, savings, credit cards, investments, and loans
- **Encrypted local database** — All data stays on your machine in an AES-256 encrypted SQLite database
- **Daily scoring** — A 0-100 behavior score with streaks and 14 unlockable achievements. No restaurants for a week? That's Kitchen Hero. Five zero-spend days? Monk Mode.
- **CFO personality** — Ray doesn't list options. It tells you what it would do and why, references your goals, and flags problems you haven't noticed yet.
- **Budgets and goals** — Track spending limits by category and progress toward financial goals
- **PII masking** — Names, account numbers, and identifying details are scrubbed before anything reaches the AI. Your data is analyzed, not exposed.
- **Smart alerts** — Large transactions, low balances, budget overruns
- **Auto-recategorization** — Define rules to automatically re-label transactions
- **Scheduled daily sync** — Automatic bank sync via launchd (macOS) or cron (Linux)
- **Export/import** — Back up and restore your financial data

## Install

```bash
npm install -g ray-finance
```

## Quick Start

```bash
ray setup
```

The setup wizard offers two modes:

### Quick setup (managed)

We handle the API keys. Your data stays local. $10/mo.

1. Enter your name
2. Get a Ray API key (opens Stripe checkout)
3. Link your accounts — checking, savings, credit cards, investments, loans, mortgage
4. Done — daily sync auto-scheduled at 6am

### Self-hosted

Bring your own Anthropic and Plaid credentials. Free forever.

1. Enter your Anthropic API key ([get one](https://console.anthropic.com))
2. Enter your Plaid credentials ([get free keys](https://dashboard.plaid.com/signup))
3. Link your accounts — checking, savings, credit cards, investments, loans, mortgage
4. Done

## Commands

Run `ray --help` to see all available commands.

| Command | Description |
|---------|-------------|
| `ray` | Interactive AI chat with your financial advisor |
| `ray setup` | Configure API keys and preferences |
| `ray link` | Connect a new bank account |
| `ray sync` | Pull latest transactions and balances |
| `ray status` | Quick financial dashboard |
| `ray transactions` | Recent transactions (filterable by category, merchant) |
| `ray spending [period]` | Spending breakdown by category |
| `ray budgets` | Budget status and overruns |
| `ray goals` | Financial goal progress |
| `ray score` | Daily score, streaks, and achievements |
| `ray alerts` | Active financial alerts |
| `ray export [path]` | Export data to a backup file |
| `ray import <path>` | Restore from a backup file |
| `ray billing` | Manage your Ray subscription (managed mode only) |

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
                      Claude API
                     (PII-masked)
```

Two outbound calls: Plaid (bank sync) and Anthropic (AI chat, PII-masked). Your financial data is never stored off your machine. No telemetry. No analytics.

## Security & Privacy

- All financial data stored locally in `~/.ray/data/finance.db`
- Database encrypted with AES-256 (SQLCipher)
- Plaid access tokens encrypted at rest with AES-256-GCM
- Config file stored with `0600` permissions
- PII redacted before sending to Claude API
- No data leaves your machine — only API calls to Plaid and Anthropic

## Configuration

Ray stores everything in `~/.ray/`:

```
~/.ray/
  config.json          # API keys and preferences (0600 permissions)
  context.md           # Persistent financial context for AI
  data/
    finance.db         # Encrypted SQLite database
  sync.log             # Daily sync output
```

### Environment Variables

You can also configure Ray via environment variables or a `.env` file:

```bash
ANTHROPIC_API_KEY=     # Anthropic API key for AI chat
PLAID_CLIENT_ID=       # Plaid client ID
PLAID_SECRET=          # Plaid secret key
PLAID_ENV=production   # Plaid environment
DB_ENCRYPTION_KEY=     # Database encryption key
PLAID_TOKEN_SECRET=    # Key for encrypting stored Plaid tokens
RAY_API_KEY=           # Ray API key (managed mode, replaces the above)
```

## Roadmap

- [ ] Daily digest email — morning summary of your finances

Have an idea? [Open a PR](https://github.com/cdinnison/ray-finance/pulls).

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
