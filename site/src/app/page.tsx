import { CopyCommand } from "./copy-command";
import { VideoModal } from "./video-modal";
import { TerminalDemo } from "./terminal-demo";
import { PIIScramble } from "./pii-scramble";
import { Reveal } from "./reveal";
import { Nav } from "@/components/nav";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Ray Finance",
  description:
    "An open-source AI financial advisor that learns your full situation and gives personalized advice from your real bank data — running locally on your machine.",
  applicationCategory: "FinanceApplication",
  applicationSubCategory: "AI Financial Advisor",
  operatingSystem: "macOS, Linux, Windows",
  url: "https://rayfinance.app",
  offers: [
    {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Self-hosted with your own API keys",
    },
    {
      "@type": "Offer",
      price: "10",
      priceCurrency: "USD",
      description: "Ray API Key — managed setup",
    },
  ],
  license: "https://opensource.org/licenses/MIT",
  featureList: [
    "AI-powered financial advice from real bank data",
    "Local-first — all data stays on your machine",
    "Connects to 12,000+ banks via Plaid",
    "Open source (MIT licensed)",
    "PII-masked AI queries",
    "Spending analysis and budget tracking",
    "Net worth tracking across all accounts",
    "Debt payoff planning",
    "Cash flow projection",
    "Financial goal tracking",
  ],
};

const faqItems = [
  {
    question: "What does Ray do?",
    answer:
      "Ray is an AI financial advisor that learns your full situation — your family, income, goals, strategy, and key decisions — and keeps a persistent profile that evolves over time. It connects to your bank via Plaid and answers questions like \"can I afford this trip?\" and \"should I pay off debt or invest?\" using your actual financial data. Instead of generic advice, Ray gives answers grounded in your specific context. It gets smarter the more you use it.",
  },
  {
    question: "How does Ray keep my financial data private?",
    answer:
      "Ray runs entirely on your computer. Your financial data is stored in an encrypted SQLite database on your machine — there's no cloud account, no server, and no company storing your bank data. When Ray uses AI, it strips personally identifiable information before sending anything to the AI model. It's open source (MIT licensed) so you can verify this yourself.",
  },
  {
    question: "How is Ray different from Monarch, Copilot, or YNAB?",
    answer:
      "Those apps sort your transactions into categories and show you dashboards. Ray takes a different approach: it's a conversational AI advisor that answers financial questions using your real data. Ask \"how many months of runway do I have?\" and Ray queries your actual bank data, runs the math, and gives you a direct answer. Ray also keeps all data local on your machine instead of on cloud servers, and can be self-hosted for free — because a tool that helps you manage your money shouldn't be another expense you have to budget for.",
  },
  {
    question: "What can I ask Ray?",
    answer:
      "Anything about your finances. Example questions: \"Can I afford to take this trip?\", \"Am I on track to save $10k by December?\", \"What's my monthly burn rate?\", \"Did anything unusual hit my account this week?\", and \"How much should I set aside for quarterly taxes?\" Ray has 30+ tools that query your real financial data to give accurate answers.",
    link: { href: "/prompts", text: "See more example prompts" },
  },
  {
    question: "How much does Ray cost?",
    answer:
      "Ray has two plans. The free plan is fully open source (MIT licensed) — you install it with npm, bring your own Anthropic API key for AI and your own Plaid credentials for bank access. You pay Anthropic directly for AI usage, which is typically $1–3/month. The tradeoff is setup: Plaid production access requires a business entity, isn't guaranteed, and takes 1–2 weeks if approved. Ray Pro is $10/month and includes everything — AI and bank connectivity are built in, so you just install and connect your accounts in minutes. Both plans are the same app with the same features, and both keep all your financial data local on your machine. The only difference is whether you manage your own API keys or let Ray handle it.",
  },
  {
    question: "Which banks does Ray work with?",
    answer:
      "Ray connects to 12,000+ financial institutions through Plaid — including Chase, Bank of America, Wells Fargo, Capital One, American Express, Fidelity, Schwab, Robinhood, Vanguard, SoFi, Ally, and thousands more. If your bank works with Plaid, it works with Ray.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

export default function Home() {
  return (
    <main id="main">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60] focus:rounded-lg focus:bg-stone-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <Nav />
      <Hero />
      <SocialProof />
      <Terminal />
      <Reveal><Context /></Reveal>
      <Reveal><Story /></Reveal>
      <HowItWorks />
      <Reveal><Features /></Reveal>
      <Reveal><Privacy /></Reveal>
      <Reveal><SupportedBanks /></Reveal>
      <Reveal><Pricing /></Reveal>
      <Reveal><FAQ /></Reveal>
      <CTA />
    </main>
  );
}


/* ─── Npm Downloads ─── */
async function NpmDownloads() {
  let downloads: number | null = null;
  try {
    const res = await fetch("https://api.npmjs.org/downloads/point/last-month/ray-finance", {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = await res.json();
      downloads = data.downloads ?? null;
    }
  } catch {}
  if (!downloads) return null;

  return (
    <div className="animate-fade-up-delay-2 mt-6 flex items-center justify-center gap-1.5 text-sm text-stone-400">
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
      {downloads.toLocaleString()} installs this month
    </div>
  );
}

/* ─── Hero ─── */
function Hero() {
  return (
    <section className="relative overflow-hidden pt-24 pb-12 sm:pt-32">
      <div className="mx-auto max-w-5xl px-6 text-center">
        <h1 className="animate-fade-up text-6xl leading-[1.05] font-black tracking-tight text-stone-950 sm:text-7xl lg:text-8xl">
          Talk to your&nbsp;money
        </h1>
        <p className="animate-fade-up-delay-1 mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-stone-500 sm:text-xl">
          Ray is an AI financial advisor that connects to your bank, understands your full picture, and gives real advice&mdash;all local on your machine.
        </p>
        <div className="animate-fade-up-delay-2 mt-10 flex flex-col items-center gap-4">
          <CopyCommand
            command="npm install -g ray-finance"
            className="rounded-lg bg-stone-900 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-stone-900/20 transition-colors hover:bg-stone-800 [&>span:first-child]:text-stone-500"
          />
          <VideoModal youtubeId="-ULzglbZmPg">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-stone-500 transition-colors hover:text-stone-700">
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              Watch demo
            </span>
          </VideoModal>
        </div>
        <NpmDownloads />
      </div>
    </section>
  );
}

/* ─── Social Proof ─── */
function SocialProof() {
  return (
    <div className="animate-fade-up-delay-2 flex items-center justify-center gap-8 px-6 -mb-4">
      {/* 5-star reviews */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex gap-0.5">
          {[...Array(5)].map((_, i) => (
            <svg key={i} className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          ))}
        </div>
        <p className="text-xs text-stone-400">Loved by users</p>
      </div>

      <div className="h-8 w-px bg-stone-200" />

      {/* Open source */}
      <a
        href="https://github.com/cdinnison/ray-finance"
        className="flex flex-col items-center gap-1.5 transition-colors hover:opacity-70"
      >
        <div className="flex items-center gap-1.5">
          <svg className="h-5 w-5 text-stone-700" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-semibold text-stone-700">Open Source</span>
        </div>
        <p className="whitespace-nowrap text-xs text-stone-400">MIT Licensed · Fully Auditable</p>
      </a>

      <div className="hidden h-8 w-px bg-stone-200 sm:block" />

      {/* Product Hunt — hidden on mobile */}
      <a
        href="https://www.producthunt.com/products/ray-7?embed=true&utm_source=badge-top-post-badge&utm_medium=badge&utm_campaign=badge-ray-7"
        target="_blank"
        rel="noopener noreferrer"
        className="hidden transition-opacity hover:opacity-80 sm:block"
      >
        <img
          alt="Ray - Your personal CFO in the terminal | Product Hunt"
          width="180"
          height="39"
          src="https://api.producthunt.com/widgets/embed-image/v1/top-post-badge.svg?post_id=1121525&theme=light&period=daily&t=1776122621761"
        />
      </a>
    </div>
  );
}

/* ─── Terminal Demo ─── */
function Terminal() {
  return (
    <section className="px-6 -mt-9 py-16">
      <div className="mx-auto max-w-4xl">
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-950 shadow-2xl shadow-stone-900/10">
          <TerminalDemo />
        </div>
      </div>
    </section>
  );
}


/* ─── Story ─── */
function Story() {
  return (
    <section id="story" className="py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-stone-950 sm:text-4xl">
          You&rsquo;ve tried<br className="sm:hidden" /> everything&nbsp;else.
        </h2>

        <div className="mt-16 space-y-16">
          <StoryBlock
            label="The Apps"
            icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></svg>}
            title="Dashboards show you what happened."
            body="Monarch, Copilot, YNAB — they sort your transactions into
              pie charts and send you notifications. They're good at showing
              you what you spent. They never tell you what to do about it.
              And when your subscription expires, so does your data."
          />

          <StoryBlock
            label="The Spreadsheets"
            icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" /></svg>}
            title="Powerful, but you still do all the work."
            body="You built the perfect spreadsheet once. Formulas, projections,
              a debt payoff timeline. Even with Tiller syncing your data,
              you're still the one analyzing it, updating formulas, and
              deciding what it means. The spreadsheet never tells you
              what to do next."
          />

          <div>
            <p className="flex items-center gap-2 font-mono text-sm tracking-wide text-stone-400 uppercase">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="m4 17 6-6-6-6M12 19h8" /></svg>
              Then there&rsquo;s Ray
            </p>
            <h3 className="mt-3 text-2xl font-bold tracking-tight text-stone-950">
              The advisor you&rsquo;d hire if they weren&rsquo;t $200/hour.
            </h3>
            <p className="mt-4 text-lg leading-relaxed text-stone-500">
              Ray remembers your goals, your family, your strategy, and
              every decision you&rsquo;ve made together. When you ask
              &ldquo;can I afford this?&rdquo; it doesn&rsquo;t give generic
              advice&nbsp;&mdash; it factors in your real situation, connects
              to your bank, queries your actual data, and gives you a real
              answer. Every conversation builds on the last.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function StoryBlock({
  label,
  title,
  body,
  icon,
}: {
  label: string;
  title: string;
  body: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-2 font-mono text-sm tracking-wide text-stone-400 uppercase">
        {icon}
        {label}
      </p>
      <h3 className="mt-3 text-2xl font-bold tracking-tight text-stone-950">
        {title}
      </h3>
      <p className="mt-4 text-lg leading-relaxed text-stone-500">{body}</p>
    </div>
  );
}

/* ─── How It Works ─── */
function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "Install in seconds",
      description:
        "One npm command. No accounts, no sign-ups, no app store.",
      code: "npm install -g ray-finance",
    },
    {
      num: "02",
      title: "Connect your bank",
      description:
        "Securely link your accounts through Plaid. Bank-level encryption.",
      code: "ray link",
    },
    {
      num: "03",
      title: "Ask anything",
      description:
        "Get instant, AI-powered answers about your spending, savings goals, subscriptions, and financial health.",
      code: "Am I on track to save $10k?",
    },
  ];

  return (
    <section id="how-it-works" className="py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <p className="font-mono text-xs tracking-widest text-stone-400 uppercase">
          How it works
        </p>

        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-stone-200 bg-stone-200 sm:grid-cols-3">
          {steps.map((step) => (
            <div key={step.num} className="flex flex-col justify-between bg-white p-8">
              <div>
                <span className="text-5xl font-extrabold text-stone-200">
                  {step.num}
                </span>
                <h3 className="mt-4 text-lg font-bold text-stone-950">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-stone-500">
                  {step.description}
                </p>
              </div>
              <div className="mt-6 inline-flex items-center gap-2 self-start rounded-lg bg-stone-900 px-4 py-2.5">
                <span className="text-stone-500">$</span>
                <code className="font-mono text-xs text-stone-200">
                  {step.code}
                </code>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Supported Banks ─── */
const banks: { name: string; file: string; className?: string }[] = [
  { name: "Chase", file: "chase" },
  { name: "Bank of America", file: "bankofamerica" },
  { name: "Wells Fargo", file: "wellsfargo" },
  { name: "Capital One", file: "capitalone" },
  { name: "American Express", file: "americanexpress" },
  { name: "Fidelity", file: "fidelity" },
  { name: "Charles Schwab", file: "schwab" },
  { name: "Robinhood", file: "robinhood" },
  { name: "Vanguard", file: "vanguard" },
  { name: "SoFi", file: "sofi" },
  { name: "Ally", file: "ally" },
  { name: "PayPal", file: "paypal" },
  { name: "Venmo", file: "venmo" },
  { name: "Discover", file: "discover" },
];

function SupportedBanks() {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <p className="font-mono text-xs tracking-widest text-stone-400 uppercase">
          Integrations
        </p>
        <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-stone-950 sm:text-4xl">
          Works with your bank, brokerage, and lender.
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-stone-500">
          Ray connects to 12,000+ financial institutions through Plaid — from
          major banks to local credit unions.
        </p>

        <div className="mt-12 grid grid-cols-3 gap-x-10 gap-y-10 sm:grid-cols-4 lg:grid-cols-7">
          {banks.map((bank) => (
            <div key={bank.file} className="flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/banks/${bank.file}.svg`}
                alt={bank.name}
                className={`${bank.className ?? "h-6"} w-auto`}
              />
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-sm text-stone-400">
          And 12,000+ more institutions supported via Plaid
        </p>
      </div>
    </section>
  );
}

/* ─── Context ─── */
function Context() {
  const items = [
    { label: "Family situation", example: "Married, two kids, one income" },
    { label: "Career stage", example: "Just started a new job at $95k" },
    { label: "Financial goals", example: "Pay off student loans by 2027" },
    { label: "Risk tolerance", example: "Conservative — no crypto" },
    { label: "Life events", example: "Baby due in March, buying a house" },
    { label: "Past decisions", example: "We cut DoorDash last month" },
  ];

  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <p className="font-mono text-xs tracking-widest text-stone-400 uppercase">
              What makes Ray different
            </p>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-stone-950 sm:text-4xl">
              Tell Ray once. It remembers&nbsp;everything.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-stone-500">
              Ray keeps a persistent profile of your life&nbsp;&mdash; family,
              income, goals, strategy, and key decisions. When your situation
              changes, Ray updates it automatically. The advice you get on
              day&nbsp;30 is nothing like day&nbsp;one, because Ray knows what
              happened on days&nbsp;1&nbsp;through&nbsp;29.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-stone-200 bg-white p-5"
              >
                <h3 className="text-sm font-semibold text-stone-950">
                  {item.label}
                </h3>
                <p className="mt-1 text-sm text-stone-400">
                  {item.example}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Before / After — terminal-style */}
        <div className="mx-auto mt-20 max-w-4xl overflow-hidden rounded-2xl border border-stone-200 bg-stone-950 shadow-2xl shadow-stone-900/10">
          {/* Title bar */}
          <div className="flex items-center border-b border-stone-800 px-4 py-3">
            <div className="flex gap-2">
              <div className="h-3 w-3 rounded-full bg-stone-700" />
              <div className="h-3 w-3 rounded-full bg-stone-700" />
              <div className="h-3 w-3 rounded-full bg-stone-700" />
            </div>
            <span className="absolute inset-x-0 text-center font-mono text-xs text-stone-500">
              generic AI vs ray
            </span>
          </div>

          {/* Threads */}
          <div className="divide-y divide-stone-800">
            <TerminalThread
              question="how should I deal with my debt?"
              generic="You should aim to save 15–20% of your income. Consider building a 3–6 month emergency fund, then focus on paying off high-interest debt."
              ray="You've got $34,200 in debt across two cards and a car loan. At $95k with two kids and a baby coming in March, I'd pause the Japan fund and throw that $440/mo at the Chase card — it's at 24.9%. That clears it by September and frees up $340/mo before the baby arrives."
            />
            <TerminalThread
              question="can I take this trip to Tahoe?"
              generic="A weekend trip can cost $500–$2,000 depending on the destination. Make sure it fits your budget and doesn't derail your savings goals."
              ray="Tahoe would run about $1,200 with the Airbnb and gas. You can swing it, but it'll push your 401k contribution below the $23,000 max this year — you'd need to bump it back to 18% in May to catch up. Want me to map that out?"
            />
            <TerminalThread
              question="is my rent too high?"
              generic="It depends on your income, expenses, and financial goals. Generally, you should avoid spending more than 30% of income on housing."
              ray="Your rent is $2,400 against $6,100 take-home — that's 39%, which is high. But you told me last week you're planning to move in with your partner in June. Once you split rent, housing drops to 22% and frees up $900/mo for the student loan blitz."
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function TerminalThread({
  question,
  generic,
  ray,
}: {
  question: string;
  generic: string;
  ray: string;
}) {
  return (
    <div className="px-5 py-5 font-mono text-[11px] leading-[1.7] sm:px-8 sm:py-6 sm:text-[13px]">
      {/* User question */}
      <p className="text-white">
        <span className="text-stone-500">{"❯ "}</span>
        {question}
      </p>

      {/* Generic response — crossed out */}
      <div className="mt-3">
        <p className="text-stone-600 text-[10px] sm:text-[11px] uppercase tracking-wider mb-1">
          chatgpt
        </p>
        <p className="text-stone-600 line-through decoration-stone-700">
          {generic}
        </p>
      </div>

      {/* Ray response */}
      <div className="mt-3">
        <p className="text-lime-400 text-[10px] sm:text-[11px] uppercase tracking-wider mb-1">
          ray
        </p>
        <p className="text-stone-300">
          {ray}
        </p>
      </div>
    </div>
  );
}

/* ─── Privacy ─── */
function Privacy() {
  return (
    <section id="privacy" className="py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-sm tracking-wide text-stone-400 uppercase">
            Privacy
          </p>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-stone-950 sm:text-4xl">
            Your financial data is never stored outside your machine.
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-stone-500">
            Ray runs entirely on your computer. There&rsquo;s no cloud, no
            account, no server storing your data. Your financial history lives
            in an encrypted database on your hard drive, and your name is
            scrubbed before anything reaches the AI.
          </p>
        </div>

        <div className="mt-16">
          <PIIScramble />
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <PrivacyCard
            title="Encrypted at rest"
            description="Your data is encrypted on disk with the same standard used by banks. No one else can read it."
            href="https://github.com/cdinnison/ray-finance/blob/main/src/db/schema.ts"
          />
          <PrivacyCard
            title="No cloud storage"
            description="Everything stays in ~/.ray on your machine. No servers or security breaches to worry about."
          />
          <PrivacyCard
            title="Fully auditable"
            description="Every AI tool call is logged locally. You can see exactly what data was accessed and when."
            href="https://github.com/cdinnison/ray-finance/blob/main/src/ai/agent.ts"
          />
          <PrivacyCard
            title="Two outbound calls"
            description="Plaid for bank sync, Anthropic for AI chat (PII-masked). That's it. No telemetry. No analytics."
            href="https://github.com/cdinnison/ray-finance/blob/main/src/plaid/client.ts"
          />
        </div>
      </div>
    </section>
  );
}

function PrivacyCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href?: string;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-6">
      <h3 className="text-base font-semibold text-stone-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-stone-500">
        {description}
      </p>
      {href && (
        <a
          href={href}
          className="mt-3 inline-block py-2 font-mono text-xs text-stone-400 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-stone-600"
        >
          view source
        </a>
      )}
    </div>
  );
}

/* ─── Features ─── */
function Features() {
  return (
    <section id="features" className="border-t border-stone-200 bg-stone-100 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <p className="font-mono text-sm tracking-wide text-stone-400 uppercase">
          What Ray can do
        </p>
        <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-stone-950 sm:text-4xl">
          Not a dashboard. Not a chatbot. A financial brain that actually knows your situation.
        </h2>
        <p className="mt-4 max-w-2xl text-lg text-stone-500">
          Ray has 30+ tools that query your real financial data. It looks
          things up, runs calculations, and takes action.
        </p>

        <div className="mt-16 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          <Feature
            question={`"Can I afford to take this trip?"`}
            description="Ray projects your balance forward based on actual income and spending patterns. See the impact before you commit."

          />
          <Feature
            question={`"How's my score today?"`}
            description="A daily 0-100 behavior score with streaks and unlockable achievements. No restaurants for a week? That's Kitchen Hero. Five zero-spend days? Monk Mode. It turns financial discipline into a game you actually want to play."

          />
          <Feature
            question={`"What did we decide last time?"`}
            description="Ray remembers your goals, preferences, life events, and past decisions. Every conversation builds on the last one."

          />
          <Feature
            question={`"What's my net worth right now?"`}
            description="Ray pulls balances across every linked account — checking, savings, credit cards, loans — and gives you one number. Updated every time you ask."
          />
          <Feature
            question={`"Did anything unusual hit my account this week?"`}
            description="Ray scans recent transactions for anomalies — unexpected charges, duplicate payments, amounts that don't match your patterns. Like a financial advisor who actually checks."
          />
          <Feature
            question={`"Can you audit to make sure my tenants have paid for the past 12 months?"`}
            description="Ray searches your real transaction history, flags gaps, and gives you a straight answer. Landlord, freelancer, whatever — if the data is in your bank, Ray can check it."
          />
        </div>
      </div>
    </section>
  );
}

function Feature({
  question,
  description,
}: {
  question: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5">
      <h3 className="font-mono text-base font-medium text-stone-900">
        {question}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-stone-500">
        {description}
      </p>
    </div>
  );
}

/* ─── Pricing ─── */
function Pricing() {
  return (
    <section id="pricing" className="py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <p className="font-mono text-sm tracking-wide text-stone-400 uppercase">
            Pricing
          </p>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-stone-950 sm:text-4xl">
            Free forever. Or skip the setup.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lg text-stone-500">
            Two ways to run Ray. Both keep your data local.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl gap-8 sm:grid-cols-2 items-start">
          {/* BYOK */}
          <div className="rounded-2xl border border-stone-200 bg-white p-8 flex flex-col sm:min-h-[560px]">
            <span className="whitespace-nowrap self-start rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-500">
              full control
            </span>
            <h3 className="mt-2 text-lg font-bold text-stone-900">Bring Your Own Keys</h3>
            <p className="mt-1 text-sm text-stone-500">Free and open source forever</p>
            <p className="mt-6">
              <span className="text-4xl font-extrabold tracking-tight text-stone-900">
                $0
              </span>
              <span className="text-sm text-stone-500">/forever</span>
            </p>
            <ul className="mt-8 space-y-3 text-sm text-stone-600">
              <PricingItem>Open source, MIT licensed</PricingItem>
              <PricingItem>Your own Anthropic API key</PricingItem>
              <PricingItem>Your own Plaid credentials</PricingItem>
              <PricingItem>Full model selection</PricingItem>
              <PricingItem>All features included</PricingItem>
            </ul>
            <CopyCommand
              command="npm install -g ray-finance"
              className="mt-8 block rounded-lg bg-stone-900 px-4 py-3 text-center text-sm text-white transition-colors hover:bg-stone-800 [&>span:first-child]:text-stone-500"
            />
            <a
              href="https://github.com/cdinnison/ray-finance"
              className="mt-3 block text-center text-xs text-stone-400 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-stone-600"
            >
              View source on GitHub
            </a>
            <div className="grow" />

            <details className="pt-6 group">
              <summary className="cursor-pointer select-none w-full rounded-lg border border-stone-200 px-4 py-3 text-xs text-stone-400 hover:border-stone-300 hover:text-stone-500 transition-colors flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <svg className="h-3 w-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  Steps to self-host
                </span>
                <span className="font-mono text-[10px] text-stone-300 group-open:hidden">~2 weeks</span>
              </summary>
              <div className="mt-4 ml-1 border-l-2 border-stone-200 pl-4 space-y-4">
                <SetupStep time="~5 min" href="/guides/get-anthropic-api-key">
                  Sign up for Anthropic &amp; add billing
                </SetupStep>
                <SetupStep time="~5 min" href="/guides/get-plaid-credentials">
                  Create Plaid developer account
                </SetupStep>
                <SetupStep time="1-2 weeks" href="/guides/get-plaid-credentials">
                  Apply for Plaid production access
                </SetupStep>
                <SetupStep time="~5 min">
                  Run <code className="rounded bg-stone-100 px-1 py-0.5">ray setup</code>, paste keys
                </SetupStep>
                <SetupStep time="~2 min">
                  Run <code className="rounded bg-stone-100 px-1 py-0.5">ray link</code> to connect bank
                </SetupStep>
              </div>
              <p className="mt-4 ml-1 text-[11px] font-mono text-stone-400">
                ~20 min of work + 1-2 week wait for Plaid approval
              </p>
            </details>
          </div>

          {/* Ray API Key */}
          <div className="rounded-2xl border-2 border-stone-900 bg-white p-8 flex flex-col sm:min-h-[560px]">
            <span className="inline-flex self-start items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4 5.6 21.2 8 14 2 9.2h7.6z"/></svg>
              most popular
            </span>
            <h3 className="mt-2 text-lg font-bold text-stone-900">
              Ray Pro
            </h3>
            <p className="mt-1 text-sm text-stone-500">
              Just install and go
            </p>
            <p className="mt-6">
              <span className="text-4xl font-extrabold tracking-tight text-stone-900">
                $10
              </span>
              <span className="text-sm text-stone-500">/month</span>
            </p>
            <ul className="mt-8 space-y-3 text-sm text-stone-600">
              <PricingItem>AI and bank connection included</PricingItem>
              <PricingItem>Connect your accounts in seconds</PricingItem>
              <PricingItem>Your data stays on your machine</PricingItem>
              <PricingItem>All features, no limits</PricingItem>
              <PricingItem>Cancel anytime</PricingItem>
            </ul>
            <CopyCommand
              command="npm install -g ray-finance"
              className="mt-8 block rounded-lg bg-stone-900 px-4 py-3 text-center text-sm text-white shadow-lg shadow-stone-900/20 transition-colors hover:bg-stone-800 [&>span:first-child]:text-stone-500"
            />
            <div className="grow" />

            <details className="pt-6 group">
              <summary className="cursor-pointer select-none w-full rounded-lg border border-stone-200 px-4 py-3 text-xs text-stone-400 hover:border-stone-300 hover:text-stone-500 transition-colors flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <svg className="h-3 w-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  Steps to sign up
                </span>
                <span className="font-mono text-[10px] text-stone-300 group-open:hidden">~5 min</span>
              </summary>
              <div className="mt-4 ml-1 border-l-2 border-stone-200 pl-4 space-y-4">
                <SetupStep time="~2 min">
                  Run <code className="rounded bg-stone-100 px-1 py-0.5">ray setup</code> to get your key
                </SetupStep>
                <SetupStep time="~1 min">
                  Run <code className="rounded bg-stone-100 px-1 py-0.5">ray link</code> to connect bank
                </SetupStep>
              </div>
              <p className="mt-4 ml-1 text-[11px] font-mono text-stone-400">
                Total: ~3 minutes
              </p>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}

function SetupStep({ children, time, href }: { children: React.ReactNode; time: string; href?: string }) {
  const content = (
    <div className="flex items-start justify-between gap-3">
      <p className="text-xs text-stone-500">{children}</p>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-mono ${
        time.includes("week") ? "bg-amber-50 text-amber-600" : "bg-stone-100 text-stone-400"
      }`}>
        {time}
      </span>
    </div>
  );
  if (href) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className="block hover:opacity-70 transition-opacity">{content}</a>;
  }
  return content;
}

function PricingItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <svg
        className="mt-0.5 h-4 w-4 shrink-0 text-stone-900"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2.5}
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.5 12.75l6 6 9-13.5"
        />
      </svg>
      {children}
    </li>
  );
}

/* ─── FAQ ─── */
function FAQ() {
  return (
    <section id="faq" className="py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-6">
        <p className="font-mono text-sm tracking-wide text-stone-400 uppercase">
          FAQ
        </p>
        <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-stone-950 sm:text-4xl">
          Common questions about Ray
        </h2>

        <div className="mt-12 divide-y divide-stone-200">
          {faqItems.map((item) => (
            <details key={item.question} className="group py-6">
              <summary className="flex cursor-pointer items-start justify-between gap-4">
                <h3 className="text-base font-semibold text-stone-900 group-open:text-stone-950">
                  {item.question}
                </h3>
                <svg
                  className="mt-1 h-5 w-5 shrink-0 text-stone-400 transition-transform group-open:rotate-45"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-stone-500">
                {item.answer}
                {item.link && (
                  <>
                    {" "}
                    <a href={item.link.href} className="text-stone-900 underline decoration-stone-300 underline-offset-4 hover:text-stone-700">
                      {item.link.text} &rarr;
                    </a>
                  </>
                )}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── CTA ─── */
function CTA() {
  return (
    <section className="bg-stone-950 py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-2xl leading-[1.3] font-extrabold tracking-tight text-white sm:text-3xl lg:text-5xl">
          Feel in control of your money&nbsp;again.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg text-stone-400">
          Ray is free, open source, and takes five minutes to set up.
          Your data never leaves your machine.
        </p>
        <div className="mt-10 flex flex-col items-center gap-6">
          <CopyCommand
            command="npm install -g ray-finance"
            className="rounded-lg border border-stone-800 bg-stone-900 px-6 py-3.5 text-sm text-white [&>span:first-child]:text-stone-500"
          />
          <div className="flex items-center gap-6">
            <a
              href="https://github.com/cdinnison/ray-finance"
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-stone-900 transition-colors hover:bg-stone-100"
            >
              <GitHubIcon />
              View on GitHub
            </a>
            <a
              href="#pricing"
              className="text-sm font-medium text-stone-400 underline decoration-stone-700 underline-offset-4 transition-colors hover:text-white"
            >
              Compare plans
            </a>
          </div>
        </div>

        {/* Founder story */}
        <div className="mx-auto mt-20 max-w-xl border-t border-stone-800 pt-12">
          <p className="text-lg leading-relaxed text-stone-400 italic">
            &ldquo;I tried every finance app, built every spreadsheet, and talked to
            a financial advisor who charged $200/hr to tell me things I already
            knew. Nothing actually helped me make better decisions with my own
            money. So I built the thing I wanted&nbsp;&mdash; an advisor that
            knows my real numbers, runs locally, and is honest enough to
            open&#8209;source.&rdquo;
          </p>
          <p className="mt-6 text-sm text-stone-500">
            &mdash;{" "}
            <a
              href="https://github.com/cdinnison"
              className="underline decoration-stone-700 underline-offset-4 transition-colors hover:text-stone-300"
            >
              Clark Dinnison
            </a>
            , creator of Ray
          </p>
        </div>
      </div>
    </section>
  );
}


function GitHubIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}
