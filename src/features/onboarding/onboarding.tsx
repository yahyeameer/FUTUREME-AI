"use client";

import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ClockFace, Wordmark } from "@/components/brand/mark";
import { Orb } from "@/components/brand/orb";
import { Presence } from "@/components/brand/presence";
import { celebrate } from "@/components/motion/celebrate";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Field, PlanLengthField, StyleField, toProfile, useProfileForm, type ProfileValues } from "@/features/settings/profile-form";
import { BRAND } from "@/lib/brand";
import { usePreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { useWorkspaceContext } from "@/lib/workspace-store";
import { Cosmos } from "./cosmos";

// Progressive: three short steps, only the first required. Each says why it asks, and everything can be edited later
// in Settings. Nothing is saved until the last step.
const STEPS: { short: string; title: string; lede: string; why: string; optional?: boolean; fields: (keyof ProfileValues)[] }[] = [
  {
    short: "Your ambition",
    title: "Who are you becoming?",
    lede: "Your future self starts from the ambition you name here. Be as specific as you can.",
    why: "Every possible future TOMORA explores is a road toward this ambition.",
    fields: ["name", "dream", "horizonYear"],
  },
  {
    short: "Where you are now",
    title: "Where are you now?",
    lede: "The honest starting point. It keeps plans grounded in what you actually have.",
    why: "Roads are only useful if they start from what's true. Share as much or as little as you like; money and hours can be added later, when you compare roads.",
    optional: true,
    fields: ["current", "resources", "challenges"],
  },
  {
    short: "How it speaks to you",
    title: "How should your future self speak?",
    lede: "You can change this any time, or for a single conversation.",
    why: "Values help your future self point out trade-offs that matter to you.",
    fields: ["values", "style"],
  },
];

const ROMAN = ["I", "II", "III"];
// The two circles of the Presence draw closer as the picture of your future fills in.
const CONVERGENCE = [0.12, 0.42, 0.72];
const EASE = [0.22, 1, 0.36, 1] as const;

type Draft = { name: string; dream: string; year?: number };

export function Onboarding() {
  const { status, workspace, error, reload, resetDemoData } = useWorkspaceContext();
  const { set } = usePreferences();
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [draft, setDraft] = React.useState<Draft>({ name: "", dream: "" });
  const [arriving, setArriving] = React.useState<Draft | null>(null);
  // The orb spins up for a moment each time you move to a new step.
  const [stirred, setStirred] = React.useState(false);
  const calm = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const moveTo = React.useCallback((n: number) => {
    setStep(n);
    setStirred(true);
    clearTimeout(calm.current);
    calm.current = setTimeout(() => setStirred(false), 1400);
  }, []);

  const exploreDemo = () => {
    resetDemoData("seed");
    set("mode", "demo");
    router.push("/");
  };

  const convergence = arriving ? 1 : CONVERGENCE[step];

  return (
    <div className="relative isolate grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden p-3 lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <div className="relative flex flex-1 flex-col overflow-hidden rounded-[1.5rem] bg-[linear-gradient(180deg,#171B22_0%,#101113_100%)] p-10 text-[#F3F0E8] ring-1 ring-white/[0.06]">
          <Cosmos step={step} />
          <Link href="/welcome" className="relative self-start rounded-md outline-offset-4" aria-label="TOMORA welcome page">
            <Wordmark withSymbol className="text-[#F3F0E8]" />
          </Link>

          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center py-4">
            <motion.div initial={{ opacity: 0, scale: 0.8, filter: "blur(14px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} transition={{ duration: 1.2, ease: EASE }}>
              <Orb size={270} horizonYear={draft.year} active={stirred || !!arriving} className="text-[#F3F0E8]">
                <Presence convergence={convergence} size={178} horizonLabel={draft.name ? `Future ${draft.name}` : "Possible you"} />
              </Orb>
            </motion.div>
            <FutureLine draft={draft} />
          </div>

          <div className="relative">
            <Tagline />
            <Timeline step={step} />
            <p className="mt-6 max-w-sm text-[12px] text-[#F3F0E8]/50">Nothing is saved until you finish. Your answers stay on this TOMORA server, and you can edit or delete them in Settings.</p>
          </div>
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-col px-5 py-8 sm:px-10 lg:px-16 lg:py-12">
        <Glow step={step} />
        <div className="flex items-center justify-between gap-4 lg:justify-end">
          <Link href="/welcome" className="rounded-md lg:hidden" aria-label="TOMORA welcome page">
            <Wordmark withSymbol />
          </Link>
          <Button variant="link" size="sm" className="px-0" onClick={exploreDemo}>
            Explore with demo data
          </Button>
        </div>

        {/* On a phone the orb sits above the form instead of beside it. */}
        <div className="relative mx-auto mt-6 lg:hidden">
          <Orb size={200} horizonYear={draft.year} active={stirred || !!arriving}>
            <Presence convergence={convergence} size={132} />
          </Orb>
        </div>

        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-8 lg:py-10">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE, delay: 0.15 }} className="relative overflow-hidden rounded-[1.65rem] p-px shadow-[var(--shadow-float)]">
            {/* A light running the card's edge, like the second hand on the dial. */}
            <div aria-hidden className="absolute top-1/2 left-1/2 aspect-square w-[160%] -translate-x-1/2 -translate-y-1/2 animate-[orbit_7s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_250deg,rgb(200_146_95/0.55)_300deg,rgb(200_183_143/0.95)_340deg,transparent_360deg)]" />
            <div aria-hidden className="absolute inset-0 bg-border" style={{ zIndex: -1 }} />
            <div className="card relative rounded-[1.6rem] border-0 p-6 sm:p-9">
              {status === "loading" ? (
                <div aria-busy="true" aria-label="Loading">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-4 h-10 w-80 max-w-full" />
                  <Skeleton className="mt-8 h-40 w-full" />
                </div>
              ) : status === "error" ? (
                <ErrorState title="Couldn't reach TOMORA" message={error ?? "Unknown error."} onRetry={reload} />
              ) : (
                <ProfileSteps key={workspace?.runtime.mode} step={step} setStep={moveTo} onDraft={setDraft} onArrive={setArriving} />
              )}
            </div>
          </motion.div>
        </div>
      </main>

      <AnimatePresence>{arriving && <Arrival draft={arriving} />}</AnimatePresence>
    </div>
  );
}

/** What you've typed so far, written back to you as the future self you're describing. */
function FutureLine({ draft }: { draft: Draft }) {
  const title = `${draft.name ? `Future ${draft.name}` : "The future you"}${draft.year ? `, ${draft.year}` : ""}`;
  return (
    <div aria-hidden className="mt-4 flex min-h-[5.5rem] w-full max-w-sm flex-col items-center text-center">
      <AnimatePresence mode="wait" initial={false}>
        <motion.p key={title} initial={{ opacity: 0, y: 6, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -6, filter: "blur(6px)" }} transition={{ duration: 0.35 }} className="font-display text-[1.35rem] text-[#E9DFC6]">
          {title}
        </motion.p>
      </AnimatePresence>
      <p className="mt-1.5 line-clamp-2 font-display text-[15px] text-[#F3F0E8]/60 italic">
        {draft.dream ? <>“{draft.dream}”</> : "Is waiting to hear where you're headed"}
        <span className="ml-0.5 inline-block h-[1em] w-px translate-y-[2px] animate-caret bg-[#C8B78F]" />
      </p>
    </div>
  );
}

/** The tagline, word by word, with "you" catching the light. */
function Tagline() {
  const words = BRAND.tagline.split(" ");
  return (
    <p className="max-w-md font-display text-[2.6rem] leading-[1.02] text-balance">
      {words.map((w, i) => {
        const last = i === words.length - 1;
        return (
          <motion.span key={i} initial={{ opacity: 0, y: 18, filter: "blur(10px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.8, ease: EASE, delay: 0.5 + i * 0.12 }} className={cn("inline-block", !last && "mr-[0.24em]")}>
            <span className={cn(last && "animate-[gradient-pan_5s_ease-in-out_infinite] bg-[linear-gradient(100deg,#C8B78F_0%,#F7F1E1_35%,#C8925F_65%,#C8B78F_100%)] bg-[length:220%_100%] bg-clip-text text-transparent italic")}>{w}</span>
          </motion.span>
        );
      })}
    </p>
  );
}

/** The three steps as a short timeline, with a light that travels to where you are. */
function Timeline({ step }: { step: number }) {
  return (
    <ol className="relative mt-6 grid gap-4">
      <span aria-hidden className="absolute top-3 bottom-3 left-[13px] w-px bg-white/10" />
      <motion.span aria-hidden className="absolute top-[13px] left-[13px] w-px bg-gradient-to-b from-[#C8925F] to-[#C8B78F]" initial={false} animate={{ height: step * 43 }} transition={{ duration: 0.7, ease: EASE }} />
      {STEPS.map((s, i) => {
        const done = i < step;
        const now = i === step;
        return (
          <motion.li key={s.short} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.9 + i * 0.1, ease: EASE }} className="relative flex items-center gap-4" aria-current={now ? "step" : undefined}>
            <span className={cn("relative flex size-[27px] shrink-0 items-center justify-center rounded-full border font-display text-[11px] transition-colors duration-500", done ? "border-[#C8B78F] bg-[#C8B78F] text-[#101113]" : now ? "border-[#C8B78F] bg-[#101113] text-[#E9DFC6]" : "border-white/15 bg-[#101113] text-[#F3F0E8]/40")}>
              {done ? <Check className="size-3.5" strokeWidth={3} /> : ROMAN[i]}
              {now && <motion.span layoutId="timeline-now" className="absolute -inset-[5px] rounded-full border border-[#C8B78F]/60 shadow-[0_0_18px_-2px_#C8B78F]" transition={{ type: "spring", stiffness: 260, damping: 26 }} />}
            </span>
            <span className={cn("text-[13px] transition-colors duration-500", now ? "text-[#F3F0E8]" : "text-[#F3F0E8]/50")}>
              {s.short}
              {s.optional && <span className="ml-1.5 text-[11px] text-[#F3F0E8]/35">optional</span>}
            </span>
          </motion.li>
        );
      })}
    </ol>
  );
}

/** Soft light behind the form, moving a little with each step. */
function Glow({ step }: { step: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <motion.div className="absolute top-[-10%] size-[44rem] rounded-full bg-[radial-gradient(closest-side,var(--accent-wash),transparent)] blur-2xl" initial={false} animate={{ left: `${10 + step * 22}%` }} transition={{ duration: 1.4, ease: EASE }} />
      <div className="absolute right-[-10%] bottom-[-20%] size-[36rem] animate-[drift_22s_ease-in-out_infinite] rounded-full bg-[radial-gradient(closest-side,rgb(200_146_95/0.1),transparent)] blur-2xl" />
    </div>
  );
}

/** The moment you finish: the dial opens and time runs forward to the year you named. */
function Arrival({ draft }: { draft: Draft }) {
  return (
    <motion.div role="status" aria-live="polite" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className="fixed inset-0 z-[90] flex flex-col items-center justify-center overflow-hidden bg-[#101113]/90 text-[#F3F0E8] backdrop-blur-md">
      {[0, 1, 2].map((i) => (
        <motion.span key={i} aria-hidden className="absolute size-40 rounded-full border border-[#C8B78F]/60" initial={{ scale: 0.4, opacity: 0.9 }} animate={{ scale: 9, opacity: 0 }} transition={{ duration: 1.6, ease: "easeOut", delay: i * 0.25 }} />
      ))}
      <motion.div initial={{ scale: 0.6, rotate: -90, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ duration: 0.9, ease: EASE }} className="relative">
        <span aria-hidden className="absolute inset-0 animate-[glint_1.6s_ease-in-out_infinite] rounded-full shadow-[0_0_80px_10px_rgb(200_183_143/0.35)]" />
        <ClockFace animated className="relative size-28 text-[#F3F0E8] [&_g]:[animation-duration:2.5s]" />
      </motion.div>
      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.6 }} className="mt-8 font-display text-3xl">
        {draft.name ? `Future ${draft.name}` : "Your future self"} is waiting
      </motion.p>
      {draft.year && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mt-2 font-mono text-[12px] tracking-[0.3em] text-[#C8B78F]">
          {new Date().getFullYear()} → {draft.year}
        </motion.p>
      )}
    </motion.div>
  );
}

function ProfileSteps({ step, setStep, onDraft, onArrive }: { step: number; setStep: (n: number) => void; onDraft: (d: Draft) => void; onArrive: (d: Draft | null) => void }) {
  const { workspace, run } = useWorkspaceContext();
  const router = useRouter();
  const reduce = useReducedMotionConfig();
  const form = useProfileForm(workspace?.profile ?? null);
  const [saving, setSaving] = React.useState(false);
  const [direction, setDirection] = React.useState(1);
  const heading = React.useRef<HTMLHeadingElement>(null);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  const [name, dream, year] = useWatch({ control: form.control, name: ["name", "dream", "horizonYear"] });
  React.useEffect(() => {
    const y = Number(year);
    onDraft({ name: (name ?? "").trim().slice(0, 40), dream: (dream ?? "").trim(), year: Number.isInteger(y) && y > 2000 && y < 2200 ? y : undefined });
  }, [name, dream, year, onDraft]);

  React.useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  const go = (to: number) => {
    setDirection(to > step ? 1 : -1);
    setStep(to);
  };

  // The burst comes from the main button of the form that was submitted.
  const button = (target: EventTarget | null | undefined) => (target instanceof HTMLFormElement ? target.querySelector('button[type="submit"]') : null);

  const next = async (target: EventTarget) => {
    if (await form.trigger(s.fields)) {
      celebrate(button(target), { count: 10, spread: 44 });
      go(step + 1);
    }
  };

  const finish = form.handleSubmit(async (v, e) => {
    setSaving(true);
    const profile = toProfile(v);
    const ok = await run(async (svc) => {
      const ws = await svc.saveProfile(profile);
      if (!ws.profile || ws.profile.dream !== profile.dream) throw new Error("Your profile wasn't saved. Try again.");
      return ws;
    });
    setSaving(false);
    if (ok) {
      toast.success(`Welcome, ${profile.name}`);
      if (reduce) return router.push("/reflection");
      celebrate(button(e?.target), { count: 26, spread: 90 });
      onArrive({ name: profile.name, dream: profile.dream, year: profile.horizonYear });
      setTimeout(() => {
        router.push("/reflection");
        setTimeout(() => onArrive(null), 800);
      }, 1500);
    }
  });

  const pct = ((step + 1) / STEPS.length) * 100;

  return (
    <form
      onSubmit={(e) => {
        if (!last) {
          e.preventDefault();
          void next(e.currentTarget);
        } else void finish(e);
      }}
      noValidate
    >
      <div className="flex items-center gap-4">
        <span className="t-meta whitespace-nowrap">
          Step {step + 1} of {STEPS.length}
        </span>
        <div className="relative h-0.5 flex-1 rounded-full bg-surface-3" aria-hidden>
          <motion.div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-bronze to-accent" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: EASE }} />
          {STEPS.map((_, i) => (
            <span key={i} className={cn("absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-500", i <= step ? "bg-accent" : "bg-surface-3")} style={{ left: `${((i + 1) / STEPS.length) * 100}%` }} />
          ))}
          <motion.span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_14px_2px_var(--accent)]" initial={false} animate={{ left: `${pct}%` }} transition={{ duration: 0.7, ease: EASE }}>
            <span className="absolute inset-0 animate-ping rounded-full bg-accent/60" />
          </motion.span>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={step}
          custom={direction}
          variants={{
            enter: (d: number) => ({ opacity: 0, x: d * 36, filter: "blur(8px)" }),
            center: { opacity: 1, x: 0, filter: "blur(0px)" },
            exit: (d: number) => ({ opacity: 0, x: d * -36, filter: "blur(8px)" }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.38, ease: EASE }}
        >
          <p className="mt-8 font-display text-[13px] tracking-[0.12em] text-accent-ink">{ROMAN[step]}</p>
          <h1 ref={heading} tabIndex={-1} className="mt-2 t-headline outline-none" aria-label={s.title}>
            {s.title.split(" ").map((w, i) => (
              <motion.span key={i} aria-hidden initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 + i * 0.05, duration: 0.45, ease: EASE }} className="inline-block whitespace-pre">
                {w}{" "}
              </motion.span>
            ))}
          </h1>
          <p className="mt-3 text-[14px] text-muted-foreground">{s.lede}</p>
          <p className="mt-3 flex gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-[12.5px] text-muted-foreground">
            <span className="shrink-0 font-medium text-foreground">Why we ask</span>
            {s.why}
          </p>
          <Stagger className="mt-8 grid gap-5">
            {step === 0 && [
              <Field key="name" form={form} name="name" label="What should TOMORA call you?" placeholder="Your first name" />,
              <Field key="dream" form={form} name="dream" label="Your ambition" multiline rows={4} placeholder="e.g. Lead an applied AI lab that builds tools for farmers in the Horn of Africa." />,
              <div key="year" className="grid gap-2">
                <div className="max-w-[10rem]">
                  <Field form={form} name="horizonYear" label="By the year" />
                </div>
                <PlanLengthField form={form} />
              </div>,
            ]}
            {step === 1 && [
              <Field key="current" form={form} name="current" label="Where you are now (optional)" multiline placeholder="Studying, working, starting over… whatever is true." />,
              <Field key="resources" form={form} name="resources" label="What you have to work with (optional)" multiline placeholder="Skills, people, time, money, tools." />,
              <Field key="challenges" form={form} name="challenges" label="What stands in the way (optional)" multiline placeholder="Responsibilities, money, time, doubts. It helps your future self be useful." />,
            ]}
            {step === 2 && [
              <Field key="values" form={form} name="values" label="Values that guide you" hint="A few words, separated by commas." placeholder="Curiosity, family, craft" />,
              <div key="style" className="grid gap-1.5">
                <p className="text-[13px] font-medium">Coaching style</p>
                <StyleField form={form} />
              </div>,
            ]}
          </Stagger>
        </motion.div>
      </AnimatePresence>

      <div className="mt-10 flex items-center justify-between gap-3">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => go(step - 1)}>
            <ArrowLeft /> Back
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {s.optional && (
            <Button variant="ghost" onClick={() => go(step + 1)}>
              Skip for now
            </Button>
          )}
          <Button type="submit" variant="primary" size="lg" disabled={saving} className="group/next">
            {last ? (saving ? "Saving…" : "Meet your future self") : "Continue"} <ArrowRight className="transition-transform group-hover/next:translate-x-0.5" />
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Fields arrive one after another. */
function Stagger({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      {React.Children.toArray(children).map((child, i) => (
        <motion.div key={(child as React.ReactElement).key ?? i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 + i * 0.07, duration: 0.4, ease: EASE }}>
          {child}
        </motion.div>
      ))}
    </div>
  );
}
