import { milestoneStatuses, progressOf, sortedMilestones, tasksFor } from "@/lib/derive";
import { formatDate } from "@/lib/utils";
import type { DailyArticle, DailyEdition, DailyItem, Memory, Task } from "@/types";
import type { DemoState } from "./seed";

// Builds a demo edition from the demo records as they stood on `date`.
// Headlines are templates filled with real records, so the paper can't claim anything the data doesn't show.

const WINDOW_DAYS = 7;

export function buildEdition(state: DemoState, date: string, issueNumber: number): DailyEdition {
  const end = `${date}T23:59:59.999Z`;
  const since = new Date(`${date}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - WINDOW_DAYS);
  const sinceIso = since.toISOString();

  // The world as it was on that date: tasks completed later count as open.
  const tasks: Task[] = state.tasks
    .filter((t) => t.createdAt <= end)
    .map((t) => (t.completedAt && t.completedAt > end ? { ...t, status: "todo", completedAt: undefined } : t));
  const milestones = state.milestones.filter((m) => m.createdAt <= end);
  const memories = state.memories.filter((m) => m.createdAt <= end && !m.archived && m.retrievable);
  const msTitle = (id: string) => milestones.find((m) => m.id === id)?.title ?? "your roadmap";

  const wins = tasks
    .filter((t) => t.status === "done" && t.completedAt && t.completedAt >= sinceIso)
    .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!));
  const progress: DailyItem[] = wins.map((t) => ({
    title: t.title,
    detail: `Completed ${formatDate(t.completedAt!)} · ${msTitle(t.milestoneId)}`,
    source: { kind: "task", id: t.id, label: "Completed task" },
  }));

  const statuses = milestoneStatuses(milestones, tasks);
  const active = sortedMilestones(milestones).find((m) => statuses.get(m.id) === "active");
  const activeTasks = active ? tasksFor(tasks, active.id) : [];
  const p = progressOf(activeTasks);
  const open = tasks.filter((t) => t.status !== "done").sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const blocked = open.filter((t) => t.status === "blocked");

  const firstName = state.profile?.name ?? "You";
  const lead: DailyArticle = wins.length
    ? {
        id: `${date}-lead`,
        section: "progress",
        kicker: active ? active.title : "The Journey",
        headline: wins.length === 1 ? `${firstName} closes a step: ${lowerFirst(wins[0].title)}` : `${firstName} completes ${wins.length} steps in a week`,
        dek: active ? `${p.done} of ${p.total} steps of the current milestone are now done.` : undefined,
        body: [
          `In the seven days to ${formatDate(date, { day: "numeric", month: "long" })}, ${firstName} completed ${wins.length === 1 ? "one task" : `${wins.length} tasks`}: ${wins.map((w) => w.title.toLowerCase()).join("; ")}.`,
          active
            ? `The current milestone, “${active.title}”, stands at ${p.done} of ${p.total} steps.${blocked.length ? ` ${blocked.length === 1 ? "One step is" : `${blocked.length} steps are`} blocked.` : ""}`
            : "There is no active milestone right now.",
        ],
        sources: [...wins.map((w) => ({ kind: "task" as const, id: w.id, label: w.title })), ...(active ? [{ kind: "milestone" as const, id: active.id, label: active.title }] : [])],
      }
    : {
        id: `${date}-lead`,
        section: "progress",
        kicker: "The Journey",
        headline: active ? `A quiet week on “${active.title}”` : `${firstName}'s story begins`,
        dek: "No steps were completed in the last seven days.",
        body: [
          "This edition only reports what the records show, and this week they show no completed steps.",
          open[0] ? `The next open step is “${open[0].title}”.` : "There are no open steps yet. Planning the next one is a good place to start.",
        ],
        sources: open[0] ? [{ kind: "task", id: open[0].id, label: open[0].title }] : [],
      };

  const stalled = open.find((t) => t.status === "blocked") ?? open.find((t) => t.dueDate && t.dueDate < date) ?? open[0];
  const unfinished: DailyArticle | null = stalled
    ? {
        id: `${date}-unfinished`,
        section: "progress",
        kicker: "The Unfinished Chapter",
        headline: stalled.status === "blocked" ? `Waiting on: ${lowerFirst(stalled.title)}` : `Still open: ${lowerFirst(stalled.title)}`,
        body: [
          stalled.status === "blocked" && stalled.blockedReason
            ? `This step is blocked. The note on it says: “${stalled.blockedReason}”`
            : `This step belongs to “${msTitle(stalled.milestoneId)}”${stalled.dueDate ? ` and is due ${formatDate(stalled.dueDate, { day: "numeric", month: "long" })}` : ""}.`,
          "Unfinished isn't failure. It's the part of the story that's still being written. The question worth asking is what would make the next move smaller.",
        ],
        sources: [{ kind: "task", id: stalled.id, label: stalled.title }],
      }
    : null;

  const lessonSource = latest(memories.filter((m) => m.provenance === "user-stated" && (m.kind === "reflection" || m.kind === "experience")));
  const lessons: DailyArticle | null = lessonSource
    ? {
        id: `${date}-lessons`,
        section: "reflection",
        kicker: "Lessons from the Journey",
        headline: lessonSource.title,
        dek: `From a note you wrote on ${formatDate(lessonSource.createdAt, { day: "numeric", month: "long" })}.`,
        body: lessonSource.body.split(/\n{2,}/).map((s) => s.replace(/^- /gm, "")),
        sources: [{ kind: "memory", id: lessonSource.id, label: lessonSource.title }],
      }
    : null;

  // Only interactions the user recorded themselves.
  const peopleSource = latest(memories.filter((m) => m.kind === "experience" && m.provenance === "user-stated" && m.id !== lessonSource?.id && /\b(call|met|spoke|asked|said|mentor|students?)\b/i.test(m.body)));
  const people: DailyArticle | null = peopleSource
    ? {
        id: `${date}-people`,
        section: "learning",
        kicker: "People and Conversations",
        headline: peopleSource.title,
        body: peopleSource.body.split(/\n{2,}/).slice(0, 2),
        sources: [{ kind: "memory", id: peopleSource.id, label: peopleSource.title }],
      }
    : null;

  const next = open.find((t) => t.status !== "blocked");
  return {
    id: `edition-${date}`,
    date,
    issueNumber,
    lead,
    progress,
    unfinished,
    openItems: open.slice(0, 4).map((t) => ({
      title: t.title,
      detail: t.status === "blocked" ? "Blocked" : t.dueDate ? `Due ${formatDate(t.dueDate)}` : msTitle(t.milestoneId),
      source: { kind: "task", id: t.id, label: "Open task" },
    })),
    lessons,
    people,
    trends: TRENDS,
    nextEdition: next ? `Next up: ${next.title}${next.dueDate ? `, due ${formatDate(next.dueDate, { day: "numeric", month: "long" })}` : ""}.` : null,
  };
}

// Demo mode has no research tool, so these are labelled illustrative examples with no links or real sources.
const TRENDS = [
  {
    id: "trend-sms",
    title: "Advice over SMS keeps outperforming apps in low-connectivity regions",
    summary: "An illustrative example of the kind of sourced signal this section shows once research is connected.",
    sourceName: "Illustrative example",
    simulated: true,
  },
  {
    id: "trend-compute",
    title: "More cloud providers are offering research credits to early-stage labs",
    summary: "Relevant to your compute blocker. In live mode this would link to the real programme and its date.",
    sourceName: "Illustrative example",
    simulated: true,
  },
];

function latest(list: Memory[]) {
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
