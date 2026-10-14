"use client";

import { ArrowRight, BookOpenText, Check, CircleDashed, Flag, Library, ListChecks, MessageCircle, Newspaper, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { Presence } from "@/components/brand/presence";
import { SectionHeading } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { MemoryPreview } from "@/features/memory/memory-preview";
import { TaskRow } from "@/features/roadmap/task-row";
import { activeMilestone, convergence, milestoneStatuses, nextStep, pendingApprovals, progressOf, recentMemories, sortedMilestones, tasksFor } from "@/lib/derive";
import { cn, formatDate, greeting, pluralize, relativeDay } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";
import type { ActivityItem } from "@/types";

const rise = (i: number) => ({ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.04 * i, duration: 0.3, ease: [0.2, 0.7, 0.2, 1] as const } });

export function Home() {
  const { workspace } = useWorkspace();
  const profile = workspace.profile!;
  const active = activeMilestone(workspace);
  const next = nextStep(workspace);
  const activeProgress = active ? progressOf(tasksFor(workspace.tasks, active.id)) : null;
  const waiting = pendingApprovals(workspace);
  const today = new Date();

  const summary = active && activeProgress
    ? `“${active.title}” is ${activeProgress.done} of ${pluralize(activeProgress.total, "step")} in.${next ? ` Next: ${next.title.charAt(0).toLowerCase()}${next.title.slice(1)}.` : ""}`
    : "You haven't set a goal yet. Start with a conversation and your future self will help you shape one.";

  return (
    <div className="mx-auto w-full max-w-[72rem] px-4 py-6 sm:px-6 sm:py-10 lg:px-10">
      <motion.header {...rise(0)} className="max-w-3xl">
        <p className="t-meta uppercase">{formatDate(today.toISOString(), { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="mt-3 font-display text-[2.4rem] leading-[1.02] tracking-[-0.01em] text-balance sm:text-[3.25rem]">
          {greeting(today)}, {profile.name}. <span className="text-muted-foreground">Your future is taking shape.</span>
        </h1>
        <p className="mt-3 max-w-2xl text-[14px] text-muted-foreground">{summary}</p>
      </motion.header>

      <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <motion.section {...rise(1)} aria-labelledby="fs-heading" className="paper relative overflow-hidden rounded-xl border border-border bg-surface">
          <div className="grid gap-6 p-5 sm:grid-cols-[auto_1fr] sm:p-7">
            <Presence convergence={convergence(workspace.tasks)} size={150} horizonLabel={String(profile.horizonYear)} className="mx-auto text-foreground sm:mx-0" />
            <div className="flex min-w-0 flex-col">
              <p className="t-label">Your future self</p>
              <h2 id="fs-heading" className="mt-1.5 font-display text-[26px] leading-tight italic">
                Future {profile.name}
              </h2>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                <OpeningLine />
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="primary" size="lg">
                  <Link href="/future-self">
                    <MessageCircle /> {workspace.conversation.length ? "Continue the conversation" : "Start a conversation"}
                  </Link>
                </Button>
                {waiting.length > 0 && (
                  <Button asChild variant="secondary" size="lg">
                    <Link href="/future-self">{pluralize(waiting.length, "proposal")} to review</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="border-t border-border px-5 py-3 sm:px-7">
            <p className="mb-2 t-label">Ask about</p>
            <ul className="flex flex-col gap-0.5">
              {suggestions(workspace).map((s) => (
                <li key={s}>
                  <Link href={`/future-self?prompt=${encodeURIComponent(s)}`} className="group flex items-center justify-between gap-3 rounded-md py-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                    <span className="truncate">{s}</span>
                    <ArrowRight className="size-3.5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent-ink" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </motion.section>

        <motion.section {...rise(2)} aria-labelledby="next-heading" className="flex flex-col rounded-xl border border-border bg-surface p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 id="next-heading" className="t-label">
              Today&apos;s next step
            </h2>
            {active && <span className="max-w-[50%] truncate t-meta">{active.title}</span>}
          </div>
          {next ? (
            <>
              <div className="mt-3">
                <TaskRow task={next} />
              </div>
              <p className="mt-auto pt-4 text-[12px] text-subtle">
                Chosen from your active milestone: work in progress first, then whatever is due soonest and not waiting on anything else.
              </p>
            </>
          ) : (
            <EmptyState
              className="mt-3"
              icon={Check}
              title={workspace.tasks.length ? "Everything open is done or blocked" : "No tasks yet"}
              action={
                <Button asChild size="sm" variant="secondary">
                  <Link href="/future-self?prompt=Help%20me%20plan%20my%20next%20step">Plan the next step</Link>
                </Button>
              }
            >
              {workspace.tasks.length ? "Unblock something on your roadmap, or plan the next milestone." : "Approved plans become tasks here."}
            </EmptyState>
          )}
        </motion.section>
      </div>

      <motion.section {...rise(3)} aria-labelledby="trajectory-heading" className="mt-12">
        <SectionHeading
          id="trajectory-heading"
          action={
            <Link href="/roadmap" className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
              Roadmap <ArrowRight className="size-3" />
            </Link>
          }
        >
          Personal trajectory
        </SectionHeading>
        <Trajectory />
      </motion.section>

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        <motion.section {...rise(4)} aria-labelledby="mem-heading">
          <SectionHeading
            id="mem-heading"
            action={
              <Link href="/memory" className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
                Memory Vault <ArrowRight className="size-3" />
              </Link>
            }
          >
            Recent memories
          </SectionHeading>
          {recentMemories(workspace.memories).length ? (
            <div className="divide-y divide-border border-y border-border">
              {recentMemories(workspace.memories).map((m) => (
                <MemoryPreview key={m.id} memory={m} className="mx-0 rounded-none px-0 hover:bg-transparent" />
              ))}
            </div>
          ) : (
            <EmptyState icon={Library} title="No memories yet">
              Things you share and approve in conversations are kept here, as notes you can read and edit.
            </EmptyState>
          )}
        </motion.section>

        <motion.section {...rise(5)} aria-labelledby="activity-heading">
          <SectionHeading id="activity-heading">Recent activity</SectionHeading>
          <ActivityList items={workspace.activity.slice(0, 7)} />
        </motion.section>
      </div>
    </div>
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
  if (next) out.push(`What's the smallest way to start “${next.title}”?`);
  if (blocked) out.push(`How do I get unstuck on “${blocked.title}”?`);
  out.push("How am I doing this week?");
  return out.slice(0, 3);
}

function Trajectory() {
  const { workspace } = useWorkspace();
  const milestones = sortedMilestones(workspace.milestones);
  const statuses = milestoneStatuses(workspace.milestones, workspace.tasks);
  if (!milestones.length)
    return (
      <EmptyState icon={Flag} title="No milestones yet">
        Your 10-year dream is set. Ask your future self to break it into a first milestone.
      </EmptyState>
    );
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex flex-col gap-1 border-b border-border px-5 py-4 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="font-display text-[19px] leading-snug italic">{workspace.profile!.dream}</p>
        <p className="shrink-0 t-meta">by {workspace.profile!.horizonYear}</p>
      </div>
      <ol className="grid sm:grid-cols-2 lg:grid-cols-4">
        {milestones.map((m, i) => {
          const s = statuses.get(m.id)!;
          const p = progressOf(tasksFor(workspace.tasks, m.id));
          return (
            <li key={m.id} className={cn("border-border", i > 0 && "border-t sm:border-t-0", i % 2 === 1 && "sm:border-l", i >= 2 && "sm:border-t lg:border-t-0", i > 0 && "lg:border-l")}>
              <Link href={`/roadmap?milestone=${encodeURIComponent(m.id)}`} className={cn("group flex h-full flex-col gap-2 px-5 py-4 transition-colors hover:bg-surface-2", s === "active" && "bg-accent-wash/40")}>
                <div className="flex items-center gap-2">
                  {s === "done" ? <Check className="size-3.5 text-success" aria-hidden /> : s === "active" ? <span aria-hidden className="size-2 rounded-full bg-accent" /> : <CircleDashed className="size-3.5 text-subtle" aria-hidden />}
                  <span className={cn("t-label", s === "active" && "!text-accent-ink")}>{s === "done" ? "Done" : s === "active" ? "Now" : "Later"}</span>
                </div>
                <p className={cn("text-[13.5px] leading-snug font-medium", s === "done" && "text-muted-foreground")}>{m.title}</p>
                <div className="mt-auto flex items-center gap-2 pt-1">
                  <div className="flex h-1 flex-1 gap-0.5" aria-hidden>
                    {tasksFor(workspace.tasks, m.id).map((t) => (
                      <span key={t.id} className={cn("flex-1 rounded-[1px]", t.status === "done" ? "bg-accent" : t.status === "blocked" ? "bg-warning/50" : t.status === "in_progress" ? "bg-accent/35" : "bg-surface-3")} />
                    ))}
                  </div>
                  <span className="t-meta">
                    {p.done}/{p.total}
                    <span className="sr-only"> tasks done</span>
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
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
    return (
      <EmptyState title="Nothing recorded yet">Completed tasks, saved reflections and approved plans will appear here as they happen.</EmptyState>
    );
  return (
    <ol className="relative ml-1.5 border-l border-border">
      {items.map((a) => {
        const Icon = ACTIVITY_ICON[a.kind];
        const body = (
          <>
            <span aria-hidden className="absolute -left-[9px] mt-0.5 flex size-[17px] items-center justify-center rounded-full border border-border-strong bg-background">
              <Icon className={cn("size-2.5", a.kind === "task_completed" ? "text-success" : "text-subtle")} />
            </span>
            <p className="text-[13px] leading-snug">{a.title}</p>
            <p className="mt-0.5 t-meta">{relativeDay(a.at)}</p>
          </>
        );
        return (
          <li key={a.id} className="relative pb-4 pl-5 last:pb-0">
            {a.href ? (
              <Link href={a.href} className="block rounded-md hover:text-foreground [&:hover_p:first-of-type]:underline">
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
