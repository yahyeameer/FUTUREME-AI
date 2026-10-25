"use client";

import { ArrowLeft, ArrowRight, ArrowUpRight, BookmarkPlus, Check, Clock, Flag, Loader2, MessageCircle, Mountain, Quote, RefreshCw, Split } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import * as React from "react";
import { Presence } from "@/components/brand/presence";
import { CountUp } from "@/components/motion/count-up";
import { celebrate } from "@/components/motion/celebrate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProvenanceBadge } from "@/features/memory/provenance";
import { NorthStarPlate, Postmark, Summits } from "@/features/reflection/art";
import { COVERS, CoverPlate, coverIndexFor } from "@/features/reflection/covers";
import { convergence } from "@/lib/derive";
import { cn, formatDate } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";
import type { Reflection } from "@/types";

const ROMAN = ["I", "II", "III", "IV", "V", "VI"];
const EASE = [0.2, 0.7, 0.2, 1] as const;
const pad = (n: number) => String(n).padStart(2, "0");

interface Chapter {
  id: string;
  label: string;
  render: (n: number) => React.ReactNode;
}

/** The first look at an imagined future: a magazine issue in chapters, then a way back into action. */
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
        TOMORA will imagine one possible future from your dream, your situation and the obstacles you named. It&apos;s a direction to explore, not a prediction.
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

/** Words rise in one after another; screen readers get the sentence whole. */
function RisingWords({ text, delay = 0, step = 0.04, className }: { text: string; delay?: number; step?: number; className?: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((w, i) => (
          <React.Fragment key={i}>
            <motion.span className="inline-block" initial={{ opacity: 0, y: "0.45em" }} animate={{ opacity: 1, y: 0 }} transition={{ delay: delay + Math.min(i * step, 1.4), duration: 0.55, ease: EASE }}>
              {w}
            </motion.span>{" "}
          </React.Fragment>
        ))}
      </span>
    </span>
  );
}

/** Splits a greeting ("Dear yahye,") and a short sign-off off the letter, so the page can set them itself. */
function letterParts(narrative: string[]) {
  const short = (p?: string) => !!p && p.length < 48;
  const salutation = short(narrative[0]) && /^(dear|hi|hello|hey)\b/i.test(narrative[0]) ? narrative[0] : null;
  const rest = salutation ? narrative.slice(1) : narrative;
  const signoff = rest.length > 1 && short(rest.at(-1)) && !/[.!?]$/.test(rest.at(-1)!) ? rest.at(-1)! : null;
  return { salutation, body: signoff ? rest.slice(0, -1) : rest, signoff };
}

/** The shortest whole sentence after the opening, long enough to stand alone: the letter's pull quote. */
function pullQuoteOf(body: string[]) {
  const sentences = body
    .slice(1)
    .flatMap((p) => p.match(/[^.!?]+[.!?]+/g) ?? [])
    .map((s) => s.trim().replace(/\.{2,}$/, "."))
    .filter((s) => s.length >= 30 && s.length <= 150);
  return sentences.sort((a, b) => a.length - b.length)[0] ?? null;
}

/** Same day and month in the horizon year, so the years, weeks and days agree. */
function runway(horizonYear: number) {
  const now = new Date();
  const then = new Date(now);
  then.setFullYear(horizonYear);
  const days = Math.round((then.getTime() - now.getTime()) / 86_400_000);
  return days > 0 ? { years: horizonYear - now.getFullYear(), weeks: Math.round(days / 7), days } : null;
}

function Chapters({ reflection, onRegenerate, generating }: { reflection: Reflection; onRegenerate: () => void; generating: boolean }) {
  const { workspace, run } = useWorkspace();
  const profile = workspace.profile!;
  const [index, setIndex] = React.useState(0);
  const [direction, setDirection] = React.useState(1);
  const [saved, setSaved] = React.useState<Set<string>>(new Set());
  const [letterOpen, setLetterOpen] = React.useState(false);
  const [faced, setFaced] = React.useState<Set<number>>(new Set());
  const [coverShift, setCoverShift] = React.useState(0);
  const celebrated = React.useRef(false);
  const swipe = React.useRef<{ x: number; y: number } | null>(null);

  const year = reflection.horizonYear;
  // How far ahead the plan reaches, counted from when the letter was written.
  const span = Math.max(1, year - new Date(reflection.createdAt).getFullYear());
  const cover = (coverIndexFor(reflection.id, reflection.aspiration) + coverShift) % COVERS.length;
  const today = new Date().getFullYear();
  const letter = React.useMemo(() => letterParts(reflection.narrative), [reflection.narrative]);
  const pullQuote = React.useMemo(() => pullQuoteOf(letter.body), [letter.body]);
  const quoteAfter = letter.body.length > 2 ? Math.floor(letter.body.length / 2) - 1 : -1;
  const minutes = Math.max(1, Math.round(reflection.narrative.join(" ").split(/\s+/).length / 200));
  const lastLine = letter.body.at(-1);

  const save = async (key: string, title: string, body: string) => {
    const ok = await run((s) => s.createMemory({ title: `Imagined: ${title}`, body, kind: "reflection", tags: ["future-reflection", "imagined"], imagined: true }), "Saved to memory as an imagined insight");
    if (ok) setSaved((s) => new Set(s).add(key));
  };

  const goalHref = (title: string, body: string) =>
    `/future-self?prompt=${encodeURIComponent(`From my future reflection: "${title}". ${body} Help me turn this into a goal with small first steps.`)}`;

  const saveButton = (key: string, title: string, body: string, label = "Save to memory") => (
    <Button size="sm" variant="ghost" onClick={() => save(key, title, body)} disabled={saved.has(key)}>
      {saved.has(key) ? (
        <>
          <Check className="text-success" /> Saved
        </>
      ) : (
        <>
          <BookmarkPlus /> {label}
        </>
      )}
    </Button>
  );

  const insightActions = (key: string, title: string, body: string) => (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button asChild size="sm" variant="secondary">
        <Link href={goalHref(title, body)}>
          <Flag /> Turn into a goal
        </Link>
      </Button>
      {saveButton(key, title, body)}
    </div>
  );

  const face = (i: number, el: Element | null) => {
    if (faced.has(i)) return;
    const next = new Set(faced).add(i);
    setFaced(next);
    celebrate(el, { count: next.size === reflection.challenges.length ? 28 : 12, spread: next.size === reflection.challenges.length ? 110 : 60 });
  };

  const chapters: Chapter[] = [
    {
      id: "title",
      label: "Opening",
      render: () => (
        <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
          <div className="relative">
            <motion.p className="flex flex-wrap items-center gap-x-3 gap-y-1 t-label" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
              <span className="text-copper">
                {profile.name} · {year}
              </span>
              <span aria-hidden className="h-px w-8 bg-border-strong" />
              <span>The {year} issue</span>
            </motion.p>
            <h1 className="mt-5 font-display text-[clamp(3rem,1.6rem+5.2vw,6.25rem)] leading-[0.92] tracking-[-0.02em] text-balance">
              <RisingWords text={reflection.title} step={0.08} />
            </h1>
            <motion.p className="mt-6 max-w-xl font-serif text-[clamp(1.05rem,0.95rem+0.4vw,1.3rem)] leading-relaxed text-muted-foreground italic" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.6, ease: EASE }}>
              One possible {year}, imagined from everything you&apos;ve shared. Not a prediction: a direction worth walking toward.
            </motion.p>
            <motion.div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.6, ease: EASE }}>
              <Button variant="primary" size="lg" className="sheen" onClick={() => go(1)}>
                Read your future <ArrowRight />
              </Button>
              <span className="flex items-center gap-1.5 t-meta">
                <Clock className="size-3.5" /> {minutes} min read · written {formatDate(reflection.createdAt, { day: "numeric", month: "long", year: "numeric" })}
              </span>
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease: EASE }} className="lg:row-span-2">
            <CoverPlate index={cover} year={year} span={span} onShuffle={() => setCoverShift((n) => n + 1)} className="mx-auto max-w-[26rem]" />
          </motion.div>

          <nav aria-label="In this issue" className="lg:col-start-1 lg:row-start-2">
            <p className="t-label">In this issue</p>
            <ol className="mt-3 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
              {chapters.slice(1).map((c, i) => (
                <li key={c.id}>
                  <button type="button" onClick={() => go(i + 1)} className="group flex h-full w-full items-baseline gap-3 bg-surface/80 px-4 py-3 text-left transition-colors hover:bg-surface">
                    <span className="font-display text-[22px] leading-none text-copper italic">{pad(i + 1)}</span>
                    <span className="flex-1 text-[13px] font-medium">{c.label}</span>
                    <ArrowUpRight className="size-3.5 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      ),
    },
    {
      id: "aspiration",
      label: "The aspiration",
      render: (n) => {
        const left = runway(year);
        return (
          <div className="grid gap-12 lg:grid-cols-[1fr_17rem] lg:items-start">
            <div>
              <ChapterHead n={n} kicker="The aspiration" title="The life you said yes to." />
              <figure className="relative mt-10">
                <Quote aria-hidden className="mb-3 size-10 fill-copper-wash text-copper sm:size-12" strokeWidth={1.25} />
                <blockquote className="relative font-display text-[clamp(2rem,1.2rem+3vw,3.6rem)] leading-[1.06] tracking-[-0.01em] text-balance">
                  <RisingWords text={reflection.aspiration} delay={0.25} step={0.05} />
                </blockquote>
                <figcaption className="mt-6 flex flex-wrap items-center gap-2 t-meta">
                  <span className="h-px w-8 bg-copper" aria-hidden /> {profile.name}, in your own words <ProvenanceBadge value="user-stated" />
                </figcaption>
              </figure>
              {left && (
                <motion.dl className="mt-12 grid grid-cols-3 divide-x divide-border border-y border-border" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2, duration: 0.6, ease: EASE }}>
                  {[
                    { value: left.years, label: left.years === 1 ? "year" : "years" },
                    { value: left.weeks, label: "weeks" },
                    { value: left.days, label: "mornings" },
                  ].map((s) => (
                    <div key={s.label} className="flex flex-col-reverse px-3 py-4 first:pl-0 sm:px-5">
                      <dt className="mt-2 t-label">{s.label}</dt>
                      <dd className="font-display text-[clamp(1.75rem,1.2rem+2vw,3rem)] leading-none tabular-nums">
                        <CountUp value={s.value} duration={1600} />
                      </dd>
                    </div>
                  ))}
                </motion.dl>
              )}
              {left && <p className="mt-3 text-[13px] text-muted-foreground">Between today and {year}. Plenty of time, if you start spending it on purpose.</p>}
            </div>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.8, ease: EASE }}>
              <NorthStarPlate className="mx-auto max-w-[17rem]" />
            </motion.div>
          </div>
        );
      },
    },
    {
      id: "letter",
      label: "The letter",
      render: (n) => (
        <div>
          <ChapterHead n={n} kicker="The letter" title={`A letter from ${year}`} dek={`From ${profile.name}, ${year}. To ${profile.name}, ${today}.`} />
          <AnimatePresence mode="wait" initial={false}>
            {letterOpen ? (
              <motion.article key="open" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }} className="card paper relative mt-10 overflow-hidden px-6 py-8 sm:px-12 sm:py-12">
                <Postmark year={year} name={profile.name} className="absolute top-5 right-5 size-20 rotate-[-12deg] opacity-80 sm:size-24" />
                <p className="pr-24 font-display text-[clamp(1.5rem,1.2rem+1vw,2rem)] italic">{letter.salutation ?? `Dear ${profile.name},`}</p>
                <div className="mt-6 t-reading md:columns-2 md:gap-12 [&>p]:mb-5">
                  {letter.body.map((p, i) => (
                    <React.Fragment key={i}>
                      <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.1, duration: 0.5 }} className={cn(i === 0 && "drop-cap")}>
                        {p}
                      </motion.p>
                      {i === quoteAfter && pullQuote && (
                        <motion.figure initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5, duration: 0.6, ease: EASE }} className="rule-double my-7 border-b border-b-foreground pb-5 [column-span:all]">
                          <blockquote className="pt-4 text-center font-display text-[clamp(1.6rem,1.1rem+2vw,2.6rem)] leading-[1.1] text-balance italic">
                            <span className="text-gradient">“{pullQuote}”</span>
                          </blockquote>
                          <div className="mt-3 flex justify-center">{saveButton("pull-quote", "A line from my future", pullQuote, "Keep this line")}</div>
                        </motion.figure>
                      )}
                    </React.Fragment>
                  ))}
                </div>
                <div className="mt-8 flex flex-wrap items-end justify-between gap-4 border-t border-border pt-6">
                  <p className="font-display text-[clamp(1.6rem,1.3rem+1vw,2.2rem)] leading-none italic">
                    {profile.name}
                    <svg viewBox="0 0 200 16" className="mt-1 block h-3 w-40 text-copper" aria-hidden>
                      <motion.path d="M2 10 C 40 2 80 14 120 7 S 180 4 198 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.9, duration: 1.1, ease: EASE }} />
                    </svg>
                    <span className="mt-1 block t-meta not-italic">{letter.signoff ? `${letter.signoff} · ` : ""}writing from {year}</span>
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 t-meta break-all">
                    <ProvenanceBadge value="ai-inferred" /> imagined by TOMORA{reflection.path ? ` · saved as ${reflection.path}` : ""}
                  </p>
                </div>
              </motion.article>
            ) : (
              <motion.div key="sealed" exit={{ opacity: 0, y: -12, scale: 0.98 }} transition={{ duration: 0.35, ease: EASE }} className="mt-10 flex justify-center">
                <button
                  type="button"
                  onClick={() => setLetterOpen(true)}
                  className="group card card-hover paper relative w-full max-w-xl overflow-hidden px-6 pt-8 pb-10 text-left sm:px-10"
                  aria-label={`Open the letter from ${year}`}
                >
                  <svg viewBox="0 0 400 120" preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-24 w-full text-border-strong" aria-hidden>
                    <path d="M0 0 L200 104 L400 0" fill="var(--surface-2)" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  </svg>
                  <Postmark year={year} name={profile.name} className="absolute top-4 right-4 size-16 rotate-[-10deg] opacity-80 sm:size-20" />
                  <div className="relative mt-20 grid gap-1 font-serif text-[17px] italic">
                    <span>
                      <span className="t-label not-italic">To</span> {profile.name}, {today}
                    </span>
                    <span>
                      <span className="t-label not-italic">From</span> {profile.name}, {year}
                    </span>
                  </div>
                  <span className="pulse-ring absolute top-[5.25rem] left-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-copper font-display text-[22px] text-[#f5f2ea] italic shadow-[var(--shadow-lift)] transition-transform group-hover:scale-105">
                    {String(year).slice(-2)}
                  </span>
                  <span className="relative mt-6 flex items-center justify-center gap-2 t-label !text-copper">Tap the seal to open</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ),
    },
    ...(reflection.moments.length
      ? [
          {
            id: "moments",
            label: "Turning points",
            render: (n: number) => (
              <div>
                <ChapterHead n={n} kicker="Turning points" title="Three moments that could change everything" />
                <ol className="mt-10 grid gap-5 md:grid-cols-3">
                  {reflection.moments.map((m, i) => (
                    <motion.li key={m.title} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.12, duration: 0.55, ease: EASE }} className="card card-hover flex flex-col p-6">
                      <span className="font-display text-[64px] leading-none text-transparent" style={{ WebkitTextStroke: "1px var(--copper)" }}>
                        {pad(i + 1)}
                      </span>
                      <p className="mt-4 font-display text-[24px] leading-tight">{m.title}</p>
                      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{m.body}</p>
                      <div className="mt-auto">{insightActions(`moment-${i}`, m.title, m.body)}</div>
                    </motion.li>
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
            render: (n: number) => (
              <div>
                <ChapterHead n={n} kicker="What changes" title="Who you might become on the way" />
                <dl className="mt-10 divide-y divide-border border-y border-border">
                  {reflection.shifts.map((s, i) => (
                    <motion.div key={s.area} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.12, duration: 0.5, ease: EASE }} className="grid gap-2 py-5 sm:grid-cols-[9rem_1fr_auto_1.2fr] sm:items-baseline sm:gap-6">
                      <dt className="t-label !text-copper">{s.area}</dt>
                      <dd className="text-[15px] text-subtle line-through decoration-border-strong">{s.from}</dd>
                      <ArrowRight className="hidden size-4 text-copper sm:block" aria-label="becomes" />
                      <dd className="font-display text-[clamp(1.35rem,1.1rem+0.8vw,1.75rem)] leading-snug">{s.to}</dd>
                    </motion.div>
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
          <ChapterHead
            n={n}
            kicker="What stands in the way"
            title="Every summit starts as a wall."
            dek={reflection.challenges.length ? "These are the obstacles you named. Tap each one to face it." : undefined}
          />
          {reflection.challenges.length ? (
            <>
              <Summits count={reflection.challenges.length} faced={faced} className="mt-8" />
              <p className="mt-2 flex items-center gap-2 t-meta" aria-live="polite">
                {faced.size === reflection.challenges.length ? (
                  <>
                    <Check className="size-3.5 text-success" /> All {faced.size} faced. This is how {year} happens.
                  </>
                ) : (
                  <>
                    {faced.size} of {reflection.challenges.length} faced
                  </>
                )}
              </p>
              <ul className={cn("mt-6 grid gap-4 sm:grid-cols-2", reflection.challenges.length >= 3 && reflection.challenges.length !== 4 && "lg:grid-cols-3")}>
                {reflection.challenges.map((c, i) => (
                  <ObstacleCard
                    key={c.title}
                    index={i}
                    challenge={c}
                    faced={faced.has(i)}
                    onFace={(el) => face(i, el)}
                    year={year}
                    actions={insightActions(`challenge-${i}`, `Overcome: ${c.title}`, c.body)}
                  />
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-8 text-muted-foreground">You didn&apos;t name any obstacles during onboarding. You can add them in Settings.</p>
          )}
        </div>
      ),
    },
    {
      id: "continue",
      label: "Now",
      render: (n) => (
        <Finale
          n={n}
          year={year}
          lastLine={lastLine}
          onArrive={(el) => {
            if (celebrated.current) return;
            celebrated.current = true;
            celebrate(el, { count: 30, spread: 130 });
          }}
          presence={<Presence convergence={convergence(workspace.tasks)} size={220} horizonLabel={String(year)} className="text-foreground" />}
          goalHref={lastLine ? goalHref("My first move", lastLine) : undefined}
          onRegenerate={onRegenerate}
          generating={generating}
        />
      ),
    },
  ];

  function go(to: number) {
    const clamped = Math.max(0, Math.min(chapters.length - 1, to));
    setDirection(clamped >= index ? 1 : -1);
    setIndex(clamped);
    window.scrollTo({ top: 0 });
  }

  const onKey = React.useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "ArrowRight") go(index + 1);
    if (e.key === "ArrowLeft") go(index - 1);
  });

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Swipe between chapters on touch screens; mostly-vertical drags stay scrolls.
  const onTouchStart = (e: React.TouchEvent) => {
    swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
  };

  const current = chapters[index];
  const next = chapters[index + 1];
  return (
    <div className="paper relative flex min-h-[calc(100dvh-3rem)] flex-col lg:min-h-dvh" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <nav aria-label="Reflection chapters" className="sticky top-12 z-20 border-b border-border bg-background/80 px-4 pt-2.5 pb-2 backdrop-blur-md sm:px-8 lg:top-0" data-print-hide>
        <div className="flex items-center gap-3">
          <span className="hidden font-display text-[18px] leading-none italic sm:inline">The {year} issue</span>
          <Badge tone="copper">Imagined scenario</Badge>
          <span className="min-w-0 flex-1 truncate text-right text-[12px] font-medium sm:hidden">{current.label}</span>
          <span className="ml-auto t-meta">
            <span className="font-display text-[17px] text-foreground not-italic">{index + 1}</span> / {chapters.length}
          </span>
        </div>
        <ol className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${chapters.length}, minmax(0, 1fr))` }}>
          {chapters.map((c, i) => (
            <li key={c.id} className="min-w-0">
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === index ? "step" : undefined}
                aria-label={`${i + 1}. ${c.label}`}
                className={cn("group block w-full py-1 text-left", i === index ? "text-foreground" : "text-subtle hover:text-muted-foreground")}
              >
                <span className="hidden truncate pb-1.5 text-[11.5px] transition-colors md:block">
                  <span className="mr-1.5 font-mono text-[10px] opacity-70">{pad(i + 1)}</span>
                  {c.label}
                </span>
                <span className="relative block h-[3px] overflow-hidden rounded-full bg-border-strong/70 transition-colors group-hover:bg-border-strong">
                  <motion.span className="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-accent to-copper" initial={false} animate={{ scaleX: i <= index ? 1 : 0 }} transition={{ duration: 0.5, ease: EASE }} />
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="relative mx-auto flex w-full max-w-[72rem] flex-1 flex-col justify-center overflow-x-clip px-5 py-10 sm:px-10 sm:py-14">
        {index > 0 && (
          <span aria-hidden className="pointer-events-none absolute top-6 right-6 hidden font-display text-[44vw] leading-none text-transparent opacity-60 select-none sm:block lg:text-[18rem]" style={{ WebkitTextStroke: "1px var(--border-strong)" }}>
            {ROMAN[index - 1]}
          </span>
        )}
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.section
            key={current.id}
            custom={direction}
            initial={{ opacity: 0, x: direction * 32, filter: "blur(6px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, x: direction * -32, filter: "blur(6px)" }}
            transition={{ duration: 0.42, ease: EASE }}
            aria-label={current.label}
            className="relative"
          >
            {current.render(index - 1)}
          </motion.section>
        </AnimatePresence>
      </div>

      <div className="sticky bottom-[var(--tabbar)] flex items-center justify-between gap-3 border-t border-border bg-background/80 px-4 py-3 backdrop-blur-md sm:px-8" data-print-hide>
        <Button variant="ghost" onClick={() => go(index - 1)} disabled={index === 0}>
          <ArrowLeft /> Back
        </Button>
        <p className="hidden t-meta sm:block">← → or swipe to turn the page</p>
        {next ? (
          <Button variant={index === 0 ? "primary" : "secondary"} onClick={() => go(index + 1)}>
            {index === 0 ? "Begin" : "Continue"}
            <span className="hidden font-normal opacity-60 md:inline">· {next.label}</span> <ArrowRight />
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

function ChapterHead({ n, kicker, title, dek }: { n: number; kicker: string; title: string; dek?: string }) {
  return (
    <header className="relative max-w-3xl">
      <motion.p className="flex items-center gap-3 t-label !text-copper" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, ease: EASE }}>
        <span className="font-display text-[22px] tracking-normal normal-case italic">{ROMAN[n]}.</span>
        {kicker}
        <motion.span aria-hidden className="h-px w-14 origin-left bg-copper/50" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.2, duration: 0.6, ease: EASE }} />
      </motion.p>
      <h2 className="mt-4 font-display text-[clamp(2.4rem,1.5rem+3vw,4.25rem)] leading-[0.98] tracking-[-0.015em] text-balance">
        <RisingWords text={title} delay={0.1} step={0.06} />
      </h2>
      {dek && (
        <motion.p className="mt-4 max-w-xl font-serif text-[clamp(1.05rem,0.95rem+0.3vw,1.2rem)] text-muted-foreground italic" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45, duration: 0.6 }}>
          {dek}
        </motion.p>
      )}
    </header>
  );
}

/** A card with the obstacle on the front. Tapping it turns it over: faced, with the ways to act on it. */
function ObstacleCard({
  index,
  challenge,
  faced,
  onFace,
  year,
  actions,
}: {
  index: number;
  challenge: Reflection["challenges"][number];
  faced: boolean;
  onFace: (el: Element | null) => void;
  year: number;
  actions: React.ReactNode;
}) {
  return (
    <motion.li className="[perspective:1400px]" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + index * 0.1, duration: 0.55, ease: EASE }}>
      <motion.div className="grid [transform-style:preserve-3d]" initial={false} animate={{ rotateY: faced ? 180 : 0 }} transition={{ duration: 0.75, ease: EASE }}>
        <button
          type="button"
          onClick={(e) => onFace(e.currentTarget)}
          inert={faced}
          aria-label={`Face it: ${challenge.title}`}
          className={cn("card card-hover flex min-h-60 flex-col p-6 text-left [backface-visibility:hidden] [grid-area:1/1]", faced && "pointer-events-none")}
        >
          <span className="flex w-full items-start justify-between gap-3">
            <span className="font-display text-[56px] leading-none text-transparent" style={{ WebkitTextStroke: "1px var(--border-strong)" }}>
              {pad(index + 1)}
            </span>
            <ProvenanceBadge value={challenge.provenance} compact />
          </span>
          <span className="mt-auto pt-6 font-display text-[clamp(1.5rem,1.3rem+0.6vw,1.9rem)] leading-[1.08] text-balance">{challenge.title}</span>
          <span className="mt-4 inline-flex items-center gap-1.5 t-label !text-copper">
            <Mountain className="size-3.5" /> Tap to face it
          </span>
        </button>
        <div inert={!faced} className={cn("card ring-gradient flex min-h-60 flex-col p-6 [backface-visibility:hidden] [grid-area:1/1] [transform:rotateY(180deg)]", !faced && "pointer-events-none")}>
          <span className="inline-flex items-center gap-1.5 t-label !text-accent-ink">
            <Flag className="size-3.5" /> Faced
          </span>
          <p className="mt-3 font-display text-[22px] leading-tight">{challenge.title}</p>
          <p className="mt-2 text-[13px] text-muted-foreground">
            {challenge.body} In this version of {year}, it never fully went away. You built around it.
          </p>
          <div className="mt-auto">{actions}</div>
        </div>
      </motion.div>
    </motion.li>
  );
}

function Finale({
  n,
  year,
  lastLine,
  onArrive,
  presence,
  goalHref,
  onRegenerate,
  generating,
}: {
  n: number;
  year: number;
  lastLine?: string;
  onArrive: (el: Element | null) => void;
  presence: React.ReactNode;
  goalHref?: string;
  onRegenerate: () => void;
  generating: boolean;
}) {
  const art = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const t = window.setTimeout(() => onArrive(art.current), 500);
    return () => window.clearTimeout(t);
    // Once, when the last chapter opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid items-center gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
      <motion.div ref={art} className="relative mx-auto grid place-items-center" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease: EASE }}>
        <span aria-hidden className="absolute size-[17rem] rounded-full bg-[radial-gradient(circle,var(--accent-wash),transparent_70%)] animate-breathe" />
        {presence}
        <p className="relative mt-4 max-w-[16rem] text-center t-meta">Today and {year}. They move closer only when you finish real steps.</p>
      </motion.div>
      <div>
        <ChapterHead n={n} kicker="Now" title="The future is a direction, not a destination." />
        {lastLine && (
          <motion.figure className="mt-8 border-l-2 border-copper pl-5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.6, ease: EASE }}>
            <figcaption className="t-label">The last line of your letter</figcaption>
            <blockquote className="mt-2 font-serif text-[clamp(1.1rem,1rem+0.4vw,1.3rem)] leading-relaxed italic">{lastLine}</blockquote>
          </motion.figure>
        )}
        <motion.div className="mt-8 flex flex-wrap gap-2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.6, ease: EASE }}>
          {goalHref && (
            <Button asChild variant="primary" size="lg" className="sheen">
              <Link href={goalHref}>
                <Flag /> Make it this week&apos;s goal
              </Link>
            </Button>
          )}
          <Button asChild variant="secondary" size="lg">
            <Link href="/future-self">
              <MessageCircle /> Chat with your future
            </Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/simulator">
              <Split /> Explore roads
            </Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/">Return to dashboard</Link>
          </Button>
        </motion.div>
        <Button variant="ghost" size="sm" className="mt-5 -ml-2" onClick={onRegenerate} disabled={generating}>
          {generating ? <Loader2 className="animate-spin" /> : <RefreshCw />} Imagine a different version
        </Button>
      </div>
    </div>
  );
}
