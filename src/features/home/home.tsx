"use client";

import { ArrowRight, ArrowUpRight, BookOpenText, Bot, Check, CircleDashed, Flag, Hourglass, Library, ListChecks, MessageCircle, Newspaper, PhoneCall, Sparkles, Target } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Orb } from "@/components/brand/orb";
import { Presence } from "@/components/brand/presence";
import { CountUp } from "@/components/motion/count-up";
import { ProgressRing } from "@/components/motion/progress-ring";
import { Reveal, RevealItem } from "@/components/motion/reveal";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { ApprovalCard } from "@/features/assistant/approval-card";
import { agentLog, agentTools, logKind, toolUsage, vaultFiles } from "@/features/agent/agent-data";
import { MorningBrief, recentShift } from "@/features/agent/agent-team";
import { excerpt, KIND_LABEL } from "@/features/memory/memory-preview";
import { ProvenanceBadge } from "@/features/memory/provenance";
import { TaskRow } from "@/features/roadmap/task-row";
import { activeMilestone, convergence, liveMemories, milestoneStatuses, nextStep, pendingApprovals, progressOf, recentMemories, sortedMilestones, tasksFor } from "@/lib/derive";
import { useNow } from "@/lib/use-now";
import { cn, formatDate, greeting, pluralize, relativeDay } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";
import type { ActivityItem } from "@/types";

export function Home() {
  const { workspace } = useWorkspace();
  const profile = workspace.profile!;
  const active = activeMilestone(workspace);
  const next = nextStep(workspace);
  const activeProgress = active ? progressOf(tasksFor(workspace.tasks, active.id)) : null;
  const waiting = pendingApprovals(workspace);
  const today = new Date();
  const conv = convergence(workspace.tasks);
  const [now] = React.useState(() => Date.now());
  const brief = recentShift(workspace.nightShifts, now);

  const summary =
    active && activeProgress
      ? `“${active.title}” is ${activeProgress.done} of ${pluralize(activeProgress.total, "step")} in.${next ? ` Next: ${next.title.charAt(0).toLowerCase()}${next.title.slice(1)}.` : ""}`
      : "You haven't set a goal yet. Start with a conversation and your future self will help you shape one.";

  return (
    <div className="mx-auto w-full max-w-[80rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <Reveal className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-12 lg:gap-5">
        {/* Hero */}
        <RevealItem as="section" aria-labelledby="hero-heading" className="card ring-gradient paper relative overflow-hidden lg:col-span-8">
          <div aria-hidden className="aurora" />
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-[28rem] rounded-full bg-[radial-gradient(circle,var(--accent-wash),transparent_65%)]" />
          <div className="relative grid grid-cols-[minmax(0,1fr)] items-center gap-6 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2/80 px-3 py-1 text-[11.5px] font-medium text-muted-foreground shadow-[0_1px_2px_rgb(40_30_10/0.05)]">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-accent" />
                </span>
                {formatDate(today.toISOString(), { weekday: "long", day: "numeric", month: "long" })}
              </span>
              <h1 id="hero-heading" className="mt-5 font-display text-[2.4rem] leading-[1] tracking-[-0.02em] text-balance sm:text-[3rem] xl:text-[3.25rem]">
                {greeting(today)}, <span className="text-gradient italic">{profile.name}.</span>{" "}
                <span className="block text-muted-foreground">Your future is taking shape.</span>
              </h1>
              <p className="mt-4 max-w-xl text-[14.5px] leading-relaxed text-muted-foreground">{summary}</p>
              <div className="mt-6 flex flex-wrap gap-2.5">
                <Button asChild variant="primary" size="lg">
                  <Link href="/future-self">
                    <MessageCircle /> {workspace.conversation.length ? "Continue with your future self" : "Talk to your future self"}
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <Link href="/roadmap">
                    <Target /> Open roadmap
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="lg">
                  <Link href="/twin#talk">
                    <PhoneCall /> Call your future self
                  </Link>
                </Button>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                {suggestions(workspace).map((s) => (
                  <Link
                    key={s}
                    href={`/future-self?prompt=${encodeURIComponent(s)}`}
                    className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-[12.5px] text-muted-foreground backdrop-blur transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:bg-accent-wash hover:text-foreground hover:shadow-[0_8px_18px_-10px_var(--accent)]"
                  >
                    <Sparkles className="size-3 shrink-0 text-accent-ink transition-transform duration-300 group-hover:scale-125 group-hover:rotate-12" aria-hidden />
                    <span className="truncate">{s}</span>
                  </Link>
                ))}
              </div>
            </div>
            <div className="hidden animate-float flex-col items-center md:flex">
              <Orb size={230} horizonYear={profile.horizonYear}>
                <Presence convergence={conv} size={156} className="text-foreground" />
              </Orb>
              <p className="mt-2 text-center t-meta">
                Today <span className="text-subtle">→</span> <span className="text-accent-ink">{profile.horizonYear}</span>
              </p>
            </div>
          </div>
        </RevealItem>

        {/* Future self + next step */}
        <RevealItem as="section" aria-labelledby="fs-heading" className="card flex flex-col overflow-hidden lg:col-span-4">
          <div className="flex items-center gap-3 border-b border-border bg-gradient-to-br from-accent-wash to-transparent px-5 py-4">
            <span aria-hidden className="relative flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-accent to-copper font-display text-lg text-accent-foreground italic shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_6px_18px_-6px_var(--copper)]">
              <span className="absolute inset-[-3px] rounded-full border border-accent/40 pulse-ring" />
              {profile.name.charAt(0)}
            </span>
            <div className="min-w-0">
              <p className="t-label">Your future self says</p>
              <h2 id="fs-heading" className="font-display text-[20px] leading-tight italic">
                Future {profile.name}, {profile.horizonYear}
              </h2>
            </div>
          </div>
          <p className="px-5 pt-4 font-serif text-[15.5px] leading-relaxed">
            <OpeningLine />
          </p>
          <div className="mt-4 border-t border-dashed border-border px-5 pt-4 pb-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="t-label">Today&apos;s next step</h3>
              {active && <span className="max-w-[55%] truncate t-meta">{active.title}</span>}
            </div>
            {next ? (
              <div className="mt-1">
                <TaskRow task={next} />
              </div>
            ) : (
              <p className="mt-2 text-[13px] text-muted-foreground">{workspace.tasks.length ? "Everything open is done or blocked." : "Approved plans become tasks here."}</p>
            )}
          </div>
          <QuickAsk name={profile.name} />
        </RevealItem>

        {/* Stats: every number is counted from the records */}
        <RevealItem className="grid grid-cols-2 gap-4 lg:col-span-12 lg:grid-cols-4 lg:gap-5">
          <StatSteps />
          <StatMilestone />
          <StatMemories />
          <StatHorizon />
        </RevealItem>

        {brief && (
          <RevealItem as="section" aria-labelledby="brief-heading" className="lg:col-span-12">
            <MorningBrief shift={brief} />
          </RevealItem>
        )}

        {waiting.length > 0 && (
          <RevealItem as="section" aria-labelledby="waiting-heading" className="lg:col-span-12">
            <div className="mb-3 flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-warning" aria-hidden />
              <h2 id="waiting-heading" className="t-label">
                Waiting for your decision
              </h2>
            </div>
            <div className={cn("grid gap-4", waiting.length > 1 && "lg:grid-cols-2")}>
              {waiting.slice(0, 2).map((a) => (
                <ApprovalCard key={a.id} approval={a} />
              ))}
            </div>
          </RevealItem>
        )}

        {/* Agent */}
        <RevealItem as="section" aria-labelledby="agent-heading" className="card overflow-hidden lg:col-span-12">
          <AgentPanel />
        </RevealItem>

        {/* Journey */}
        <RevealItem as="section" aria-labelledby="journey-heading" className="card overflow-hidden lg:col-span-12">
          <Journey />
        </RevealItem>

        {/* Memories + activity */}
        <RevealItem as="section" aria-labelledby="mem-heading" className="lg:col-span-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="mem-heading" className="t-label">
              Recent memories
            </h2>
            <Link href="/memory" className="flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground">
              Memory Vault <ArrowRight className="size-3" />
            </Link>
          </div>
          <MemoryCards />
        </RevealItem>
        <RevealItem as="section" aria-labelledby="activity-heading" className="card p-5 lg:col-span-4">
          <h2 id="activity-heading" className="mb-4 t-label">
            Recent activity
          </h2>
          <ActivityList items={workspace.activity.slice(0, 6)} />
        </RevealItem>
      </Reveal>
    </div>
  );
}

function QuickAsk({ name }: { name: string }) {
  const router = useRouter();
  const [text, setText] = React.useState("");
  return (
    <form
      className="mt-auto border-t border-border bg-surface-2/70 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) router.push(`/future-self?prompt=${encodeURIComponent(text.trim())}`);
      }}
    >
      <label htmlFor="quick-ask" className="t-label">
        Ask Future {name}
      </label>
      <div className="focus-glow mt-2 flex items-center gap-2 rounded-xl border border-border bg-surface p-1.5 pl-3 shadow-[inset_0_1px_2px_rgb(40_30_10/0.05)] focus-within:border-accent">
        <input
          id="quick-ask"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What's on your mind today?"
          className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-subtle"
        />
        <Button type="submit" variant="primary" size="icon-sm" aria-label="Ask" disabled={!text.trim()}>
          <ArrowRight />
        </Button>
      </div>
    </form>
  );
}

function Stat({ icon: Icon, label, children, foot, href }: { icon: typeof Check; label: string; children: React.ReactNode; foot?: React.ReactNode; href?: string }) {
  const body = (
    <>
      <span aria-hidden className="pointer-events-none absolute -top-12 -right-12 size-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-50" style={{ background: "radial-gradient(circle, var(--accent), transparent 70%)" }} />
      <div className="relative flex items-center justify-between">
        <p className="t-label">{label}</p>
        <span className="flex size-7 items-center justify-center rounded-full bg-surface-3/80 text-muted-foreground transition-[color,background-color,transform] duration-300 group-hover:rotate-[-8deg] group-hover:scale-110 group-hover:bg-accent group-hover:text-accent-foreground group-hover:shadow-[0_0_14px_-2px_var(--accent)]">
          <Icon className="size-3.5" aria-hidden />
        </span>
      </div>
      <div className="mt-3">{children}</div>
      {foot && <div className="mt-3 text-[12px] text-muted-foreground">{foot}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="group card card-hover relative block overflow-hidden p-5">
      {body}
    </Link>
  ) : (
    <div className="group card card-hover relative overflow-hidden p-5">{body}</div>
  );
}

function StatSteps() {
  const { workspace } = useWorkspace();
  const p = progressOf(workspace.tasks);
  return (
    <Stat icon={Check} label="Steps completed" href="/roadmap">
      <p className="font-display text-[2.6rem] leading-none tracking-tight">
        <CountUp value={p.done} />
        <span className="text-[1.4rem] text-subtle">/{p.total}</span>
      </p>
      <div className="mt-3 flex h-1.5 gap-0.5" aria-hidden>
        {workspace.tasks.slice(0, 24).map((t, i) => (
          <motion.span
            key={t.id}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: 0.3 + i * 0.03 }}
            className={cn("flex-1 origin-bottom rounded-full", t.status === "done" ? "bg-gradient-to-r from-accent to-[color-mix(in_oklab,var(--accent),var(--copper)_35%)] shadow-[0_0_8px_-1px_var(--accent)]" : t.status === "blocked" ? "bg-warning/50" : t.status === "in_progress" ? "bg-accent/40" : "bg-surface-3")}
          />
        ))}
      </div>
    </Stat>
  );
}

function StatMilestone() {
  const { workspace } = useWorkspace();
  const active = activeMilestone(workspace);
  const p = active ? progressOf(tasksFor(workspace.tasks, active.id)) : { done: 0, total: 0 };
  const ratio = p.total ? p.done / p.total : 0;
  return (
    <Stat icon={Flag} label="Current milestone" href={active ? `/roadmap?milestone=${encodeURIComponent(active.id)}` : "/roadmap"}>
      <div className="flex items-center gap-3">
        <ProgressRing value={ratio} size={58} label={`${Math.round(ratio * 100)}% of the current milestone done`}>
          <span className="font-mono text-[12px] font-medium">
            <CountUp value={Math.round(ratio * 100)} />%
          </span>
        </ProgressRing>
        <p className="line-clamp-3 min-w-0 text-[13px] leading-snug font-medium">{active?.title ?? "No active milestone"}</p>
      </div>
    </Stat>
  );
}

function StatMemories() {
  const { workspace } = useWorkspace();
  const live = liveMemories(workspace.memories);
  const inferred = live.filter((m) => m.provenance === "ai-inferred").length;
  return (
    <Stat icon={Library} label="Memories" href="/memory" foot={`${live.length - inferred} you said · ${inferred} AI interpretations`}>
      <p className="font-display text-[2.6rem] leading-none tracking-tight">
        <CountUp value={live.length} />
      </p>
    </Stat>
  );
}

function StatHorizon() {
  const { workspace } = useWorkspace();
  const year = workspace.profile!.horizonYear;
  const years = Math.max(0, year - new Date().getFullYear());
  const now = useNow();
  const days = now ? Math.max(0, Math.ceil((new Date(year, 0, 1).getTime() - now.getTime()) / 86_400_000)) : null;
  return (
    <Stat icon={Hourglass} label={`Toward ${year}`} href="/reflection" foot={days !== null ? <span className="tabular-nums">{days.toLocaleString("en-GB")} days to the future you described</span> : "Years left to the future you described"}>
      <p className="font-display text-[2.6rem] leading-none tracking-tight">
        <CountUp value={years} />
        <span className="ml-1 text-[1.1rem] text-subtle">{years === 1 ? "year" : "years"}</span>
      </p>
    </Stat>
  );
}

function OpeningLine() {
  const { workspace } = useWorkspace();
  const waiting = pendingApprovals(workspace);
  const lastUser = [...workspace.conversation].reverse().find((m) => m.role === "user");
  const next = nextStep(workspace);
  if (waiting.length) {
    const a = waiting[0];
    return <>I suggested {a.kind === "plan" ? `a plan for “${a.plan.goal}”` : `remembering “${a.memory.title}”`}. It&apos;s waiting for your decision; nothing is saved until you approve it.</>;
  }
  if (lastUser) return <>{relativeDay(lastUser.createdAt)} you asked: “{lastUser.content.length > 90 ? `${lastUser.content.slice(0, 89)}…` : lastUser.content}” Want to pick that up?</>;
  if (next) return <>The most concrete step in front of you is “{next.title}”. Want to think it through together?</>;
  return <>Tell me what&apos;s on your mind, and I&apos;ll help you connect it to where you want to go.</>;
}

function suggestions(ws: ReturnType<typeof useWorkspace>["workspace"]) {
  const out: string[] = [];
  const next = nextStep(ws);
  const blocked = ws.tasks.find((t) => t.status === "blocked");
  if (next) out.push(`Smallest way to start “${next.title}”?`);
  if (blocked) out.push(`Get unstuck on “${blocked.title}”`);
  out.push("How am I doing this week?");
  return out.slice(0, 3);
}

function AgentPanel() {
  const { workspace } = useWorkspace();
  const usage = toolUsage(workspace);
  const log = agentLog(workspace).slice(0, 3);
  const readable = vaultFiles(workspace).filter((f) => f.readable).length;
  const tools = agentTools(workspace);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-card">
              <Bot className="size-4" aria-hidden />
            </span>
            <div>
              <h2 id="agent-heading" className="t-label">
                Your agent
              </h2>
              <p className="text-[13px] text-muted-foreground">
                {pluralize(tools.filter((t) => t.gate !== "unavailable").length, "tool")} · {pluralize(readable, "file")} it can read · {pluralize(workspace.skills.filter((s) => s.available).length, "action")}
              </p>
            </div>
          </div>
          <Link href="/agent" className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground">
            Open agent <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
        <ul className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2">
          {tools.slice(0, 4).map((t) => {
            const u = usage.get(t.name);
            const off = t.gate === "unavailable";
            return (
              <li key={t.name}>
                <Link href="/agent" className={cn("flex items-center gap-3 rounded-xl border bg-surface-2/60 px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-surface", off ? "border-dashed border-border" : "border-border")}>
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", off ? "text-subtle" : t.gate === "approval" ? "bg-copper-wash text-copper" : "bg-accent-wash text-accent-ink")}>
                    <t.icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-[13px] font-medium", off && "text-muted-foreground")}>{t.label}</span>
                    <span className="block truncate text-[11.5px] text-subtle">{off ? "Not connected" : t.gate === "approval" ? "Asks before saving" : "Runs on its own"}</span>
                  </span>
                  {!off && <span className="t-meta">{u ? `${u.count}×` : "0×"}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="border-t border-border bg-sunken/50 p-6 lg:border-t-0 lg:border-l">
        <p className="t-label">Latest actions</p>
        {log.length ? (
          <ol className="mt-4 space-y-3.5">
            {log.map((e) => (
              <li key={e.id}>
                <Link href={e.href} className="group flex gap-3">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", e.status === "pending" ? "bg-warning" : e.status === "failed" ? "bg-destructive" : e.status === "rejected" ? "bg-subtle" : "bg-accent")} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-[13px] leading-snug group-hover:underline">{e.title}</span>
                    <span className="mt-0.5 block t-meta">
                      <span className={cn(e.tool && "font-mono")}>{logKind(e)}</span> · {relativeDay(e.at)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-[13px] text-muted-foreground">Nothing yet. Ask your future self something and each tool it uses shows up here.</p>
        )}
      </div>
    </div>
  );
}

function Journey() {
  const { workspace } = useWorkspace();
  const milestones = sortedMilestones(workspace.milestones);
  const statuses = milestoneStatuses(workspace.milestones, workspace.tasks);
  const doneCount = milestones.filter((m) => statuses.get(m.id) === "done").length;
  const activeIdx = milestones.findIndex((m) => statuses.get(m.id) === "active");
  // The line fills to the active milestone, plus how far into it you are.
  const activeP = activeIdx >= 0 ? progressOf(tasksFor(workspace.tasks, milestones[activeIdx].id)) : null;
  const fill = milestones.length > 1 ? Math.min(1, ((activeIdx >= 0 ? activeIdx : doneCount) + (activeP && activeP.total ? activeP.done / activeP.total : 0)) / (milestones.length - 1)) : doneCount ? 1 : 0;

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-border px-6 py-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 id="journey-heading" className="t-label">
            Your journey to {workspace.profile!.horizonYear}
          </h2>
          <p className="mt-2 max-w-3xl font-display text-[1.35rem] leading-snug text-balance italic sm:text-[1.6rem]">“{workspace.profile!.dream}”</p>
        </div>
        <Link href="/roadmap" className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground">
          Full roadmap <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
      {milestones.length ? (
        <div className="relative px-6 pt-8 pb-6">
          <div aria-hidden className="absolute top-[2.65rem] right-10 left-10 hidden h-[3px] rounded-full bg-surface-3 md:block">
            <motion.div className="h-full origin-left rounded-full bg-gradient-to-r from-accent to-copper" initial={{ scaleX: 0 }} animate={{ scaleX: fill }} transition={{ duration: 1.4, ease: [0.2, 0.7, 0.2, 1], delay: 0.3 }} />
          </div>
          <ol className="relative grid gap-5 md:gap-4" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(12rem, 1fr))` }}>
            {milestones.map((m, i) => {
              const s = statuses.get(m.id)!;
              const p = progressOf(tasksFor(workspace.tasks, m.id));
              return (
                <motion.li key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 + i * 0.1 }}>
                  <Link href={`/roadmap?milestone=${encodeURIComponent(m.id)}`} className="group flex flex-col items-start gap-3 md:items-center md:text-center">
                    <span
                      className={cn(
                        "relative flex size-[22px] items-center justify-center rounded-full border-2 bg-surface transition-transform group-hover:scale-110",
                        s === "done" && "border-accent bg-accent text-accent-foreground",
                        s === "active" && "border-accent",
                        s === "upcoming" && "border-border-strong",
                      )}
                    >
                      {s === "done" && <Check className="size-3" strokeWidth={3} />}
                      {s === "active" && (
                        <>
                          <span className="absolute inset-0 animate-ping rounded-full bg-accent/40" />
                          <span className="size-2 rounded-full bg-accent" />
                        </>
                      )}
                      {s === "upcoming" && <CircleDashed className="size-3 text-subtle" />}
                    </span>
                    <div className={cn("w-full rounded-xl border border-transparent px-3 py-2.5 transition-colors group-hover:border-border group-hover:bg-surface-2", s === "active" && "border-accent/40 bg-accent-wash")}>
                      <p className={cn("t-label", s === "active" && "!text-accent-ink")}>{s === "done" ? "Done" : s === "active" ? "Now" : "Later"}</p>
                      <p className={cn("mt-1 text-[13.5px] leading-snug font-medium", s === "done" && "text-muted-foreground")}>{m.title}</p>
                      <p className="mt-1 t-meta">
                        {p.done}/{p.total} steps{m.targetDate ? ` · ${formatDate(m.targetDate, { month: "short", year: "numeric" })}` : ""}
                      </p>
                    </div>
                  </Link>
                </motion.li>
              );
            })}
          </ol>
        </div>
      ) : (
        <div className="p-6">
          <EmptyState icon={Flag} title="No milestones yet">
            Ask your future self to break your dream into a first milestone.
          </EmptyState>
        </div>
      )}
    </>
  );
}

function MemoryCards() {
  const { workspace } = useWorkspace();
  const recent = recentMemories(workspace.memories, 4);
  if (!recent.length)
    return (
      <EmptyState icon={Library} title="No memories yet">
        Things you share and approve in conversations are kept here, as notes you can read and edit.
      </EmptyState>
    );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {recent.map((m) => (
        <Link key={m.id} href={`/memory/${encodeURIComponent(m.id)}`} className="group card card-hover flex flex-col p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="t-label">{KIND_LABEL[m.kind]}</span>
            <ProvenanceBadge value={m.provenance} />
          </div>
          <p className="mt-2.5 font-display text-[1.3rem] leading-tight">{m.title}</p>
          <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{excerpt(m.body, 160)}</p>
          <p className="mt-auto flex items-center justify-between pt-4 t-meta">
            {relativeDay(m.updatedAt)}
            <ArrowUpRight className="size-3.5 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
          </p>
        </Link>
      ))}
    </div>
  );
}

const ACTIVITY_ICON: Record<ActivityItem["kind"], typeof Check> = {
  goal_created: Flag,
  task_completed: Check,
  reflection_saved: BookOpenText,
  memory_saved: Library,
  plan_approved: ListChecks,
  plan_rejected: ListChecks,
  daily_published: Newspaper,
  skill_run: Sparkles,
};

export function ActivityList({ items }: { items: ActivityItem[] }) {
  if (!items.length)
    return <EmptyState title="Nothing recorded yet">Completed tasks, saved reflections and approved plans will appear here as they happen.</EmptyState>;
  return (
    <ol className="relative ml-2.5 border-l border-dashed border-border-strong">
      {items.map((a) => {
        const Icon = ACTIVITY_ICON[a.kind];
        const body = (
          <>
            <span aria-hidden className={cn("absolute -left-[12px] flex size-[23px] items-center justify-center rounded-full border bg-surface shadow-[0_1px_2px_rgb(40_30_10/0.06)]", a.kind === "task_completed" ? "border-accent/60 text-accent-ink" : "border-border text-subtle")}>
              <Icon className="size-3" />
            </span>
            <p className="text-[13px] leading-snug">{a.title}</p>
            <p className="mt-0.5 t-meta">{relativeDay(a.at)}</p>
          </>
        );
        return (
          <li key={a.id} className="relative pb-5 pl-6 last:pb-0">
            {a.href ? (
              <Link href={a.href} className="block rounded-md [&:hover_p:first-of-type]:underline">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ol>
  );
}
