"use client";

import { AudioLines, Database, Download, Laptop, Loader2, Moon, RotateCcw, Sun, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { PageFrame } from "@/components/layout/page-frame";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { liveMemories } from "@/lib/derive";
import { usePreferences, type DensityPref, type ModePref, type MotionPref, type ThemePref } from "@/lib/preferences";
import { cn, pluralize } from "@/lib/utils";
import { useWorkspaceContext } from "@/lib/workspace-store";
import { Field, PlanLengthField, StylePicker, toProfile, toValues, useProfileForm } from "./profile-form";

const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "coaching", label: "Coaching style" },
  { id: "appearance", label: "Appearance" },
  { id: "memory", label: "Memory" },
  { id: "decision-model", label: "Decision model" },
  { id: "data", label: "Data and privacy" },
  { id: "twin-data", label: "Voice twin data" },
];

export function Settings() {
  const { workspace } = useWorkspaceContext();
  return (
    <PageFrame>
      <PageHeader eyebrow="Settings" title="Your workspace" description="Preferences on this page change how TOMORA looks and behaves. Your profile and memories are stored wherever the data mode below says." />
      <div className="mt-8 grid gap-10 lg:grid-cols-[10rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-20 space-y-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="relative block rounded-md px-2 py-1.5 text-[13px] text-muted-foreground transition-[padding,background-color,color] duration-200 before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:w-[2px] before:rounded-full before:bg-accent before:opacity-0 before:shadow-[0_0_6px_var(--accent)] before:transition-opacity hover:bg-[linear-gradient(90deg,var(--accent-wash),transparent)] hover:pl-3 hover:text-foreground hover:before:opacity-100">
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
          {workspace && <DecisionModelSection />}
          <WorkspaceCodeSection />
          <DataSection />
          <TwinDataSection />
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
        <PlanLengthField form={form} />
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
    <Section id="memory" title="Memory" description="Everything TOMORA remembers is a note you can read, correct or delete.">
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

/** Jev, TypeSafe's decision model, for the Future Simulator's decision check. The key never comes back to the browser. */
function DecisionModelSection() {
  const { workspace, run } = useWorkspaceContext();
  const m = workspace!.platform.decisionModel;
  const live = workspace!.runtime.mode === "live";
  const [key, setKey] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const save = async (value: string | null) => {
    setSaving(true);
    const ok = await run((s) => s.saveDecisionKey(value), value ? "TypeSafe key saved" : "TypeSafe key removed");
    if (ok) setKey("");
    setSaving(false);
  };
  return (
    <Section
      id="decision-model"
      title="Decision model"
      description={
        <>
          The Future Simulator&apos;s decision check rates roads that passed TOMORA&apos;s own rules with Jev, a decision model from TypeSafe (paid per input token, about $0.042 per million). Only the text its questions need is sent, never your money figures.{" "}
          <a href="https://docs.typesafe.ai" target="_blank" rel="noreferrer" className="text-accent-ink underline underline-offset-2">
            TypeSafe docs
          </a>
        </>
      }
    >
      <div className="card px-5">
        <Row label="Status" hint={m?.configured ? `Using ${m.model}, key ${m.keySource === "env" ? "from the server's environment" : "saved in the app"} ending in ${m.keyHint}.` : "Not set up. Decision checks show the rules' order only, with no recommendation."}>
          <span className={cn("text-[12px]", m?.configured ? "text-success" : "text-subtle")}>{m?.configured ? "Connected" : "Off"}</span>
        </Row>
        {live && m?.keySource !== "env" && (
          <form
            className="flex flex-col gap-2 py-3.5 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (key.trim()) void save(key.trim());
            }}
          >
            <label htmlFor="typesafe-key" className="sr-only">
              TypeSafe API key
            </label>
            <Input id="typesafe-key" type="password" autoComplete="off" placeholder="TypeSafe API key" value={key} onChange={(e) => setKey(e.target.value)} className="sm:max-w-sm" />
            <Button type="submit" size="md" disabled={saving || !key.trim()}>
              {saving && <Loader2 className="animate-spin" />} Save key
            </Button>
            {m?.keySource === "app" && (
              <Button type="button" variant="ghost" size="md" disabled={saving} onClick={() => save(null)}>
                Remove
              </Button>
            )}
          </form>
        )}
        {!live && <p className="py-3.5 text-[12.5px] text-muted-foreground">Demo mode runs in your browser and can&apos;t call Jev.</p>}
      </div>
    </Section>
  );
}

/** Multi-user servers only: the code that opens this same workspace again from another browser or device. */
function WorkspaceCodeSection() {
  const [code, setCode] = React.useState<string | null>(null);
  React.useEffect(() => {
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { workspace: string | null }) => setCode(d.workspace))
      .catch(() => setCode(null));
  }, []);
  if (!code) return null;
  return (
    <Section id="workspace-code" title="Your workspace code" description="This server gives everyone a private workspace of their own. Keep this code to open yours again on another device, and don't share it: whoever has it can open your workspace.">
      <div className="card flex flex-wrap items-center gap-3 px-5 py-4">
        <Input readOnly value={code} aria-label="Workspace code" className="min-w-0 flex-1 font-mono text-[12px]" onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          variant="secondary"
          onClick={() => navigator.clipboard.writeText(code).then(() => toast.success("Workspace code copied"), () => toast.error("Couldn't copy. Select the code and copy it."))}
        >
          Copy
        </Button>
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
          API keys stay on the server. The browser only talks to TOMORA&apos;s own endpoints and never holds a model key.
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

// ---------- Voice twin data (server only) ----------

function TwinDataSection() {
  const { service } = useWorkspaceContext();
  const [retention, setRetention] = React.useState<number | null>(null);
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const live = service?.mode === "live";

  React.useEffect(() => {
    if (!live) return;
    fetch("/api/twin", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { guard?: { retentionDays?: number } } | null) => setRetention(s?.guard?.retentionDays ?? null))
      .catch(() => undefined);
  }, [live]);

  if (!live) return null;

  const deleteAll = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/twin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deleteAll", confirm: "DELETE" }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "That didn't work.");
      toast.success("Everything your twin held is deleted.");
      setOpen(false);
      setTyped("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section id="twin-data" title="Voice twin data" description="Your voice, your contacts, and the calls and emails your twin handled.">
      <div className="card px-5">
        <p className="flex gap-2 border-b border-border py-3.5 text-[12.5px] text-muted-foreground">
          <AudioLines className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden />
          What other people said to your twin (call transcripts and recordings, and mail it received) is deleted after {retention ?? 30} days, here and at ElevenLabs and
          AgentMail. Calls with your future self stay in your notes until you delete them.
        </p>
        <Row label="Download twin data" hint="Contacts, calls, emails, approvals, consents and the review queue, as one JSON file. Secrets are left out.">
          <Button asChild variant="secondary" size="sm">
            <a href="/api/twin/export" download>
              <Download /> Download
            </a>
          </Button>
        </Row>
        <Row label="Delete all twin data" hint="Deletes your cloned voice, its agent and every call at ElevenLabs, received mail at AgentMail, and all twin data here.">
          <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
            <Trash2 /> Delete
          </Button>
        </Row>
      </div>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete everything your twin holds?</DialogTitle>
            <DialogDescription>
              Your cloned voice, contacts, call transcripts, emails and approvals are deleted here and at ElevenLabs and AgentMail. Your goals, memories and other notes stay.
              This can&apos;t be undone. Type DELETE to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" aria-label="Type DELETE to confirm" autoComplete="off" />
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy || typed !== "DELETE"} onClick={deleteAll}>
              {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}
