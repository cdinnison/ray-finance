import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeader } from "@/components/page-header";
import { CTABlock } from "@/components/cta-block";
import { comparisons } from "@/data/comparisons";

export const metadata: Metadata = {
  title: "Compare Ray — How Ray Stacks Up Against Other Finance Tools",
  description:
    "See how Ray's AI-powered, local-first financial advisor compares to Mint, YNAB, Copilot Money, Monarch, and spreadsheets.",
  alternates: { canonical: "/compare" },
};

const vsPages = comparisons.filter((c) => c.type === "vs");
const altPages = comparisons.filter((c) => c.type === "alternative");

export default function ComparePage() {
  return (
    <main>
      <Nav minimal />
      <div className="mx-auto max-w-4xl px-6 pt-32 pb-24">
        <Breadcrumbs crumbs={[{ label: "Compare" }]} />
        <PageHeader
          label="Compare"
          title="How Ray compares"
          subtitle="Most finance apps show you what you spent. Ray tells you what to do. Honest, side-by-side comparisons with the most popular personal finance tools — where they're stronger, and where Ray's local-first AI actually closes the loop."
        />

        {/* Head-to-Head */}
        <section>
          <h2 className="text-xl font-bold tracking-tight text-stone-950">
            Head-to-Head
          </h2>
          <p className="mt-2 text-sm text-stone-500">
            Direct feature and philosophy comparisons.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {vsPages.map((page) => (
              <Link
                key={page.slug}
                href={`/compare/${page.slug}`}
                className="rounded-xl border border-stone-200 bg-white p-5 transition-colors hover:border-stone-300"
              >
                <p className="text-sm font-semibold text-stone-900">
                  {page.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-stone-500">
                  {page.heroSubtitle.slice(0, 120)}...
                </p>
              </Link>
            ))}
          </div>
        </section>

        {/* Alternatives */}
        <section className="mt-16">
          <h2 className="text-xl font-bold tracking-tight text-stone-950">
            Alternatives
          </h2>
          <p className="mt-2 text-sm text-stone-500">
            Looking for a replacement? See how Ray fits in.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {altPages.map((page) => (
              <Link
                key={page.slug}
                href={`/compare/${page.slug}`}
                className="rounded-xl border border-stone-200 bg-white p-5 transition-colors hover:border-stone-300"
              >
                <p className="text-sm font-semibold text-stone-900">
                  {page.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-stone-500">
                  {page.heroSubtitle.slice(0, 120)}...
                </p>
              </Link>
            ))}
          </div>
        </section>
      </div>
      <CTABlock />
    </main>
  );
}
