import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolCall } from "@/types";

/** What the agent did during a turn, in order. Running steps animate; finished steps show their result. */
export function ToolStatus({ tools, className }: { tools: ToolCall[]; className?: string }) {
  if (!tools.length) return null;
  return (
    <ul className={cn("flex flex-col gap-1", className)} aria-label="Agent activity">
      {tools.map((t, i) => (
        <li key={`${t.name}-${i}`} className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span aria-hidden className={cn("flex size-4 items-center justify-center rounded-full border", t.status === "done" ? "border-success/40 text-success" : t.status === "failed" ? "border-destructive/40 text-destructive" : "border-accent/40 text-accent-ink")}>
            {t.status === "running" ? <Loader2 className="size-2.5 animate-spin" /> : t.status === "done" ? <Check className="size-2.5" strokeWidth={3} /> : <X className="size-2.5" strokeWidth={3} />}
          </span>
          <span className={cn(t.status === "running" && "text-foreground")}>{t.label}</span>
          {t.detail && <span className="t-meta">· {t.detail}</span>}
          <span className="sr-only">{t.status === "running" ? "in progress" : t.status}</span>
        </li>
      ))}
    </ul>
  );
}
