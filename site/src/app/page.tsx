import { CopyCommand } from "./copy-command";
import { RotatingPrompt } from "./rotating-prompt";
import { PIIScramble } from "./pii-scramble";
import { Reveal } from "./reveal";
import { Nav } from "@/components/nav";
import { GitHubStars } from "@/components/github-stars";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Ray Finance",
  description:
    "An open-source CLI that connects to your bank and gives you AI-powered financial advice — all running locally on your machine.",
  applicationCategory: "FinanceApplication",
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
      <Nav />
      <Hero />
      <Terminal />
      <Reveal><Story /></Reveal>
      <HowItWorks />
      <Reveal><Privacy /></Reveal>
      <Reveal><Context /></Reveal>
      <Reveal><Features /></Reveal>
      <Reveal><Pricing /></Reveal>
      <CTA />
    </main>
  );
}


/* ─── Hero ─── */
function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-12">
      <div className="mx-auto max-w-5xl px-6 text-center">
        <h1 className="animate-fade-up text-6xl leading-[1.05] font-black tracking-tight text-stone-950 sm:text-7xl lg:text-8xl">
          Talk to your&nbsp;money
        </h1>
        <p className="animate-fade-up-delay-1 mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-stone-500 sm:text-xl">
          Ray is an AI financial advisor that connects to your bank, understands your full picture, and gives real advice&mdash;all local on your machine.
        </p>
        <div className="animate-fade-up-delay-2 mt-10 flex flex-col items-center gap-3">
          <CopyCommand
            command="npm install -g ray-finance"
            className="rounded-lg bg-stone-900 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-stone-900/20 transition-colors hover:bg-stone-800 [&>span:first-child]:text-stone-500"
          />
        </div>
        <div className="animate-fade-up-delay-2 mt-10 flex h-5 flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-stone-400">
          <span className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
            Your data stays local
          </span>
          <span>AES-256 encrypted</span>
          <span>MIT licensed</span>
          <span>5 min setup</span>
          <GitHubStars />
        </div>
      </div>
    </section>
  );
}

/* ─── Terminal Demo ─── */
function Terminal() {
  return (
    <section className="px-6 -mt-5 py-16">
      <div className="mx-auto max-w-3xl">
        <div className="overflow-hidden rounded-2xl border border-sand-200 bg-stone-950 shadow-2xl shadow-stone-900/10">
          {/* Title bar */}
          <div className="flex items-center gap-2 border-b border-stone-800 px-4 py-3">
            <div className="h-3 w-3 rounded-full bg-stone-700" />
            <div className="h-3 w-3 rounded-full bg-stone-700" />
            <div className="h-3 w-3 rounded-full bg-stone-700" />
            <span className="ml-2 font-mono text-xs text-stone-500">
              ray
            </span>
          </div>
          {/* Content */}
          <div className="overflow-x-auto p-5 font-mono text-[11px] leading-[1.7] sm:p-8 sm:text-[13px] h-[400px] sm:h-[360px]">
            <p className="text-stone-500">tuesday, apr 1</p>
            <Blank />
            <p className="text-stone-300">
              <D>net worth</D>{"  "}<W>$45,230</W>{" "}<G>+$4,244</G>
            </p>
            <p className="text-stone-500">
              {"  "}checking $4,521{"  "}<D>&middot;</D>{"  "}savings $18,200{"  "}<D>&middot;</D>{"  "}brokerage $23,996{"  "}<D>&middot;</D>{"  "}credit card <R>-$1,487</R>
            </p>
            <Blank />
            <p className="text-stone-300">
              <D>score</D>{"      "}<G>72</G><D>/100</D>{"  "}<D>&middot;  5d no dining  &middot;  3d on pace</D>
            </p>
            <Blank />
            <div className="border-t border-stone-800 my-3" />
            {/* ── Conversation ── */}
            <RotatingPrompt />
          </div>
          {/* Status bar */}
          <div className="border-t border-stone-800 px-5 py-2.5 font-mono text-[10px] text-stone-600 sm:px-8 sm:text-[11px]">
            ray{"  "}<D>&middot;</D>{"  "}synced 1h ago{"  "}<D>&middot;</D>{"  "}try: compare this month to last month{"  "}<D>&middot;</D>{"  "}ctrl+c to exit
          </div>
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
          You&rsquo;ve tried everything else.
        </h2>

        <div className="mt-16 space-y-16">
          <StoryBlock
            label="The Apps"
            title="Dashboards show you what happened."
            body="Mint, Copilot, Monarch — they sort your transactions into
              pie charts and send you notifications. They're good at showing
              you what you spent. They never tell you what to do about it.
              And when your subscription expires, so does your data."
          />

          <StoryBlock
            label="The Spreadsheets"
            title="Powerful when you keep them updated."
            body="You built the perfect spreadsheet once. Formulas, projections,
              a debt payoff timeline. But it only works when you do — and
              manual data entry doesn't survive a busy month.
              You haven't opened it since February."
          />

          <div className="pl-8">
            <p className="font-mono text-sm tracking-wide text-stone-400 uppercase">
              Then there&rsquo;s Ray
            </p>
            <h3 className="mt-3 text-2xl font-bold tracking-tight text-stone-950">
              The advisor you&rsquo;d hire if they weren&rsquo;t $200/hour.
            </h3>
            <p className="mt-4 text-lg leading-relaxed text-stone-500">
              Ray connects directly to your bank accounts. It sees every
              transaction, every balance, every debt. When you ask &ldquo;can
              I afford this?&rdquo; it doesn&rsquo;t guess&nbsp;&mdash; it
              queries your actual data, runs the math, and gives you a real
              answer. It remembers your goals, tracks your progress, and
              proactively flags problems before they become emergencies.
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
}: {
  label: string;
  title: string;
  body: string;
}) {
  return (
    <div className="pl-8">
      <p className="font-mono text-sm tracking-wide text-stone-400 uppercase">
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

        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-sand-200 bg-sand-200 sm:grid-cols-3">
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
              It knows your whole situation, not just your transactions.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-stone-500">
              Ray builds a profile of your life over time — your goals, your
              family, your career, your priorities. Every conversation makes it
              smarter. The advice you get on day 30 is nothing like day one.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-sand-200 bg-white p-5"
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
      </div>
    </section>
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
            description="AES-256 encrypted database with scrypt key derivation. File permissions locked to your user account."
            href="https://github.com/cdinnison/ray-finance/blob/main/src/db/schema.ts"
          />
          <PrivacyCard
            title="No cloud storage"
            description="Everything stays in ~/.ray on your machine. Even with a Ray API key, data is processed in-flight and never stored on our servers."
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
    <div className="rounded-xl border border-sand-200 bg-white p-6">
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
    <section id="features" className="border-t border-sand-200 bg-sand-100 py-24 sm:py-32">
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
            highlight
          />
          <Feature
            question={`"How's my score today?"`}
            description="A daily 0-100 behavior score with streaks and unlockable achievements. No restaurants for a week? That's Kitchen Hero. Five zero-spend days? Monk Mode. It turns financial discipline into a game you actually want to play."
            highlight
          />
          <Feature
            question={`"What did we decide last time?"`}
            description="Ray remembers your goals, preferences, life events, and past decisions. Every conversation builds on the last one."
            highlight
          />
          <Feature
            question={`"Where is all my money going?"`}
            description="Category breakdowns, period comparisons, and trend detection. Ray finds the patterns you miss in your own spending."
          />
          <Feature
            question={`"How much am I spending on food delivery month over month?"`}
            description="Ray breaks down any category across any time range. Spot trends you'd never catch scrolling through transactions."
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
  highlight,
}: {
  question: string;
  description: string;
  highlight?: boolean;
}) {
  return (
    <div className={highlight ? "rounded-xl border border-stone-200 bg-white p-5 sm:-m-5 shadow-sm" : ""}>
      <h3 className="font-mono text-base font-medium text-stone-900">
        {question}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-stone-500">
        {description}
      </p>
      {highlight && (
        <p className="mt-3 font-mono text-[11px] tracking-wide text-stone-400 uppercase">Only in Ray</p>
      )}
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
            A human financial advisor costs $200/hr. Ray costs $10/mo&nbsp;&mdash; or nothing at all.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl gap-8 sm:grid-cols-2 items-start">
          {/* Self-Hosted */}
          <div className="rounded-2xl border border-sand-200 bg-white p-8 flex flex-col sm:min-h-[560px]">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-stone-900">Self-Hosted</h3>
              <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-500">
                full control
              </span>
            </div>
            <p className="mt-1 text-sm text-stone-500">Bring your own keys</p>
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
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-stone-900">
                Ray Hosted Keys
              </h3>
              <span className="rounded-full bg-stone-900 px-2.5 py-0.5 text-xs font-medium text-white">
                most popular
              </span>
            </div>
            <p className="mt-1 text-sm text-stone-500">
              We handle everything
            </p>
            <p className="mt-6">
              <span className="text-4xl font-extrabold tracking-tight text-stone-900">
                $10
              </span>
              <span className="text-sm text-stone-500">/month</span>
            </p>
            <ul className="mt-8 space-y-3 text-sm text-stone-600">
              <PricingItem>AI and bank access included</PricingItem>
              <PricingItem>No Plaid application needed</PricingItem>
              <PricingItem>Same privacy guarantees</PricingItem>
              <PricingItem>All features included</PricingItem>
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

/* ─── CTA ─── */
function CTA() {
  return (
    <section className="bg-stone-950 py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-2xl leading-[1.3] font-extrabold tracking-tight text-white sm:text-3xl lg:text-5xl">
          You&rsquo;re already making financial decisions without the full&nbsp;picture.
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


/* ─── Helpers ─── */
function Line({
  children,
  dim,
  prompt,
}: {
  children: React.ReactNode;
  dim?: boolean;
  prompt?: boolean;
}) {
  return (
    <p className={dim ? "text-stone-500" : "text-stone-300"}>
      {prompt && <span className="text-stone-500" aria-hidden="true">{"❯ "}</span>}
      {children}
    </p>
  );
}

function Blank() {
  return <p className="h-5" />;
}

function G({ children }: { children: React.ReactNode }) {
  return <span className="text-lime-400">{children}</span>;
}

function R({ children }: { children: React.ReactNode }) {
  return <span className="text-red-400">{children}</span>;
}

function Y({ children }: { children: React.ReactNode }) {
  return <span className="text-amber-400">{children}</span>;
}

function W({ children }: { children: React.ReactNode }) {
  return <span className="text-white">{children}</span>;
}

function D({ children }: { children: React.ReactNode }) {
  return <span className="text-stone-500">{children}</span>;
}

function CSSBar({ pct, color }: { pct: number; color: "lime" | "amber" }) {
  const total = 8;
  const filled = Math.round((Math.min(pct, 100) / 100) * total);
  const fillColor = color === "amber" ? "#fbbf24" : "#87da26";
  const emptyColor = "#292524";
  // Each block is a 6x10 rect with 1px gaps, mimicking terminal block chars
  return (
    <svg width={total * 7} height={10} className="inline-block align-middle" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <rect
          key={i}
          x={i * 7}
          y={0}
          width={6}
          height={10}
          rx={1}
          fill={i < filled ? fillColor : emptyColor}
        />
      ))}
    </svg>
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
