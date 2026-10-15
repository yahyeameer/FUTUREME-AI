"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Wordmark } from "@/components/brand/mark";
import { Presence } from "@/components/brand/presence";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Field, StyleField, toProfile, useProfileForm, type ProfileValues } from "@/features/settings/profile-form";
import { usePreferences } from "@/lib/preferences";
import { useWorkspaceContext } from "@/lib/workspace-store";

const STEPS: { title: string; lede: string; fields: (keyof ProfileValues)[] }[] = [
  { title: "Who are you becoming?", lede: "Your future self starts from the ambition you name here. Be as specific as you can.", fields: ["name", "dream", "horizonYear"] },
  { title: "Where are you now?", lede: "The honest starting point. It keeps plans grounded in what you actually have.", fields: ["current", "resources", "challenges"] },
  { title: "How should your future self speak?", lede: "You can change this any time, or for a single conversation.", fields: ["values", "style"] },
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
      <aside className="paper relative hidden flex-col justify-between overflow-hidden border-r border-border bg-sunken p-10 lg:flex">
        <Wordmark />
        <div>
          <Presence convergence={0.15} size={260} horizonLabel="You, later" />
          <p className="mt-10 max-w-sm font-display text-[2rem] leading-[1.08] text-balance">A conversation with the person you&apos;re becoming.</p>
          <p className="mt-4 max-w-sm text-[13px] text-muted-foreground">
            FutureMe turns an ambition into milestones and small steps, remembers what matters, and never claims progress you haven&apos;t made.
          </p>
        </div>
        <p className="t-meta">Nothing is saved until you finish.</p>
      </aside>

      <main className="flex min-w-0 flex-col px-5 py-8 sm:px-10 lg:px-16 lg:py-12">
        <div className="flex items-center justify-between gap-4 lg:justify-end">
          <Wordmark className="lg:hidden" />
          <Button variant="link" size="sm" className="px-0" onClick={exploreDemo}>
            Explore with demo data
          </Button>
        </div>
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-10">
          {status === "loading" ? (
            <div aria-busy="true" aria-label="Loading">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-4 h-10 w-80 max-w-full" />
              <Skeleton className="mt-8 h-40 w-full" />
            </div>
          ) : status === "error" ? (
            <ErrorState title="Couldn't reach FutureMe" message={error ?? "Unknown error."} onRetry={reload} />
          ) : (
            <ProfileSteps key={workspace?.runtime.mode} />
          )}
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
          <div className="mt-8 grid gap-5">
            {step === 0 && (
              <>
                <Field form={form} name="name" label="What should FutureMe call you?" placeholder="Your first name" />
                <Field form={form} name="dream" label="Your ambition" multiline rows={4} placeholder="e.g. Lead an applied AI lab that builds tools for farmers in the Horn of Africa." />
                <div className="max-w-[10rem]">
                  <Field form={form} name="horizonYear" label="By the year" />
                </div>
              </>
            )}
            {step === 1 && (
              <>
                <Field form={form} name="current" label="Where you are now" multiline placeholder="Studying, working, starting over… whatever is true." />
                <Field form={form} name="resources" label="What you have to work with" multiline placeholder="Skills, people, time, money, tools." />
                <Field form={form} name="challenges" label="What stands in the way" multiline placeholder="Optional, but it helps your future self be useful." />
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
        <Button type="submit" variant="primary" size="lg" disabled={saving}>
          {last ? (saving ? "Saving…" : "Meet your future self") : "Continue"} <ArrowRight />
        </Button>
      </div>
    </form>
  );
}
