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
    tip: "If you don't want to manage your own API key, the $10/mo Ray Hosted Keys plan includes AI access. Just run `ray setup`, pick \"Ray API Key\", and pay $10/mo — no Anthropic account needed.",
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
    tip: "Don't want to wait for Plaid approval? The $10/mo Ray Hosted Keys plan includes bank access. Run `ray setup`, pick \"Ray API Key\", and pay $10/mo — then `ray link` to connect your bank immediately. No Plaid account needed.",
    relatedGuides: ["get-anthropic-api-key"],
    metaTitle: "How to Get Plaid Credentials for Ray | Ray Finance",
    metaDescription:
      "Step-by-step guide to getting Plaid API credentials for Ray. Create a developer account, apply for production access, and connect your bank.",
  },
];

export function getGuideBySlug(slug: string): Guide | undefined {
  return guides.find((g) => g.slug === slug);
}
