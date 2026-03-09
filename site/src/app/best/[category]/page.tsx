import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "@/components/nav";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeader } from "@/components/page-header";
import { CTABlock } from "@/components/cta-block";
import { RelatedLinks } from "@/components/related-links";
import { curations, getCurationBySlug } from "@/data/curations";

export function generateStaticParams() {
  return curations.map((page) => ({ category: page.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const page = getCurationBySlug(category);
  if (!page) return {};

  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: {
      canonical: `/best/${page.slug}`,
    },
    openGraph: {
      title: page.metaTitle,
      description: page.metaDescription,
      url: `https://rayfinance.app/best/${page.slug}`,
    },
  };
}

function CheckIcon() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 shrink-0 text-stone-900"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 12.75l6 6 9-13.5"
      />
    </svg>
  );
}

function DotIcon() {
  return (
    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-stone-300" />
  );
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const page = getCurationBySlug(category);
  if (!page) notFound();

  const relatedPages = page.relatedCategories
    .map((slug) => getCurationBySlug(slug))
    .filter(Boolean);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: page.headline,
    description: page.metaDescription,
    url: `https://rayfinance.app/best/${page.slug}`,
    numberOfItems: page.tools.length,
    itemListElement: page.tools.map((tool, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: tool.name,
      url: tool.url,
    })),
  };

  return (
    <>
      <Nav minimal />
      <main className="mx-auto max-w-4xl px-6 pt-32 pb-24">
        <Breadcrumbs
          crumbs={[
            { label: "Best", href: "/best" },
            { label: page.category },
          ]}
        />
        <PageHeader
          label={page.category}
          title={page.headline}
          subtitle={page.subtitle}
        />

        {/* Editorial intro */}
        <section className="mb-16">
          {page.intro.split("\n\n").map((para, i) => (
            <p
              key={i}
              className="mt-4 text-base leading-relaxed text-stone-600 first:mt-0"
            >
              {para}
            </p>
          ))}
        </section>

        {/* Tool list */}
        <section className="space-y-8">
          {page.tools.map((tool, i) => (
            <div
              key={tool.name}
              className={`rounded-xl border bg-white p-6 ${
                tool.isRay
                  ? "border-2 border-stone-900"
                  : "border-stone-200"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-100 font-mono text-xs font-bold text-stone-500">
                    {i + 1}
                  </span>
                  <h3 className="text-lg font-bold tracking-tight text-stone-950">
                    {tool.name}
                  </h3>
                  {tool.isRay && (
                    <span className="rounded-full bg-stone-900 px-2.5 py-0.5 font-mono text-xs font-medium text-white">
                      Our pick
                    </span>
                  )}
                </div>
                <span className="rounded-full bg-stone-100 px-3 py-1 font-mono text-xs text-stone-500">
                  {tool.pricing}
                </span>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-stone-600">
                {tool.description}
              </p>

              <div className="mt-5 grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="mb-2 font-mono text-xs tracking-wide text-stone-400 uppercase">
                    Pros
                  </p>
                  <ul className="space-y-2">
                    {tool.pros.map((pro) => (
                      <li
                        key={pro}
                        className="flex items-start gap-2 text-sm text-stone-600"
                      >
                        <CheckIcon />
                        {pro}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 font-mono text-xs tracking-wide text-stone-400 uppercase">
                    Cons
                  </p>
                  <ul className="space-y-2">
                    {tool.cons.map((con) => (
                      <li
                        key={con}
                        className="flex items-start gap-2 text-sm text-stone-600"
                      >
                        <DotIcon />
                        {con}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-stone-100 pt-4">
                <a
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-stone-900 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-500"
                >
                  Visit {tool.name}
                </a>
                {tool.slug && !tool.isRay && (
                  <Link
                    href={`/compare/ray-vs-${tool.slug}`}
                    className="text-sm text-stone-600 underline decoration-stone-300 underline-offset-4 hover:decoration-stone-500"
                  >
                    Ray vs {tool.name}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </section>

        {/* Buying guide */}
        <section className="mt-16">
          <h2 className="text-xl font-bold tracking-tight text-stone-950">
            What to look for
          </h2>
          <p className="mt-4 text-base leading-relaxed text-stone-600">
            {page.buyingGuide}
          </p>
        </section>

        {/* Verdict */}
        <section className="mt-16 rounded-xl border border-stone-200 bg-stone-50 p-6">
          <h2 className="text-xl font-bold tracking-tight text-stone-950">
            Our verdict
          </h2>
          <p className="mt-4 text-base leading-relaxed text-stone-600">
            {page.verdict}
          </p>
        </section>

        {/* Related categories */}
        <RelatedLinks
          title="Related comparisons"
          links={relatedPages.map((p) => ({
            href: `/best/${p!.slug}`,
            label: p!.headline,
            description: p!.subtitle,
          }))}
        />
      </main>
      <CTABlock />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
