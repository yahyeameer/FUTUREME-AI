import { cn } from "@/lib/utils";
import { STATUS_META } from "@/features/roadmap/task-status";
import type { RichBlock } from "@/types";

export function ProgressBlock({ block }: { block: Extract<RichBlock, { type: "progress" }> }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="t-label">Progress review</p>
        <p className="t-meta">
          {block.completed} of {block.total} done
        </p>
      </div>
      <p className="mt-1 text-[13.5px] font-medium">{block.title}</p>
      <div className="mt-2.5 flex h-1.5 gap-0.5" aria-hidden>
        {block.lines.map((l, i) => (
          <span key={i} className={cn("flex-1 rounded-[2px]", l.status === "done" ? "bg-accent" : l.status === "in_progress" ? "bg-accent/40" : l.status === "blocked" ? "bg-warning/50" : "bg-surface-3")} />
        ))}
      </div>
      <ul className="mt-3 space-y-1">
        {block.lines.map((l, i) => {
          const m = STATUS_META[l.status];
          return (
            <li key={i} className="flex items-start gap-2 text-[12.5px]">
              <m.icon className={cn("mt-0.5 size-3.5 shrink-0", m.className)} aria-label={m.label} />
              <span className={cn(l.status === "done" && "text-muted-foreground")}>{l.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
