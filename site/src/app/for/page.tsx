import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeader } from "@/components/page-header";
import { CTABlock } from "@/components/cta-block";
import { personas } from "@/data/personas";

export const metadata: Metadata = {
  title: "Ray Finance for Every Life Stage | Ray Finance",
  description:
    "AI-powered financial advice tailored to your situation — whether you're a freelancer, parent, new grad, retiree, or couple. Open-source CLI.",
  alternates: {
    canonical: "/for",
  },
};

export default function ForPage() {
  return (
    <main>
      <Nav minimal />
      <div className="mx-auto max-w-5xl px-6 pt-32 pb-24">
        <Breadcrumbs crumbs={[{ label: "For" }]} />
        <PageHeader
          label="Built for you"
          title="Ray Finance for every life stage"
          subtitle="Your finances are unique. Ray connects to your bank and gives advice that fits your actual situation — not generic tips from a blog post."
        />

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {personas.map((p) => (
            <Link
              key={p.slug}
              href={`/for/${p.slug}`}
              className="rounded-xl border border-stone-200 bg-white p-6 transition-colors hover:border-stone-300"
            >
              <p className="text-base font-semibold text-stone-900">
                {p.persona}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-stone-500">
                {p.subtitle}
              </p>
            </Link>
          ))}
        </div>
      </div>
      <CTABlock />
    </main>
  );
}
