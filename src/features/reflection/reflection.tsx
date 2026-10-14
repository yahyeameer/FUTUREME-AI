"use client";

import { ArrowLeft, ArrowRight, BookmarkPlus, Check, Flag, Loader2, MessageCircle, RefreshCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import * as React from "react";
import { Presence } from "@/components/brand/presence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProvenanceBadge } from "@/features/memory/provenance";
import { convergence } from "@/lib/derive";
import { cn, formatDate } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";
import type { Reflection } from "@/types";

const ROMAN = ["I", "II", "III", "IV", "V", "VI"];

interface Chapter {
  id: string;
  label: string;
  render: (n: number) => React.ReactNode;
}

/** The first look at an imagined future: a short film in chapters, then a way back into action. */
export function ReflectionExperience() {
  const { workspace, run } = useWorkspace();
  const reflection = workspace.reflection;
  const [generating, setGenerating] = React.useState(false);

  const generate = async () => {
    setGenerating(true);
    await run((s) => s.generateReflection(), "Reflection saved to your vault");
    setGenerating(false);
  };

  if (!reflection) return <Cover onBegin={generate} generating={generating} />;
  return <Chapters key={reflection.id} reflection={reflection} onRegenerate={generate} generating={generating} />;
}

function Cover({ onBegin, generating }: { onBegin: () => void; generating: boolean }) {
  const { workspace } = useWorkspace();
  const profile = workspace.profile!;
  return (
    <section className="paper relative flex min-h-[calc(100dvh-3rem)] flex-col items-center justify-center overflow-hidden px-6 py-16 text-center lg:min-h-dvh">
      <HorizonNumerals year={profile.horizonYear} />
      <p className="relative t-label">A future reflection for {profile.name}</p>
      <h1 className="relative mt-5 max-w-3xl t-display text-balance">What could {profile.horizonYear} look like?</h1>
      <p className="relative mt-5 max-w-lg text-[14px] text-muted-foreground">
        FutureMe will imagine one possible future from your dream, your situation and the obstacles you named. It&apos;s a direction to explore, not a prediction.
      </p>
      <Button variant="primary" size="lg" className="relative mt-8" onClick={onBegin} disabled={generating}>
        {generating ? (
          <>
            <Loader2 className="animate-spin" /> Imagining your future…
          </>
        ) : (
          <>
            Begin the reflection <ArrowRight />
          </>
        )}
      </Button>
      {workspace.runtime.simulated && <p className="relative mt-3 t-meta">{workspace.runtime.mode === "demo" ? "Demo mode: written from a template, not a model." : "Written by the stand-in model."}</p>}
    </section>
  );
}

function HorizonNumerals({ year }: { year: number }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-display text-[34vw] leading-none text-transparent select-none lg:text-[22vw]"
      style={{ WebkitTextStroke: "1px var(--border-strong)" }}
    >
      {year}
    </span>
  );
}

function Chapters({ reflection, onRegenerate, generating }: { reflection: Reflection; onRegenerate: () => void; generating: boolean }) {
  const { workspace, run } = useWorkspace();
  const profile = workspace.profile!;
  const [index, setIndex] = React.useState(0);
  const [direction, setDirection] = React.useState(1);
  const [saved, setSaved] = React.useState<Set<string>>(new Set());

  const save = async (key: string, title: string, body: string) => {
    const ok = await run((s) => s.createMemory({ title: `Imagined: ${title}`, body, kind: "reflection", tags: ["future-reflection", "imagined"], imagined: true }), "Saved to memory as an imagined insight");
    if (ok) setSaved((s) => new Set(s).add(key));
  };

  const goalHref = (title: string, body: string) =>
    `/future-self?prompt=${encodeURIComponent(`From my future reflection: "${title}". ${body} Help me turn this into a goal with small first steps.`)}`;

  const insightActions = (key: string, title: string, body: string) => (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button asChild size="sm" variant="secondary">
        <Link href={goalHref(title, body)}>
          <Flag /> Turn into a goal
        </Link>
      </Button>
      <Button size="sm" variant="ghost" onClick={() => save(key, title, body)} disabled={saved.has(key)}>
        {saved.has(key) ? (
          <>
            <Check className="text-success" /> Saved
          </>
        ) : (
          <>
            <BookmarkPlus /> Save to memory
          </>
        )}
      </Button>
    </div>
  );

  const chapters: Chapter[] = [
    {
      id: "title",
      label: "Opening",
      render: () => (
        <div className="relative flex min-h-[60dvh] flex-col justify-center">
          <HorizonNumerals year={reflection.horizonYear} />
          <p className="relative t-label">
            {profile.name} · {reflection.horizonYear}
          </p>
          <h1 className="relative mt-5 t-display text-balance">{reflection.title}</h1>
          <p className="relative mt-6 max-w-xl text-[13px] text-muted-foreground">
            An imagined scenario, written {formatDate(reflection.createdAt, { day: "numeric", month: "long", year: "numeric" })} from what you&apos;ve shared. One possible direction, not a prediction.
          </p>
        </div>
      ),
    },
    {
      id: "aspiration",
      label: "The aspiration",
      render: (n) => (
        <div>
          <ChapterMark n={n} title="The aspiration" />
          <blockquote className="mt-8 font-display text-[clamp(1.75rem,1.2rem+2vw,2.75rem)] leading-[1.12] text-balance">“{reflection.aspiration}”</blockquote>
          <p className="mt-5 flex items-center gap-2 t-meta">
            <ProvenanceBadge value="user-stated" /> your words, from onboarding
          </p>
        </div>
      ),
    },
    {
      id: "letter",
      label: "The letter",
      render: (n) => (
        <div>
          <ChapterMark n={n} title={`A letter from ${reflection.horizonYear}`} />
          <div className="mt-8 max-w-[38rem] space-y-5 t-reading">
            {reflection.narrative.map((p, i) => (
              <motion.p key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.12, duration: 0.5 }} className={cn(i === 0 && "drop-cap")}>
                {p}
              </motion.p>
            ))}
          </div>
          <p className="mt-6 flex items-center gap-2 t-meta">
            <ProvenanceBadge value="ai-inferred" /> imagined by FutureMe{reflection.path ? ` · saved as ${reflection.path}` : ""}
          </p>
        </div>
      ),
    },
    ...(reflection.moments.length
      ? [
          {
            id: "moments",
            label: "Turning points",
            render: (n) => (
              <div>
                <ChapterMark n={n} title="Three moments that could change everything" />
                <ol className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
                  {reflection.moments.map((m, i) => (
                    <li key={m.title} className="flex flex-col bg-surface p-5">
                      <span className="font-display text-[44px] leading-none text-copper">{i + 1}</span>
                      <p className="mt-4 font-display text-[22px] leading-tight">{m.title}</p>
                      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{m.body}</p>
                      <div className="mt-auto">{insightActions(`moment-${i}`, m.title, m.body)}</div>
                    </li>
                  ))}
                </ol>
              </div>
            ),
          },
        ]
      : []),
    ...(reflection.shifts.length
      ? [
          {
            id: "shifts",
            label: "What changes",
            render: (n) => (
              <div>
                <ChapterMark n={n} title="What might change in you" />
                <dl className="mt-8 divide-y divide-border border-y border-border">
                  {reflection.shifts.map((s) => (
                    <div key={s.area} className="grid gap-2 py-4 sm:grid-cols-[9rem_1fr_auto_1fr] sm:items-baseline sm:gap-5">
                      <dt className="t-label">{s.area}</dt>
                      <dd className="text-[14px] text-muted-foreground">{s.from}</dd>
                      <ArrowRight className="hidden size-3.5 text-copper sm:block" aria-label="becomes" />
                      <dd className="font-display text-[19px] leading-snug">{s.to}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ),
          },
        ]
      : []),
    {
      id: "challenges",
      label: "What stands in the way",
      render: (n) => (
        <div>
          <ChapterMark n={n} title="What you'd need to get through" />
          {reflection.challenges.length ? (
            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {reflection.challenges.map((c, i) => (
                <li key={c.title} className="rounded-lg border border-border bg-surface p-5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-display text-[21px] leading-tight">{c.title}</p>
                    <ProvenanceBadge value={c.provenance} compact />
                  </div>
                  <p className="mt-2 text-[13px] text-muted-foreground">{c.body}</p>
                  {insightActions(`challenge-${i}`, `Overcome: ${c.title}`, c.body)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-8 text-muted-foreground">You didn&apos;t name any obstacles during onboarding. You can add them in Settings.</p>
          )}
        </div>
      ),
    },
    {
      id: "continue",
      label: "Now",
      render: () => (
        <div className="flex flex-col items-center py-6 text-center">
          <Presence convergence={convergence(workspace.tasks)} size={160} horizonLabel={String(reflection.horizonYear)} className="text-foreground" />
          <h2 className="mt-6 t-headline text-balance">The future is a direction, not a destination.</h2>
          <p className="mt-3 max-w-md text-[14px] text-muted-foreground">Talk it through with the version of you who got there, or go back to what you can do today.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <Button asChild variant="primary" size="lg">
              <Link href="/future-self">
                <MessageCircle /> Chat with your future
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/">Return to dashboard</Link>
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="mt-6" onClick={onRegenerate} disabled={generating}>
            {generating ? <Loader2 className="animate-spin" /> : <RefreshCw />} Imagine a different version
          </Button>
        </div>
      ),
    },
  ];

  const go = React.useCallback(
    (to: number) => {
      const clamped = Math.max(0, Math.min(chapters.length - 1, to));
      setDirection(clamped >= index ? 1 : -1);
      setIndex(clamped);
      window.scrollTo({ top: 0 });
    },
    [chapters.length, index],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName) && e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  const current = chapters[index];
  return (
    <div className="paper relative flex min-h-[calc(100dvh-3rem)] flex-col lg:min-h-dvh">
      <nav aria-label="Reflection chapters" className="sticky top-12 z-20 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-2.5 backdrop-blur-md sm:px-8 lg:top-0" data-print-hide>
        <Badge tone="copper">Imagined scenario</Badge>
        <ol className="flex flex-1 items-center gap-1 overflow-x-auto scrollbar-none">
          {chapters.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === index ? "step" : undefined}
                className={cn("flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] whitespace-nowrap transition-colors", i === index ? "text-foreground" : "text-subtle hover:text-muted-foreground")}
              >
                <span aria-hidden className={cn("h-px w-4 transition-colors", i <= index ? "bg-accent" : "bg-border-strong")} />
                <span className={cn(i !== index && "hidden md:inline")}>{c.label}</span>
              </button>
            </li>
          ))}
        </ol>
        <span className="hidden t-meta sm:inline">
          {index + 1} / {chapters.length}
        </span>
      </nav>

      <div className="mx-auto flex w-full max-w-[64rem] flex-1 flex-col justify-center px-5 py-10 sm:px-10 sm:py-14">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.section
            key={current.id}
            custom={direction}
            initial={{ opacity: 0, x: direction * 24, filter: "blur(4px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, x: direction * -24, filter: "blur(4px)" }}
            transition={{ duration: 0.38, ease: [0.2, 0.7, 0.2, 1] }}
            aria-label={current.label}
          >
            {current.render(index - 1)}
          </motion.section>
        </AnimatePresence>
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-background/80 px-4 py-3 backdrop-blur-md sm:px-8" data-print-hide>
        <Button variant="ghost" onClick={() => go(index - 1)} disabled={index === 0}>
          <ArrowLeft /> Back
        </Button>
        <p className="hidden t-meta sm:block">Use ← → to move between chapters</p>
        {index < chapters.length - 1 ? (
          <Button variant={index === 0 ? "primary" : "secondary"} onClick={() => go(index + 1)}>
            {index === 0 ? "Begin" : "Continue"} <ArrowRight />
          </Button>
        ) : (
          <Button asChild variant="primary">
            <Link href="/future-self">
              Chat with your future <ArrowRight />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function ChapterMark({ n, title }: { n: number; title: string }) {
  return (
    <header className="flex items-baseline gap-4">
      <span className="font-display text-[20px] text-copper italic">{ROMAN[n]}.</span>
      <h2 className="t-label !text-[12px]">{title}</h2>
      <span aria-hidden className="h-px flex-1 bg-border" />
    </header>
  );
}
