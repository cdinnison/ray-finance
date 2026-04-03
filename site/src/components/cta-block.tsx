import { CopyCommand } from "@/app/copy-command";

export function CTABlock() {
  return (
    <section className="bg-stone-950 py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
          Try Ray free
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-stone-400">
          Open source, local-first, and takes five minutes to set up.
        </p>
        <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <CopyCommand
            command="npm install -g ray-finance"
            className="rounded-full border border-stone-800 bg-stone-900 px-6 py-3.5 text-sm text-white"
          />
          <a
            href="https://github.com/cdinnison/ray-finance"
            className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-stone-900 transition-colors hover:bg-stone-100"
          >
            View on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
