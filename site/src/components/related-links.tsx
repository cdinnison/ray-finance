import Link from "next/link";

interface RelatedLink {
  href: string;
  label: string;
  description: string;
}

export function RelatedLinks({
  title,
  links,
}: {
  title: string;
  links: RelatedLink[];
}) {
  if (links.length === 0) return null;

  return (
    <section className="mt-16 border-t border-stone-200 pt-16">
      <h2 className="text-xl font-bold tracking-tight text-stone-950">
        {title}
      </h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-xl border border-stone-200 bg-white p-5 transition-colors hover:border-stone-300"
          >
            <p className="text-sm font-semibold text-stone-900">
              {link.label}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-stone-500">
              {link.description}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
