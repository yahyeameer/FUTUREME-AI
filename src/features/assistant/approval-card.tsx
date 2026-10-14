"use client";

import { ArrowRight, Check, ChevronDown, FilePlus2, ListChecks, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { cn, pluralize } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";
import type { Approval, PlanProposal, Workspace } from "@/types";

type Phase = "idle" | "running" | "verifying" | "verified" | "unverified";

/**
 * Review-and-approve surface for anything the agent wants to change.
 * After approval it checks the returned workspace for the created records before saying they exist.
 */
export function ApprovalCard({ approval, className }: { approval: Approval; className?: string }) {
  const { service, apply, workspace } = useWorkspace();
  const [expanded, setExpanded] = React.useState(approval.status === "pending");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<PlanProposal | null>(approval.kind === "plan" ? approval.plan : null);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<{ milestoneId?: string; taskTitles: string[]; memoryId?: string } | null>(null);

  const decide = async (decision: "approve" | "reject") => {
    setError(null);
    setPhase("running");
    try {
      const plan = approval.kind === "plan" && editing && draft ? cleanPlan(draft) : undefined;
      if (plan && plan.tasks.length === 0) throw new Error("A plan needs at least one task.");
      const ws = await service.decide(approval.id, decision, plan);
      if (decision === "reject") {
        apply(ws);
        setPhase("idle");
        return;
      }
      setPhase("verifying");
      const found = verify(ws, approval, plan);
      apply(ws);
      setCreated(found);
      setPhase(found ? "verified" : "unverified");
      setEditing(false);
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "That didn't work. Nothing was created.");
    }
  };

  const status = phase === "running" ? "running" : approval.status;
  const plan = approval.kind === "plan" ? (editing && draft ? draft : approval.plan) : null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-surface-2 transition-colors",
        status === "pending" ? "border-accent/35" : status === "running" ? "border-accent/50" : "border-border",
        className,
      )}
    >
      <div className="flex items-start gap-3 px-4 pt-3.5 pb-3">
        <span aria-hidden className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border", status === "approved" ? "border-success/30 bg-success-wash text-success" : "border-accent/30 bg-accent-wash text-accent-ink")}>
          {approval.kind === "plan" ? <ListChecks className="size-3.5" /> : <FilePlus2 className="size-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="t-label !text-accent-ink">{approval.kind === "plan" ? "Proposed plan" : "Proposed memory"}</p>
            <StatusBadge status={approval.status} phase={phase} />
          </div>
          <p className="mt-1 text-[14px] leading-snug font-medium">
            {approval.kind === "plan"
              ? approval.status === "pending"
                ? `Create ${pluralize(plan!.tasks.length, "task")} for “${plan!.goal}”?`
                : plan!.goal
              : approval.status === "pending"
                ? `Remember “${approval.memory.title}”?`
                : approval.memory.title}
          </p>
          {approval.kind === "plan" && plan?.why && !editing && <p className="mt-1 text-[12.5px] text-muted-foreground">{plan.why}</p>}
        </div>
        {approval.status !== "pending" && (
          <Button variant="ghost" size="icon-sm" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded} aria-label={expanded ? "Hide details" : "Show details"}>
            <ChevronDown className={cn("transition-transform", expanded && "rotate-180")} />
          </Button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="border-t border-border px-4 py-3">
              {approval.kind === "plan" && plan && (editing && draft ? <PlanEditor draft={draft} onChange={setDraft} /> : <PlanTasks plan={plan} created={created?.taskTitles} />)}
              {approval.kind === "memory" && (
                <div className="rounded-md border border-border bg-sunken px-3 py-2.5 text-[13px] leading-relaxed">
                  {approval.memory.body}
                  {approval.memory.tags.length > 0 && <p className="mt-2 t-meta">{approval.memory.tags.map((t) => `#${t}`).join(" ")}</p>}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p role="alert" className="mx-4 mb-3 rounded-md bg-destructive-wash px-3 py-2 text-[12.5px] text-destructive">
          {error}
        </p>
      )}

      {approval.status === "pending" && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface/60 px-4 py-2.5">
          {phase === "running" || phase === "verifying" ? (
            <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground" role="status">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {phase === "running" ? (approval.kind === "plan" ? `Creating the goal and ${pluralize(plan!.tasks.length, "task")}…` : "Saving to your vault…") : "Checking it was saved…"}
            </p>
          ) : (
            <>
              <Button variant="primary" size="sm" onClick={() => decide("approve")}>
                <Check /> {approval.kind === "plan" ? (editing ? "Save and create" : "Approve and create") : "Save memory"}
              </Button>
              {approval.kind === "plan" && !expanded && (
                <Button variant="secondary" size="sm" onClick={() => setExpanded(true)}>
                  Review plan
                </Button>
              )}
              {approval.kind === "plan" && workspace.capabilities.editPlansBeforeApproval && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing((e) => !e);
                    setExpanded(true);
                    if (editing) setDraft(approval.plan);
                  }}
                  aria-pressed={editing}
                >
                  <Pencil /> {editing ? "Discard edits" : "Edit plan"}
                </Button>
              )}
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => decide("reject")}>
                <X /> {approval.kind === "plan" ? "Reject" : "Don't save"}
              </Button>
            </>
          )}
        </div>
      )}

      {phase === "verified" && created && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-2 border-t border-success/20 bg-success-wash px-4 py-2.5 text-[12.5px]" role="status">
          <Check className="size-3.5 text-success" aria-hidden />
          <span>
            {approval.kind === "plan" ? `Created “${plan?.goal}” with ${pluralize(created.taskTitles.length, "task")}.` : "Saved to your memory vault."}
          </span>
          <Link
            href={created.milestoneId ? `/roadmap?milestone=${encodeURIComponent(created.milestoneId)}` : created.memoryId ? `/memory/${encodeURIComponent(created.memoryId)}` : "/memory"}
            className="ml-auto inline-flex items-center gap-1 font-medium text-accent-ink hover:underline"
          >
            {approval.kind === "plan" ? "Open in roadmap" : "Open memory"} <ArrowRight className="size-3" />
          </Link>
        </motion.div>
      )}
      {phase === "unverified" && (
        <p role="alert" className="border-t border-warning/25 bg-warning-wash px-4 py-2.5 text-[12.5px] text-warning">
          The approval was recorded, but the new records didn't appear yet. Refresh the roadmap before relying on them.
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status, phase }: { status: Approval["status"]; phase: Phase }) {
  if (phase === "running" || phase === "verifying") return <Badge tone="accent">Working</Badge>;
  if (status === "approved") return <Badge tone="success">Approved</Badge>;
  if (status === "rejected") return <Badge tone="neutral">Declined</Badge>;
  return <Badge tone="accent">Needs your approval</Badge>;
}

function PlanTasks({ plan, created }: { plan: PlanProposal; created?: string[] }) {
  return (
    <ol className="space-y-1.5">
      {plan.tasks.map((t, i) => {
        const ok = created?.includes(t.title);
        return (
          <li key={i} className="flex items-start gap-2.5 text-[13px]">
            <span aria-hidden className={cn("mt-px flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border font-mono text-[10px]", ok ? "border-success/40 bg-success-wash text-success" : "border-border-strong text-subtle")}>
              {ok ? <Check className="size-3" strokeWidth={3} /> : i + 1}
            </span>
            <span className="flex-1">{t.title}</span>
            {t.dueInDays !== undefined && <span className="shrink-0 t-meta">{t.dueInDays === 0 ? "today" : `in ${pluralize(t.dueInDays, "day")}`}</span>}
          </li>
        );
      })}
    </ol>
  );
}

function PlanEditor({ draft, onChange }: { draft: PlanProposal; onChange: (p: PlanProposal) => void }) {
  const setTask = (i: number, patch: Partial<PlanProposal["tasks"][number]>) => onChange({ ...draft, tasks: draft.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  return (
    <div className="grid gap-3">
      <label className="grid gap-1">
        <span className="t-label">Goal</span>
        <Input value={draft.goal} onChange={(e) => onChange({ ...draft, goal: e.target.value })} maxLength={160} />
      </label>
      <label className="grid gap-1">
        <span className="t-label">Why it matters</span>
        <Textarea rows={2} value={draft.why ?? ""} onChange={(e) => onChange({ ...draft, why: e.target.value })} className="min-h-0" />
      </label>
      <fieldset className="grid gap-2">
        <legend className="mb-1 t-label">Tasks</legend>
        {draft.tasks.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input aria-label={`Task ${i + 1}`} value={t.title} onChange={(e) => setTask(i, { title: e.target.value })} maxLength={200} />
            <Input
              aria-label={`Days until task ${i + 1} is due`}
              type="number"
              min={0}
              max={365}
              className="w-20"
              placeholder="days"
              value={t.dueInDays ?? ""}
              onChange={(e) => setTask(i, { dueInDays: e.target.value === "" ? undefined : Math.max(0, Math.min(365, Number(e.target.value))) })}
            />
            <Button variant="ghost" size="icon-sm" aria-label={`Remove task ${i + 1}`} onClick={() => onChange({ ...draft, tasks: draft.tasks.filter((_, j) => j !== i) })}>
              <Trash2 />
            </Button>
          </div>
        ))}
        {draft.tasks.length < 10 && (
          <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => onChange({ ...draft, tasks: [...draft.tasks, { title: "" }] })}>
            <Plus /> Add task
          </Button>
        )}
      </fieldset>
    </div>
  );
}

function cleanPlan(p: PlanProposal): PlanProposal {
  return { goal: p.goal.trim() || "Untitled goal", why: p.why?.trim() || undefined, tasks: p.tasks.map((t) => ({ ...t, title: t.title.trim() })).filter((t) => t.title) };
}

/** Looks for what the approval should have created in the workspace the service returned. */
function verify(ws: Workspace, approval: Approval, edited?: PlanProposal) {
  if (approval.kind === "plan") {
    const plan = edited ?? approval.plan;
    const ms = [...ws.milestones].reverse().find((m) => m.title === plan.goal);
    if (!ms) return null;
    const titles = ws.tasks.filter((t) => t.milestoneId === ms.id).map((t) => t.title);
    const found = plan.tasks.filter((t) => titles.includes(t.title)).map((t) => t.title);
    return found.length === plan.tasks.length ? { milestoneId: ms.id, taskTitles: found } : null;
  }
  const mem = ws.memories.find((m) => m.title === approval.memory.title);
  return mem ? { memoryId: mem.id, taskTitles: [] } : null;
}
