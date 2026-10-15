"use client";

import { Check, Link2, MoreHorizontal, Pencil } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { cn, daysUntil, formatDate, relativeDay } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";
import type { Task, TaskStatus } from "@/types";
import { STATUS_META } from "./task-status";
import { TaskEditor } from "./task-editor";

export function DueLabel({ task }: { task: Task }) {
  if (task.status === "done" && task.completedAt) return <span className="t-meta">Done {relativeDay(task.completedAt).toLowerCase()}</span>;
  if (!task.dueDate) return null;
  const d = daysUntil(task.dueDate);
  return (
    <span className={cn("t-meta", d < 0 && "!text-destructive", d >= 0 && d <= 2 && "!text-warning")}>
      {d < 0 ? `Overdue ${-d}d` : d === 0 ? "Due today" : d === 1 ? "Due tomorrow" : `Due ${formatDate(task.dueDate)}`}
    </span>
  );
}

/** One task with a completion control. Completion only shows once the service confirms it. */
export function TaskRow({ task, showMilestone, compact = false }: { task: Task; showMilestone?: string; compact?: boolean }) {
  const { run, workspace } = useWorkspace();
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState<null | { status?: TaskStatus }>(null);
  const caps = workspace.capabilities;
  const done = task.status === "done";
  const meta = STATUS_META[task.status];
  const deps = (task.dependsOn ?? []).map((id) => workspace.tasks.find((t) => t.id === id)).filter((t): t is Task => !!t && t.status !== "done");
  const canReopen = caps.taskStatuses.includes("todo") && caps.editTasks;

  const setStatus = async (status: TaskStatus) => {
    setBusy(true);
    await run((s) => s.updateTask(task.id, { status }), status === "done" ? "Task completed" : undefined);
    setBusy(false);
  };

  return (
    <div className={cn("group flex items-start gap-3 py-[var(--row-y)]", compact && "py-1.5")}>
      <Tooltip content={done ? (canReopen ? "Mark as not done" : "Completed") : "Mark as done"}>
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `${task.title}: done` : `Mark “${task.title}” as done`}
          disabled={busy || (done && !canReopen)}
          onClick={() => setStatus(done ? "todo" : "done")}
          className={cn(
            "relative mt-px flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
            done ? "border-accent bg-accent text-accent-foreground" : "border-border-strong bg-surface-2 hover:border-accent/70",
            busy && "animate-pulse",
          )}
        >
          <AnimatePresence initial={false}>
            {done && (
              <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ type: "spring", stiffness: 500, damping: 26 }}>
                <Check className="size-3" strokeWidth={3} />
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </Tooltip>

      <div className="min-w-0 flex-1">
        <p className={cn("text-[13.5px] leading-snug transition-colors", done && "text-subtle line-through decoration-border-strong")}>{task.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {task.status !== "todo" && task.status !== "done" && (
            <span className={cn("flex items-center gap-1 text-[11px] font-medium", meta.className)}>
              <meta.icon className="size-3" aria-hidden /> {meta.label}
            </span>
          )}
          <DueLabel task={task} />
          {showMilestone && <span className="truncate t-meta">{showMilestone}</span>}
          {deps.length > 0 && !done && (
            <span className="flex items-center gap-1 t-meta">
              <Link2 className="size-3" aria-hidden /> After: {deps.map((d) => d.title).join(", ")}
            </span>
          )}
        </div>
        {task.status === "blocked" && task.blockedReason && !compact && <p className="mt-1 text-[12px] text-warning/90">{task.blockedReason}</p>}
        {task.notes && !compact && <p className="mt-1 text-[12px] text-muted-foreground">{task.notes}</p>}
      </div>

      {(caps.editTasks || caps.taskStatuses.length > 2) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="opacity-60 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100" aria-label={`Actions for “${task.title}”`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={task.status} onValueChange={(v) => (v === "blocked" ? setEditing({ status: "blocked" }) : setStatus(v as TaskStatus))}>
              {caps.taskStatuses.map((s) => {
                const m = STATUS_META[s];
                return (
                  <DropdownMenuRadioItem key={s} value={s}>
                    <m.icon className={m.className} /> {m.label}
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
            {caps.editTasks && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setEditing({})}>
                  <Pencil /> Edit task
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {editing && <TaskEditor task={task} initialStatus={editing.status} open onOpenChange={(o) => !o && setEditing(null)} />}
    </div>
  );
}
