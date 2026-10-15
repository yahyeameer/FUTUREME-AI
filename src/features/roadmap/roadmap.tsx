"use client";

import { AlertTriangle, CalendarClock, Check, ChevronDown, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { PageFrame, RailSection } from "@/components/layout/page-frame";
import { PageHeader, SectionHeading } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { ApprovalCard } from "@/features/assistant/approval-card";
import { MemoryPreview } from "@/features/memory/memory-preview";
import { blockedTasks, milestoneStatuses, pendingApprovals, progressOf, sortedMilestones, tasksFor, upcomingDeadlines } from "@/lib/derive";
import { cn, formatDate, pluralize } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";
import type { Milestone, MilestoneStatus } from "@/types";
import { DueLabel, TaskRow } from "./task-row";

export function Roadmap() {
  const { workspace } = useWorkspace();
  const params = useSearchParams();
  const focus = params.get("milestone");
  const milestones = sortedMilestones(workspace.milestones);
  const statuses = milestoneStatuses(workspace.milestones, workspace.tasks);
  const all = progressOf(workspace.tasks);
  const plans = pendingApprovals(workspace).filter((a) => a.kind === "plan");
  const profile = workspace.profile!;

  return (
    <PageFrame rail={<RoadmapRail />} railTitle="Accountability">
      <PageHeader
        eyebrow="Life Roadmap"
        title="From your dream to this week"
        actions={
          <Button asChild variant="secondary">
            <Link href={`/future-self?prompt=${encodeURIComponent("Help me plan my next milestone, in small steps.")}`}>
              <Plus /> Plan a milestone
            </Link>
          </Button>
        }
      />

      <section className="mt-7 card px-5 py-5 sm:px-6">
        <p className="t-label">Long-term goal · by {profile.horizonYear}</p>
        <p className="mt-2 font-display text-[clamp(1.4rem,1.1rem+1vw,1.9rem)] leading-snug text-balance">{profile.dream}</p>
        <p className="mt-3 t-meta">
          {pluralize(milestones.length, "milestone")} · {all.done} of {pluralize(all.total, "task")} done
        </p>
      </section>

      {plans.length > 0 && (
        <section className="mt-8">
          <SectionHeading>Waiting for your approval</SectionHeading>
          <div className="flex flex-col gap-3">
            {plans.map((a) => (
              <ApprovalCard key={a.id} approval={a} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-10" aria-labelledby="ms-heading">
        <SectionHeading id="ms-heading">Milestones</SectionHeading>
        {milestones.length ? (
          <ol className="relative">
            {milestones.map((m, i) => (
              <MilestoneItem key={m.id} milestone={m} status={statuses.get(m.id)!} last={i === milestones.length - 1} focused={focus === m.id} />
            ))}
          </ol>
        ) : (
          <EmptyState
            title="No milestones yet"
            action={
              <Button asChild size="sm" variant="primary">
                <Link href={`/future-self?prompt=${encodeURIComponent("Help me plan a first goal toward my dream, in small steps.")}`}>Plan with your future self</Link>
              </Button>
            }
          >
            Plans you approve in a conversation become milestones and tasks here. Progress is counted from the tasks themselves.
          </EmptyState>
        )}
      </section>
    </PageFrame>
  );
}

function MilestoneItem({ milestone, status, last, focused }: { milestone: Milestone; status: MilestoneStatus; last: boolean; focused: boolean }) {
  const { workspace } = useWorkspace();
  const tasks = tasksFor(workspace.tasks, milestone.id);
  const p = progressOf(tasks);
  const [open, setOpen] = React.useState(status === "active" || focused);
  const ref = React.useRef<HTMLLIElement>(null);
  const notes = milestone.memoryIds.map((id) => workspace.memories.find((m) => m.id === id)).filter((m) => !!m && !m.archived);

  React.useEffect(() => {
    if (focused) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(true);
      ref.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [focused]);

  const open_ = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <li ref={ref} className="relative scroll-mt-28 pb-6 pl-9 last:pb-0">
      {!last && <span aria-hidden className={cn("absolute top-6 bottom-0 left-[11px] w-px", status === "done" ? "bg-accent/50" : "bg-border")} />}
      <span
        aria-hidden
        className={cn(
          "absolute top-1 left-0 flex size-[23px] items-center justify-center rounded-full border bg-background",
          status === "done" && "border-accent bg-accent text-accent-foreground",
          status === "active" && "border-accent",
          status === "upcoming" && "border-border-strong",
        )}
      >
        {status === "done" ? <Check className="size-3" strokeWidth={3} /> : status === "active" ? <span className="size-2 rounded-full bg-accent" /> : null}
      </span>

      <div className={cn("rounded-xl border transition-colors", status === "active" ? "border-accent/40 bg-surface shadow-card" : "border-transparent", focused && "ring-1 ring-accent/40")}>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cn("flex w-full items-start gap-3 text-left", status === "active" ? "px-4 py-3" : "px-1 py-1")}>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("t-label", status === "active" && "!text-accent-ink")}>{status === "done" ? "Done" : status === "active" ? "Current milestone" : "Upcoming"}</span>
              {milestone.targetDate && <span className="t-meta">· target {formatDate(milestone.targetDate, { day: "numeric", month: "short", year: "numeric" })}</span>}
            </div>
            <p className={cn("mt-1 text-[15px] leading-snug font-medium", status === "done" && "text-muted-foreground")}>{milestone.title}</p>
            {milestone.why && <p className="mt-1 text-[12.5px] text-muted-foreground">{milestone.why}</p>}
            <div className="mt-2.5 flex items-center gap-2.5">
              <div className="flex h-1.5 max-w-xs flex-1 gap-0.5" aria-hidden>
                {tasks.map((t) => (
                  <motion.span key={t.id} layout className={cn("flex-1 rounded-[2px] transition-colors duration-500", t.status === "done" ? "bg-accent" : t.status === "in_progress" ? "bg-accent/35" : t.status === "blocked" ? "bg-warning/55" : "bg-surface-3")} />
                ))}
              </div>
              <span className="t-meta">
                {p.done}/{p.total} tasks
              </span>
            </div>
          </div>
          <ChevronDown className={cn("mt-1 size-4 shrink-0 text-subtle transition-transform", open && "rotate-180")} aria-hidden />
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
              <div className={cn("pb-3", status === "active" ? "px-4" : "px-1")}>
                {tasks.length === 0 && <p className="py-2 text-[12.5px] text-muted-foreground">No tasks under this milestone yet.</p>}
                <div className="divide-y divide-border">
                  {open_.map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
                  {done.map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
                </div>
                {notes.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="mb-1 t-label">Notes</p>
                    {notes.map((n) => (
                      <MemoryPreview key={n!.id} memory={n!} showExcerpt={false} className="mx-0 px-0 hover:bg-transparent" />
                    ))}
                  </div>
                )}
                <div className="mt-2">
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/future-self?prompt=${encodeURIComponent(`Review my milestone "${milestone.title}" and propose the next tasks.`)}`}>Ask for the next tasks</Link>
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </li>
  );
}

function RoadmapRail() {
  const { workspace } = useWorkspace();
  const blocked = blockedTasks(workspace.tasks);
  const deadlines = upcomingDeadlines(workspace.tasks.filter((t) => t.status !== "blocked"));
  const title = (id: string) => workspace.milestones.find((m) => m.id === id)?.title;
  return (
    <div>
      <RailSection title="Blockers">
        {blocked.length ? (
          <ul className="space-y-3">
            {blocked.map((t) => (
              <li key={t.id} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                <div>
                  <p className="text-[13px]">{t.title}</p>
                  {t.blockedReason && <p className="mt-0.5 text-[12px] text-muted-foreground">{t.blockedReason}</p>}
                  <Link href={`/future-self?prompt=${encodeURIComponent(`I'm blocked on "${t.title}". Help me find a way around it.`)}`} className="mt-1 inline-block text-[12px] text-accent-ink hover:underline">
                    Talk it through
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">{workspace.capabilities.taskStatuses.includes("blocked") ? "Nothing is blocked." : "Mark tasks as blocked in demo mode; the live backend tracks to-do and done."}</p>
        )}
      </RailSection>
      <RailSection title="Upcoming deadlines">
        {deadlines.length ? (
          <ul className="space-y-2.5">
            {deadlines.map((t) => (
              <li key={t.id} className="flex gap-2">
                <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[13px] leading-snug">{t.title}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-2">
                    <DueLabel task={t} />
                    <span className="truncate t-meta">{title(t.milestoneId)}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">No due dates set.</p>
        )}
      </RailSection>
      <RailSection title="How progress is counted">
        <p className="text-[12px] text-subtle">Only from tasks: a milestone is done when all its tasks are done. There are no streaks or scores.</p>
      </RailSection>
    </div>
  );
}
