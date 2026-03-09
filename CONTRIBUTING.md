# Contributing

Thanks for your interest in contributing to Ray.

## Development Setup

```bash
git clone https://github.com/cdinnison/ray-finance.git
cd ray-finance
npm install
npm run build
npm link
```

You'll need Plaid and Anthropic API keys to test. Copy `.env.example` to `.env` and fill in your credentials.

## Making Changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `npm run build` to verify the project compiles
4. Open a pull request

## Code Style

- TypeScript with strict mode
- ES modules (`"type": "module"`)
- Prefer simple, direct code over abstractions
- No unnecessary dependencies

## Reporting Bugs

Open a GitHub issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your Node.js version and OS

## Security Issues

See [SECURITY.md](SECURITY.md) for reporting security vulnerabilities. Do not open public issues for security bugs.
