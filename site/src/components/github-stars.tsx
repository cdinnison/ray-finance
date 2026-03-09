const REPO = "cdinnison/ray-finance";

async function getStarCount(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.stargazers_count ?? null;
  } catch {
    return null;
  }
}

export async function GitHubStars() {
  const stars = await getStarCount();
  if (stars === null) return null;

  return (
    <a
      href={`https://github.com/${REPO}`}
      className="inline-flex items-center gap-1.5 text-sm text-stone-500 transition-colors hover:text-stone-900"
    >
      <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
      {stars.toLocaleString()} stars on GitHub
    </a>
  );
}
