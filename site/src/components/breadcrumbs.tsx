import Link from "next/link";

interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  const items = [{ label: "Home", href: "/" }, ...crumbs];

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex flex-wrap items-center gap-1 font-mono text-xs text-stone-400">
          {items.map((crumb, i) => (
            <li key={i} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden="true">/</span>}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="underline decoration-stone-300 underline-offset-4 transition-colors hover:text-stone-600"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-stone-500">{crumb.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: items.map((crumb, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: crumb.label,
              ...(crumb.href
                ? { item: `https://rayfinance.app${crumb.href}` }
                : {}),
            })),
          }),
        }}
      />
    </>
  );
}
