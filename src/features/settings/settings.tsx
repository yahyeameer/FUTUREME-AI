"use client";

import { Database, Laptop, Moon, RotateCcw, Sun } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { PageFrame } from "@/components/layout/page-frame";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { liveMemories } from "@/lib/derive";
import { usePreferences, type DensityPref, type ModePref, type MotionPref, type ThemePref } from "@/lib/preferences";
import { cn, pluralize } from "@/lib/utils";
import { useWorkspaceContext } from "@/lib/workspace-store";
import { Field, StylePicker, toProfile, toValues, useProfileForm } from "./profile-form";

const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "coaching", label: "Coaching style" },
  { id: "appearance", label: "Appearance" },
  { id: "memory", label: "Memory" },
  { id: "data", label: "Data and privacy" },
];

export function Settings() {
  const { workspace } = useWorkspaceContext();
  return (
    <PageFrame>
      <PageHeader eyebrow="Settings" title="Your workspace" description="Preferences on this page change how FutureMe looks and behaves. Your profile and memories are stored wherever the data mode below says." />
      <div className="mt-8 grid gap-10 lg:grid-cols-[10rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-20 space-y-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-md px-2 py-1.5 text-[13px] text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-12">
          {workspace?.profile ? (
            <>
              <ProfileSection />
              <CoachingSection />
            </>
          ) : (
            <Section id="profile" title="Profile">
              <p className="text-[13px] text-muted-foreground">
                No profile yet.{" "}
                <Link href="/onboarding" className="text-accent-ink underline underline-offset-2">
                  Set up your profile
                </Link>{" "}
                to start.
              </p>
            </Section>
          )}
          <AppearanceSection />
          {workspace && <MemorySection />}
          <DataSection />
        </div>
      </div>
    </PageFrame>
  );
}

function Section({ id, title, description, children }: { id: string; title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24">
      <h2 id={`${id}-h`} className="t-section">
        {title}
      </h2>
      {description && <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-border py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-[12px] text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ProfileSection() {
  const { workspace, run } = useWorkspaceContext();
  const form = useProfileForm(workspace!.profile);
  const { isSubmitting, isDirty } = form.formState;

  const submit = form.handleSubmit(async (v) => {
    // Style has its own section; keep whatever is current.
    const profile = { ...toProfile(v), style: workspace!.profile!.style };
    const ok = await run(async (s) => {
      const ws = await s.saveProfile(profile);
      if (ws.profile?.dream !== profile.dream || ws.profile?.name !== profile.name) throw new Error("The profile wasn't saved. Try again.");
      return ws;
    }, "Profile saved");
    if (ok) form.reset(v);
  });

  return (
    <Section id="profile" title="Profile" description="What your future self knows about you. Saving updates the profile notes in your memory vault too.">
      <form onSubmit={submit} className="grid gap-4 card p-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <Field form={form} name="name" label="Name" />
          <Field form={form} name="horizonYear" label="Horizon year" />
        </div>
        <Field form={form} name="dream" label="Your ambition" multiline rows={3} />
        <Field form={form} name="current" label="Where you are now" multiline />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field form={form} name="resources" label="What you have to work with" multiline />
          <Field form={form} name="challenges" label="What stands in the way" multiline />
        </div>
        <Field form={form} name="values" label="Values" hint="Separate with commas." />
        <div className="flex items-center justify-end gap-2">
          {isDirty && (
            <Button variant="ghost" onClick={() => form.reset(toValues(workspace!.profile))}>
              Discard
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

function CoachingSection() {
  const { workspace, run } = useWorkspaceContext();
  const style = workspace!.profile!.style;
  return (
    <Section id="coaching" title="Coaching style" description="The default voice of your future self. You can still switch tone for a single conversation.">
      <StylePicker name="settings-style" value={style} onChange={(s) => s !== style && run((svc) => svc.setStyle(s), "Coaching style updated")} />
    </Section>
  );
}

function AppearanceSection() {
  const { theme, motion, density, set } = usePreferences();
  return (
    <Section id="appearance" title="Appearance" description="Saved on this device only.">
      <div className="card px-5">
        <Row label="Theme">
          <Segmented<ThemePref>
            label="Theme"
            value={theme}
            onValueChange={(v) => set("theme", v)}
            options={[
              { value: "dark", label: "Dark", icon: <Moon /> },
              { value: "light", label: "Light", icon: <Sun /> },
              { value: "system", label: "System", icon: <Laptop /> },
            ]}
          />
        </Row>
        <Row label="Motion" hint="Reduced keeps fades but removes movement. System follows your device setting.">
          <Segmented<MotionPref>
            label="Motion"
            value={motion}
            onValueChange={(v) => set("motion", v)}
            options={[
              { value: "system", label: "System" },
              { value: "reduced", label: "Reduced" },
              { value: "full", label: "Full" },
            ]}
          />
        </Row>
        <Row label="Density">
          <Segmented<DensityPref>
            label="Density"
            value={density}
            onValueChange={(v) => set("density", v)}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
          />
        </Row>
      </div>
    </Section>
  );
}

function MemorySection() {
  const { workspace } = useWorkspaceContext();
  const ws = workspace!;
  const live = liveMemories(ws.memories);
  const inferred = live.filter((m) => m.provenance === "ai-inferred").length;
  const archived = ws.memories.filter((m) => m.archived).length;
  const hidden = ws.memories.filter((m) => !m.retrievable).length;
  const caps = ws.capabilities;
  return (
    <Section id="memory" title="Memory" description="Everything FutureMe remembers is a note you can read, correct or delete.">
      <div className="card px-5">
        <Row label="Notes in your vault" hint={`${inferred} of them ${inferred === 1 ? "is an AI interpretation" : "are AI interpretations"}, labelled wherever they appear.`}>
          <span className="t-meta !text-[13px] !text-foreground">{live.length}</span>
        </Row>
        <Row label="New memories need your approval" hint="When your future self wants to remember something from a conversation, it asks first with an approval card. This can't be turned off.">
          <span className="text-[12px] text-success">Always on</span>
        </Row>
        <Row
          label="Recall control"
          hint={
            caps.memoryRetrievalControl
              ? `${pluralize(hidden, "note")} ${hidden === 1 ? "is" : "are"} hidden from recall. Change it on any note.`
              : "The connected server always searches every note. To stop a note being recalled, delete it."
          }
        >
          <span className={cn("text-[12px]", caps.memoryRetrievalControl ? "text-success" : "text-subtle")}>{caps.memoryRetrievalControl ? "Per note" : "Not supported"}</span>
        </Row>
        {caps.archiveMemories && (
          <Row label="Archived" hint="Archived notes are kept but left out of recall and the graph.">
            <span className="t-meta !text-[13px] !text-foreground">{archived}</span>
          </Row>
        )}
        <div className="py-3.5">
          <Button asChild variant="secondary" size="sm">
            <Link href="/memory">Open the Memory Vault</Link>
          </Button>
        </div>
      </div>
    </Section>
  );
}

function DataSection() {
  const { workspace, modeReason, resetDemoData, status } = useWorkspaceContext();
  const { mode, set } = usePreferences();
  const router = useRouter();
  const [confirm, setConfirm] = React.useState<"seed" | "empty" | null>(null);
  const rt = workspace?.runtime;

  return (
    <Section id="data" title="Data and privacy" description="Where your data lives and what answers your conversations.">
      <div className="card px-5">
        <Row label="Data mode" hint={modeReason || (status === "error" ? "The chosen backend isn't responding." : undefined)}>
          <Segmented<ModePref>
            label="Data mode"
            value={mode}
            onValueChange={(v) => set("mode", v)}
            options={[
              { value: "auto", label: "Automatic" },
              { value: "demo", label: "Demo data" },
              { value: "live", label: "Server" },
            ]}
          />
        </Row>
        {rt && (
          <dl className="grid gap-x-6 gap-y-3 border-b border-border py-4 sm:grid-cols-2">
            {[
              ["Conversations answered by", rt.agent],
              ["Model", rt.model],
              ["Stored in", rt.storage],
              ["Inference", rt.inference],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="t-label">{k}</dt>
                <dd className="mt-0.5 text-[13px] break-words">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {rt?.simulated && (
          <p className="border-b border-border py-3 text-[12.5px] text-copper">
            {rt.mode === "demo" ? "Replies are scripted demo responses. No model is called." : "Replies come from the built-in stand-in model, not a real language model. Configure a provider on the server to change this."}
          </p>
        )}
        <p className="flex gap-2 py-3.5 text-[12.5px] text-muted-foreground">
          <Database className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden />
          API keys stay on the server. The browser only talks to FutureMe&apos;s own endpoints and never holds a model key.
        </p>
      </div>

      {rt?.mode === "demo" && (
        <div className="mt-4 card px-5">
          <Row label="Reset demo data" hint="Restores Hodan's example workspace. Anything you changed in demo mode is lost.">
            <Button variant="secondary" size="sm" onClick={() => setConfirm("seed")}>
              <RotateCcw /> Reset
            </Button>
          </Row>
          <Row label="Start fresh" hint="Clears the demo workspace so you can onboard as yourself. Still stored only in this browser.">
            <Button variant="destructive" size="sm" onClick={() => setConfirm("empty")}>
              Start fresh
            </Button>
          </Row>
        </div>
      )}

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === "seed" ? "Reset the demo workspace?" : "Clear the demo workspace?"}</DialogTitle>
            <DialogDescription>
              {confirm === "seed" ? "Your demo changes are replaced with the original example data." : "Every demo goal, task, memory and conversation in this browser is deleted, and you'll go through onboarding."} This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirm) resetDemoData(confirm);
                if (confirm === "empty") router.push("/onboarding");
                setConfirm(null);
              }}
            >
              {confirm === "seed" ? "Reset demo data" : "Clear everything"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

