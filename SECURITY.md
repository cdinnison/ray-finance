# Security

## Architecture

Ray is local-first. Your financial database (`~/.ray/data/finance.db`), context profile (`~/.ray/context.md`), and configuration (`~/.ray/config.json`) live on your machine. In **Bring Your Own Keys (BYOK)** mode, Ray communicates directly with the banking and AI providers you configure and does not route financial data through Ray servers. In **Managed** mode (`rayApiKey`), Plaid and AI requests are proxied through `api.rayfinance.app` so you don't need to manage separate API accounts.

### Encryption

- **Database encryption**: The local SQLite database is encrypted at rest using `libsql` with `AES-256-CBC` when `dbEncryptionKey` is configured. The encryption key is generated during setup and stored locally in `~/.ray/config.json` (which means local disk protection relies on OS user isolation and `0600` file permissions).
- **Plaid token encryption**: Plaid access tokens are encrypted separately using `AES-256-GCM` (128-bit auth tag, random per-token salt) with `scrypt` key derivation before being stored in the database.
- **File permissions**: Config and database directories/files are restricted to owner-only permissions (`0700` directories, `0600` files).

### Data Flow

Depending on which features and providers you configure, Ray may make outbound HTTPS requests to:

| Service | Purpose | When |
|---------|---------|------|
| Plaid (`*.plaid.com`, `cdn.plaid.com`) | Sync bank transactions, balances, holdings, liabilities | `ray sync`, `ray link` (BYOK Plaid) |
| Bridge (`api.bridgeapi.io`) | Sync European bank accounts and transactions | `ray sync`, `ray link` (BYOK Bridge) |
| AI Provider (`api.anthropic.com`, OpenAI, Ollama, or custom URL) | AI-powered chat responses | `ray` (interactive chat) |
| Ray Managed Proxy (`api.rayfinance.app`) | Proxied Plaid/AI requests and Stripe billing | Managed mode (`rayApiKey`) or `ray billing` |
| npm Registry (`registry.npmjs.org`) | Check for newer CLI releases (opt out via `RAY_NO_UPDATE_CHECK=1`) | CLI startup (cached 1h), `ray update` |
| models.dev (`models.dev`) | Fetch model metadata for provider selection | `ray setup` (OpenAI-compatible providers) |
| Redfin (`redfin.com`) | Fetch home value estimates (only if you add a Redfin listing URL) | `ray add`, `ray link`, `ray sync` |

No analytics or usage telemetry is collected.

### PII Handling

Before sending prompts or tool results to an AI provider, Ray redacts configured names (user, family members, employers) case-insensitively along with structured PII patterns (SSNs, IBANs, credit card numbers, emails, phone numbers, and account/routing numbers), then restores name placeholders in the displayed response. For maximum privacy, you can also run a local model via Ollama so chat prompts never leave your machine.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email **clark@rayfinance.app** with details
3. Include steps to reproduce if possible

I will respond within 48 hours and work with you to address the issue before any public disclosure.
