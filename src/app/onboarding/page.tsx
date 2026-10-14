import { connection } from "next/server";
import { Suspense } from "react";
import { saveProfileAction } from "@/app/actions";
import { input, PageHeader, primaryButton } from "@/components/ui";
import { getProfile } from "@/lib/futureme";
import { db } from "@/lib/server-db";

const FIELDS = [
  { name: "dream", label: "Your 10-year dream", hint: "Who do you want to be, and what does your life look like?", rows: 4, required: true },
  { name: "current", label: "Where you are now", hint: "Work, studies, health, relationships, whatever matters.", rows: 3 },
  { name: "resources", label: "What you have to work with", hint: "Skills, time, people, money, tools.", rows: 2 },
  { name: "challenges", label: "What stands in the way", hint: "Obstacles, fears, constraints.", rows: 2 },
  { name: "values", label: "Your values", hint: "A few words, e.g. family, craft, courage.", rows: 1 },
] as const;

async function ProfileForm() {
  await connection();
  const p = getProfile(db());
  return (
    <form action={saveProfileAction} className="space-y-6">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Your name</span>
        <input name="name" required defaultValue={p?.name} className={input} />
      </label>
      {FIELDS.map((f) => (
        <label key={f.name} className="block space-y-1.5">
          <span className="text-sm font-medium">{f.label}</span>
          <span className="block text-xs text-stone-500">{f.hint}</span>
          <textarea name={f.name} rows={f.rows} required={"required" in f} defaultValue={p?.[f.name]} className={input} />
        </label>
      ))}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">How should your future self talk to you?</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          {[
            ["gentle", "Gentle and encouraging"],
            ["direct", "Warm but direct"],
            ["strategic", "Strategic and analytical"],
          ].map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input type="radio" name="style" value={value} defaultChecked={(p?.style ?? "direct") === value} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <button className={primaryButton}>{p ? "Update and see my future" : "Meet my future self"}</button>
    </form>
  );
}

export default function OnboardingPage() {
  // A single root element: hidden routes kept by Cache Components are hidden by styling their root nodes.
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader eyebrow="Step 1" title="Tell me about you">
        This becomes the first notes in your memory vault. You can change it any time.
      </PageHeader>
      <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
        <ProfileForm />
      </Suspense>
    </div>
  );
}
