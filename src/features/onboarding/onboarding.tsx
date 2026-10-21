"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Wordmark } from "@/components/brand/mark";
import { Orb } from "@/components/brand/orb";
import { Presence } from "@/components/brand/presence";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Field, PlanLengthField, StyleField, toProfile, useProfileForm, type ProfileValues } from "@/features/settings/profile-form";
import { BRAND } from "@/lib/brand";
import { usePreferences } from "@/lib/preferences";
import { useWorkspaceContext } from "@/lib/workspace-store";

// Progressive: three short steps, only the first required. Each says why it asks, and everything can be edited later
// in Settings. Nothing is saved until the last step.
const STEPS: { title: string; lede: string; why: string; optional?: boolean; fields: (keyof ProfileValues)[] }[] = [
  {
    title: "Who are you becoming?",
    lede: "Your future self starts from the ambition you name here. Be as specific as you can.",
    why: "Every possible future TOMORA explores is a road toward this ambition.",
    fields: ["name", "dream", "horizonYear"],
  },
  {
    title: "Where are you now?",
    lede: "The honest starting point. It keeps plans grounded in what you actually have.",
    why: "Roads are only useful if they start from what's true. Share as much or as little as you like; money and hours can be added later, when you compare roads.",
    optional: true,
    fields: ["current", "resources", "challenges"],
  },
  {
    title: "How should your future self speak?",
    lede: "You can change this any time, or for a single conversation.",
    why: "Values help your future self point out trade-offs that matter to you.",
    fields: ["values", "style"],
  },
];

export function Onboarding() {
  const { status, workspace, error, reload, resetDemoData } = useWorkspaceContext();
  const { set } = usePreferences();
  const router = useRouter();

  const exploreDemo = () => {
    resetDemoData("seed");
    set("mode", "demo");
    router.push("/");
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden p-3 lg:flex">
        <div className="relative flex flex-1 flex-col justify-between overflow-hidden rounded-[1.5rem] bg-[#171B22] p-10 text-[#F3F0E8]">
          <div aria-hidden className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_70%_at_70%_0%,rgb(200_183_143/0.16),transparent_70%)]" />
          <Link href="/welcome" className="relative self-start rounded-md outline-offset-4" aria-label="TOMORA welcome page">
            <Wordmark withSymbol className="text-[#F3F0E8]" />
          </Link>
          <div className="relative">
            <Orb size={280} className="text-[#F3F0E8]">
              <Presence convergence={0.15} size={190} horizonLabel="Possible you" />
            </Orb>
            <p className="mt-10 max-w-md font-display text-[2.6rem] leading-[1.02] text-balance">{BRAND.tagline}</p>
            <ol className="mt-8 grid gap-3 text-[13px] text-[#F3F0E8]/75">
              {["Tell TOMORA where you are and where you want to go", "Explore different roads, each with its assumptions", "Choose one, and turn it into a few next steps"].map((t, i) => (
                <motion.li key={t} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.1 }} className="flex gap-3">
                  <span className="font-mono text-[11px] text-[#C8B78F]">0{i + 1}</span>
                  {t}
                </motion.li>
              ))}
            </ol>
          </div>
          <p className="relative max-w-sm text-[12px] text-[#F3F0E8]/55">Nothing is saved until you finish. Your answers stay on this TOMORA server, and you can edit or delete them in Settings.</p>
        </div>
      </aside>

      <main className="flex min-w-0 flex-col px-5 py-8 sm:px-10 lg:px-16 lg:py-12">
        <div className="flex items-center justify-between gap-4 lg:justify-end">
          <Link href="/welcome" className="rounded-md lg:hidden" aria-label="TOMORA welcome page">
            <Wordmark withSymbol />
          </Link>
          <Button variant="link" size="sm" className="px-0" onClick={exploreDemo}>
            Explore with demo data
          </Button>
        </div>
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-10">
          <div className="card p-6 sm:p-9">
          {status === "loading" ? (
            <div aria-busy="true" aria-label="Loading">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-4 h-10 w-80 max-w-full" />
              <Skeleton className="mt-8 h-40 w-full" />
            </div>
          ) : status === "error" ? (
            <ErrorState title="Couldn't reach TOMORA" message={error ?? "Unknown error."} onRetry={reload} />
          ) : (
            <ProfileSteps key={workspace?.runtime.mode} />
          )}
          </div>
        </div>
      </main>
    </div>
  );
}

function ProfileSteps() {
  const { workspace, run } = useWorkspaceContext();
  const router = useRouter();
  const form = useProfileForm(workspace?.profile ?? null);
  const [step, setStep] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const heading = React.useRef<HTMLHeadingElement>(null);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  React.useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  const next = async () => {
    if (await form.trigger(s.fields)) setStep((n) => n + 1);
  };

  const finish = form.handleSubmit(async (v) => {
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
      router.push("/reflection");
    }
  });

  return (
    <form
      onSubmit={(e) => {
        if (!last) {
          e.preventDefault();
          void next();
        } else void finish(e);
      }}
      noValidate
    >
      <div className="flex items-center gap-3">
        <span className="t-meta">
          Step {step + 1} of {STEPS.length}
        </span>
        <div className="flex flex-1 gap-1" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className={`h-0.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-accent" : "bg-surface-3"}`} />
          ))}
        </div>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
          <h1 ref={heading} tabIndex={-1} className="mt-8 t-headline outline-none">
            {s.title}
          </h1>
          <p className="mt-3 text-[14px] text-muted-foreground">{s.lede}</p>
          <p className="mt-3 flex gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-[12.5px] text-muted-foreground">
            <span className="shrink-0 font-medium text-foreground">Why we ask</span>
            {s.why}
          </p>
          <div className="mt-8 grid gap-5">
            {step === 0 && (
              <>
                <Field form={form} name="name" label="What should TOMORA call you?" placeholder="Your first name" />
                <Field form={form} name="dream" label="Your ambition" multiline rows={4} placeholder="e.g. Lead an applied AI lab that builds tools for farmers in the Horn of Africa." />
                <div className="grid gap-2">
                  <div className="max-w-[10rem]">
                    <Field form={form} name="horizonYear" label="By the year" />
                  </div>
                  <PlanLengthField form={form} />
                </div>
              </>
            )}
            {step === 1 && (
              <>
                <Field form={form} name="current" label="Where you are now (optional)" multiline placeholder="Studying, working, starting over… whatever is true." />
                <Field form={form} name="resources" label="What you have to work with (optional)" multiline placeholder="Skills, people, time, money, tools." />
                <Field form={form} name="challenges" label="What stands in the way (optional)" multiline placeholder="Responsibilities, money, time, doubts. It helps your future self be useful." />
              </>
            )}
            {step === 2 && (
              <>
                <Field form={form} name="values" label="Values that guide you" hint="A few words, separated by commas." placeholder="Curiosity, family, craft" />
                <div className="grid gap-1.5">
                  <p className="text-[13px] font-medium">Coaching style</p>
                  <StyleField form={form} />
                </div>
              </>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="mt-10 flex items-center justify-between gap-3">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => setStep((n) => n - 1)}>
            <ArrowLeft /> Back
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
        {s.optional && (
          <Button variant="ghost" onClick={() => setStep((n) => n + 1)}>
            Skip for now
          </Button>
        )}
        <Button type="submit" variant="primary" size="lg" disabled={saving}>
          {last ? (saving ? "Saving…" : "Meet your future self") : "Continue"} <ArrowRight />
        </Button>
        </div>
      </div>
    </form>
  );
}
