"use client";

import { AlertCircle, CalendarCheck, CheckCircle2, CircleDashed, Clock, Globe, ListTree, Loader2, Lock, Play, Route, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import * as React from "react";
import { PageFrame, RailSection } from "@/components/layout/page-frame";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApprovalCard } from "@/features/assistant/approval-card";
import { cn, relativeDay } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";
import type { Skill, SkillRun, SkillRunStatus, Workspace } from "@/types";

const STATUS: Record<SkillRunStatus, { label: string; icon: React.ElementType; tone: "neutral" | "accent" | "warning" | "success" | "destructive" }> = {
  ready: { label: "Ready", icon: CircleDashed, tone: "neutral" },
  running: { label: "Running", icon: Loader2, tone: "accent" },
  awaiting_approval: { label: "Waiting for your approval", icon: Clock, tone: "warning" },
  completed: { label: "Completed", icon: CheckCircle2, tone: "success" },
  failed: { label: "Failed", icon: AlertCircle, tone: "destructive" },
};

/** A run that proposed a plan stays "awaiting approval" until every proposal it made is decided. */
function effectiveStatus(run: SkillRun | undefined, ws: Workspace): SkillRunStatus {
  if (!run) return "ready";
  if (run.status !== "awaiting_approval") return run.status;
  const open = run.approvalIds.some((id) => ws.approvals.find((a) => a.id === id)?.status === "pending");
  return open ? "awaiting_approval" : "completed";
}

export function Skills() {
  const { workspace } = useWorkspace();
  const [active, setActive] = React.useState<Record<string, SkillRun>>({});
  const [open, setOpen] = React.useState<Skill | null>(null);

  const lastRun = (skillId: string) => active[skillId] ?? workspace.skillRuns.find((r) => r.skillId === skillId);

  return (
    <PageFrame rail={<RunHistory />} railTitle="Run history">
      <PageHeader
        eyebrow="Skills and Actions"
        title="Things your future self can do for you"
        description="Each skill says what it can read and change. Anything that would create goals, tasks or memories waits for your approval first."
      />
      <div className="mt-7 grid gap-4">
        {workspace.skills.map((s) => (
          <SkillCard key={s.id} skill={s} run={lastRun(s.id)} onRun={() => setOpen(s)} />
        ))}
      </div>
      {open && (
        <RunDialog
          skill={open}
          onOpenChange={(o) => !o && setOpen(null)}
          onUpdate={(run) => setActive((prev) => ({ ...prev, [run.skillId]: run }))}
          onDone={(run) =>
            setActive((prev) => {
              const next = { ...prev };
              // The stored run now lives in the workspace snapshot.
              if (next[run.skillId]?.id === run.id && run.status !== "running") delete next[run.skillId];
              return next;
            })
          }
        />
      )}
    </PageFrame>
  );
}

// Each skill gets its own mark, so the catalogue scans at a glance.
const SKILL_ICON: Record<string, React.ElementType> = {
  "plan-day": CalendarCheck,
  "break-down": ListTree,
  research: Globe,
  "weekly-review": TrendingUp,
  "action-plan": Route,
};

function SkillCard({ skill, run, onRun }: { skill: Skill; run?: SkillRun; onRun: () => void }) {
  const { workspace } = useWorkspace();
  const status = effectiveStatus(run, workspace);
  const meta = STATUS[skill.available ? status : "ready"];
  const Icon = meta.icon;
  const approvals = (run?.approvalIds ?? []).map((id) => workspace.approvals.find((a) => a.id === id)).filter((a) => !!a);
  const label = run?.simulated ? "Demo result" : workspace.runtime.simulated ? "Stand-in model" : null;

  return (
    <section className={cn("group card card-hover", status === "awaiting_approval" && "!border-warning/40", !skill.available && "opacity-80")} aria-labelledby={`skill-${skill.id}`}>
      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-start">
        <SkillMark icon={SKILL_ICON[skill.id] ?? Sparkles} available={skill.available} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`skill-${skill.id}`} className="t-section">
              {skill.name}
            </h2>
            {skill.available ? (
              <Badge tone={meta.tone}>
                <Icon className={cn(status === "running" && "animate-spin")} aria-hidden /> {meta.label}
              </Badge>
            ) : (
              <Badge tone="outline">
                <Lock aria-hidden /> Not available
              </Badge>
            )}
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">{skill.description}</p>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1" aria-label="Permissions">
            {skill.permissions.map((p) => (
              <li key={p} className="flex items-center gap-1.5 text-[12px] text-subtle">
                <ShieldCheck className="size-3.5" aria-hidden /> {p}
              </li>
            ))}
          </ul>
          {!skill.available && skill.unavailableReason && <p className="mt-2 text-[12.5px] text-warning">{skill.unavailableReason}</p>}
        </div>
        <Button variant={skill.available ? "secondary" : "ghost"} size="sm" onClick={onRun} disabled={!skill.available || status === "running"} className="self-start group-hover:border-accent/70 group-hover:bg-accent group-hover:text-accent-foreground">
          {status === "running" ? <Loader2 className="animate-spin" /> : <Play />} {status === "running" ? "Running…" : run ? "Run again" : "Run"}
        </Button>
      </div>

      {run && skill.available && (
        <div className="border-t border-border px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="t-label">{status === "running" ? "Working" : "Last result"}</p>
            {run.finishedAt && <span className="t-meta">· {relativeDay(run.finishedAt)}</span>}
            {label && <Badge tone="copper">{label}</Badge>}
          </div>
          <p className={cn("mt-1.5 text-[13.5px]", run.status === "failed" && "text-destructive")} role={run.status === "failed" ? "alert" : undefined}>
            {run.summary}
          </p>
          {run.output.length > 0 && approvals.length === 0 && (
            <ul className="mt-2 space-y-1 font-serif text-[15px] leading-relaxed">
              {run.output.map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden className="mt-[0.7em] size-1 shrink-0 rounded-full bg-subtle" />
                  <span className="min-w-0">{line}</span>
                </li>
              ))}
            </ul>
          )}
          {approvals.length > 0 && (
            <div className="mt-4 flex flex-col gap-3">
              {approvals.map((a) => (
                <ApprovalCard key={a.id} approval={a} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RunDialog({ skill, onOpenChange, onUpdate, onDone }: { skill: Skill; onOpenChange: (o: boolean) => void; onUpdate: (r: SkillRun) => void; onDone: (r: SkillRun) => void }) {
  const { workspace, service, apply } = useWorkspace();
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const milestoneTitles = workspace.milestones.map((m) => m.title);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const missing: Record<string, string> = {};
    for (const i of skill.inputs) if (i.required && !values[i.name]?.trim()) missing[i.name] = `${i.label} is required.`;
    setErrors(missing);
    if (Object.keys(missing).length) return;
    onOpenChange(false);
    const inputs = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()]));
    try {
      const { workspace: ws, run } = await service.runSkill(skill.id, inputs, onUpdate);
      apply(ws);
      onDone(run);
    } catch (err) {
      const failed: SkillRun = {
        id: `failed-${Date.now()}`,
        skillId: skill.id,
        status: "failed",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        summary: err instanceof Error ? err.message : "The skill failed to run.",
        output: [],
        approvalIds: [],
        simulated: workspace.runtime.mode === "demo",
      };
      onUpdate(failed);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{skill.name}</DialogTitle>
            <DialogDescription>{skill.description}</DialogDescription>
          </DialogHeader>
          {skill.inputs.map((i, idx) => (
            <div key={i.name} className="grid gap-1.5">
              <Label htmlFor={`in-${i.name}`}>
                {i.label}
                {!i.required && <span className="ml-1 font-normal text-subtle">(optional)</span>}
              </Label>
              <Input
                id={`in-${i.name}`}
                autoFocus={idx === 0}
                list={i.kind === "milestone" ? `ms-${i.name}` : undefined}
                placeholder={i.placeholder}
                value={values[i.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [i.name]: e.target.value }))}
                aria-invalid={!!errors[i.name]}
                aria-describedby={errors[i.name] ? `in-${i.name}-err` : undefined}
              />
              {i.kind === "milestone" && (
                <datalist id={`ms-${i.name}`}>
                  {milestoneTitles.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              )}
              {errors[i.name] && (
                <p id={`in-${i.name}-err`} className="text-xs text-destructive">
                  {errors[i.name]}
                </p>
              )}
            </div>
          ))}
          <div className="rounded-md border border-border bg-sunken px-3 py-2.5">
            <p className="t-label">This skill can</p>
            <ul className="mt-1.5 space-y-1">
              {skill.permissions.map((p) => (
                <li key={p} className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                  <ShieldCheck className="size-3.5 text-subtle" aria-hidden /> {p}
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              <Play /> Run skill
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RunHistory() {
  const { workspace } = useWorkspace();
  const name = (id: string) => workspace.skills.find((s) => s.id === id)?.name ?? id;
  const runs = workspace.skillRuns.slice(0, 12);
  return (
    <div>
      <RailSection title="Recent runs">
        {runs.length ? (
          <ul className="space-y-3">
            {runs.map((r) => {
              const s = effectiveStatus(r, workspace);
              const Icon = STATUS[s].icon;
              return (
                <li key={r.id} className="flex gap-2">
                  <Icon className={cn("mt-0.5 size-3.5 shrink-0", s === "failed" ? "text-destructive" : s === "awaiting_approval" ? "text-warning" : "text-subtle")} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[13px]">{name(r.skillId)}</p>
                    <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">{r.summary}</p>
                    <p className="mt-0.5 t-meta">{relativeDay(r.finishedAt ?? r.startedAt)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="No runs yet" className="px-4 py-4">
            Run a skill and its result is kept here.
          </EmptyState>
        )}
      </RailSection>
      <RailSection title="How actions are gated">
        <p className="text-[12px] text-subtle">Skills can read your records freely. Creating goals, tasks or memories always goes through an approval card, and the result is checked against your data before it&apos;s reported as done.</p>
      </RailSection>
    </div>
  );
}

function SkillMark({ icon: Icon, available }: { icon: React.ElementType; available: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "hidden size-11 shrink-0 items-center justify-center rounded-xl border sm:flex",
        available
          ? "border-accent/30 bg-[linear-gradient(140deg,var(--accent-wash),var(--copper-wash))] text-accent-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.35)] transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3"
          : "border-dashed border-border-strong text-subtle",
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}
