import Image from "next/image";
import Link from "next/link";

const columns = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/#how-it-works" },
      { label: "Privacy", href: "/#privacy" },
      { label: "Pricing", href: "/#pricing" },
      { label: "Features", href: "/#features" },
    ],
  },
  {
    title: "Learn",
    links: [
      { label: "All terms", href: "/learn" },
      { label: "Net Worth", href: "/learn/net-worth" },
      { label: "Emergency Fund", href: "/learn/emergency-fund" },
      { label: "Compound Interest", href: "/learn/compound-interest" },
      { label: "Credit Score", href: "/learn/credit-score" },
    ],
  },
  {
    title: "Compare",
    links: [
      { label: "All comparisons", href: "/compare" },
      { label: "Ray vs Copilot", href: "/compare/ray-vs-copilot-money" },
      { label: "Ray vs YNAB", href: "/compare/ray-vs-ynab" },
      { label: "Ray vs Monarch", href: "/compare/ray-vs-monarch" },
      { label: "Mint Alternative", href: "/compare/mint-alternative" },
    ],
  },
  {
    title: "For",
    links: [
      { label: "All personas", href: "/for" },
      { label: "Freelancers", href: "/for/freelancers" },
      { label: "Couples", href: "/for/couples" },
      { label: "New Grads", href: "/for/new-grads" },
      { label: "Parents", href: "/for/parents" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Setup Guides", href: "/guides" },
      { label: "Get Anthropic Key", href: "/guides/get-anthropic-api-key" },
      { label: "Get Plaid Credentials", href: "/guides/get-plaid-credentials" },
      { label: "Best Budgeting Apps", href: "/best/budgeting-apps" },
      { label: "GitHub", href: "https://github.com/cdinnison/ray-finance" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-sand-200 pt-12 pb-8">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          {columns.map((col) => (
            <div key={col.title}>
              <p className="font-mono text-xs tracking-wide text-stone-400 uppercase">
                {col.title}
              </p>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    {link.href.startsWith("http") ? (
                      <a
                        href={link.href}
                        className="text-sm text-stone-500 transition-colors hover:text-stone-900"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-stone-500 transition-colors hover:text-stone-900"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-sand-200 pt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ray-logo-dark.png" alt="Ray" width={37} height={18} className="opacity-40" />
            <p className="text-sm text-stone-400">
              Open source under MIT.
            </p>
          </div>
          <p className="mt-4 max-w-xl text-left text-xs leading-relaxed text-stone-400/70">
            Ray is an AI tool, not a licensed financial advisor. Output is
            informational, may be inaccurate, and does not constitute financial
            advice. Consult a qualified professional before making financial
            decisions.
          </p>
        </div>
      </div>
    </footer>
  );
}
