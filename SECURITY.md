# Security

## Architecture

Ray is local-first. All financial data is stored on your machine in an encrypted SQLite database. No data is sent to Ray servers because there are no Ray servers.

### Encryption

- **Database encryption**: The SQLite database is encrypted at rest using AES-256 via [SQLCipher](https://www.zetetic.net/sqlcipher/) (better-sqlite3-multiple-ciphers). The encryption key is provided during setup and stored in your local config.
- **Plaid token encryption**: Plaid access tokens are encrypted separately using AES-256-GCM with scrypt key derivation before being stored in the database.
- **File permissions**: Config and database files are created with `0600` permissions (owner read/write only).

### Data Flow

Ray makes outbound API calls to two services:

| Service | Purpose | When |
|---------|---------|------|
| Plaid | Sync bank transactions and balances | `ray sync`, `ray link` |
| Anthropic | AI-powered chat responses | `ray` (interactive chat) |

No telemetry, analytics, or usage data is collected or transmitted.

### PII Handling

When sending data to the Anthropic API for AI chat, Ray redacts personally identifiable information (account numbers, routing numbers) before transmission and restores it in the response for display.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email **clark@rayfinance.app** with details
3. Include steps to reproduce if possible

I will respond within 48 hours and work with you to address the issue before any public disclosure.
