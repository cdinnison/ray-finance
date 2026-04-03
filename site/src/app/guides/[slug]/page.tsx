import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Nav } from "@/components/nav";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeader } from "@/components/page-header";
import { CTABlock } from "@/components/cta-block";
import { RelatedLinks } from "@/components/related-links";
import { guides, getGuideBySlug } from "@/data/guides";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return guides.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);
  if (!guide) return {};

  return {
    title: guide.metaTitle,
    description: guide.metaDescription,
    alternates: {
      canonical: `/guides/${guide.slug}`,
    },
  };
}

export default async function GuidePage({ params }: PageProps) {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);
  if (!guide) notFound();

  const relatedLinks = guide.relatedGuides
    .map((s) => getGuideBySlug(s))
    .filter((g) => g !== undefined)
    .map((g) => ({
      href: `/guides/${g.slug}`,
      label: g.title,
      description: g.subtitle.split(". ")[0] + ".",
    }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: guide.title,
    description: guide.subtitle,
    url: `https://rayfinance.app/guides/${guide.slug}`,
    step: guide.steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.title,
      text: s.body,
    })),
  };

  return (
    <>
      <Nav minimal />
      <main className="min-h-screen bg-stone-50 pt-24">
        <article className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
          <Breadcrumbs
            crumbs={[
              { label: "Guides", href: "/guides" },
              { label: guide.title },
            ]}
          />
          <PageHeader
            label="Guide"
            title={guide.title}
            subtitle={guide.subtitle}
          />

          {/* Steps */}
          <div className="space-y-8">
            {guide.steps.map((step, i) => (
              <section key={i} className="relative pl-10">
                <div className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white">
                  {i + 1}
                </div>
                {i < guide.steps.length - 1 && (
                  <div className="absolute left-[13px] top-8 bottom-[-16px] w-px bg-stone-200" />
                )}
                <h3 className="text-lg font-bold tracking-tight text-stone-950">
                  {step.title}
                </h3>
                <p className="mt-2 leading-relaxed text-stone-600">
                  {step.body.split("`").map((part, j) =>
                    j % 2 === 1 ? (
                      <code
                        key={j}
                        className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-sm font-semibold text-stone-900"
                      >
                        {part}
                      </code>
                    ) : (
                      <span key={j}>{part}</span>
                    )
                  )}
                </p>
                {step.link && (
                  <a
                    href={step.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-sm text-stone-400 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-stone-600"
                  >
                    {new URL(step.link).hostname.replace("www.", "")} →
                  </a>
                )}
              </section>
            ))}
          </div>

          {/* Tip */}
          {guide.tip && (
            <div className="mt-12 rounded-xl border border-stone-200 bg-white p-6">
              <p className="mb-1 font-mono text-xs tracking-wide text-stone-400 uppercase">
                Skip the setup?
              </p>
              <p className="leading-relaxed text-stone-600">
                {guide.tip.split("`").map((part, j) =>
                  j % 2 === 1 ? (
                    <code
                      key={j}
                      className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-sm font-semibold text-stone-900"
                    >
                      {part}
                    </code>
                  ) : (
                    <span key={j}>{part}</span>
                  )
                )}
              </p>
            </div>
          )}

          {/* Related guides */}
          <div className="mt-12">
            <RelatedLinks title="Related guides" links={relatedLinks} />
          </div>
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
