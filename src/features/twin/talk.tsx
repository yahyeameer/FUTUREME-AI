"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { CalendarClock, Check, Hourglass, Loader2, Phone, PhoneCall, PhoneOff, ShieldCheck, Trash2, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { SectionHeading } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { cn, formatDate, formatTime, relativeDay } from "@/lib/utils";
import type { TwinState } from "@/app/api/twin/state";
import { post, type Act } from "./api";

// Phase 2: talk to your future self in your own cloned voice, in the browser or on your phone.

type Calls = TwinState["calls"];
type CallItem = Calls["calls"][number];

const LIVE = new Set(["connecting", "dialing", "in_progress"]);
/** SQLite stores UTC as "YYYY-MM-DD HH:MM:SS". */
const fromSql = (s: string) => new Date(`${s.replace(" ", "T")}Z`).toISOString();

export function TalkSection({ state, act, onState }: { state: TwinState; act: Act; onState: (s: TwinState) => void }) {
  const c = state.calls;
  const waiting = c.calls.some((x) => LIVE.has(x.status));
  // While a call is live or its transcript is still being written, check back now and then.
  React.useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => post({ action: "syncCalls" }).then(onState, () => undefined), 15_000);
    return () => clearInterval(t);
  }, [waiting, onState]);

  return (
    <section aria-labelledby="talk-h" id="talk" className="scroll-mt-24">
      <SectionHeading id="talk-h">Talk to your future self</SectionHeading>
      {!c.ready.publicUrl ? (
        <EmptyState icon={PhoneCall} title="Calls need a public address">
          ElevenLabs runs the voice and asks this server what your future self says next. Set TWIN_PUBLIC_URL to FutureMe&apos;s public https address and restart.
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ConversationProvider>
            <BrowserCall act={act} paused={state.twin.paused} year={c.horizonYear} />
          </ConversationProvider>
          <PhoneCalls state={state} act={act} />
        </div>
      )}
      {c.calls.length > 0 && <CallLog calls={c.calls} act={act} />}
    </section>
  );
}

// ---------- In the browser ----------

function BrowserCall({ act, paused, year }: { act: Act; paused: boolean; year: number }) {
  const [topic, setTopic] = React.useState("");
  const [starting, setStarting] = React.useState(false);
  const [lines, setLines] = React.useState<{ id: number; role: "user" | "agent"; text: string }[]>([]);
  const callId = React.useRef<number | null>(null);

  const conversation = useConversation({
    onConnect: ({ conversationId }) => {
      if (callId.current) void post({ action: "webCallConnected", callId: callId.current, conversationId }).catch(() => undefined);
    },
    onDisconnect: () => end(),
    onMessage: (m) => setLines((l) => [...l, { id: m.event_id, role: m.role, text: m.message }].slice(-12)),
    onError: (message) => {
      toast.error(typeof message === "string" ? message : "The call dropped.");
      end();
    },
  });

  /** Tells the server the call is over (once), then checks for its transcript. */
  function end() {
    const id = callId.current;
    callId.current = null;
    if (id) void act(() => post({ action: "webCallEnded", callId: id }).then(() => post({ action: "syncCalls" })));
  }
  const live = conversation.status === "connected" || conversation.status === "connecting";

  const start = async () => {
    setStarting(true);
    setLines([]);
    try {
      // Ask for the microphone first, so a refusal doesn't leave a call half started.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      toast.error("FutureMe needs your microphone for a call.");
      setStarting(false);
      return;
    }
    const next = await act(() => post({ action: "startWebCall", topic }));
    const call = next?.webCall as { callId: number; conversationToken: string; dynamicVariables: Record<string, string> } | undefined;
    if (call) {
      callId.current = call.callId;
      conversation.startSession({ conversationToken: call.conversationToken, connectionType: "webrtc", dynamicVariables: call.dynamicVariables });
    }
    setStarting(false);
  };

  return (
    <article className="flex flex-col rounded-2xl border border-accent/35 bg-surface p-5 shadow-card">
      <p className="t-label !text-accent-ink">In the browser</p>
      <h3 className="mt-1 font-display text-[1.35rem] leading-tight">Call yourself from {year}</h3>
      <p className="mt-2 text-[13px] text-muted-foreground">Your future self answers in your own voice and remembers your notes. The transcript is saved to your vault&apos;s Calls folder.</p>
      {live ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3" role="status">
            <span aria-hidden className={cn("size-2.5 rounded-full", conversation.status === "connecting" ? "bg-warning" : conversation.isSpeaking ? "animate-pulse bg-accent" : "bg-success")} />
            <span className="text-[13px]">{conversation.status === "connecting" ? "Connecting…" : conversation.isSpeaking ? "Your future self is speaking" : "Listening"}</span>
          </div>
          {lines.length > 0 && (
            <ul className="max-h-56 space-y-1.5 overflow-auto rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px]" aria-live="polite">
              {lines.map((l) => (
                <li key={`${l.role}-${l.id}`}>
                  <span className="font-medium">{l.role === "user" ? "You" : "Future you"}:</span> {l.text}
                </li>
              ))}
            </ul>
          )}
          <Button variant="destructive" onClick={() => conversation.endSession()}>
            <PhoneOff /> End call
          </Button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} placeholder="What's on your mind? (optional)" aria-label="What to talk about" />
          <Button variant="primary" onClick={start} disabled={starting || paused}>
            {starting ? <Loader2 className="animate-spin" /> : <PhoneCall />} Call now
          </Button>
        </div>
      )}
    </article>
  );
}

// ---------- On your phone ----------

function PhoneCalls({ state, act }: { state: TwinState; act: Act }) {
  const c = state.calls;
  if (!c.ready.phone) {
    return (
      <article className="rounded-2xl border border-dashed border-border-strong p-5">
        <p className="t-label">On your phone</p>
        <p className="mt-2 text-[13px] text-muted-foreground">
          To get calls from your future self, import a Twilio number into ElevenLabs and set ELEVENLABS_PHONE_NUMBER_ID on the server.
        </p>
      </article>
    );
  }
  return (
    <article className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <p className="t-label">On your phone</p>
      {c.phone.verified ? <Schedule state={state} act={act} /> : <VerifyPhone state={state} act={act} />}
    </article>
  );
}

function VerifyPhone({ state, act }: { state: TwinState; act: Act }) {
  const [phone, setPhone] = React.useState(state.calls.phone.number ?? "");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  return (
    <div className="mt-2 space-y-3">
      <p className="text-[13px] text-muted-foreground">Your twin only ever calls your own number. Add it and FutureMe calls you to read out a six-digit code.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+14155550123" aria-label="Your phone number" />
        <Button variant="secondary" disabled={busy || !phone.trim()} onClick={() => run(() => act(() => post({ action: "setPhone", phone }), "Calling you with your code now."))}>
          {busy ? <Loader2 className="animate-spin" /> : <Phone />} {state.calls.phone.codePending ? "Call again" : "Call me with a code"}
        </Button>
      </div>
      {state.calls.phone.codePending && (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => act(() => post({ action: "confirmPhone", code }), "Your phone is verified."));
          }}
        >
          <Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={10} placeholder="6-digit code" aria-label="Code from the call" />
          <Button type="submit" variant="primary" disabled={busy || code.replace(/\D/g, "").length !== 6}>
            <ShieldCheck /> Verify
          </Button>
        </form>
      )}
    </div>
  );
}

type Kind = "future_call" | "promise_check";

function Schedule({ state, act }: { state: TwinState; act: Act }) {
  const c = state.calls;
  const [kind, setKind] = React.useState<Kind>("future_call");
  const [topic, setTopic] = React.useState("");
  const [taskId, setTaskId] = React.useState(String(c.openTasks[0]?.id ?? ""));
  const [when, setWhen] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const task = c.openTasks.find((t) => String(t.id) === taskId);
  const valid = kind === "future_call" ? !!topic.trim() : !!task;

  const submit = async (now: boolean) => {
    setBusy(true);
    const call = kind === "future_call" ? { mode: kind, topic } : { mode: kind, taskId: Number(taskId) };
    const at = now || !when ? undefined : new Date(when).toISOString();
    const done = await act(() => post({ action: "scheduleCall", call: { ...call, at } }), now ? "Calling your phone now." : "Call scheduled.");
    if (done) {
      setTopic("");
      setWhen("");
    }
    setBusy(false);
  };

  return (
    <div className="mt-2 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">Calls go to {c.phone.number}.</p>
        <Button size="sm" variant="ghost" onClick={() => act(() => post({ action: "removePhone" }), "Phone removed. Scheduled calls were cancelled.")}>
          <Trash2 /> Remove
        </Button>
      </div>
      <Segmented<Kind>
        label="Kind of call"
        value={kind}
        onValueChange={setKind}
        options={[
          { value: "future_call", label: `Call from ${c.horizonYear}`, icon: <Hourglass /> },
          { value: "promise_check", label: "Promise Keeper", icon: <Check /> },
        ]}
      />
      {kind === "future_call" ? (
        <Input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} placeholder="What should future you call about?" aria-label="What the call is about" />
      ) : c.openTasks.length ? (
        <>
          <Select value={taskId} onValueChange={setTaskId} aria-label="Task to check on" options={c.openTasks.map((t) => ({ value: String(t.id), label: t.title }))} />
          <p className="text-[12.5px] text-muted-foreground">Future you asks whether you did it. Say yes and it&apos;s marked done; say no and you pick the next small step together.</p>
        </>
      ) : (
        <p className="text-[13px] text-muted-foreground">No open tasks. Approve a plan from your future self first.</p>
      )}
      <div className="flex flex-col gap-2">
        <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="When to call" />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy || !valid || !when} onClick={() => submit(false)}>
            <CalendarClock /> Schedule
          </Button>
          <Button variant="primary" disabled={busy || !valid || state.twin.paused} onClick={() => submit(true)}>
            {busy ? <Loader2 className="animate-spin" /> : <PhoneCall />} Call me now
          </Button>
        </div>
      </div>
      <p className="text-[12px] text-muted-foreground">
        {c.selfCallsToday} of {c.selfCallLimit} calls to your phone today.
      </p>
    </div>
  );
}

// ---------- Call log ----------

const STATUS: Record<CallItem["status"], { label: string; tone: "neutral" | "accent" | "success" | "warning" | "destructive" | "info" }> = {
  connecting: { label: "Connecting", tone: "info" },
  scheduled: { label: "Scheduled", tone: "accent" },
  dialing: { label: "Calling", tone: "info" },
  in_progress: { label: "Live", tone: "info" },
  done: { label: "Done", tone: "success" },
  missed: { label: "Missed", tone: "warning" },
  failed: { label: "Failed", tone: "destructive" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

function CallLog({ calls, act }: { calls: CallItem[]; act: Act }) {
  return (
    <div className="mt-6">
      <h3 className="t-label mb-2">Your calls</h3>
      <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
        {calls.map((call) => {
          const at = call.scheduledFor && call.status === "scheduled" ? call.scheduledFor : (call.startedAt ?? call.scheduledFor ?? call.createdAt);
          const s = STATUS[call.status] ?? STATUS.done;
          return (
            <li key={call.id} className="flex items-start gap-3 px-4 py-3">
              {call.direction === "self" ? <Phone className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden /> : <PhoneCall className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13.5px] font-medium">{call.label}</p>
                  <Badge tone={s.tone}>{s.label}</Badge>
                  {call.outcome === "kept" && <Badge tone="success">Promise kept</Badge>}
                </div>
                {(call.topic || call.task) && <p className="text-[12.5px]">{call.topic ?? call.task}</p>}
                <p className="text-[12px] text-muted-foreground">
                  {at && `${relativeDay(fromSql(at))}, ${formatTime(fromSql(at))}`}
                  {call.durationSecs ? ` · ${Math.max(1, Math.round(call.durationSecs / 60))} min` : ""}
                  {call.direction === "web" ? " · in the browser" : " · your phone"}
                </p>
                {call.summary && <p className="text-[12.5px] text-muted-foreground">{call.summary}</p>}
                {call.error && <p className="text-[12.5px] text-destructive">{call.error}</p>}
                {call.notePath && (
                  // A full page load, so the Memory Vault reads the note this call just added.
                  <a href={`/memory/${encodeURIComponent(call.notePath)}`} className="text-[12.5px] text-accent-ink underline-offset-2 hover:underline">
                    Read the transcript
                  </a>
                )}
              </div>
              {call.status === "scheduled" && (
                <Button size="icon-sm" variant="ghost" aria-label={`Cancel the call on ${formatDate(fromSql(at!))}`} onClick={() => act(() => post({ action: "cancelCall", id: call.id }), "Call cancelled")}>
                  <X />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
