import Image from "next/image";
import Link from "next/link";

function GitHubIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function Nav({ minimal }: { minimal?: boolean }) {
  if (minimal) {
    return (
      <nav aria-label="Main navigation" className="fixed top-0 left-0 right-0 z-50 border-b border-sand-200/60 bg-sand-50/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/">
            <Image src="/ray-logo-dark.png" alt="Ray" width={38} height={19} className="h-[19px] w-auto" />
          </Link>
          <a
            href="https://github.com/cdinnison/ray-finance"
            className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800"
          >
            <GitHubIcon />
            GitHub
          </a>
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label="Main navigation" className="fixed top-0 left-0 right-0 z-50 border-b border-sand-200/60 bg-sand-50/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/">
          <Image src="/ray-logo-dark.png" alt="Ray" width={38} height={19} className="h-[19px] w-auto" />
        </Link>
        {/* Desktop nav */}
        <div className="hidden items-center gap-8 sm:flex">
          <a
            href="#how-it-works"
            className="rounded-lg px-3 py-2 text-sm text-stone-500 transition-colors hover:text-stone-900"
          >
            How it works
          </a>
          <a
            href="#privacy"
            className="rounded-lg px-3 py-2 text-sm text-stone-500 transition-colors hover:text-stone-900"
          >
            Privacy
          </a>
          <a
            href="#pricing"
            className="rounded-lg px-3 py-2 text-sm text-stone-500 transition-colors hover:text-stone-900"
          >
            Pricing
          </a>
          <a
            href="https://github.com/cdinnison/ray-finance"
            className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800"
          >
            <GitHubIcon />
            View on GitHub
          </a>
        </div>
        {/* Mobile nav */}
        <div className="flex items-center gap-3 sm:hidden">
          <a href="#how-it-works" className="rounded-full px-2 py-2 text-xs text-stone-500">How</a>
          <a href="#pricing" className="rounded-full px-2 py-2 text-xs text-stone-500">Pricing</a>
          <a
            href="https://github.com/cdinnison/ray-finance"
            className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800"
          >
            <GitHubIcon />
            GitHub
          </a>
        </div>
      </div>
    </nav>
  );
}
