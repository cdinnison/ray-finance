import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Nav } from "@/components/nav";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeader } from "@/components/page-header";
import { CTABlock } from "@/components/cta-block";
import { RelatedLinks } from "@/components/related-links";
import { glossaryTerms, getTermBySlug } from "@/data/glossary";

interface PageProps {
  params: Promise<{ term: string }>;
}

export function generateStaticParams() {
  return glossaryTerms.map((t) => ({ term: t.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { term: slug } = await params;
  const term = getTermBySlug(slug);
  if (!term) return {};

  return {
    title: term.metaTitle,
    description: term.metaDescription,
    alternates: {
      canonical: `/learn/${term.slug}`,
    },
  };
}

export default async function TermPage({ params }: PageProps) {
  const { term: slug } = await params;
  const term = getTermBySlug(slug);
  if (!term) notFound();

  const relatedLinks = term.relatedTerms
    .map((s) => getTermBySlug(s))
    .filter((t) => t !== undefined)
    .map((t) => ({
      href: `/learn/${t.slug}`,
      label: t.term,
      description: t.definition.split(". ")[0] + ".",
    }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: term.term,
    description: term.definition,
    url: `https://rayfinance.app/learn/${term.slug}`,
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      name: "Ray Finance Glossary",
      url: "https://rayfinance.app/learn",
    },
  };

  return (
    <>
      <Nav minimal />
      <main className="min-h-screen bg-stone-50 pt-24">
        <article className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
          <Breadcrumbs
            crumbs={[
              { label: "Learn", href: "/learn" },
              { label: term.term },
            ]}
          />
          <PageHeader
            label="Glossary"
            title={term.term}
            subtitle={term.definition}
          />

          {/* Why it matters */}
          <section className="mb-12">
            <h2 className="mb-4 text-xl font-bold tracking-tight text-stone-950">
              Why it matters
            </h2>
            <p className="leading-relaxed text-stone-600">{term.whyItMatters}</p>
          </section>

          {/* Example */}
          {term.example && (
            <section className="mb-12 rounded-xl border border-stone-200 bg-white p-6">
              <p className="mb-2 font-mono text-xs tracking-wide text-stone-400 uppercase">
                Example
              </p>
              <p className="leading-relaxed text-stone-700">{term.example}</p>
            </section>
          )}

          {/* How Ray helps */}
          <section className="mb-12">
            <h2 className="mb-4 text-xl font-bold tracking-tight text-stone-950">
              How Ray helps
            </h2>
            <p className="mb-6 leading-relaxed text-stone-600">
              {term.howRayHelps.replace(/`[^`]+`/, "").replace(/  /, " ")}
            </p>
            {(() => {
              const match = term.howRayHelps.match(/`([^`]+)`/);
              if (!match) return null;
              return (
                <div className="overflow-hidden rounded-xl border border-stone-800 bg-stone-950">
                  <div className="flex items-center gap-2 border-b border-stone-800 px-4 py-2.5">
                    <span className="h-3 w-3 rounded-full bg-stone-700" />
                    <span className="h-3 w-3 rounded-full bg-stone-700" />
                    <span className="h-3 w-3 rounded-full bg-stone-700" />
                    <span className="ml-2 font-mono text-xs text-stone-500">
                      Terminal
                    </span>
                  </div>
                  <div className="p-4">
                    <code className="font-mono text-sm text-stone-300">
                      $ {match[1]}
                    </code>
                  </div>
                </div>
              );
            })()}
          </section>

          {/* Related terms */}
          <RelatedLinks title="Related terms" links={relatedLinks} />
        </article>
        <CTABlock />
      </main>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
