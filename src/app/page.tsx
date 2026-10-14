import Link from "next/link";

export default function Home() {
  return (
    <section className="flex flex-1 flex-col justify-center gap-6 py-16">
      <p className="text-sm font-medium uppercase tracking-widest text-amber-700 dark:text-amber-400">FutureMe AI</p>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Meet the person you&apos;re becoming.</h1>
      <p className="max-w-xl text-lg leading-8 text-stone-600 dark:text-stone-400">
        Tell FutureMe where you are and where you want to be. Read a letter from your future self, talk it through, and
        turn it into steps you approve and track. Your memories stay in a Markdown vault you own.
      </p>
      <div className="flex gap-3">
        <Link href="/onboarding" className="rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300">
          Start
        </Link>
        <Link href="/chat" className="rounded-lg px-5 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-200/60 dark:text-stone-300 dark:hover:bg-stone-800">
          Talk to your future self
        </Link>
      </div>
    </section>
  );
}
