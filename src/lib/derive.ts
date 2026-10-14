import type { Memory, Milestone, MilestoneStatus, Task, Workspace } from "@/types";

// Derived views over workspace data. Every number shown in the UI comes from here, computed from task records.

export function tasksFor(tasks: Task[], milestoneId: string) {
  return tasks.filter((t) => t.milestoneId === milestoneId);
}

export function progressOf(tasks: Task[]) {
  const done = tasks.filter((t) => t.status === "done").length;
  return { done, total: tasks.length, ratio: tasks.length ? done / tasks.length : 0 };
}

export function milestoneStatuses(milestones: Milestone[], tasks: Task[]): Map<string, MilestoneStatus> {
  const out = new Map<string, MilestoneStatus>();
  let activeAssigned = false;
  for (const ms of [...milestones].sort((a, b) => a.order - b.order)) {
    const p = progressOf(tasksFor(tasks, ms.id));
    if (p.total > 0 && p.done === p.total) out.set(ms.id, "done");
    else if (!activeAssigned) {
      out.set(ms.id, "active");
      activeAssigned = true;
    } else out.set(ms.id, "upcoming");
  }
  return out;
}

export function sortedMilestones(milestones: Milestone[]) {
  return [...milestones].sort((a, b) => a.order - b.order);
}

export function activeMilestone(ws: Pick<Workspace, "milestones" | "tasks">): Milestone | null {
  const statuses = milestoneStatuses(ws.milestones, ws.tasks);
  return sortedMilestones(ws.milestones).find((m) => statuses.get(m.id) === "active") ?? null;
}

const STATUS_RANK: Record<Task["status"], number> = { in_progress: 0, todo: 1, blocked: 2, done: 3 };

function unblocked(task: Task, all: Task[]) {
  return (task.dependsOn ?? []).every((id) => all.find((t) => t.id === id)?.status === "done");
}

/** The single most useful next action: in-progress first, then the earliest due unblocked task in the active milestone. */
export function nextStep(ws: Pick<Workspace, "milestones" | "tasks">): Task | null {
  const active = activeMilestone(ws);
  const pool = ws.tasks.filter((t) => t.status !== "done" && t.status !== "blocked" && unblocked(t, ws.tasks));
  const ranked = (list: Task[]) =>
    [...list].sort(
      (a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
        (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
        a.createdAt.localeCompare(b.createdAt),
    )[0] ?? null;
  return (active && ranked(pool.filter((t) => t.milestoneId === active.id))) || ranked(pool);
}

export function upcomingDeadlines(tasks: Task[], limit = 4) {
  return tasks
    .filter((t) => t.status !== "done" && t.dueDate)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
    .slice(0, limit);
}

export function blockedTasks(tasks: Task[]) {
  return tasks.filter((t) => t.status === "blocked");
}

export function liveMemories(memories: Memory[]) {
  return memories.filter((m) => !m.archived);
}

export function recentMemories(memories: Memory[], limit = 4) {
  return liveMemories(memories)
    .filter((m) => m.kind !== "daily" && m.kind !== "task")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

export function memoryById(memories: Memory[], id: string) {
  return memories.find((m) => m.id === id);
}

export function pendingApprovals(ws: Pick<Workspace, "approvals">) {
  return ws.approvals.filter((a) => a.status === "pending");
}

/** How far "present" and "future" have converged, from real task completion across all milestones. */
export function convergence(tasks: Task[]) {
  return progressOf(tasks).ratio;
}
