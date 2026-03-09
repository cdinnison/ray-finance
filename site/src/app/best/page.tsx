import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeader } from "@/components/page-header";
import { CTABlock } from "@/components/cta-block";
import { curations } from "@/data/curations";

export const metadata: Metadata = {
  title: "Best Finance Tools in 2026 — Ray Finance",
  description:
    "Honest reviews and comparisons of the best budgeting apps, personal finance tools, AI finance apps, expense trackers, and Mint alternatives in 2026.",
  alternates: {
    canonical: "/best",
  },
  openGraph: {
    title: "Best Finance Tools in 2026 — Ray Finance",
    description:
      "Honest reviews and comparisons of the best budgeting apps, personal finance tools, AI finance apps, expense trackers, and Mint alternatives in 2026.",
    url: "https://rayfinance.app/best",
  },
};

export default function BestPage() {
  return (
    <>
      <Nav minimal />
      <main className="mx-auto max-w-4xl px-6 pt-32 pb-24">
        <Breadcrumbs crumbs={[{ label: "Best" }]} />
        <PageHeader
          label="Reviews"
          title="Best Finance Tools in 2026"
          subtitle="Honest, tested reviews of every major personal finance tool. No affiliate links, no sponsored placements — just what actually works."
        />

        <div className="grid gap-6 sm:grid-cols-2">
          {curations.map((page) => (
            <Link
              key={page.slug}
              href={`/best/${page.slug}`}
              className="group rounded-xl border border-sand-200 bg-white p-6 transition-colors hover:border-stone-300"
            >
              <p className="font-mono text-xs tracking-wide text-stone-400 uppercase">
                {page.category}
              </p>
              <h2 className="mt-2 text-lg font-bold tracking-tight text-stone-950 group-hover:text-stone-700">
                {page.headline}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-500">
                {page.subtitle}
              </p>
              <p className="mt-4 font-mono text-xs text-stone-400">
                {page.tools.length} tools reviewed
              </p>
            </Link>
          ))}
        </div>
      </main>
      <CTABlock />
    </>
  );
}
