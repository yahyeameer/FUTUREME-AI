"use client";

import { ArrowRight, AudioLines, Check, Cpu, KeyRound, Library, Lock, Menu, MessageSquareText, Server, ShieldCheck, X } from "lucide-react";
import { motion } from "motion/react";
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
import { Cosmos } from "@/features/onboarding/cosmos";
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
        <Roads />
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
    <header data-theme="dark" className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#07080B]/90 text-foreground backdrop-blur-xl backdrop-saturate-150">
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
          <Button asChild size="sm" className="hidden border-0 bg-[#C8B78F] text-[#14120D] shadow-[0_0_24px_-6px_#C8B78F] hover:bg-[#D6C79F] sm:inline-flex">
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
  const words = BRAND.tagline.split(" ");
  const last = words.pop();
  return (
    <section data-theme="dark" aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-[#07080B] text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-[-30%] left-[-15%] size-[48rem] animate-[aurora_24s_ease-in-out_infinite] rounded-full bg-[radial-gradient(closest-side,rgb(200_146_95/0.22),transparent)] blur-3xl" />
        <div className="absolute top-[-10%] right-[-20%] size-[52rem] animate-[aurora_30s_ease-in-out_infinite_reverse] rounded-full bg-[radial-gradient(closest-side,rgb(200_183_143/0.2),transparent)] blur-3xl" />
        <div className="absolute bottom-[-35%] left-[25%] size-[40rem] animate-[aurora_36s_ease-in-out_infinite] rounded-full bg-[radial-gradient(closest-side,rgb(96_116_148/0.18),transparent)] blur-3xl" />
        <div className="absolute inset-0 opacity-50 [background-image:linear-gradient(rgb(255_255_255/0.035)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.035)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:radial-gradient(ellipse_70%_60%_at_60%_40%,#000,transparent_75%)]" />
        <Cosmos className="left-1/4 [mask-image:linear-gradient(to_right,transparent,#000_35%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#07080B]" />
      </div>

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-14 sm:px-6 sm:pt-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-8 lg:pt-24 lg:pb-20">
        <div className="min-w-0">
          <Rise delay={0}>
            <p className="inline-flex max-w-full items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.05] py-1 pr-3.5 pl-1.5 text-[12px] text-[#F3F0E8]/80 shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] backdrop-blur-md">
              <span className="rounded-full bg-[#C8B78F] px-2 py-0.5 text-[10.5px] font-semibold tracking-wide text-[#14120D] uppercase">New</span>
              <span className="truncate">{BRAND.category} · powered by NVIDIA Nemotron</span>
            </p>
          </Rise>
          <Rise delay={0.08}>
            <h1 id="hero-title" className="mt-7 font-display text-[3.4rem] leading-[0.95] tracking-[-0.025em] text-balance text-[#F7F3EA] sm:text-[5.4rem]">
              {words.join(" ")}{" "}
              <span className="animate-[gradient-pan_6s_ease-in-out_infinite] bg-[linear-gradient(100deg,#C8925F_0%,#F7F1E1_35%,#C8B78F_60%,#C8925F_100%)] bg-[length:220%_100%] bg-clip-text pr-2 text-transparent italic">{last}</span>
            </h1>
          </Rise>
          <Rise delay={0.16}>
            <p className="mt-7 max-w-[34rem] text-[16.5px] leading-relaxed text-[#F3F0E8]/70 sm:text-[18px]">{BRAND.description}</p>
          </Rise>
          <Rise delay={0.24}>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="group/cta h-12 border-0 bg-[#C8B78F] px-6 text-[15px] text-[#14120D] shadow-[0_0_0_1px_rgb(247_241_225/0.25),0_10px_40px_-8px_rgb(200_183_143/0.75)] transition-[box-shadow,background-color] hover:bg-[#D6C79F] hover:shadow-[0_0_0_1px_rgb(247_241_225/0.35),0_14px_56px_-6px_rgb(200_183_143/0.95)]">
                <Link href={START}>
                  Explore my future <ArrowRight className="transition-transform group-hover/cta:translate-x-0.5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="h-12 border border-white/12 bg-white/[0.04] px-6 text-[15px] text-[#F3F0E8] backdrop-blur-md hover:bg-white/[0.08]">
                <a href="#how">See how it works</a>
              </Button>
            </div>
          </Rise>
          <Rise delay={0.32}>
            <p className="mt-7 max-w-md text-[12.5px] text-[#F3F0E8]/45">{BRAND.uncertainty}</p>
          </Rise>
        </div>

        <Rise delay={0.12} className="relative mx-auto w-full max-w-[19rem] sm:max-w-[27rem] lg:max-w-none">
          <LivingMark progress={0.35} ring={BRAND.tagline} label={`${BRAND.name}: today and the future you're steering toward`} />
          <FloatCard className="top-[14%] -left-[14%] [animation-delay:-1s]" eyebrow="Your future self" title="Future Amina · 2036" />
          <FloatCard className="top-[58%] -right-[2%] [animation-delay:-3s] sm:-right-[10%]" eyebrow="Compared" title="3 roads, re-ranked" />
          <FloatCard className="bottom-[0%] left-[2%] [animation-delay:-5s]" eyebrow="This week" title="Ship one small tool" check />
        </Rise>
      </div>

      <div className="relative mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:pb-20">
        <ul className="glass-panel grid gap-px overflow-hidden rounded-2xl sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map((f) => (
            <li key={f.title} className="flex items-start gap-3 px-5 py-4">
              <f.icon className="mt-0.5 size-4 shrink-0 text-[#C8B78F]" aria-hidden />
              <span>
                <span className="block text-[13.5px] font-medium text-[#F3F0E8]">{f.title}</span>
                <span className="block text-[12px] text-[#F3F0E8]/55">{f.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const FACTS = [
  { icon: Cpu, title: "NVIDIA Nemotron", body: "On Nebius Token Factory" },
  { icon: Lock, title: "A private workspace", body: "Your future self is yours alone" },
  { icon: Library, title: "Memory you can read", body: "Plain notes you can edit or delete" },
  { icon: ShieldCheck, title: "Asks before acting", body: "Nothing changes without your OK" },
] as const;

/** Fades and lifts in once, on load. */
function Rise({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 22, filter: "blur(10px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }} className={className}>
      {children}
    </motion.div>
  );
}

/** A small glass card drifting around the mark: what TOMORA does, as a glimpse. Decorative. */
function FloatCard({ eyebrow, title, check = false, className }: { eyebrow: string; title: string; check?: boolean; className?: string }) {
  return (
    <div aria-hidden className={cn("glass-panel absolute hidden animate-float rounded-xl px-3.5 py-2.5 [animation-duration:6s] sm:block", className)}>
      <p className="font-mono text-[9.5px] tracking-[0.2em] text-[#C8B78F] uppercase">{eyebrow}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-[13px] whitespace-nowrap text-[#F3F0E8]">
        {check && <Check className="size-3.5 text-[#C8B78F]" strokeWidth={3} />}
        {title}
      </p>
    </div>
  );
}

/** The branching example, right after the hero: one goal, several futures, each with its trade-offs. */
function Roads() {
  return (
    <section aria-labelledby="roads-title" className="relative">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
        <div>
          <p className="t-eyebrow">One goal, several futures</p>
          <h2 id="roads-title" className="mt-3 font-display text-[2.1rem] leading-[1.05] tracking-[-0.01em] text-balance sm:text-[2.75rem]">
            See the roads before you take one.
          </h2>
          <p className="mt-4 max-w-[30rem] text-[15px] leading-relaxed text-muted-foreground">
            Name where you want to go and TOMORA lays out clearly different ways there, each with its time, weekly hours, risk and the assumptions it rests on. Pick one to see its route.
          </p>
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
