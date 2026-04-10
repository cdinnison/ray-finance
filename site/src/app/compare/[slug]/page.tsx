import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "@/components/nav";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeader } from "@/components/page-header";
import { CTABlock } from "@/components/cta-block";
import { RelatedLinks } from "@/components/related-links";
import { comparisons, getComparisonBySlug } from "@/data/comparisons";
import type { ComparisonPage } from "@/data/comparisons";

export function generateStaticParams() {
  return comparisons.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getComparisonBySlug(slug);
  if (!page) return {};
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: { canonical: `/compare/${page.slug}` },
  };
}

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4 text-stone-900"
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
  );
}

function XIcon() {
  return (
    <svg
      className="h-4 w-4 text-stone-300"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

function CellValue({ value }: { value: string }) {
  if (value === "Yes" || value.startsWith("Yes")) {
    return (
      <span className="flex items-center gap-2">
        <CheckIcon />
        <span className="text-sm text-stone-700">{value}</span>
      </span>
    );
  }
  if (value === "No" || value.startsWith("No")) {
    return (
      <span className="flex items-center gap-2">
        <XIcon />
        <span className="text-sm text-stone-400">{value}</span>
      </span>
    );
  }
  return <span className="text-sm text-stone-700">{value}</span>;
}

function ComparisonTable({ page }: { page: ComparisonPage }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-left">
        <thead>
          <tr className="border-b border-stone-200">
            <th className="py-3 pr-4 text-xs font-medium tracking-wide text-stone-400 uppercase">
              Feature
            </th>
            <th className="py-3 px-4 text-xs font-medium tracking-wide text-stone-900 uppercase">
              Ray
            </th>
            <th className="py-3 pl-4 text-xs font-medium tracking-wide text-stone-400 uppercase">
              {page.competitor.name}
            </th>
          </tr>
        </thead>
        <tbody>
          {page.comparisonTable.map((row) => (
            <tr key={row.feature} className="border-b border-stone-100">
              <td className="py-3 pr-4 text-sm font-medium text-stone-900">
                {row.feature}
              </td>
              <td className="py-3 px-4">
                <CellValue value={row.ray} />
              </td>
              <td className="py-3 pl-4">
                <CellValue value={row.competitor} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VsPage({ page }: { page: ComparisonPage }) {
  const relatedLinks = page.relatedComparisons
    .map((slug) => {
      const related = getComparisonBySlug(slug);
      if (!related) return null;
      return {
        href: `/compare/${related.slug}`,
        label: related.title,
        description: related.heroSubtitle.slice(0, 100) + "...",
      };
    })
    .filter(Boolean) as { href: string; label: string; description: string }[];

  return (
    <main>
      <Nav minimal />
      <div className="mx-auto max-w-4xl px-6 pt-32 pb-24">
        <Breadcrumbs
          crumbs={[
            { label: "Compare", href: "/compare" },
            { label: page.title },
          ]}
        />
        <PageHeader
          label="Comparison"
          title={page.title}
          subtitle={page.heroSubtitle}
        />

        {/* Overview */}
        <section className="mb-16">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border-2 border-stone-900 bg-white p-6">
              <h3 className="text-base font-semibold text-stone-900">Ray</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                An open-source CLI that connects to your bank via Plaid and
                gives AI-powered financial advice. Runs locally on your machine.
                $0 self-hosted or $10/mo managed.
              </p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-6">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-stone-900">
                  {page.competitor.name}
                </h3>
                {page.competitor.status && (
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
                    {page.competitor.status}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                {page.competitor.description}
              </p>
            </div>
          </div>
        </section>

        {/* Comparison Table */}
        <section className="mb-16">
          <h2 className="mb-6 text-xl font-bold tracking-tight text-stone-950">
            Feature comparison
          </h2>
          <div className="rounded-xl border border-stone-200 bg-white p-6">
            <ComparisonTable page={page} />
          </div>
        </section>

        {/* Key Differences */}
        <section className="mb-16">
          <h2 className="mb-6 text-xl font-bold tracking-tight text-stone-950">
            Key differences
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {page.rayAdvantages.map((adv) => (
              <div
                key={adv.title}
                className="rounded-xl border border-stone-200 bg-white p-6"
              >
                <h3 className="text-sm font-semibold text-stone-900">
                  {adv.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-500">
                  {adv.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section className="mb-16">
          <h2 className="mb-6 text-xl font-bold tracking-tight text-stone-950">
            Pricing comparison
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border-2 border-stone-900 bg-white p-6">
              <p className="text-sm font-semibold text-stone-900">Ray</p>
              <p className="mt-2 text-2xl font-extrabold tracking-tight text-stone-900">
                $0{" "}
                <span className="text-sm font-normal text-stone-400">
                  self-hosted
                </span>
              </p>
              <p className="text-lg font-bold text-stone-700">
                $10
                <span className="text-sm font-normal text-stone-400">
                  /mo managed
                </span>
              </p>
              <p className="mt-2 text-xs text-stone-400">
                Open source, MIT licensed. All features included.
              </p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-6">
              <p className="text-sm font-semibold text-stone-900">
                {page.competitor.name}
              </p>
              <p className="mt-2 text-2xl font-extrabold tracking-tight text-stone-900">
                {page.competitor.pricing}
              </p>
              {page.competitor.status && (
                <p className="mt-2 text-xs text-stone-400">
                  {page.competitor.status}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Verdict */}
        <section className="mb-16">
          <h2 className="mb-6 text-xl font-bold tracking-tight text-stone-950">
            The verdict
          </h2>
          <div className="rounded-xl border border-stone-200 bg-white p-6">
            {page.verdict.split("\n").map((para, i) => (
              <p
                key={i}
                className="text-sm leading-relaxed text-stone-600 [&:not(:first-child)]:mt-4"
              >
                {para}
              </p>
            ))}
          </div>
        </section>

        <RelatedLinks title="More comparisons" links={relatedLinks} />
      </div>
      <CTABlock />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: `How does Ray compare to ${page.competitor.name}?`,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: page.verdict.replace(/\n/g, " "),
                },
              },
              {
                "@type": "Question",
                name: `What are the key differences between Ray and ${page.competitor.name}?`,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: page.rayAdvantages.map((a) => `${a.title}: ${a.description}`).join(" "),
                },
              },
            ],
          }),
        }}
      />
    </main>
  );
}

function AlternativePage({ page }: { page: ComparisonPage }) {
  const relatedLinks = page.relatedComparisons
    .map((slug) => {
      const related = getComparisonBySlug(slug);
      if (!related) return null;
      return {
        href: `/compare/${related.slug}`,
        label: related.title,
        description: related.heroSubtitle.slice(0, 100) + "...",
      };
    })
    .filter(Boolean) as { href: string; label: string; description: string }[];

  return (
    <main>
      <Nav minimal />
      <div className="mx-auto max-w-4xl px-6 pt-32 pb-24">
        <Breadcrumbs
          crumbs={[
            { label: "Compare", href: "/compare" },
            { label: page.title },
          ]}
        />
        <PageHeader
          label="Alternative"
          title={page.title}
          subtitle={page.heroSubtitle}
        />

        {/* Why people switch */}
        <section className="mb-16">
          <h2 className="mb-6 text-xl font-bold tracking-tight text-stone-950">
            Looking for a {page.competitor.name} alternative?
          </h2>
          <div className="rounded-xl border border-stone-200 bg-white p-6">
            <p className="text-sm leading-relaxed text-stone-600">
              {page.competitor.description}
            </p>
            {page.competitor.status && (
              <p className="mt-3 text-sm font-medium text-stone-900">
                Status: {page.competitor.status}
              </p>
            )}
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium tracking-wide text-stone-400 uppercase">
                  What {page.competitor.name} did well
                </p>
                <ul className="mt-3 space-y-2">
                  {page.competitor.pros.map((pro) => (
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
                <p className="text-xs font-medium tracking-wide text-stone-400 uppercase">
                  Where it fell short
                </p>
                <ul className="mt-3 space-y-2">
                  {page.competitor.cons.map((con) => (
                    <li
                      key={con}
                      className="flex items-start gap-2 text-sm text-stone-600"
                    >
                      <XIcon />
                      {con}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Why Ray */}
        <section className="mb-16">
          <h2 className="mb-6 text-xl font-bold tracking-tight text-stone-950">
            Why people choose Ray instead
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {page.rayAdvantages.map((adv) => (
              <div
                key={adv.title}
                className="rounded-xl border border-stone-200 bg-white p-6"
              >
                <h3 className="text-sm font-semibold text-stone-900">
                  {adv.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-500">
                  {adv.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Comparison Table */}
        <section className="mb-16">
          <h2 className="mb-6 text-xl font-bold tracking-tight text-stone-950">
            How Ray compares
          </h2>
          <div className="rounded-xl border border-stone-200 bg-white p-6">
            <ComparisonTable page={page} />
          </div>
        </section>

        {/* Verdict */}
        <section className="mb-16">
          <h2 className="mb-6 text-xl font-bold tracking-tight text-stone-950">
            The verdict
          </h2>
          <div className="rounded-xl border border-stone-200 bg-white p-6">
            {page.verdict.split("\n").map((para, i) => (
              <p
                key={i}
                className="text-sm leading-relaxed text-stone-600 [&:not(:first-child)]:mt-4"
              >
                {para}
              </p>
            ))}
          </div>
        </section>

        <RelatedLinks title="More comparisons" links={relatedLinks} />
      </div>
      <CTABlock />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: `What is the best alternative to ${page.competitor.name}?`,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: page.verdict.replace(/\n/g, " "),
                },
              },
              {
                "@type": "Question",
                name: `Why do people switch from ${page.competitor.name} to Ray?`,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: page.rayAdvantages.map((a) => `${a.title}: ${a.description}`).join(" "),
                },
              },
            ],
          }),
        }}
      />
    </main>
  );
}

export default async function ComparisonSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getComparisonBySlug(slug);
  if (!page) notFound();

  if (page.type === "alternative") {
    return <AlternativePage page={page} />;
  }
  return <VsPage page={page} />;
}
