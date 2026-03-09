import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Nav } from "@/components/nav";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeader } from "@/components/page-header";
import { CTABlock } from "@/components/cta-block";
import { RelatedLinks } from "@/components/related-links";
import { personas, getPersonaBySlug } from "@/data/personas";

export function generateStaticParams() {
  return personas.map((p) => ({ persona: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ persona: string }>;
}): Promise<Metadata> {
  const { persona } = await params;
  const page = getPersonaBySlug(persona);
  if (!page) return {};

  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: {
      canonical: `/for/${page.slug}`,
    },
  };
}

export default async function PersonaPage({
  params,
}: {
  params: Promise<{ persona: string }>;
}) {
  const { persona } = await params;
  const page = getPersonaBySlug(persona);
  if (!page) notFound();

  const relatedLinks = page.relatedPersonas
    .map((slug) => {
      const related = getPersonaBySlug(slug);
      if (!related) return null;
      return {
        href: `/for/${related.slug}`,
        label: `Ray for ${related.persona}`,
        description: related.subtitle,
      };
    })
    .filter(Boolean) as { href: string; label: string; description: string }[];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: page.metaTitle,
    description: page.metaDescription,
    url: `https://rayfinance.app/for/${page.slug}`,
    isPartOf: {
      "@type": "WebSite",
      name: "Ray Finance",
      url: "https://rayfinance.app",
    },
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Nav minimal />
      <div className="mx-auto max-w-5xl px-6 pt-32 pb-24">
        <Breadcrumbs
          crumbs={[
            { label: "For", href: "/for" },
            { label: page.persona },
          ]}
        />
        <PageHeader
          label={`Ray for ${page.persona}`}
          title={page.headline}
          subtitle={page.subtitle}
        />

        {/* Pain Points */}
        <section className="mt-8">
          <h2 className="text-2xl font-extrabold tracking-tight text-stone-950">
            The challenge
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {page.painPoints.map((point) => (
              <div
                key={point.title}
                className="rounded-xl border border-stone-200 bg-white p-6"
              >
                <h3 className="text-base font-semibold text-stone-900">
                  {point.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-500">
                  {point.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How Ray Helps */}
        <section className="mt-24">
          <h2 className="text-2xl font-extrabold tracking-tight text-stone-950">
            How Ray helps
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {page.howRayHelps.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-stone-200 bg-white p-6"
              >
                <h3 className="text-base font-semibold text-stone-900">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-500">
                  {item.description}
                </p>
                <code className="mt-4 block whitespace-pre-wrap rounded-lg bg-stone-950 px-4 py-3 font-mono text-sm text-stone-300">
                  <span className="text-stone-500">{"❯ "}</span>
                  {item.exampleQuery}
                </code>
              </div>
            ))}
          </div>
        </section>

        {/* Scenario */}
        <section className="mt-24">
          <div className="overflow-hidden rounded-2xl border border-stone-800 bg-stone-950 shadow-2xl shadow-stone-900/10">
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
            <div className="p-5 font-mono text-[11px] leading-[1.7] sm:p-8 sm:text-[13px]">
              <p className="text-stone-500">{page.scenario.situation}</p>
              <div className="my-3 h-5" />
              <p className="text-stone-300">
                <span className="text-stone-500">{"❯ "}</span>
                {page.scenario.question}
              </p>
              <div className="my-3 h-5" />
              <p className="text-stone-300 leading-relaxed">
                {page.scenario.rayResponse}
              </p>
            </div>
          </div>
        </section>

        {/* Related Personas */}
        <RelatedLinks title="Explore more" links={relatedLinks} />
      </div>
      <CTABlock />
    </main>
  );
}
