export interface Guide {
  slug: string;
  title: string;
  subtitle: string;
  steps: { title: string; body: string; link?: string }[];
  tip?: string;
  relatedGuides: string[];
  metaTitle: string;
  metaDescription: string;
}

export const guides: Guide[] = [
  {
    slug: "get-anthropic-api-key",
    title: "How to get an Anthropic API key",
    subtitle:
      "Anthropic makes Claude, the AI that powers Ray. You need an API key so Ray can talk to Claude on your behalf. Takes about 5 minutes.",
    steps: [
      {
        title: "Create an Anthropic account",
        body: "Head to the Anthropic console and sign up with your email or Google account. No credit card needed to create the account.",
        link: "https://console.anthropic.com/",
      },
      {
        title: "Add a payment method",
        body: "Go to Settings → Billing and add a credit card. Claude API usage is pay-as-you-go. A typical Ray session costs a few cents — most people spend $1–3/month.",
      },
      {
        title: "Generate your API key",
        body: "Go to Settings → API Keys and click \"Create Key\". Give it a name like \"ray\" and copy the key. You'll only see it once.",
      },
      {
        title: "Paste it into Ray",
        body: "Run `ray setup` and paste your key when prompted. Ray stores it locally in an encrypted config file — it never leaves your machine.",
      },
    ],
    tip: "If you don't want to manage your own API key, the $10/mo Ray Pro plan includes AI access. Just run `ray setup`, pick \"Ray Pro\", and pay $10/mo — no Anthropic account needed.",
    relatedGuides: ["get-plaid-credentials"],
    metaTitle: "How to Get an Anthropic API Key for Ray | Ray Finance",
    metaDescription:
      "Step-by-step guide to creating an Anthropic account, generating a Claude API key, and connecting it to Ray. Takes 5 minutes.",
  },
  {
    slug: "get-plaid-credentials",
    title: "How to get Plaid credentials",
    subtitle:
      "Plaid connects Ray to your bank accounts. You need a Client ID and Secret so Ray can securely pull your transactions and balances. The signup is free — but production access takes 1–2 weeks.",
    steps: [
      {
        title: "Create a Plaid developer account",
        body: "Sign up for a free Plaid account. You'll get sandbox credentials immediately — these let you test with fake data.",
        link: "https://plaid.com/docs/quickstart/",
      },
      {
        title: "Apply for production access",
        body: "In the Plaid dashboard, go to the production access page and submit your application. Plaid will ask for a use case description — just say \"personal finance tracking for a single user\". This is the slow part: approval takes 1–2 weeks.",
        link: "https://dashboard.plaid.com/overview/production",
      },
      {
        title: "Get your Client ID and Secret",
        body: "Once approved, go to Keys in the Plaid dashboard. You'll see your Client ID and a Secret for each environment. Copy the production Client ID and Secret.",
        link: "https://dashboard.plaid.com/developers/keys",
      },
      {
        title: "Paste them into Ray",
        body: "Run `ray setup` and paste your Plaid Client ID and Secret when prompted. Ray encrypts and stores them locally.",
      },
      {
        title: "Connect your bank",
        body: "Run `ray link` to open Plaid Link in your browser. Pick your bank, log in, and select the accounts you want Ray to track. Done.",
      },
    ],
    tip: "Don't want to wait for Plaid approval? The $10/mo Ray Pro plan includes bank access. Run `ray setup`, pick \"Ray Pro\", and pay $10/mo — then `ray link` to connect your bank immediately. No Plaid account needed.",
    relatedGuides: ["get-anthropic-api-key"],
    metaTitle: "How to Get Plaid Credentials for Ray | Ray Finance",
    metaDescription:
      "Step-by-step guide to getting Plaid API credentials for Ray. Create a developer account, apply for production access, and connect your bank.",
  },
  {
    slug: "why-local-first",
    title: "Why local-first matters for personal finance",
    subtitle:
      "Most finance apps store your bank data on their servers. Ray keeps everything on your machine. Here's why that matters and how it works.",
    steps: [
      {
        title: "Your financial data is uniquely sensitive",
        body: "Your bank transactions reveal where you live, where you shop, what you earn, who you pay, and what you're planning. This data is more intimate than your browsing history. When a finance app stores it on their servers, you're trusting that company with a complete map of your financial life — and hoping they never get breached, acquired, or shut down.",
      },
      {
        title: "Cloud finance apps create unnecessary risk",
        body: "Every cloud-hosted budgeting app is a target. Mint had 3.6 million users' data on Intuit's servers before it shut down in 2024. When you use Monarch, Copilot, or YNAB, your transaction history lives on their infrastructure — subject to their security practices, their privacy policies, and their business decisions. If they get hacked, your data is exposed. If they shut down, your data may be lost.",
      },
      {
        title: "Local-first means you control your data",
        body: "Ray stores your financial data in an encrypted SQLite database at ~/.ray on your machine. It never leaves your computer. There's no cloud account, no server to breach, and no company that can lose your data. If Ray the project disappeared tomorrow, your data would still be right where you left it — on your hard drive, encrypted and accessible.",
      },
      {
        title: "But Ray still connects to your bank",
        body: "Local-first doesn't mean disconnected. Ray uses Plaid to sync your transactions and balances — the same secure connection used by Monarch, Copilot, and every other finance app. The difference is where that data goes after syncing: with Ray, it goes straight to your encrypted local database. With cloud apps, it goes to their servers.",
      },
      {
        title: "AI queries are PII-masked",
        body: "When Ray sends a question to Claude (the AI), it strips personally identifiable information first. Your name, account numbers, and institution names are replaced with generic labels. The AI sees \"Account A at Bank 1\" — not your actual Chase checking account. The full data stays local; only anonymized context reaches the AI.",
      },
      {
        title: "Open source means fully auditable",
        body: "Ray is MIT licensed and fully open source. You can read every line of code, verify what data is sent where, and confirm that nothing is phoning home. You can't do this with Monarch, Copilot, or any closed-source finance app. If privacy matters to you, verifiability matters — and open source is the only way to get it.",
      },
    ],
    tip: "If you want local-first privacy without managing your own API keys, the $10/mo Ray Pro plan still keeps all financial data on your machine. The only difference is that Ray Pro routes AI calls through our proxy (still PII-masked) so you don't need your own Anthropic or Plaid accounts.",
    relatedGuides: ["get-anthropic-api-key", "get-plaid-credentials"],
    metaTitle: "Why Local-First Matters for Personal Finance | Ray Finance",
    metaDescription:
      "Why your financial data should stay on your machine. How Ray keeps bank data local with AES-256 encryption, PII-masked AI calls, and zero cloud storage.",
  },
];

export function getGuideBySlug(slug: string): Guide | undefined {
  return guides.find((g) => g.slug === slug);
}
