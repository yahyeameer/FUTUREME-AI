"use client";

import { ArrowRight, ArrowUpRight, Bot, Eye, Flag, UserPlus, Check, CircleDashed, Cloud, ExternalLink, Globe, HardDrive, Loader2, Lock, Moon, Package, Play, ShieldCheck, Sparkles, Telescope, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toolLabel } from "@/lib/tool-labels";
import { cn, formatDate, formatTime, relativeDay } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";
import { RunCard } from "@/features/missions/run-card";
import type { AgentInfo, AgentRole, NightShift } from "@/types";

const ROLE: Record<AgentRole, { icon: LucideIcon; label: string; href?: string }> = {
  chat: { icon: Bot, label: "Talks with you", href: "/future-self" },
  council: { icon: Users, label: "Council", href: "/council" },
  voice: { icon: Users, label: "Council voice", href: "/council" },
  check: { icon: ShieldCheck, label: "Checks replies" },
  research: { icon: Telescope, label: "Research", href: "/skills#skill-research" },
  schedule: { icon: Moon, label: "Runs overnight", href: "#night-heading" },
  helper: { icon: UserPlus, label: "Created on demand" },
  lead: { icon: Flag, label: "Leads missions", href: "/missions" },
  supervise: { icon: Eye, label: "Supervises", href: "#supervisor-heading" },
};

/** Every agent in agents/futureme.yaml, with the tools it is allowed to call. */
export function Team() {
  const { workspace } = useWorkspace();
  const team = workspace.platform.team;
  const voices = new Set(team.flatMap((a) => a.subAgents));
  const leads = team.filter((a) => !voices.has(a.name));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-3">
      {leads.map((a) => (
        <AgentCard key={a.name} agent={a} members={a.subAgents.map((n) => team.find((t) => t.name === n)).filter((t): t is AgentInfo => !!t)} />
      ))}
    </div>
  );
}

function AgentCard({ agent, members }: { agent: AgentInfo; members: AgentInfo[] }) {
  const role = ROLE[agent.role];
  const tools = agent.tools.length ? agent.tools : [...new Set(members.flatMap((m) => m.tools))];
  return (
    <article className="card card-hover flex flex-col p-5">
      <div className="flex items-start gap-3">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl border", agent.role === "chat" ? "border-copper/25 bg-copper-wash text-copper" : "border-accent/30 bg-accent-wash text-accent-ink")}>
          <role.icon className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14.5px] font-medium">{agent.label}</h3>
          <p className="truncate text-[11.5px] text-subtle">
            <span className="font-mono">{agent.name}</span> · {role.label}
          </p>
        </div>
      </div>
      <p className="mt-3 flex-1 text-[12.5px] leading-relaxed text-muted-foreground">{agent.description}</p>
      {members.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Sub-agents">
          {members.map((m) => (
            <li key={m.name} className="rounded-full border border-border bg-surface-2/70 px-2.5 py-0.5 text-[11.5px]">
              {m.label}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        {tools.length ? (
          tools.map((t) => (
            <span key={t} className="rounded-md bg-surface-3/70 px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground" title={toolLabel(t)}>
              {t}
            </span>
          ))
        ) : (
          <span className="text-[11.5px] text-subtle">No tools. It only reads what the app hands it.</span>
        )}
        {role.href && (
          <Link href={role.href} className="ml-auto inline-flex items-center gap-0.5 text-[11.5px] font-medium text-muted-foreground hover:text-foreground" aria-label={`Open ${agent.label}`}>
            Open <ArrowUpRight className="size-3" />
          </Link>
        )}
      </div>
    </article>
  );
}

/** The latest night shift, its morning brief, and a button to run it now. */
export function NightShiftPanel() {
  const { workspace, service, apply } = useWorkspace();
  const p = workspace.platform;
  const latest = workspace.nightShifts[0];
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const runNow = async () => {
    setRunning(true);
    setError(null);
    try {
      const { workspace: ws } = await service.runNightShift();
      apply(ws);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The night shift couldn't run.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-border bg-gradient-to-br from-[color-mix(in_oklab,var(--info)_10%,transparent)] to-transparent p-5 sm:flex-row sm:items-center sm:p-6">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-info/25 bg-info-wash text-info">
          <Moon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-medium">Works while you sleep</p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {p.nightShiftAt
              ? `Every night at ${p.nightShiftAt} it publishes your Daily, reviews the day and writes a morning brief.${p.nextNightShift ? ` Next run ${relativeDay(p.nextNightShift).toLowerCase()} at ${formatTime(p.nextNightShift)}.` : ""}`
              : p.backend === "demo"
                ? "On a server it runs every night on a schedule. In the demo you can run it yourself."
                : "No schedule is running on this server. Start it with npm run night-shift -- --loop, or run it now."}
          </p>
        </div>
        <Button variant="secondary" onClick={runNow} disabled={running || !workspace.capabilities.nightShift} className="shrink-0">
          {running ? <Loader2 className="animate-spin" /> : <Play />} {running ? "Running…" : "Run now"}
        </Button>
      </div>
      {error && <p className="border-b border-border bg-destructive-wash px-6 py-2.5 text-[12.5px] text-destructive">{error}</p>}
      {latest ? <ShiftBody shift={latest} /> : (
        <EmptyState icon={CircleDashed} title="It hasn't run yet" className="px-6 py-8">
          The first run publishes today&apos;s Daily and picks up to three open tasks for tomorrow.
        </EmptyState>
      )}
    </div>
  );
}

function ShiftBody({ shift }: { shift: NightShift }) {
  if (shift.status === "failed")
    return (
      <div className="px-6 py-5">
        <Badge tone="destructive">Failed {relativeDay(shift.startedAt).toLowerCase()}</Badge>
        <p className="mt-2 text-[13px] text-muted-foreground">{shift.error ?? "The night shift failed."} Nothing was changed.</p>
      </div>
    );
  if (shift.status === "running")
    return (
      <p className="flex items-center gap-2 px-6 py-5 text-[13px] text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Running now…
      </p>
    );
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="t-label">Morning brief</p>
          {shift.simulated && <Badge tone="copper">Demo run</Badge>}
          <span className="t-meta">
            {shift.trigger === "schedule" ? "Scheduled" : "You ran it"} · {relativeDay(shift.finishedAt ?? shift.startedAt)}
          </span>
        </div>
        <p className="mt-2 font-serif text-[15.5px] leading-relaxed">{shift.brief}</p>
        {shift.watchOut && (
          <p className="mt-3 rounded-lg border border-warning/25 bg-warning-wash px-3 py-2 text-[12.5px] text-warning">
            <span className="font-medium">Watch out:</span> {shift.watchOut}
          </p>
        )}
      </div>
      <div className="min-w-0">
        <p className="t-label">Tomorrow&apos;s focus</p>
        {shift.focus.length ? (
          <ol className="mt-2 space-y-2">
            {shift.focus.map((f, i) => (
              <li key={f.taskId}>
                <Link href="/roadmap" className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-[13px] hover:border-border-strong">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-wash font-mono text-[10.5px] text-accent-ink">{i + 1}</span>
                  <span className="min-w-0 truncate">{f.title}</span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-[12.5px] text-muted-foreground">No open tasks to pick from.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
          {shift.dailyDate && (
            <Link href="/daily" className="inline-flex items-center gap-1 hover:text-foreground">
              Daily for {formatDate(shift.dailyDate)} <ArrowRight className="size-3" />
            </Link>
          )}
          {shift.approvalIds.length > 0 && <span className="text-warning">{shift.approvalIds.length === 1 ? "1 proposal waits" : `${shift.approvalIds.length} proposals wait`} for your approval</span>}
        </div>
      </div>
    </div>
  );
}

/** The latest completed night shift, if it finished in the last day and a half. */
export function recentShift(shifts: NightShift[], now: number) {
  const shift = shifts.find((n) => n.status === "completed");
  return shift && now - new Date(shift.finishedAt ?? shift.startedAt).getTime() <= 36 * 3600_000 ? shift : null;
}

/** A compact morning brief for Home. */
export function MorningBrief({ shift }: { shift: NightShift }) {
  return (
    <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:p-6">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-info/25 bg-info-wash text-info">
        <Moon className="size-4.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="brief-heading" className="t-label">
            While you slept
          </h2>
          {shift.simulated && <Badge tone="copper">Demo run</Badge>}
          <span className="t-meta">{relativeDay(shift.finishedAt ?? shift.startedAt)}</span>
        </div>
        <p className="mt-1.5 font-serif text-[15px] leading-relaxed">{shift.brief}</p>
        {shift.focus.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Today's focus">
            {shift.focus.map((f) => (
              <li key={f.taskId} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2/70 px-2.5 py-1 text-[12px]">
                <Check className="size-3 text-accent-ink" aria-hidden /> {f.title}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Link href="/agent#night-heading" className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground">
        Night shift <ArrowUpRight className="size-3.5" />
      </Link>
    </div>
  );
}

/** Choose which persona pack shapes the future self. Packs are Docker Agent files you can push to any OCI registry. */
export function Packs() {
  const { workspace, service, apply } = useWorkspace();
  const { packs, activePack } = workspace.platform;
  const enabled = workspace.capabilities.packs;
  const [saving, setSaving] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const choose = async (id: string | null) => {
    if (!enabled || saving) return;
    setSaving(id ?? "none");
    setError(null);
    try {
      apply(await service.setPack(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't switch persona.");
    } finally {
      setSaving(null);
    }
  };

  const options = [{ id: null, name: "Just me", tagline: "Your future self, shaped only by your profile." }, ...packs];
  return (
    <div className="card overflow-hidden">
      <div role="radiogroup" aria-label="Persona pack" className="grid grid-cols-[minmax(0,1fr)] gap-px bg-border sm:grid-cols-2 xl:grid-cols-5">
        {options.map((o) => {
          const on = (activePack ?? null) === o.id;
          return (
            <button
              key={o.id ?? "none"}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!enabled}
              onClick={() => choose(o.id)}
              className={cn("flex flex-col items-start gap-1 bg-surface p-4 text-left transition-colors enabled:hover:bg-surface-2", on && "bg-accent-wash/60", !enabled && "cursor-default")}
            >
              <span className="flex w-full items-center gap-2">
                <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", on ? "border-accent-ink bg-accent-ink text-background" : "border-border-strong")}>
                  {on && <Check className="size-2.5" strokeWidth={3} aria-hidden />}
                </span>
                <span className="text-[13.5px] font-medium">{o.name}</span>
                {saving === (o.id ?? "none") && <Loader2 className="ml-auto size-3.5 animate-spin text-subtle" aria-hidden />}
              </span>
              <span className="text-[12px] leading-snug text-muted-foreground">{o.tagline}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="border-t border-border bg-destructive-wash px-5 py-2.5 text-[12.5px] text-destructive">{error}</p>}
      <div className="flex flex-col gap-2 border-t border-border bg-sunken/50 px-5 py-3.5 text-[12px] text-muted-foreground sm:flex-row sm:items-center">
        <Package className="size-4 shrink-0 text-subtle" aria-hidden />
        <p className="min-w-0 flex-1">
          {enabled ? "Each pack is a Docker Agent file in agents/packs/. Share one with " : "Switching packs needs the FutureMe server. Each pack is a Docker Agent file you can share with "}
          <code className="rounded bg-surface-3/70 px-1 font-mono text-[11px]">docker agent share push</code> and pull a friend&apos;s with{" "}
          <code className="rounded bg-surface-3/70 px-1 font-mono text-[11px]">share pull</code>.
        </p>
      </div>
    </div>
  );
}

/** Where the model runs, and what leaves the machine. */
export function Privacy() {
  const { workspace } = useWorkspace();
  const p = workspace.platform;
  const rt = workspace.runtime;
  const rows: { icon: LucideIcon; label: string; value: string; tone?: "good" | "off" }[] = [
    p.local
      ? { icon: HardDrive, label: "Model", value: `${rt.model}, running on this machine through Docker Model Runner. Your conversations never leave it.`, tone: "good" }
      : p.backend === "demo"
        ? { icon: Sparkles, label: "Model", value: "None. The demo plays scripted replies in your browser." }
        : { icon: Cloud, label: "Model", value: `${rt.model}. Messages are sent to the model provider to get a reply.` },
    { icon: Bot, label: "Agents run in", value: p.backend === "docker-agent" ? `Docker Agent, from ${p.agentFile}` : p.backend === "in-process" ? "The FutureMe server (no Docker Agent configured)" : "Your browser (demo)" },
    p.webSearch === "brave" || p.webSearch === "duckduckgo"
      ? { icon: Globe, label: "Web", value: `Only the research agent goes online, through ${p.webSearch === "brave" ? "Brave Search" : "DuckDuckGo"}. Your notes are never sent to search.` }
      : { icon: Lock, label: "Web", value: p.webSearch === "off" ? "Off. No agent can reach the web." : "Not available in the demo.", tone: "off" },
  ];
  return (
    <div className="card divide-y divide-border">
      {rows.map((r) => (
        <div key={r.label} className="flex gap-3 px-5 py-3.5">
          <r.icon className={cn("mt-0.5 size-4 shrink-0", r.tone === "good" ? "text-success" : "text-subtle")} aria-hidden />
          <p className="text-[12.5px] text-muted-foreground">
            <span className="font-medium text-foreground">{r.label}:</span> {r.value}
          </p>
        </div>
      ))}
      {!p.local && p.backend !== "demo" && (
        <p className="px-5 py-3 text-[12px] text-subtle">
          To keep everything on your machine, start FutureMe with <code className="font-mono">docker compose -f docker-compose.yml -f docker-compose.local.yml up</code>.
        </p>
      )}
    </div>
  );
}

/** Recent research runs with the sources the agent actually read. */
export function Research() {
  const { workspace } = useWorkspace();
  const runs = workspace.research.slice(0, 4);
  const available = workspace.capabilities.research;
  if (!runs.length)
    return (
      <div className="card p-5">
        <EmptyState icon={Telescope} title={available ? "No research yet" : "Research needs the server"}>
          {available ? (
            <>
              Run <Link href="/skills#skill-research" className="underline">Research a topic</Link>. It searches the web, reads the pages and cites only links it opened.
            </>
          ) : (
            "On the FutureMe server the research agent searches the web and cites only links it actually opened."
          )}
        </EmptyState>
      </div>
    );
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
      {runs.map((r) => (
        <article key={r.id} className="card flex flex-col p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate text-[14px] font-medium">{r.topic}</h3>
            <Badge tone={r.status === "failed" ? "destructive" : r.status === "awaiting_approval" ? "warning" : "success"}>
              {r.status === "failed" ? "Failed" : r.status === "awaiting_approval" ? "Waiting for you" : r.status === "running" ? "Running" : "Saved"}
            </Badge>
          </div>
          <p className="mt-0.5 t-meta">{relativeDay(r.finishedAt ?? r.startedAt)}</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{r.status === "failed" ? r.error : r.summary}</p>
          {r.sources.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
              {r.sources.map((s) => (
                <li key={s.url} className="min-w-0">
                  <a href={s.url} target="_blank" rel="noreferrer noopener" className="group flex items-start gap-1.5 text-[12px]">
                    <ExternalLink className="mt-0.5 size-3 shrink-0 text-subtle" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate group-hover:underline">{s.point}</span>
                      <span className="block truncate font-mono text-[10.5px] text-subtle">{new URL(s.url).hostname}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}


/** Every handoff and mission task, newest first, with what the supervisor decided. */
export function SupervisorLog() {
  const { workspace } = useWorkspace();
  const reviewed = workspace.runs.filter((r) => r.kind !== "mission_lead");
  const runs = reviewed.slice(0, 8);
  const counts = { ok: 0, flag: 0, block: 0 };
  for (const r of reviewed) if (r.supervision) counts[r.supervision.verdict] += 1;
  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-3 border-b border-border">
        {(
          [
            ["ok", "Passed", "text-success"],
            ["flag", "Flagged", "text-warning"],
            ["block", "Blocked", "text-destructive"],
          ] as const
        ).map(([k, label, tone]) => (
          <div key={k} className="border-border px-5 py-3.5 [&:not(:last-child)]:border-r">
            <p className="t-meta">{label}</p>
            <p className={cn("mt-0.5 font-display text-[1.7rem] leading-none", counts[k] > 0 && tone)}>{counts[k]}</p>
          </div>
        ))}
      </div>
      {runs.length ? (
        <div className="space-y-2 p-4">
          {runs.map((r) => (
            <RunCard key={r.id} run={r} title={r.kind === "mission_task" ? `Mission task · ${r.agentLabel}` : r.kind === "spawn" ? `Created: ${r.agentLabel}` : `Handed to ${r.agentLabel.toLowerCase()}`} />
          ))}
        </div>
      ) : (
        <EmptyState icon={Eye} title="Nothing to supervise yet" className="px-6 py-8">
          {workspace.capabilities.delegation ? "Ask your future self to compare options or look something up, or start a mission. Every result is reviewed here." : "Start a mission and each helper's result is reviewed here."}
        </EmptyState>
      )}
      <p className="border-t border-border bg-sunken/50 px-5 py-3 text-[12px] text-muted-foreground">
        Rule checks catch empty answers, tools a helper wasn&apos;t given, links its tools never returned, notes that don&apos;t exist and claims to have saved or sent something. The supervisor agent then judges whether it did the task. Blocked results never reach the agent that asked.
      </p>
    </div>
  );
}
