import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { latestDaily, type DailyItem } from "@/lib/daily";
import { getProfile } from "@/lib/futureme";
import { db } from "@/lib/server-db";
import { PrintButton } from "./print-button";

function Column({ title, items, empty }: { title: string; items: DailyItem[]; empty: string }) {
  return (
    <section>
      <h3 className="border-b border-stone-900 pb-1 text-xs font-bold uppercase tracking-[0.2em] dark:border-stone-100">{title}</h3>
      {items.length ? (
        <ul className="mt-3 space-y-3">
          {items.map((i) => (
            <li key={i.source}>
              <p className="font-serif text-[15px] leading-6">{i.title}</p>
              <p className="text-xs text-stone-500">
                {i.detail && `${i.detail} · `}
                <span className="font-mono">{i.source}</span>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 font-serif text-sm italic text-stone-500">{empty}</p>
      )}
    </section>
  );
}

async function Issue() {
  await connection();
  const profile = getProfile(db());
  if (!profile) {
    return (
      <p>
        <Link href="/onboarding" className="underline">
          Tell me about yourself first.
        </Link>
      </p>
    );
  }
  const issue = latestDaily(db());
  const date = issue ? new Date(`${issue.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null;
  return (
    <div className="space-y-6">
      {issue ? (
        <article className="rounded-sm border border-stone-300 bg-[#fbf8f1] p-6 text-stone-900 shadow-sm sm:p-10 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100">
          <header className="border-b-4 border-double border-stone-900 pb-3 text-center dark:border-stone-100">
            <p className="font-serif text-4xl font-bold tracking-tight sm:text-5xl">FutureMe Daily</p>
            <p className="mt-2 flex justify-between text-[11px] uppercase tracking-widest text-stone-600 dark:text-stone-400">
              <span>{date}</span>
              <span>The journey of {profile.name}</span>
            </p>
          </header>
          <h2 className="mt-6 font-serif text-3xl font-bold leading-tight sm:text-4xl">{issue.headline}</h2>
          <p className="mt-3 font-serif text-lg leading-8 first-letter:float-left first-letter:mr-2 first-letter:text-5xl first-letter:font-bold">{issue.lead}</p>
          <div className="mt-8 grid gap-8 sm:grid-cols-3">
            <Column title="Wins this week" items={issue.wins} empty="The first win is still ahead." />
            <Column title="Milestones" items={issue.milestones} empty="No milestones yet." />
            <Column title="Still open" items={issue.open} empty="Nothing open. Plan the next chapter." />
          </div>
          {issue.reflection && (
            <blockquote className="mt-8 border-l-4 border-amber-700 pl-4 font-serif italic leading-7">
              {issue.reflection.title}
              <footer className="mt-1 text-xs not-italic text-stone-500">From your future self · {issue.reflection.source}</footer>
            </blockquote>
          )}
          {issue.editorNote && (
            <p className="mt-8 border-t border-stone-300 pt-4 font-serif text-sm dark:border-stone-700">
              <span className="font-bold uppercase tracking-widest">Editor&apos;s note.</span> {issue.editorNote}
            </p>
          )}
          <p className="mt-6 text-center text-[11px] text-stone-500">
            Every item above comes from a completed task, a goal or a saved note. Filed to your vault as {issue.notePath}.
          </p>
        </article>
      ) : (
        <p className="text-stone-600 dark:text-stone-400">No issue yet. Print your first one: it&apos;s written only from what you&apos;ve actually done.</p>
      )}
      <PrintButton hasIssue={!!issue} />
    </div>
  );
}

export default function DailyPage() {
  // A single root element: hidden routes kept by Cache Components are hidden by styling their root nodes.
  return (
    <div className="flex flex-1 flex-col">
      <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
        <Issue />
      </Suspense>
    </div>
  );
}
