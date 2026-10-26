"use client";

import { ArrowRight, Check, Eye, Flag, Loader2, Rocket, Sparkles, Telescope, UserPlus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import * as React from "react";
import { PageFrame, RailSection } from "@/components/layout/page-frame";
import { Reveal, RevealItem } from "@/components/motion/reveal";
import { EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApprovalCard } from "@/features/assistant/approval-card";
import { activeMilestone } from "@/lib/derive";
import { cn, relativeDay } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";
import type { Mission } from "@/types";
import { RunCard, VerdictBadge } from "./run-card";

const STAGES = [
  { key: "planning", label: "Plan", body: "The lead splits the goal" },
  { key: "running", label: "Work", body: "Helpers run in parallel" },
  { key: "reporting", label: "Review", body: "The supervisor checks each" },
  { key: "done", label: "Report", body: "One report, you approve" },
] as const;

const live = (m: Mission) => m.status === "planning" || m.status === "running" || m.status === "reporting";

export function Missions() {
  const { workspace, service, apply } = useWorkspace();
  const [goal, setGoal] = React.useState("");
  const [starting, setStarting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const missions = workspace.missions;
  const current = missions.find((m) => m.id === selected) ?? missions[0] ?? null;
  const busy = starting || missions.some(live);

  const start = async (text: string) => {
    const g = text.trim();
    if (g.length < 5 || busy) return;
    setStarting(true);
    setError(null);
    try {
      const { workspace: ws, mission } = await service.startMission(g);
      apply(ws);
      setSelected(mission.id);
      setGoal("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The mission couldn't start.");
    } finally {
      setStarting(false);
    }
  };

  const active = activeMilestone(workspace);
  const suggestions = [
    active && `Get “${active.title}” over the line this month`,
    "Find a mentor in my field and prepare the first conversation",
    "Work out whether I can afford a course this year",
  ].filter((s): s is string => !!s);

  return (
    <PageFrame rail={<Rail missions={missions} current={current?.id} onPick={setSelected} />} railTitle="Missions" width="wide">
      <Reveal className="grid grid-cols-[minmax(0,1fr)] gap-5">
        <RevealItem as="section" aria-labelledby="missions-heading" className="card ring-gradient paper relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 size-[24rem] rounded-full bg-[radial-gradient(circle,var(--accent-wash),transparent_65%)]" />
          <div className="relative grid grid-cols-[minmax(0,1fr)] gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
              <p className="t-label">Missions</p>
              <h1 id="missions-heading" className="mt-3 font-display text-[2.2rem] leading-[1.02] tracking-[-0.02em] text-balance sm:text-[2.8rem]">
                One goal. A <span className="text-copper italic">team</span> that splits it up.
              </h1>
              <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
                A lead agent breaks your goal into tasks and creates a helper for each. They work at the same time, a supervisor checks every result, and you get one report. Any plan waits for your approval.
              </p>
              <form
                className="mt-5 flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void start(goal);
                }}
              >
                <label htmlFor="mission-goal" className="sr-only">
                  Mission goal
                </label>
                <input
                  id="mission-goal"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  maxLength={400}
                  placeholder="What should the team work on?"
                  disabled={busy}
                  className="h-11 min-w-0 shrink-0 rounded-xl border border-border bg-surface px-4 text-[14px] shadow-card outline-none placeholder:text-subtle transition-[border-color,box-shadow] hover:border-border-strong focus:border-accent/70 focus:shadow-[var(--shadow-lift),0_0_0_3px_var(--accent-wash)] sm:flex-1"
                />
                <Button type="submit" variant="primary" size="lg" disabled={busy || goal.trim().length < 5}>
                  {busy ? <Loader2 className="animate-spin" /> : <Rocket />} {busy ? "Team at work…" : "Start the mission"}
                </Button>
              </form>
              <div className="mt-3 flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busy}
                    onClick={() => setGoal(s)}
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
            <TeamDiagram busy={busy} />
          </div>
        </RevealItem>

        <AnimatePresence mode="wait">
          {current ? (
            <motion.div key={current.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <MissionView mission={current} />
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="card p-6">
                <EmptyState icon={Rocket} title="No missions yet">
                  Give the team a goal that needs more than one kind of thinking, like finding context, testing risks and drafting first steps.
                </EmptyState>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Reveal>
    </PageFrame>
  );
}

/** Lead at the top, helpers in the middle, supervisor watching. Pulses while a mission runs. */
// The lead hands work down to three helpers and their results flow to the supervisor, as packets of light on the wires.
const WIRES = ["M120 44 L48 104", "M120 44 L120 104", "M120 44 L192 104", "M48 128 L120 164", "M120 128 L120 164", "M192 128 L120 164"];

function TeamDiagram({ busy }: { busy: boolean }) {
  const node =
    "group/node relative flex size-11 items-center justify-center rounded-xl border shadow-card transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:scale-110 hover:shadow-[0_0_24px_-6px_currentColor]";
  const label = "pointer-events-none absolute top-full left-1/2 z-10 mt-1.5 -translate-x-1/2 rounded-full border border-border bg-surface/90 px-2 py-0.5 text-[10.5px] whitespace-nowrap text-foreground opacity-0 shadow-card backdrop-blur transition-opacity group-hover/node:opacity-100";
  return (
    <div className="relative mx-auto hidden h-[13rem] w-[15rem] lg:block" aria-hidden>
      <svg className="absolute inset-0 size-full text-border-strong" viewBox="0 0 240 208" fill="none">
        {WIRES.map((d) => (
          <path key={d} d={d} stroke="currentColor" strokeDasharray="3 4" />
        ))}
        {WIRES.map((d) => (
          <path key={`glow-${d}`} d={d} stroke="var(--accent)" strokeOpacity={busy ? 0.9 : 0.35} strokeWidth="1.3" strokeDasharray="3 13" className={cn("animate-[dash-flow_1.2s_linear_infinite]", !busy && "[animation-duration:3.5s]")} />
        ))}
      </svg>
      {WIRES.map((d, i) => (
        <span
          key={`packet-${d}`}
          className={cn("absolute top-0 left-0 size-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)] animate-[travel_2.4s_ease-in-out_infinite]", busy && "[animation-duration:1.1s]")}
          style={{ offsetPath: `path("${d}")`, animationDelay: `${(i % 3) * 0.35 + (i > 2 ? 1.2 : 0)}s` }}
        />
      ))}
      <motion.span className={cn(node, "absolute top-0 left-1/2 -ml-[1.375rem] border-transparent bg-primary text-primary-foreground")} animate={busy ? { scale: [1, 1.08, 1] } : {}} transition={{ duration: 1.4, repeat: Infinity }}>
        <Flag className="size-5" />
        <span className={label}>Mission lead</span>
      </motion.span>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className={cn(node, "absolute top-[5.9rem] border-copper/30 bg-copper-wash text-copper")}
          style={{ left: `${[1.6, 6.125, 10.6][i]}rem` }}
          animate={busy ? { y: [0, -4, 0] } : {}}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.25 }}
        >
          {i === 1 ? <Telescope className="size-4.5" /> : <UserPlus className="size-4.5" />}
          <span className={label}>{i === 1 ? "Researcher" : "Helper"}</span>
        </motion.span>
      ))}
      <span className={cn(node, "absolute bottom-0 left-1/2 -ml-[1.375rem] border-accent/40 bg-accent-wash text-accent-ink")}>
        <Eye className="size-5" />
        <span className={cn(label, "top-auto bottom-full mt-0 mb-1.5")}>Supervisor</span>
      </span>
    </div>
  );
}

function Stages({ mission }: { mission: Mission }) {
  const order = STAGES.map((s) => s.key);
  const at = mission.status === "failed" ? -1 : order.indexOf(mission.status as (typeof order)[number]);
  return (
    <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
      {STAGES.map((s, i) => {
        const done = mission.status === "done" || i < at;
        const now = i === at && mission.status !== "done";
        return (
          <li key={s.key} className={cn("flex items-center gap-2.5 bg-surface px-3.5 py-3", now && "bg-accent-wash/50")}>
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px]", done ? "border-success/40 bg-success-wash text-success" : now ? "border-accent/50 text-accent-ink" : "border-border text-subtle")}>
              {done ? <Check className="size-3" strokeWidth={3} /> : now ? <Loader2 className="size-3 animate-spin" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium">{s.label}</span>
              <span className="block truncate text-[11.5px] text-muted-foreground">{s.body}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function MissionView({ mission }: { mission: Mission }) {
  const { workspace } = useWorkspace();
  const approval = mission.approvalId ? workspace.approvals.find((a) => a.id === mission.approvalId) : undefined;
  const planning = mission.status === "planning";
  return (
    <div className="grid gap-5">
      <section aria-labelledby="mission-goal-heading" className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-4">
          <h2 id="mission-goal-heading" className="t-label">
            Mission
          </h2>
          {mission.simulated && <Badge tone="copper">Demo team</Badge>}
          {mission.status === "failed" && (
            <Badge tone="destructive">
              <X aria-hidden /> Stopped
            </Badge>
          )}
          <span className="ml-auto t-meta">{relativeDay(mission.createdAt)}</span>
        </div>
        <div className="space-y-4 p-6">
          <p className="font-display text-[1.5rem] leading-snug italic">“{mission.goal}”</p>
          <Stages mission={mission} />
          {mission.error && <p className="rounded-lg border border-destructive/25 bg-destructive-wash px-3 py-2 text-[13px] text-destructive">{mission.error} Nothing was saved.</p>}
        </div>
      </section>

      <section aria-labelledby="tasks-heading">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 id="tasks-heading" className="t-section">
              The team
            </h2>
            <p className="mt-1 text-[13px] text-muted-foreground">{planning ? "The lead is deciding who does what." : `${mission.plan.length} tasks, each done by its own agent with only the tools it needs.`}</p>
          </div>
        </div>
        {planning ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card p-4">
                <motion.div className="h-3 w-2/3 rounded-full bg-surface-3" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.3, repeat: Infinity, delay: i * 0.15 }} />
                <motion.div className="mt-3 h-2.5 w-full rounded-full bg-surface-3" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.3, repeat: Infinity, delay: i * 0.15 + 0.1 }} />
                <motion.div className="mt-2 h-2.5 w-4/5 rounded-full bg-surface-3" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.3, repeat: Infinity, delay: i * 0.15 + 0.2 }} />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
            {mission.plan.map((t, i) => {
              const run = mission.runs[i];
              return run ? (
                <RunCard key={i} run={run} title={t.title} defaultOpen={mission.status === "done" && i === 0} />
              ) : (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-surface/60 p-3.5">
                  <Loader2 className="size-4 animate-spin text-subtle" aria-hidden />
                  <span className="text-[13.5px] font-medium">{t.title}</span>
                  <span className="text-[12px] text-muted-foreground">{t.agent === "researcher" ? "Researcher" : `${t.role} helper`}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {(mission.report || mission.status === "reporting") && (
        <section aria-labelledby="report-heading" className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-4">
            <h2 id="report-heading" className="t-label">
              Report
            </h2>
            {mission.lead && <VerdictBadge run={mission.lead} />}
          </div>
          {mission.report ? (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-6 p-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className="min-w-0 space-y-3 font-serif text-[15px] leading-relaxed">
                {mission.report.split(/\n{2,}/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
              <div className="min-w-0 space-y-4">
                {mission.nextStep && (
                  <div className="rounded-xl border border-accent/30 bg-accent-wash/60 p-4">
                    <p className="t-label text-accent-ink">Next step</p>
                    <p className="mt-1.5 text-[14px] font-medium">{mission.nextStep}</p>
                  </div>
                )}
                {approval ? (
                  <ApprovalCard approval={approval} />
                ) : (
                  <Button asChild variant="secondary">
                    <Link href={`/future-self?prompt=${encodeURIComponent(`Help me plan: ${mission.goal}`)}`}>
                      Talk it through <ArrowRight />
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="flex items-center gap-2 px-6 py-5 text-[13px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> The lead is writing the report from the results the supervisor accepted…
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function Rail({ missions, current, onPick }: { missions: Mission[]; current?: string; onPick: (id: string) => void }) {
  const { workspace } = useWorkspace();
  return (
    <div>
      <RailSection title="Past missions">
        {missions.length ? (
          <ul className="space-y-1">
            {missions.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onPick(m.id)}
                  aria-current={m.id === current}
                  className={cn("w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-2", m.id === current && "bg-surface-2")}
                >
                  <p className="line-clamp-2 text-[13px]">{m.goal}</p>
                  <p className="mt-0.5 t-meta">
                    {live(m) ? "Running" : m.status === "failed" ? "Stopped" : `${m.runs.filter((r) => r.status === "done").length}/${m.plan.length} accepted`} · {relativeDay(m.createdAt)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-subtle">Missions you start are kept here.</p>
        )}
      </RailSection>
      <RailSection title="Who's on the team">
        <ul className="space-y-2 text-[12px]">
          <li>
            <p className="font-medium text-foreground">Mission lead</p>
            <p className="text-subtle">Plans the tasks and writes the report. It has no tools of its own.</p>
          </li>
          <li>
            <p className="font-medium text-foreground">Helpers</p>
            <p className="text-subtle">Created for one task with a role and read-only tools. They can&apos;t save anything.</p>
          </li>
          <li>
            <p className="font-medium text-foreground">Researcher</p>
            <p className="text-subtle">{workspace.capabilities.research ? "Joins when a task needs the web." : "Joins when web search is on. It isn't here."}</p>
          </li>
          <li>
            <p className="font-medium text-foreground">Supervisor</p>
            <p className="text-subtle">Checks every result. Blocked results never reach the lead.</p>
          </li>
        </ul>
      </RailSection>
      <RailSection title="How it runs">
        <p className="text-[12px] text-subtle">
          {workspace.platform.backend === "docker-agent"
            ? "Every agent on the team is served by Docker Agent, and helper tasks run at the same time."
            : workspace.platform.backend === "in-process"
              ? "Every agent on the team runs on this server, and helper tasks run at the same time."
              : "The demo team is scripted in your browser from your demo notes. No model is called; the supervisor's rule checks are real."}
        </p>
      </RailSection>
    </div>
  );
}
