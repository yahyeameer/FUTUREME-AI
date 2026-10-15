import type { SourceRef, Workspace } from "@/types";

/** Where a source record lives in the app, or null when it no longer exists. */
export function sourceHref(ref: SourceRef, ws: Workspace): string | null {
  switch (ref.kind) {
    case "task": {
      const task = ws.tasks.find((t) => t.id === ref.id);
      return task ? `/roadmap?milestone=${encodeURIComponent(task.milestoneId)}` : null;
    }
    case "milestone":
      return ws.milestones.some((m) => m.id === ref.id) ? `/roadmap?milestone=${encodeURIComponent(ref.id)}` : null;
    case "memory":
      return ws.memories.some((m) => m.id === ref.id) ? `/memory/${encodeURIComponent(ref.id)}` : null;
    case "reflection":
      return ws.reflection ? "/reflection" : null;
  }
}

export const SOURCE_LABEL: Record<SourceRef["kind"], string> = {
  task: "Task",
  milestone: "Milestone",
  memory: "Memory",
  reflection: "Reflection",
};
