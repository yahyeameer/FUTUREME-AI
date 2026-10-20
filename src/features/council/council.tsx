"use client";

import { ArrowRight, BookmarkPlus, CalendarClock, Check, GraduationCap, Library, Loader2, ShieldAlert, Sparkles, Sunrise, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { PageFrame, RailSection } from "@/components/layout/page-frame";
import { Reveal, RevealItem } from "@/components/motion/reveal";
import { EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { activeMilestone, nextStep } from "@/lib/derive";
import { teamLabel } from "@/lib/team-info";
import { cn, relativeDay } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";
import type { CouncilSession } from "@/types";

const VOICE_STYLE: Record<string, { icon: React.ElementType; tint: string }> = {
  voice_horizon: { icon: Sunrise, tint: "bg-accent-wash text-accent-ink border-accent/30" },
  voice_next_year: { icon: CalendarClock, tint: "bg-info-wash text-info border-info/25" },
  voice_skeptic: { icon: ShieldAlert, tint: "bg-warning-wash text-warning border-warning/25" },
  voice_mentor: { icon: GraduationCap, tint: "bg-copper-wash text-copper border-copper/25" },
};
const VOICES = ["voice_horizon", "voice_next_year", "voice_skeptic", "voice_mentor"];

export function Council() {
  const { workspace, service, apply } = useWorkspace();
  const [question, setQuestion] = React.useState("");
  const [asking, setAsking] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const sessions = workspace.councils;
  const current = sessions.find((s) => s.id === selected) ?? sessions[0] ?? null;

  const ask = async (q: string) => {
    const text = q.trim();
    if (text.length < 3 || asking) return;
    setAsking(text);
    setError(null);
    try {
      const { workspace: ws, session } = await service.askCouncil(text);
      apply(ws);
      setSelected(session.id);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The council couldn't meet.");
    } finally {
      setAsking(null);
    }
  };

  const active = activeMilestone(workspace);
  const step = nextStep(workspace);
  const suggestions = [
    step && `Should I focus on “${step.title}” this week, or something else?`,
    active && `What would make “${active.title}” fail?`,
    "Should I say yes to a big opportunity that doesn't fit my plan?",
  ].filter((s): s is string => !!s);

  return (
    <PageFrame rail={<History sessions={sessions} current={current?.id} onPick={setSelected} />} railTitle="Past councils" width="wide">
      <Reveal className="grid grid-cols-[minmax(0,1fr)] gap-5">
        <RevealItem as="section" aria-labelledby="council-heading" className="card ring-gradient paper relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 size-[24rem] rounded-full bg-[radial-gradient(circle,var(--accent-wash),transparent_65%)]" />
          <div className="relative grid grid-cols-[minmax(0,1fr)] gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
              <p className="t-label">The council</p>
              <h1 id="council-heading" className="mt-3 font-display text-[2.2rem] leading-[1.02] tracking-[-0.02em] text-balance sm:text-[2.8rem]">
                One question. <span className="text-copper italic">Four</span> future selves.
              </h1>
              <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
                Each voice is its own agent. They read your notes, answer at the same time, and a chair agent turns what they said into one decision brief.
              </p>
              <form
                className="mt-5 flex flex-col gap-2.5 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void ask(question);
                }}
              >
                <label htmlFor="council-q" className="sr-only">
                  Your question for the council
                </label>
                <input
                  id="council-q"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  maxLength={600}
                  placeholder="What decision are you weighing?"
                  disabled={!!asking}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 text-[14px] shadow-card outline-none placeholder:text-subtle focus:border-border-strong focus:shadow-[var(--shadow-lift)]"
                />
                <Button type="submit" variant="primary" size="lg" disabled={!!asking || question.trim().length < 3}>
                  {asking ? <Loader2 className="animate-spin" /> : <Users />} {asking ? "Council is meeting…" : "Convene the council"}
                </Button>
              </form>
              <div className="mt-3 flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={!!asking}
                    onClick={() => setQuestion(s)}
                    className="flex max-w-full items-center gap-1.5 truncate rounded-full border border-border bg-surface-2/70 px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
                  >
                    <Sparkles className="size-3 shrink-0 text-accent-ink" aria-hidden />
                    <span className="truncate">{s}</span>
                  </button>
                ))}
              </div>
              {error && (
                <p role="alert" className="mt-3 text-[13px] text-destructive">
                  {error}
                </p>
              )}
            </div>
            <CouncilRing busy={!!asking} />
          </div>
        </RevealItem>

        <AnimatePresence mode="wait">
          {asking ? (
            <motion.div key="asking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Meeting question={asking} />
            </motion.div>
          ) : current ? (
            <motion.div key={current.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Session session={current} />
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="card p-6">
                <EmptyState icon={Users} title="No councils yet">
                  Ask about a real decision. You&apos;ll get four perspectives and one brief, and nothing is saved unless you choose to.
                </EmptyState>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Reveal>
    </PageFrame>
  );
}

/** The four voices around a table. They pulse while the council meets. */
/**
 * The four voices orbiting the chair, joined to it by threads of light. Hovering the ring stops the orbit; hovering a
 * voice lifts it and names it. While the council meets, the orbit quickens and the threads run.
 */
function CouncilRing({ busy }: { busy: boolean }) {
  const r = 82;
  const spin = busy ? "[animation-duration:9s]" : "[animation-duration:48s]";
  return (
    <div className="group/ring relative mx-auto hidden size-[14rem] lg:block" aria-hidden>
      <div className="absolute inset-[1.6rem] rounded-full border border-dashed border-border-strong" />
      <div className="absolute inset-[3.4rem] rounded-full bg-[radial-gradient(circle,var(--accent-wash),transparent_70%)] blur-md transition-opacity group-hover/ring:opacity-100 opacity-60" />
      <div className={cn("absolute inset-0 animate-orbit group-hover/ring:[animation-play-state:paused]", spin)}>
        <svg viewBox="-112 -112 224 224" className="absolute inset-0 size-full overflow-visible">
          {VOICES.map((v, i) => {
            const a = (i / VOICES.length) * Math.PI * 2 - Math.PI / 2;
            return (
              <line
                key={v}
                x1="0"
                y1="0"
                x2={Math.round(Math.cos(a) * r)}
                y2={Math.round(Math.sin(a) * r)}
                stroke="var(--accent)"
                strokeOpacity={busy ? 0.9 : 0.45}
                strokeWidth="1.2"
                strokeDasharray="3 5"
                className={cn("animate-[dash-flow_1.6s_linear_infinite]", !busy && "[animation-duration:4s]")}
              />
            );
          })}
        </svg>
        {VOICES.map((v, i) => {
          const a = (i / VOICES.length) * Math.PI * 2 - Math.PI / 2;
          const s = VOICE_STYLE[v];
          return (
            <span key={v} className="absolute top-1/2 left-1/2 -mt-5 -ml-5 size-10" style={{ transform: `translate(${Math.round(Math.cos(a) * r)}px, ${Math.round(Math.sin(a) * r)}px)` }}>
              {/* Counter-rotate so each voice stays upright while the ring turns. */}
              <span className={cn("group/voice block size-full animate-orbit [animation-direction:reverse] group-hover/ring:[animation-play-state:paused]", spin)}>
                <span className="block size-full transition-transform duration-300 group-hover/voice:scale-125">
                  <motion.span
                    className={cn("flex size-full items-center justify-center rounded-xl border shadow-card backdrop-blur transition-shadow duration-300 group-hover/voice:shadow-[0_0_22px_-4px_currentColor]", s.tint)}
                    animate={busy ? { scale: [1, 1.14, 1] } : { scale: 1 }}
                    transition={busy ? { duration: 1.2, repeat: Infinity, delay: i * 0.3 } : undefined}
                  >
                    <s.icon className="size-4.5" />
                  </motion.span>
                </span>
                <span className="pointer-events-none absolute top-full left-1/2 mt-2 -translate-x-1/2 translate-y-1 rounded-full border border-border bg-surface/90 px-2 py-0.5 text-[10.5px] whitespace-nowrap text-foreground opacity-0 shadow-card backdrop-blur transition-all duration-200 group-hover/voice:translate-y-0 group-hover/voice:opacity-100">
                  {teamLabel(v)}
                </span>
              </span>
            </span>
          );
        })}
      </div>
      <div className="absolute inset-[4.9rem] flex items-center justify-center rounded-full border border-white/20 bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_0_30px_-6px_var(--primary-glow)] transition-transform duration-500 group-hover/ring:scale-110">
        <span className={cn("absolute -inset-1.5 rounded-full border border-accent/50", busy ? "animate-ping" : "animate-breathe")} />
        <Users className="size-6" />
      </div>
    </div>
  );
}

function Meeting({ question }: { question: string }) {
  return (
    <div className="grid gap-4">
      <p className="text-[13px] text-muted-foreground">
        Asking: <span className="text-foreground">“{question}”</span>
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        {VOICES.map((v, i) => {
          const s = VOICE_STYLE[v];
          return (
            <div key={v} className="card p-5">
              <div className="flex items-center gap-2.5">
                <span className={cn("flex size-9 items-center justify-center rounded-xl border", s.tint)}>
                  <s.icon className="size-4" aria-hidden />
                </span>
                <p className="text-[14px] font-medium">{teamLabel(v)}</p>
                <span className="ml-auto flex items-center gap-1.5 t-meta">
                  <Loader2 className="size-3 animate-spin" aria-hidden /> reading your notes
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {[92, 80, 64].map((w, j) => (
                  <motion.div key={j} className="h-2.5 rounded-full bg-surface-3" style={{ width: `${w}%` }} animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.15 + j * 0.1 }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Session({ session }: { session: CouncilSession }) {
  const { workspace, run } = useWorkspace();
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const memoryIds = new Set(workspace.memories.map((m) => m.id));
  const b = session.brief;

  return (
    <div className="grid gap-5">
      <section aria-labelledby="brief-heading" className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-4">
          <h2 id="brief-heading" className="t-label">
            Decision brief
          </h2>
          {session.simulated && <Badge tone="copper">Demo voices</Badge>}
          <span className="ml-auto t-meta">{relativeDay(session.createdAt)}</span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 p-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0">
            <p className="font-display text-[1.45rem] leading-snug text-balance italic">“{session.question}”</p>
            <p className="mt-3 text-[14.5px] leading-relaxed">{b.summary}</p>
            {b.nextStep && (
              <div className="mt-5 rounded-xl border border-accent/30 bg-accent-wash px-4 py-3">
                <p className="t-label !text-accent-ink">Next step</p>
                <p className="mt-1 text-[14px] font-medium">{b.nextStep}</p>
              </div>
            )}
            <div className="mt-5 flex flex-wrap gap-2.5">
              {b.nextStep && (
                <Button variant="primary" onClick={() => router.push(`/future-self?prompt=${encodeURIComponent(`Help me plan this: ${b.nextStep}`)}`)}>
                  Turn it into a plan <ArrowRight />
                </Button>
              )}
              {session.memoryId ? (
                <Button asChild variant="secondary">
                  <Link href={memoryIds.has(session.memoryId) ? `/memory/${encodeURIComponent(session.memoryId)}` : "/memory"}>
                    <Check /> Saved to your vault
                  </Link>
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    await run((s) => s.saveCouncil(session.id), "Brief saved to your vault as an AI interpretation");
                    setSaving(false);
                  }}
                >
                  {saving ? <Loader2 className="animate-spin" /> : <BookmarkPlus />} Save brief to vault
                </Button>
              )}
            </div>
          </div>
          <div className="grid content-start gap-4">
            {b.agreements.length > 0 && <BriefList title="Where they agree" items={b.agreements} tone="success" />}
            {b.tensions.length > 0 && <BriefList title="Where they pull apart" items={b.tensions} tone="warning" />}
            {session.citations.length > 0 && (
              <div>
                <p className="t-label">Notes the voices read</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {session.citations.map((c) =>
                    memoryIds.has(c.memoryId) ? (
                      <Link key={c.memoryId} href={`/memory/${encodeURIComponent(c.memoryId)}`} className="flex max-w-60 items-center gap-1 truncate rounded-full border border-border bg-surface px-2 py-0.5 text-[11.5px] text-muted-foreground hover:text-foreground">
                        <Library className="size-3 shrink-0" aria-hidden /> <span className="truncate">{c.title}</span>
                      </Link>
                    ) : (
                      <span key={c.memoryId} className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11.5px] text-subtle">
                        {c.title}
                      </span>
                    ),
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section aria-label="What each voice said" className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        {session.voices.map((v, i) => {
          const s = VOICE_STYLE[v.name] ?? VOICE_STYLE.voice_mentor;
          return (
            <motion.article key={v.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }} className="card card-hover flex flex-col p-5">
              <header className="flex items-center gap-2.5">
                <span className={cn("flex size-9 items-center justify-center rounded-xl border", s.tint)}>
                  <s.icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[14px] font-medium">{v.label}</h3>
                  <p className="font-mono text-[10.5px] text-subtle">{v.name}</p>
                </div>
              </header>
              {v.reply ? (
                <p className="mt-3 flex-1 font-serif text-[15.5px] leading-relaxed">{v.reply}</p>
              ) : (
                <p className="mt-3 text-[13px] text-destructive">This voice didn&apos;t answer: {v.error ?? "unknown error"}.</p>
              )}
            </motion.article>
          );
        })}
      </section>
    </div>
  );
}

function BriefList({ title, items, tone }: { title: string; items: string[]; tone: "success" | "warning" }) {
  return (
    <div>
      <p className="t-label">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((a) => (
          <li key={a} className="flex gap-2 text-[13.5px]">
            <span aria-hidden className={cn("mt-[0.55em] size-1.5 shrink-0 rounded-full", tone === "success" ? "bg-success" : "bg-warning")} />
            {a}
          </li>
        ))}
      </ul>
    </div>
  );
}

function History({ sessions, current, onPick }: { sessions: CouncilSession[]; current?: string; onPick: (id: string) => void }) {
  const { workspace } = useWorkspace();
  const team = workspace.platform.team;
  return (
    <div>
      <RailSection title="Past councils">
        {sessions.length ? (
          <ul className="space-y-1">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onPick(s.id)}
                  aria-current={s.id === current}
                  className={cn("w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-2", s.id === current && "bg-surface-2")}
                >
                  <p className="line-clamp-2 text-[13px]">{s.question}</p>
                  <p className="mt-0.5 t-meta">{relativeDay(s.createdAt)}</p>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-subtle">Councils you convene are kept here.</p>
        )}
      </RailSection>
      <RailSection title="Who sits on it">
        <ul className="space-y-2">
          {team
            .filter((a) => a.role === "voice" || a.name === "council_chair")
            .map((a) => (
              <li key={a.name} className="text-[12px]">
                <p className="font-medium text-foreground">{a.label}</p>
                <p className="text-subtle">{a.description}</p>
              </li>
            ))}
        </ul>
      </RailSection>
      <RailSection title="How it runs">
        <p className="text-[12px] text-subtle">
          {workspace.platform.backend === "docker-agent"
            ? "Each voice is a separate agent in agents/futureme.yaml, served by Docker Agent. They run in parallel with read-only memory search."
            : workspace.platform.backend === "in-process"
              ? "Each voice is defined in agents/futureme.yaml and runs in the app server, with read-only memory search."
              : "Demo voices are scripted in your browser from your demo notes. No model is called."}
        </p>
      </RailSection>
    </div>
  );
}
