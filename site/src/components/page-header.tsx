export function PageHeader({
  label,
  title,
  subtitle,
}: {
  label: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-16">
      <p className="font-mono text-sm tracking-wide text-stone-400 uppercase">
        {label}
      </p>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-stone-950 sm:text-4xl">
        {title}
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-stone-500">
        {subtitle}
      </p>
    </div>
  );
}
