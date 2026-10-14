"use client";

import { ArrowUpRight, CircleDot, Flag, Library, Sparkles } from "lucide-react";
import Link from "next/link";
import { RailSection } from "@/components/layout/page-frame";
import { Badge } from "@/components/ui/badge";
import { activeMilestone, milestoneStatuses, nextStep, pendingApprovals, progressOf, sortedMilestones, tasksFor } from "@/lib/derive";
import { relativeDay } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";
import { DueLabel } from "@/features/roadmap/task-row";

/** What FutureMe is working from, separated into what you confirmed and what's only suggested. */
export function FutureSelfContext() {
  const { workspace } = useWorkspace();
  const { profile } = workspace;
  const active = activeMilestone(workspace);
  const statuses = milestoneStatuses(workspace.milestones, workspace.tasks);
  const upcoming = sortedMilestones(workspace.milestones).find((m) => statuses.get(m.id) === "upcoming");
  const next = nextStep(workspace);
  const p = active ? progressOf(tasksFor(workspace.tasks, active.id)) : null;
  const lastAssistant = [...workspace.conversation].reverse().find((m) => m.role === "assistant" && m.citations.length);
  const recalled = (lastAssistant?.citations ?? []).map((c) => workspace.memories.find((m) => m.id === c.memoryId)).filter((m) => !!m);
  const suggestions = pendingApprovals(workspace);
  const commitment = [...workspace.memories]
    .filter((m) => m.provenance === "user-stated" && !m.archived && (m.kind === "goal" || m.source.startsWith("Approved")))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const skills = workspace.skills.filter((s) => s.available);

  return (
    <div>
      {profile && (
        <RailSection title="Long-term dream">
          <p className="font-display text-[17px] leading-snug italic">{profile.dream}</p>
          <p className="mt-1.5 flex items-center gap-1.5 t-meta">
            <Badge tone="neutral">Confirmed</Badge> by {profile.horizonYear}
          </p>
        </RailSection>
      )}

      <RailSection title="Active milestone">
        {active && p ? (
          <Link href={`/roadmap?milestone=${encodeURIComponent(active.id)}`} className="group block">
            <p className="flex items-start gap-1.5 text-[13px] font-medium group-hover:underline">
              <Flag className="mt-0.5 size-3.5 shrink-0 text-accent-ink" aria-hidden /> {active.title}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.done} aria-label="Tasks done">
                <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${p.ratio * 100}%` }} />
              </div>
              <span className="t-meta">
                {p.done}/{p.total}
              </span>
            </div>
          </Link>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">No active milestone yet.</p>
        )}
      </RailSection>

      <RailSection title="Next step">
        {next ? (
          <div>
            <p className="flex items-start gap-1.5 text-[13px]">
              <CircleDot className="mt-0.5 size-3.5 shrink-0 text-accent-ink" aria-hidden />
              {next.title}
            </p>
            <div className="mt-1 pl-5">
              <DueLabel task={next} />
            </div>
          </div>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">Nothing open right now.</p>
        )}
      </RailSection>

      {commitment && (
        <RailSection title="Last commitment">
          <Link href={`/memory/${encodeURIComponent(commitment.id)}`} className="block text-[13px] hover:underline">
            {commitment.title}
          </Link>
          <p className="mt-0.5 t-meta">
            {commitment.source} · {relativeDay(commitment.createdAt)}
          </p>
        </RailSection>
      )}

      <RailSection title="Recalled in this conversation">
        {recalled.length ? (
          <ul className="space-y-1.5">
            {recalled.map((m) => (
              <li key={m.id}>
                <Link href={`/memory/${encodeURIComponent(m.id)}`} className="flex items-start gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground">
                  <Library className="mt-0.5 size-3 shrink-0" aria-hidden /> {m.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">Memories FutureMe retrieves will appear here, with links to each note.</p>
        )}
      </RailSection>

      {suggestions.length > 0 && (
        <RailSection title="Suggested, not saved">
          <ul className="space-y-1.5">
            {suggestions.map((a) => (
              <li key={a.id} className="flex items-start gap-1.5 text-[12.5px]">
                <Sparkles className="mt-0.5 size-3 shrink-0 text-copper" aria-hidden />
                <span>{a.kind === "plan" ? a.plan.goal : a.memory.title}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 t-meta">Waiting for your approval in the conversation.</p>
        </RailSection>
      )}

      {upcoming && (
        <RailSection title="Upcoming milestone">
          <Link href={`/roadmap?milestone=${encodeURIComponent(upcoming.id)}`} className="block text-[13px] hover:underline">
            {upcoming.title}
          </Link>
          {upcoming.targetDate && <p className="mt-0.5 t-meta">Target {relativeDay(upcoming.targetDate)}</p>}
        </RailSection>
      )}

      <RailSection
        title="Approved actions"
        action={
          <Link href="/skills" className="flex items-center gap-0.5 t-meta hover:text-foreground">
            All <ArrowUpRight className="size-3" />
          </Link>
        }
      >
        <p className="text-[12.5px] text-muted-foreground">
          {workspace.runtime.mode === "live" ? "Search memory, propose plans and propose memories. Changes always wait for you." : "Search memory, propose plans and memories, review progress. Changes always wait for you."}
        </p>
        {skills.length > 0 && <p className="mt-1.5 t-meta">{skills.length} skills ready</p>}
      </RailSection>
    </div>
  );
}
