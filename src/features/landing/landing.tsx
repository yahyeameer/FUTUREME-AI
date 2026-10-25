"use client";

import { ArrowRight, AudioLines, Check, KeyRound, Library, Lock, Menu, MessageSquareText, Server, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { LivingMark } from "@/components/brand/living-mark";
import { Wordmark } from "@/components/brand/mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { recalculate } from "@/lib/scenario-math";
import { formatSpan } from "@/lib/simulator-paths";
import { cn } from "@/lib/utils";
import { BranchingPreview, exampleRoads } from "./branching-preview";
import { Journey } from "./journey";

const SECTIONS = [
  { id: "how", label: "How it works" },
  { id: "futures", label: "Futures" },
  { id: "future-self", label: "Future self" },
  { id: "privacy", label: "Privacy" },
  { id: "faq", label: "FAQ" },
] as const;

/** "Explore my future" goes to /start, which opens onboarding for someone new and the app for someone returning. */
const START = "/start";

export function Landing() {
  return (
    <div className="min-h-dvh bg-background">
      <a href="#main" className="sr-only z-[60] rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <Header />
      <main id="main" tabIndex={-1} className="outline-none">
        <Hero />
        <HowItWorks />
        <Futures />
        <FutureSelf />
        <Action />
        <Privacy />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  const [open, setOpen] = React.useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/welcome" className="rounded-md outline-offset-4" aria-label={`${BRAND.name}, top of page`}>
          <Wordmark withSymbol />
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-5 md:flex">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
              {s.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="primary" size="sm" className="hidden sm:inline-flex">
            <Link href={START}>Explore my future</Link>
          </Button>
          <Button variant="ghost" size="icon" className="md:hidden" aria-expanded={open} aria-controls="mobile-sections" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((o) => !o)}>
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>
      <nav id="mobile-sections" aria-label="Sections" hidden={!open} className="border-t border-border bg-background px-4 pb-4 md:hidden">
        <ul className="grid py-2">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} onClick={() => setOpen(false)} className="flex min-h-11 items-center text-[15px] text-foreground">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
        <Button asChild variant="primary" className="w-full">
          <Link href={START}>Explore my future</Link>
        </Button>
      </nav>
    </header>
  );
}

function Section({ id, eyebrow, title, lede, children, className }: { id: string; eyebrow: string; title: React.ReactNode; lede?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-16 border-t border-border/70", className)}>
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <p className="t-eyebrow">{eyebrow}</p>
        <h2 id={`${id}-title`} className="mt-3 max-w-2xl font-display text-[2.1rem] leading-[1.05] tracking-[-0.01em] text-balance sm:text-[2.75rem]">
          {title}
        </h2>
        {lede && <p className="mt-4 max-w-[38rem] text-[15px] leading-relaxed text-muted-foreground">{lede}</p>}
        {children}
      </div>
    </section>
  );
}

function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[36rem] bg-[radial-gradient(60%_60%_at_75%_0%,var(--accent-wash),transparent_70%)]" />
      <div aria-hidden className="pointer-events-none absolute top-[-12rem] left-[-10rem] size-[34rem] animate-[aurora_24s_ease-in-out_infinite] rounded-full bg-[radial-gradient(closest-side,rgb(200_146_95/0.14),transparent)] blur-3xl" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-20 sm:px-6 sm:pt-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16 lg:pb-28">
        <div className="min-w-0">
          <div className="flex items-center gap-4">
            <div data-theme="dark" className="relative w-24 shrink-0 rounded-full bg-[radial-gradient(circle_at_35%_28%,#2B2E36,#0B0C10_72%)] shadow-[0_22px_40px_-16px_rgb(60_45_20/0.55),inset_0_1px_0_rgb(255_255_255/0.12)] ring-1 ring-black/10">
              <LivingMark progress={0.3} />
            </div>
            <p className="t-eyebrow">{BRAND.category}</p>
          </div>
          <h1 id="hero-title" className="mt-5 font-display text-[3.2rem] leading-[0.98] tracking-[-0.02em] text-balance sm:text-[4.6rem]">
            {BRAND.tagline}
          </h1>
          <p className="mt-6 max-w-[34rem] text-[16px] leading-relaxed text-muted-foreground sm:text-[17px]">{BRAND.description}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="primary" size="lg">
              <Link href={START}>
                Explore my future <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <a href="#how">See how it works</a>
            </Button>
          </div>
          <p className="mt-6 max-w-md text-[12.5px] text-subtle">{BRAND.uncertainty}</p>
        </div>
        <BranchingPreview />
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <Section id="how" eyebrow="How it works" title="From where you are to a plan you can act on." lede="TOMORA follows one journey. Each screen in the app serves a step of it. Pick a step, or watch it play.">
      <Journey />
    </Section>
  );
}

/** A live what-if on an example road, using the same arithmetic the app uses. Nothing here calls a model. */
function Futures() {
  const road = React.useMemo(() => exampleRoads()[0], []);
  const [hours, setHours] = React.useState(road.hoursPerWeek);
  const [slip, setSlip] = React.useState(0);
  const r = recalculate(road, null, { hoursPerWeek: hours, slipMonths: slip });
  return (
    <Section
      id="futures"
      eyebrow="Explore different futures"
      title="Ask what if, and see what actually changes."
      lede="TOMORA uses AI to reason about which roads exist and what they depend on. The arithmetic (time, money, hours) is plain code, so the same inputs always give the same answer, and you can see when a number was recalculated rather than newly generated."
    >
      <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ul className="grid content-start gap-3 text-[14px]">
          {["What if I can only give five hours a week?", "What if I don't reach the first milestone?", "What if I have less money?", "What if I take a safer route instead?", "What if I study for another year first?"].map((q) => (
            <li key={q} className="flex items-start gap-3 border-b border-border pb-3">
              <span aria-hidden className="mt-[0.55em] h-px w-4 shrink-0 bg-accent" />
              {q}
            </li>
          ))}
        </ul>
        <div className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-medium">{road.name}</p>
            <Badge tone="accent">Recalculated</Badge>
          </div>
          <p className="mt-1 t-meta">Example road · model estimate {formatSpan(road.months)} at ~{road.hoursPerWeek} h a week</p>
          <label className="mt-6 grid gap-2">
            <span className="flex items-baseline justify-between text-[13px] text-muted-foreground">
              Hours a week you can give <span className="font-display text-[18px] text-foreground tabular-nums">{hours} h</span>
            </span>
            <input type="range" min={2} max={30} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
          </label>
          <fieldset className="mt-5">
            <legend className="text-[13px] text-muted-foreground">If the first milestone slips</legend>
            <div className="mt-2 flex gap-1.5">
              {[0, 3, 6].map((m) => (
                <button key={m} type="button" aria-pressed={slip === m} onClick={() => setSlip(m)} className={cn("min-h-10 flex-1 rounded-lg border text-[12.5px] transition-colors", slip === m ? "border-accent/60 bg-accent-wash" : "border-border text-muted-foreground hover:border-border-strong")}>
                  {m === 0 ? "On time" : `+${m} months`}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="mt-6 rounded-xl border border-border bg-surface-2/60 p-4" aria-live="polite">
            <p className="t-meta">Recalculated timeline</p>
            <p className="mt-1 font-display text-[2rem] leading-none tabular-nums">{formatSpan(r.months)}</p>
            <p className="mt-2 text-[12.5px] text-muted-foreground">{r.notes[0] ?? "Same as the road's own estimate."}</p>
          </div>
        </div>
      </div>
    </Section>
  );
}

function FutureSelf() {
  return (
    <Section
      id="future-self"
      eyebrow="Talk with your future self"
      title="A conversation with who you could become."
      lede="An AI persona speaking as a plausible future version of you, grounded in your goals and the road you chose. It isn't a real future you, and it says so when it's unsure."
    >
      <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ul className="grid content-start gap-4">
          {[
            ["Remembers what you allow", "Only notes you haven't excluded are used, and every one can be opened, corrected or deleted."],
            ["Asks before it advises", "Follow-up questions, trade-offs named plainly, and contradictions pointed out kindly."],
            ["Separates fact from guess", "What you told it is marked apart from what it inferred."],
            ["Ends with a next step", "Conversations turn into small plans, and nothing is added to your roadmap until you approve it."],
          ].map(([t, b]) => (
            <li key={t} className="flex gap-3">
              <Check className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-hidden />
              <div>
                <p className="text-[14px] font-medium">{t}</p>
                <p className="mt-0.5 text-[13.5px] text-muted-foreground">{b}</p>
              </div>
            </li>
          ))}
          <li className="flex gap-3">
            <AudioLines className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-hidden />
            <div>
              <p className="text-[14px] font-medium">Speak or type</p>
              <p className="mt-0.5 text-[13.5px] text-muted-foreground">Voice conversations work when a voice engine is set up on your server. Text always works.</p>
            </div>
          </li>
        </ul>
        <figure className="card p-5 sm:p-6" aria-label="Illustrative exchange">
          <div className="flex items-center gap-2">
            <MessageSquareText className="size-4 text-subtle" aria-hidden />
            <p className="t-meta">Illustrative exchange</p>
          </div>
          <div className="mt-5 grid gap-4 text-[14px] leading-relaxed">
            <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-surface-3 px-4 py-2.5">I keep saying I&apos;ll start the course, then the week fills up.</p>
            <div className="max-w-[92%]">
              <p>
                You told me you have about ten hours a week, but your last three weeks went to your job. That&apos;s not a willpower problem; it&apos;s a calendar one.
              </p>
              <p className="mt-2">Could two fixed evenings work, say Tuesday and Thursday? I don&apos;t know your shifts, so tell me if that&apos;s unrealistic.</p>
            </div>
          </div>
          <figcaption className="mt-5 border-t border-border pt-3 text-[11.5px] text-subtle">Written to show the tone. Real replies come from your own context.</figcaption>
        </figure>
      </div>
    </Section>
  );
}

function Action() {
  return (
    <Section id="action" eyebrow="Turn insight into action" title="Fewer, better next steps." lede="The road you choose becomes a short plan: the next three actions, this week's priorities, milestones with target windows and a review when they come due. Progress only moves when you complete a real step.">
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {[
          ["Next three actions", "Small enough to start this week, tied to the road you chose."],
          ["Milestones and reviews", "Target windows, not deadlines, with a check-in to ask what changed."],
          ["Plans you approve", "Your future self proposes; nothing lands on your roadmap until you say yes."],
        ].map(([t, b]) => (
          <div key={t} className="rounded-2xl border border-border bg-surface p-6">
            <p className="text-[15px] font-semibold">{t}</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{b}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Privacy() {
  const items = [
    { icon: Library, title: "Memory you can read", body: "What TOMORA remembers is a folder of plain notes. Open, correct, exclude or delete any of them." },
    { icon: Server, title: "Runs on your server", body: "Your data lives in a local database and Markdown files. A cloud copy is off unless you turn it on." },
    { icon: KeyRound, title: "Keys stay server-side", body: "Model and voice keys never reach the browser, and saved keys are encrypted at rest." },
    { icon: ShieldCheck, title: "Clear about the model", body: "Requests go to NVIDIA Nemotron on Nebius Token Factory, or to a local model in private mode." },
    { icon: AudioLines, title: "Voice only with consent", body: "A voice twin needs a recorded statement of consent in your own voice, and can be deleted." },
    { icon: Lock, title: "Nothing public by default", body: "An access code can lock the whole app. Share previews show the brand, never your goals." },
  ];
  return (
    <Section id="privacy" eyebrow="Privacy and control" title="Private by design. What you share stays yours.">
      <ul className="mt-12 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <li key={i.title}>
            <i.icon className="size-5 text-accent-ink" aria-hidden />
            <p className="mt-3 text-[15px] font-medium">{i.title}</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">{i.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const FAQ = [
  { q: "Does TOMORA predict my future?", a: "No. It lays out possible roads and what each depends on. Every time and cost is a range, every road lists the assumptions it rests on, and none of it is a forecast of what will happen to you." },
  { q: "What is the future self?", a: "An AI persona that speaks as a plausible future version of you, using the goals and context you've shared. It's a way to think things through, not a real person and not a prophecy." },
  { q: "Which AI does it use?", a: "NVIDIA Nemotron, served by Nebius Token Factory, for reasoning and conversation. Without a key, a built-in stand-in model fills in clearly labelled templates. A private mode can use a model running on your own machine instead." },
  { q: "Where is my information stored?", a: "On the server you run TOMORA on: a SQLite database and a folder of Markdown notes. An optional cloud copy in Supabase is off unless configured." },
  { q: "Can I correct or delete what it remembers?", a: "Yes. Every memory is a note in the Memory vault. You can edit it, stop it from being used in conversations, or delete it." },
  { q: "Does voice always work?", a: "Voice needs a voice engine key on your server, and voice cloning needs your recorded consent. When voice isn't available, everything works by text." },
  { q: "Can I try it without sharing anything?", a: "Yes. Demo mode fills the app with sample data in your browser and never calls a model or the internet." },
];

function Faq() {
  return (
    <Section id="faq" eyebrow="Questions" title="Frequently asked questions.">
      <div className="mt-10 max-w-3xl divide-y divide-border border-y border-border">
        {FAQ.map((f) => (
          <details key={f.q} className="group">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
              {f.q}
              <span aria-hidden className="text-subtle transition-transform duration-200 group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="pb-5 text-[14px] leading-relaxed text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <Wordmark withSymbol />
          <p className="mt-4 font-display text-[1.6rem] leading-tight">{BRAND.tagline}</p>
          <p className="mt-2 max-w-sm text-[13px] text-muted-foreground">{BRAND.promise}</p>
          <Button asChild variant="primary" className="mt-6">
            <Link href={START}>
              Explore my future <ArrowRight />
            </Link>
          </Button>
        </div>
        <nav aria-label="Footer" className="grid content-start gap-2 text-[13px]">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="text-muted-foreground hover:text-foreground">
              {s.label}
            </a>
          ))}
          <a href="https://github.com/yahyeameer/FUTUREME-AI" className="text-muted-foreground hover:text-foreground">
            Source code
          </a>
        </nav>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-5 text-[11.5px] text-subtle sm:px-6">
          {BRAND.name} · {BRAND.category} · Open source under Apache-2.0. {BRAND.uncertainty}
        </p>
      </div>
    </footer>
  );
}
