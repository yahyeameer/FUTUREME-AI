"use client";

import { AudioLines, Check, Loader2, Mail, Mic, Phone, Play, Plus, ShieldCheck, Square, Trash2, Handshake, UserRound, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { PageFrame, RailSection } from "@/components/layout/page-frame";
import { PageHeader, SectionHeading } from "@/components/layout/page-header";
import { VoiceWave } from "@/components/motion/voice-wave";
import { EmptyState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn, pluralize } from "@/lib/utils";
import { useWorkspaceContext } from "@/lib/workspace-store";
import type { TwinState } from "@/app/api/twin/state";
import { post, upload, type Act } from "./api";
import { EmailSection } from "./email";
import { EngineSection } from "./engines";
import { ReviewSection } from "./review";
import { TalkSection } from "./talk";
import { recordingFile, useRecorder, type Recording } from "./use-recorder";

type Approval = TwinState["twin"]["approvals"][number];

export function Twin() {
  const { service } = useWorkspaceContext();
  const [state, setState] = React.useState<TwinState | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const fetchState = React.useCallback(
    () =>
      fetch("/api/twin", { cache: "no-store" })
        .then((res) => {
          if (!res.ok) throw new Error();
          return res.json() as Promise<TwinState>;
        })
        .then(setState, () => setError("The FutureMe server didn't answer.")),
    [],
  );
  const load = () => {
    setError(null);
    void fetchState();
  };

  React.useEffect(() => {
    if (service?.mode === "live") void fetchState();
  }, [service?.mode, fetchState]);

  const act: Act = React.useCallback(async <T extends TwinState>(fn: () => Promise<T>, success?: string): Promise<T | null> => {
    try {
      const next = await fn();
      setState(next);
      // The action worked, but what it set off didn't (an approved call that couldn't be dialled, say).
      const warning = (next as Record<string, unknown>).warning;
      if (typeof warning === "string") toast.error(warning);
      else if (success) toast.success(success);
      return next;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That didn't work.");
      return null;
    }
  }, []);

  if (service?.mode !== "live") {
    return (
      <PageFrame>
        <Header />
        <EmptyState icon={AudioLines} title="The twin runs on the FutureMe server" className="mt-8">
          Your voice, contacts and approvals live on the server, never in demo data. Switch the data mode to Server in{" "}
          <Link href="/settings#data" className="text-accent-ink underline underline-offset-2">
            Settings
          </Link>
          .
        </EmptyState>
      </PageFrame>
    );
  }
  if (error) {
    return (
      <PageFrame>
        <Header />
        <div className="mt-8">
          <ErrorState title="Couldn't load your twin" message={error} onRetry={load} />
        </div>
      </PageFrame>
    );
  }
  if (!state) return null;

  const pending = state.twin.approvals.filter((a) => a.status === "pending");
  const hasVoice = state.voice.active?.status === "ready";
  return (
    <PageFrame rail={<Rules state={state} />} railTitle="Twin rules">
      <Header
        speaking={hasVoice}
        actions={
          <label className="flex items-center gap-2.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px]">
            <Switch checked={!state.twin.paused} onCheckedChange={(on) => act(() => post({ action: "setPaused", paused: !on }), on ? "Twin resumed" : "Twin paused. Nothing can be proposed or approved.")} aria-label="Twin active" />
            {state.twin.paused ? "Paused" : "Active"}
          </label>
        }
      />
      {state.guard.exposed && (
        <p role="alert" className="mt-6 rounded-lg border border-destructive/30 bg-destructive-wash px-4 py-3 text-[13px]">
          Your twin has a public address (TWIN_PUBLIC_URL), but FutureMe has no access code, so anyone who finds it could open this page and approve calls. Set
          FUTUREME_ACCESS_CODE on the server.
        </p>
      )}
      {state.twin.paused && (
        <p role="status" className="mt-6 rounded-lg border border-warning/30 bg-warning-wash px-4 py-3 text-[13px]">
          The twin is paused. It can&apos;t propose, call, email or answer anything, and nothing can be approved until you resume it.
        </p>
      )}
      <div className="mt-8 space-y-12">
        {hasVoice ? (
          <TalkSection state={state} act={act} onState={setState} />
        ) : (
          <>
            <VoiceSection state={state} act={act} />
            <EngineSection state={state} act={act} />
          </>
        )}
        <section aria-labelledby="queue-h">
          <SectionHeading id="queue-h">Waiting for you{pending.length ? ` · ${pending.length}` : ""}</SectionHeading>
          {state.twin.approvals.length ? (
            <div className="space-y-3">
              {[...pending, ...state.twin.approvals.filter((a) => a.status !== "pending")].slice(0, 20).map((a) => (
                <TwinApprovalCard key={a.id} approval={a} state={state} act={act} />
              ))}
            </div>
          ) : (
            <EmptyState icon={ShieldCheck} title="Nothing to approve">
              When the twin wants to call or email one of your contacts, or someone asks you to agree to something, it lands here first.
            </EmptyState>
          )}
        </section>
        <ReviewSection state={state} act={act} />
        <EmailSection state={state} act={act} />
        <Contacts state={state} act={act} />
        {hasVoice && <VoiceSection state={state} act={act} />}
        {hasVoice && <EngineSection state={state} act={act} />}
      </div>
    </PageFrame>
  );
}

function Header({ actions, speaking = false }: { actions?: React.ReactNode; speaking?: boolean }) {
  return (
    <>
      <PageHeader
        eyebrow="Voice twin"
        title="Your twin, in your own voice"
        description="It speaks for you only to people you add, says it's your AI twin every time, and every call, email or promise waits for your yes."
        actions={actions}
      />
      <div data-spotlight className="card group/voice relative mt-7 flex items-center gap-5 overflow-hidden px-5 py-4">
        <div aria-hidden className="aurora opacity-60" />
        <span aria-hidden className="relative flex size-14 shrink-0 items-center justify-center">
          <span className="absolute inset-0 animate-orbit rounded-full border border-dashed border-accent/50 [animation-duration:20s] group-hover/voice:[animation-duration:4s]" />
          <span className={cn("absolute inset-1.5 rounded-full border border-accent/40", speaking && "pulse-ring")} />
          <span className="relative flex size-9 items-center justify-center rounded-full border border-white/60 bg-[linear-gradient(140deg,var(--accent-wash),var(--copper-wash))] text-accent-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.5)] transition-transform duration-500 group-hover/voice:scale-110 dark:border-white/15">
            <AudioLines className="size-4" />
          </span>
        </span>
        <div className="relative min-w-0 flex-1">
          <p className="t-label">{speaking ? "Your voice is ready" : "Your voice, from the future"}</p>
          <VoiceWave live={speaking} className="mt-1 w-full justify-between" bars={44} />
        </div>
      </div>
    </>
  );
}

// ---------- Voice ----------

function VoiceSection({ state, act }: { state: TwinState; act: Act }) {
  const v = state.voice;
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const hasVoice = v.voices.length > 0;
  const consented = v.consent?.status === "verified";
  const engine = v.engines.engines.find((e) => e.id === v.engine)!;

  return (
    <section aria-labelledby="voice-h">
      <SectionHeading
        id="voice-h"
        action={
          (hasVoice || v.consent) && (
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete my voice
            </Button>
          )
        }
      >
        Your voice
      </SectionHeading>
      {!v.configured ? (
        <EmptyState icon={AudioLines} title="Voice cloning isn't set up">
          Add a key for a voice engine below, test it, and pick it for your voice. Your recordings go only to the engine you pick.
        </EmptyState>
      ) : (
        <ol className="space-y-3">
          <Step n={1} title="Say yes, in your own voice" done={consented || hasVoice}>
            {!hasVoice && !consented && (v.canConsent ? <ConsentStep state={state} act={act} /> : <p className="text-[13px] text-muted-foreground">Checking your consent phrase needs an ElevenLabs or OpenRouter key, which hears what you read. Add one under Voice engine.</p>)}
            {(consented || hasVoice) && <p className="text-[13px] text-muted-foreground">Consent recorded. That recording is also the first sample of your voice, so only the voice that agreed can be cloned.</p>}
          </Step>
          <Step n={2} title="Create your voice" done={hasVoice}>
            {consented && !hasVoice ? (
              <SamplesStep act={act} engine={engine} />
            ) : (
              <p className="text-[13px] text-muted-foreground">{hasVoice ? `Your voice is ready, cloned with ${engine.label}.` : "Comes after your consent recording."}</p>
            )}
          </Step>
          <Step n={3} title="Hear yourself" done={false}>
            {v.active?.status === "ready" ? <Preview /> : <p className="text-[13px] text-muted-foreground">Once your voice exists, play a line from your future self.</p>}
          </Step>
          {v.engine === "elevenlabs" && (
            <Step n={4} title="Upgrade to a professional voice" done={v.active?.kind === "professional"}>
              <ProfessionalStep state={state} act={act} />
            </Step>
          )}
        </ol>
      )}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your voice?</DialogTitle>
            <DialogDescription>This deletes every clone of your voice at {engine.label} and every recording on this server, and withdraws your consent. You can start again later.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (await act(() => post({ action: "revokeVoice" }), "Your voice and recordings were deleted.")) setConfirmDelete(false);
              }}
            >
              Delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <li className="card group/step p-4 transition-shadow duration-300 hover:shadow-[var(--shadow-lift),var(--glow-accent)] sm:p-5">
      <div className="flex items-center gap-3">
        <span aria-hidden className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-medium transition-[transform,box-shadow] duration-300 group-hover/step:scale-110 group-hover/step:shadow-[0_0_14px_-2px_var(--accent)]", done ? "border-success/30 bg-success-wash text-success" : "border-border-strong text-muted-foreground")}>
          {done ? <Check className="size-3.5" /> : n}
        </span>
        <h3 className="text-[14px] font-medium">{title}</h3>
        {done && <span className="sr-only">(done)</span>}
      </div>
      <div className="mt-3 pl-10">{children}</div>
    </li>
  );
}

function RecordButton({ onRecorded, label = "Record", busy }: { onRecorded: (r: Recording) => void; label?: string; busy?: boolean }) {
  const rec = useRecorder();
  return (
    <div className="flex flex-wrap items-center gap-3">
      {rec.state === "recording" ? (
        <Button variant="destructive" onClick={rec.stop}>
          <Square /> Stop · {rec.seconds}s
        </Button>
      ) : (
        <Button variant="secondary" disabled={busy} onClick={() => rec.start().then(onRecorded, () => undefined)}>
          <Mic /> {label}
        </Button>
      )}
      {rec.error && <p className="text-[12.5px] text-destructive">{rec.error}</p>}
    </div>
  );
}

function ConsentStep({ state, act }: { state: TwinState; act: Act }) {
  const [consent, setConsent] = React.useState<{ id: number; phrase: string } | null>(null);
  const [recording, setRecording] = React.useState<Recording | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [missing, setMissing] = React.useState<{ missing: string[]; transcript: string } | null>(null);
  const failed = state.voice.consent?.status === "failed";

  const begin = async () => {
    setMissing(null);
    setRecording(null);
    const next = await act(() => post({ action: "startConsent" }));
    if (next) setConsent(next.consent as { id: number; phrase: string });
  };

  const submit = async () => {
    if (!consent || !recording) return;
    setBusy(true);
    const form = new FormData();
    form.set("action", "consent");
    form.set("consentId", String(consent.id));
    form.set("audio", recordingFile(recording, "consent"));
    const next = await act(() => upload(form));
    setBusy(false);
    const result = next?.result as { verified: boolean; missing: string[]; transcript: string } | undefined;
    if (result && !result.verified) {
      setMissing(result);
      setConsent(null);
    }
  };

  if (!consent) {
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-muted-foreground">You&apos;ll read a short phrase with three random code words. It proves the voice is yours and that you&apos;re agreeing right now, not in an old recording.</p>
        {(missing || failed) && (
          <p className="rounded-lg border border-warning/30 bg-warning-wash px-3 py-2 text-[12.5px]">
            We didn&apos;t hear {missing ? missing.missing.map((w) => `“${w}”`).join(", ") : "every code word"}. Read the new phrase clearly, all the way through.
            {missing?.transcript && <span className="mt-1 block text-muted-foreground">We heard: “{missing.transcript}”</span>}
          </p>
        )}
        <Button variant="primary" onClick={begin}>
          <Mic /> {missing || failed ? "Try again" : "Show my phrase"}
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <blockquote className="rounded-xl border border-accent/30 bg-accent-wash px-4 py-3 font-display text-[1.25rem] leading-snug">{consent.phrase}</blockquote>
      <p className="text-[12.5px] text-muted-foreground">Read it aloud within ten minutes, in a quiet room.</p>
      <RecordButton onRecorded={setRecording} label={recording ? "Record again" : "Record"} busy={busy} />
      {recording && (
        <div className="flex flex-wrap items-center gap-3">
          <audio controls src={recording.url} className="h-9" />
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Check />} Check and save consent
          </Button>
        </div>
      )}
    </div>
  );
}

const PROMPTS = [
  "Tell the story of the last time you were proud of yourself.",
  "Describe your perfect ordinary day, from waking up to falling asleep.",
  "Explain what you're building and why it matters to you.",
  "Talk about a person who shaped who you are.",
  "Describe the place you grew up.",
];

function SamplesStep({ act, engine }: { act: Act; engine: { id: string; label: string } }) {
  const withSamples = engine.id === "elevenlabs";
  const [samples, setSamples] = React.useState<Recording[]>([]);
  const [busy, setBusy] = React.useState(false);
  const seconds = samples.reduce((n, s) => n + s.seconds, 0);

  const create = async () => {
    setBusy(true);
    const form = new FormData();
    form.set("action", "clone");
    samples.forEach((s, i) => form.append("samples", recordingFile(s, `sample-${i + 1}`)));
    await act(() => upload(form), "Your voice is ready. Play it below.");
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted-foreground">
        {withSamples ? (
          <>
            Talk naturally for about a minute in total. More clean audio makes a closer voice. Prompt: <span className="text-foreground">{PROMPTS[samples.length % PROMPTS.length]}</span>
          </>
        ) : (
          `${engine.label} clones from your consent recording alone, so there's nothing more to record.`
        )}
      </p>
      {samples.length > 0 && (
        <ul className="space-y-2">
          {samples.map((s, i) => (
            <li key={s.url} className="flex items-center gap-3">
              <audio controls src={s.url} className="h-9" />
              <span className="text-[12px] text-muted-foreground">{s.seconds}s</span>
              <Button size="icon-sm" variant="ghost" aria-label={`Remove sample ${i + 1}`} onClick={() => setSamples((x) => x.filter((y) => y !== s))}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {withSamples && samples.length < 5 && <RecordButton onRecorded={(r) => setSamples((x) => [...x, r])} label={samples.length ? "Record another" : "Record a sample"} busy={busy} />}
        <Button variant="primary" onClick={create} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <AudioLines />} Create my voice
        </Button>
        {withSamples && (
          <span className="text-[12px] text-muted-foreground">
            {pluralize(samples.length, "sample")} · {seconds}s, plus your consent recording
          </span>
        )}
      </div>
    </div>
  );
}

function Preview() {
  const [text, setText] = React.useState("");
  const [url, setUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const play = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/twin/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't speak just now.");
      setUrl(URL.createObjectURL(await res.blob()));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't speak just now.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Hey, it's me. You, a few years from now…" aria-label="Line to speak" />
        <Button variant="primary" onClick={play} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Play />} Play
        </Button>
      </div>
      {url && <audio controls autoPlay src={url} className="h-9 w-full" />}
    </div>
  );
}

function ProfessionalStep({ state, act }: { state: TwinState; act: Act }) {
  const pro = state.voice.voices.find((v) => v.kind === "professional");
  const [captcha, setCaptcha] = React.useState<{ image?: string; text?: string } | null>(null);
  const [recording, setRecording] = React.useState<Recording | null>(null);
  const [busy, setBusy] = React.useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  if (!state.voice.voices.length) return <p className="text-[13px] text-muted-foreground">A professional voice is trained on your recordings and sounds closer. It needs your instant voice first.</p>;
  if (!pro)
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-muted-foreground">ElevenLabs trains a closer voice from the same recordings, after you read their own verification text aloud. Your instant voice keeps working meanwhile.</p>
        <Button variant="secondary" disabled={busy} onClick={() => run(() => act(() => post({ action: "startProfessional" })))}>
          {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Start the upgrade
        </Button>
      </div>
    );
  if (pro.status === "needs_captcha")
    return (
      <div className="space-y-3">
        {!captcha ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const next = await act(() => post({ action: "captcha" }));
                if (next) setCaptcha(next.captcha as { image?: string; text?: string });
              })
            }
          >
            <ShieldCheck /> Show the verification text
          </Button>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- a data URL from ElevenLabs, not an optimisable asset */}
            {captcha.image ? <img src={captcha.image} alt="Verification text from ElevenLabs to read aloud" className="max-w-full rounded-lg border border-border" /> : <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[14px]">{captcha.text}</p>}
            <p className="text-[12.5px] text-muted-foreground">Read every line aloud, then send it to ElevenLabs.</p>
            <RecordButton onRecorded={setRecording} label={recording ? "Record again" : "Record"} busy={busy} />
            {recording && (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() =>
                  run(() => {
                    const form = new FormData();
                    form.set("action", "captcha");
                    form.set("audio", recordingFile(recording, "captcha"));
                    return act(() => upload(form), "Verified. Training has started.");
                  })
                }
              >
                {busy ? <Loader2 className="animate-spin" /> : <Check />} Verify and train
              </Button>
            )}
          </>
        )}
      </div>
    );
  if (pro.status === "training")
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="info">Training</Badge>
        <p className="text-[13px] text-muted-foreground">Training can take a few hours.</p>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => act(() => post({ action: "refreshVoice" })))}>
          Check now
        </Button>
      </div>
    );
  if (pro.status === "failed") return <p className="text-[13px] text-destructive">Training failed at ElevenLabs. Delete your voice and start again with cleaner recordings.</p>;
  return <p className="text-[13px] text-muted-foreground">Your professional voice is live, and the instant voice was deleted.</p>;
}

// ---------- Approvals ----------

function TwinApprovalCard({ approval: a, state, act }: { approval: Approval; state: TwinState; act: Act }) {
  const [busy, setBusy] = React.useState(false);
  const run = async (body: object, success: string) => {
    setBusy(true);
    await act(() => post(body), success);
    setBusy(false);
  };
  const p = a.payload as unknown as Record<string, unknown>;
  const decide = async (decision: "approve" | "reject") => {
    setBusy(true);
    await act(() => post({ action: "decide", id: a.id, decision }), decision === "approve" ? "Approved" : "Declined");
    setBusy(false);
  };
  const Icon = a.kind === "outbound_call" ? Phone : a.kind === "send_email" ? Mail : Handshake;
  const label = a.kind === "outbound_call" ? "Call" : a.kind === "send_email" ? "Email" : "Promise";
  const title =
    a.kind === "outbound_call" ? `Call ${p.contact_name}: ${String(p.purpose).replace(/\.$/, "")}` : a.kind === "send_email" ? `Email ${p.contact_name}: “${p.subject}”` : String(p.what);

  return (
    <article className={cn("rounded-2xl border bg-surface p-4 shadow-card", a.status === "pending" ? "border-accent/35" : "border-border")}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-accent/30 bg-accent-wash text-accent-ink">
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="t-label !text-accent-ink">{label}</p>
            <Badge tone={a.status === "approved" ? "success" : a.status === "rejected" ? "neutral" : "accent"}>{a.status === "pending" ? "Waiting for you" : a.status === "approved" ? "Approved" : "Declined"}</Badge>
          </div>
          <p className="text-[14px] font-medium leading-snug">{title}</p>
          {a.kind === "outbound_call" && (
            <>
              <p className="text-[12.5px] text-muted-foreground">To {String(p.phone)}. The call opens with: “{String(p.opener)}”</p>
              {Array.isArray(p.talking_points) && p.talking_points.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-[13px]">
                  {(p.talking_points as string[]).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
            </>
          )}
          {a.kind === "send_email" && (
            <>
              <p className="text-[12.5px] text-muted-foreground">
                To {String(p.email)}
                {p.in_reply_to ? ", as a reply to their email" : ""}
                {state.mail.ownerEmail ? `, cc ${state.mail.ownerEmail}` : ""}
              </p>
              <pre className="max-h-60 overflow-auto rounded-lg border border-border bg-surface-2 px-3 py-2 font-sans text-[13px] whitespace-pre-wrap">{String(p.body)}</pre>
            </>
          )}
          {a.kind === "commitment" && (
            <p className="text-[12.5px] text-muted-foreground">
              {[p.contact_name && `With ${p.contact_name}`, p.when && `When: ${p.when}`, p.context].filter(Boolean).join(" · ") || "The twin didn't agree to this. You decide."}
            </p>
          )}
          {a.status === "pending" ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="primary" disabled={busy} onClick={() => decide("approve")}>
                <Check /> Approve
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide("reject")}>
                <X /> Decline
              </Button>
            </div>
          ) : (
            a.status === "approved" && <Delivery approval={a} state={state} busy={busy} run={run} />
          )}
        </div>
      </div>
    </article>
  );
}

/** What happened to an approved call or email, with a way to send it again when it didn't go out. */
function Delivery({ approval: a, state, busy, run }: { approval: Approval; state: TwinState; busy: boolean; run: (body: object, success: string) => Promise<void> }) {
  if (a.kind === "outbound_call") {
    const call = state.calls.byApproval[a.id];
    if (!call) return null;
    const retry = call.status === "approved" || call.status === "failed";
    return (
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {call.status === "failed" && <p className="text-[12.5px] text-destructive">{call.error}</p>}
        {call.status === "approved" && <p className="text-[12.5px] text-muted-foreground">Approved, not called yet.</p>}
        {!retry && <p className="text-[12.5px] text-muted-foreground">{call.status === "done" ? "Called. The transcript is in your call log." : call.status === "missed" ? "No answer." : "Calling now."}</p>}
        {retry && (
          <Button size="sm" variant="secondary" disabled={busy || state.twin.paused} onClick={() => run({ action: "dialApproved", callId: call.callId }, "Calling now.")}>
            <Phone /> {call.status === "failed" ? "Try again" : "Call now"}
          </Button>
        )}
      </div>
    );
  }
  if (a.kind === "send_email") {
    const email = state.mail.byApproval[a.id];
    if (!email) return null;
    const retry = email.status === "approved" || email.status === "failed";
    return (
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {email.status === "failed" && <p className="text-[12.5px] text-destructive">{email.error}</p>}
        {email.status === "approved" && <p className="text-[12.5px] text-muted-foreground">Approved, not sent yet.</p>}
        {email.status === "sent" && <p className="text-[12.5px] text-muted-foreground">Sent from your twin&apos;s inbox{state.mail.ownerEmail ? `, with you cc'd` : ""}.</p>}
        {retry && (
          <Button size="sm" variant="secondary" disabled={busy || state.twin.paused} onClick={() => run({ action: "sendApproved", emailId: email.emailId }, "Sent.")}>
            <Mail /> {email.status === "failed" ? "Try again" : "Send now"}
          </Button>
        )}
      </div>
    );
  }
  return null;
}

// ---------- Contacts ----------

function Contacts({ state, act }: { state: TwinState; act: Act }) {
  const [form, setForm] = React.useState({ name: "", phone: "", email: "", relationship: "" });
  const [busy, setBusy] = React.useState(false);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (await act(() => post({ action: "addContact", contact: form }), `${form.name} added`)) setForm({ name: "", phone: "", email: "", relationship: "" });
    setBusy(false);
  };
  const field = (key: keyof typeof form) => ({ value: form[key], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })) });

  return (
    <section aria-labelledby="contacts-h">
      <SectionHeading id="contacts-h">Who your twin may contact</SectionHeading>
      <p className="mb-4 max-w-2xl text-[13px] text-muted-foreground">Only people you add here. Add them only if they&apos;d be fine hearing from your AI twin.</p>
      {state.twin.contacts.length > 0 && (
        <ul className="mb-4 divide-y divide-border rounded-2xl border border-border bg-surface">
          {state.twin.contacts.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <UserRound className="size-4 shrink-0 text-subtle" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium">
                  {c.name} {c.relationship && <span className="font-normal text-muted-foreground">· {c.relationship}</span>}
                </p>
                <p className="truncate text-[12px] text-muted-foreground">{[c.phone, c.email].filter(Boolean).join(" · ")}</p>
              </div>
              <Button size="icon-sm" variant="ghost" aria-label={`Remove ${c.name}`} onClick={() => act(() => post({ action: "removeContact", id: c.id }), `${c.name} removed`)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="grid gap-2 rounded-2xl border border-dashed border-border-strong p-4 sm:grid-cols-2">
        <Input required placeholder="Name" aria-label="Name" {...field("name")} />
        <Input placeholder="Relationship (optional)" aria-label="Relationship" {...field("relationship")} />
        <Input type="tel" placeholder="Phone, like +14155550123" aria-label="Phone" {...field("phone")} />
        <Input type="email" placeholder="Email" aria-label="Email" {...field("email")} />
        <div className="sm:col-span-2">
          <Button type="submit" variant="secondary" disabled={busy || !form.name.trim() || (!form.phone.trim() && !form.email.trim())}>
            <Plus /> Add contact
          </Button>
        </div>
      </form>
    </section>
  );
}

// ---------- Rail ----------

function Rules({ state }: { state: TwinState }) {
  const used = state.twin.usedToday;
  return (
    <>
      <RailSection title="What your twin always does">
        <ul className="space-y-2 text-[12.5px] leading-relaxed text-muted-foreground">
          <li>Clones only your voice, after you say yes out loud.</li>
          <li>Opens every call and email by saying it&apos;s your AI twin.</li>
          <li>Reaches only the contacts you added.</li>
          <li>Waits for your approval before any call, email or promise, then sends it right away.</li>
          <li>Answers calls to its number as your AI twin and only takes messages.</li>
          <li>Never uses your memory on calls or emails with anyone else.</li>
          <li>Calls contacts only between {state.guard.callingHours}, their time.</li>
          <li>Stops recording when someone asks, and deletes what others said after {state.guard.retentionDays} days.</li>
          <li>Never pays, shares codes or passwords, or pretends to be you.</li>
        </ul>
      </RailSection>
      <RailSection title="Today">
        <dl className="space-y-1.5 text-[12.5px]">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Calls proposed</dt>
            <dd>
              {used.outbound_call} of {state.twin.limits.outbound_call}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Emails proposed</dt>
            <dd>
              {used.send_email} of {state.twin.limits.send_email}
            </dd>
          </div>
        </dl>
      </RailSection>
      <RailSection title="This month">
        <dl className="space-y-1.5 text-[12.5px]">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Estimated cost</dt>
            <dd className={cn(state.guard.usage.over && "text-destructive")}>
              ${state.guard.usage.spent.toFixed(2)} of ${state.guard.usage.budget}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Call minutes</dt>
            <dd>{state.guard.usage.minutes}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Emails</dt>
            <dd>{state.guard.usage.emails}</dd>
          </div>
        </dl>
        {state.guard.usage.over && <p className="mt-2 text-[12px] text-destructive">The cap is reached, so the twin won&apos;t call or email until next month.</p>}
      </RailSection>
      <RailSection title="The opener">
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">“Hi, this is {state.twin.owner}&apos;s AI twin, an AI assistant calling for {state.twin.owner}. This call may be recorded and transcribed…”</p>
      </RailSection>
    </>
  );
}
