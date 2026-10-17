"use client";

import { ChevronDown, CircleSlash, ExternalLink, Eye, Loader2, ShieldAlert, ShieldCheck, ShieldX, Sparkles, Telescope, UserPlus, Users, type LucideIcon } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AgentRunInfo } from "@/types";

const VERDICT: Record<string, { label: string; tone: "success" | "warning" | "destructive" | "outline" | "accent"; icon: LucideIcon }> = {
  ok: { label: "Supervisor: OK", tone: "success", icon: ShieldCheck },
  flag: { label: "Supervisor: flagged", tone: "warning", icon: ShieldAlert },
  block: { label: "Supervisor: blocked", tone: "destructive", icon: ShieldX },
  running: { label: "Working", tone: "accent", icon: Loader2 },
  failed: { label: "Failed", tone: "outline", icon: CircleSlash },
};

export function VerdictBadge({ run }: { run: Pick<AgentRunInfo, "status" | "supervision"> }) {
  const key = run.status === "running" ? "running" : run.status === "failed" ? "failed" : (run.supervision?.verdict ?? "ok");
  const v = VERDICT[key];
  return (
    <Badge tone={v.tone}>
      <v.icon aria-hidden className={cn(key === "running" && "animate-spin")} /> {v.label}
    </Badge>
  );
}

function RunIcon({ agent, className }: { agent: string; className?: string }) {
  if (agent === "researcher") return <Telescope className={className} aria-hidden />;
  if (agent === "council") return <Users className={className} aria-hidden />;
  if (agent === "mission_lead") return <Sparkles className={className} aria-hidden />;
  return <UserPlus className={className} aria-hidden />;
}

/** One sub-agent run: who did it, with which tools, what came back and what the supervisor made of it. */
export function RunCard({ run, title, defaultOpen = false, className }: { run: AgentRunInfo; title?: string; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const s = run.supervision;
  const withheld = run.status === "blocked";
  return (
    <article className={cn("rounded-xl border border-border bg-surface", withheld && "border-destructive/30", className)}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start gap-3 p-3.5 text-left">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", run.role ? "bg-copper-wash text-copper" : "bg-accent-wash text-accent-ink")}>
          <RunIcon agent={run.agent} className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13.5px] font-medium">{title ?? run.agentLabel}</span>
            {title && <span className="text-[12px] text-muted-foreground">{run.agentLabel}</span>}
          </span>
          <span className="mt-0.5 block line-clamp-1 text-[12px] text-muted-foreground">{run.task}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <VerdictBadge run={run} />
          <ChevronDown className={cn("size-3.5 text-subtle transition-transform", open && "rotate-180")} aria-hidden />
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border px-3.5 pt-3 pb-3.5 text-[12.5px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="t-meta mr-1">Tools</span>
            {run.tools.length ? (
              run.tools.map((t) => (
                <span key={t} className={cn("rounded-md px-1.5 py-0.5 font-mono text-[10.5px]", run.usedTools.includes(t) ? "bg-accent-wash text-accent-ink" : "bg-surface-3/70 text-muted-foreground")} title={run.usedTools.includes(t) ? "Used" : "Allowed, not used"}>
                  {t}
                </span>
              ))
            ) : (
              <span className="text-subtle">None</span>
            )}
            {run.simulated && <span className="ml-auto font-mono text-[10px] text-copper uppercase">demo</span>}
          </div>
          {run.status === "failed" ? (
            <p className="text-muted-foreground">{run.error ?? "It didn't finish."}</p>
          ) : run.output ? (
            <div className={cn("rounded-lg bg-sunken/70 px-3 py-2.5 whitespace-pre-line text-foreground/90", withheld && "opacity-60")}>
              {withheld && <p className="mb-1.5 text-[11.5px] font-medium text-destructive">Withheld. The agent that asked never saw this.</p>}
              {run.output}
            </div>
          ) : run.status === "running" ? (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Working on it…
            </p>
          ) : null}
          {run.sources.length > 0 && (
            <ul className="space-y-1">
              {run.sources.map((u) => (
                <li key={u}>
                  <a href={u} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline">
                    <ExternalLink className="size-3" aria-hidden /> {hostOf(u)}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {s && (
            <div className="rounded-lg border border-border px-3 py-2.5">
              <p className="flex items-center gap-1.5 font-medium">
                <Eye className="size-3.5 text-subtle" aria-hidden /> {s.summary}
              </p>
              {s.issues.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {s.issues.map((i, n) => (
                    <li key={n} className={cn("flex gap-1.5", i.severity === "block" ? "text-destructive" : "text-warning")}>
                      <span aria-hidden>•</span>
                      <span>
                        {i.text} <span className="text-subtle">({i.source === "rule" ? "rule check" : "supervisor agent"})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1.5 text-[11px] text-subtle">{s.byAgent ? "Rule checks plus the supervisor agent." : run.simulated ? "The supervisor's rule checks, run in your browser." : "Rule checks only."}</p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function hostOf(u: string) {
  try {
    return new URL(u).hostname;
  } catch {
    return u;
  }
}
