import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { getProfile, latestReflection } from "@/lib/futureme";
import { db } from "@/lib/server-db";
import { StoryButton } from "./story-button";

async function Story() {
  await connection();
  if (!getProfile(db())) {
    return (
      <p>
        <Link href="/onboarding" className="underline">
          Tell me about yourself first.
        </Link>
      </p>
    );
  }
  const r = latestReflection(db());
  return (
    <div className="space-y-8">
      {r && (
        <article className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <div className="space-y-4 font-serif text-lg leading-8">
            {r.content.split(/\n{2,}/).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
          <p className="mt-6 text-xs text-stone-500">
            Saved to your vault as {r.note_path} · AI-imagined, one possible future
          </p>
        </article>
      )}
      <div className="flex items-center gap-4">
        <StoryButton hasStory={!!r} />
        {r && (
          <Link href="/chat" className="text-sm font-medium underline">
            Talk to them
          </Link>
        )}
      </div>
    </div>
  );
}

export default function FuturePage() {
  // A single root element: hidden routes kept by Cache Components are hidden by styling their root nodes.
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader eyebrow="Step 2" title="A letter from ten years ahead" />
      <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
        <Story />
      </Suspense>
    </div>
  );
}
