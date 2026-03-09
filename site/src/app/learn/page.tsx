import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeader } from "@/components/page-header";
import { CTABlock } from "@/components/cta-block";
import { glossaryTerms, type GlossaryTerm } from "@/data/glossary";

export const metadata: Metadata = {
  title: "Personal Finance Glossary | Ray Finance",
  description:
    "Learn key personal finance terms — from budgeting and credit scores to index funds and compound interest. Plain-English definitions with real examples.",
  alternates: {
    canonical: "/learn",
  },
};

const categories: { name: string; slugs: string[] }[] = [
  {
    name: "Budgeting Basics",
    slugs: ["budget", "zero-based-budget", "cash-flow", "savings-rate", "sinking-fund", "emergency-fund"],
  },
  {
    name: "Income & Taxes",
    slugs: ["gross-income", "net-income", "tax-bracket"],
  },
  {
    name: "Debt & Credit",
    slugs: ["credit-score", "fico-score", "debt-to-income-ratio", "apr", "amortization", "mortgage"],
  },
  {
    name: "Saving & Investing",
    slugs: [
      "compound-interest",
      "apy",
      "asset-allocation",
      "diversification",
      "dollar-cost-averaging",
      "expense-ratio",
      "index-fund",
      "mutual-fund",
      "portfolio",
      "roth-ira",
      "401k",
      "rule-of-72",
      "yield",
      "capital-gains",
      "time-value-of-money",
    ],
  },
  {
    name: "Markets & Economy",
    slugs: ["inflation", "liquidity", "bear-market", "bull-market", "net-worth"],
  },
];

function termsBySlug(slugs: string[]): GlossaryTerm[] {
  return slugs
    .map((s) => glossaryTerms.find((t) => t.slug === s))
    .filter((t): t is GlossaryTerm => t !== undefined);
}

export default function LearnPage() {
  return (
    <>
      <Nav minimal />
      <main className="min-h-screen bg-stone-50 pt-24">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
          <Breadcrumbs crumbs={[{ label: "Learn" }]} />
          <PageHeader
            label="Glossary"
            title="Personal Finance Glossary"
            subtitle="Plain-English definitions for the financial terms that actually matter — with real numbers and examples of how Ray helps you apply them."
          />

          {categories.map((cat) => (
            <section key={cat.name} className="mb-16">
              <h2 className="mb-6 text-lg font-bold tracking-tight text-stone-950">
                {cat.name}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {termsBySlug(cat.slugs).map((term) => (
                  <Link
                    key={term.slug}
                    href={`/learn/${term.slug}`}
                    className="rounded-xl border border-stone-200 bg-white p-5 transition-colors hover:border-stone-300"
                  >
                    <p className="font-semibold text-stone-900">{term.term}</p>
                    <p className="mt-1 text-sm text-stone-500">{term.definition.split(". ")[0]}.</p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
        <CTABlock />
      </main>
    </>
  );
}
