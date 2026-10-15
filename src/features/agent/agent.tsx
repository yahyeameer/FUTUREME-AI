"use client";

import { ArrowRight, ArrowUpRight, Bot, Check, CircleDashed, Clock, Eye, EyeOff, FileText, Folder, FolderOpen, Loader2, Lock, MessageCircle, PenLine, Play, ShieldCheck, Sparkles, X } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import * as React from "react";
import { Orb } from "@/components/brand/orb";
import { PageFrame, RailSection } from "@/components/layout/page-frame";
import { CountUp } from "@/components/motion/count-up";
import { Reveal, RevealItem } from "@/components/motion/reveal";
import { EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApprovalCard } from "@/features/assistant/approval-card";
import { ProvenanceBadge } from "@/features/memory/provenance";
import { pendingApprovals } from "@/lib/derive";
import { cn, pluralize, relativeDay } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";
import { agentLog, agentTools, logKind, toolUsage, vaultFiles, type LogEntry, type ToolInfo, type VaultFile } from "./agent-data";
import { NightShiftPanel, Packs, Privacy, Research, Team } from "./agent-team";

export function Agent() {
  const { workspace } = useWorkspace();
  const usage = toolUsage(workspace);
  const files = vaultFiles(workspace);
  const waiting = pendingApprovals(workspace);
  const calls = [...usage.values()].reduce((n, u) => n + u.count, 0);
  const rt = workspace.runtime;
  const tools = agentTools(workspace);

  return (
    <PageFrame rail={<AgentLog />} railTitle="Agent log" width="wide">
      <Reveal className="grid grid-cols-[minmax(0,1fr)] gap-5">
        {/* Status */}
        <RevealItem as="section" aria-labelledby="agent-heading" className="card ring-gradient paper relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute -top-28 -right-20 size-[26rem] rounded-full bg-[radial-gradient(circle,var(--accent-wash),transparent_65%)]" />
          <div className="relative grid grid-cols-[minmax(0,1fr)] items-center gap-6 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2/80 px-3 py-1 text-[11.5px] font-medium text-muted-foreground">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                    <span className="relative inline-flex size-2 rounded-full bg-success" />
                  </span>
                  {rt.mode === "live" ? "Live agent" : "Demo agent"}
                </span>
                {rt.simulated && <Badge tone="copper">{rt.mode === "demo" ? "Scripted demo replies" : "Stand-in model"}</Badge>}
              </div>
              <h1 id="agent-heading" className="mt-5 font-display text-[2.3rem] leading-[1.02] tracking-[-0.02em] text-balance sm:text-[2.9rem]">
                An agent that <span className="text-copper italic">acts</span>, and asks before it changes anything.
              </h1>
              <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
                It reads your vault with its tools, proposes plans and memories, and every change waits for your approval before it is written.
              </p>
              <dl className="mt-5 grid max-w-2xl grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-3 text-[12.5px] sm:grid-cols-3">
                <div className="min-w-0">
                  <dt className="t-meta">Runs on</dt>
                  <dd className="mt-0.5">{rt.agent}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="t-meta">Model</dt>
                  <dd className="mt-0.5 truncate font-mono text-[12px]">{rt.model}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="t-meta">Files live in</dt>
                  <dd className="mt-0.5">{rt.storage}</dd>
                </div>
              </dl>
              <div className="mt-6 flex flex-wrap gap-2.5">
                <Button asChild variant="primary" size="lg">
                  <Link href="/future-self">
                    <MessageCircle /> Give it a task
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <Link href="/skills">
                    <Play /> Run an action
                  </Link>
                </Button>
              </div>
            </div>
            <div className="hidden justify-self-center md:block">
              <ToolOrbit tools={tools} />
            </div>
          </div>
          <div className="relative grid grid-cols-2 border-t border-border sm:grid-cols-4">
            <Metric label="Tool calls" value={calls} />
            <Metric label="Actions run" value={workspace.skillRuns.length} />
            <Metric label="Waiting for you" value={waiting.length} tone={waiting.length ? "warning" : undefined} />
            <Metric label="Files it can read" value={files.filter((f) => f.readable).length} />
          </div>
        </RevealItem>

        {/* Loop */}
        <RevealItem as="section" aria-labelledby="loop-heading" className="card p-5 sm:p-6">
          <h2 id="loop-heading" className="t-label">
            How a task runs
          </h2>
          <Loop />
        </RevealItem>

        {/* Team */}
        <RevealItem as="section" aria-labelledby="team-heading">
          <SectionHead
            id="team-heading"
            title="The team"
            note={`${workspace.platform.team.length} agents defined in ${workspace.platform.agentFile}. Each one gets only the tools its job needs.`}
            action={
              <Link href="/council" className="flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground">
                Ask the council <ArrowRight className="size-3" />
              </Link>
            }
          />
          <Team />
        </RevealItem>

        {/* Tools */}
        <RevealItem as="section" aria-labelledby="tools-heading">
          <SectionHead id="tools-heading" title="Tools" note="What the agent can call on its own, and what it has to ask for." />
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
            {tools.map((t) => (
              <ToolCard key={t.name} tool={t} usage={usage.get(t.name)} />
            ))}
          </div>
        </RevealItem>

        {waiting.length > 0 && (
          <RevealItem as="section" aria-labelledby="queue-heading">
            <SectionHead id="queue-heading" title="Waiting for your approval" note="Nothing here is saved until you approve it." dot="warning" />
            <div className={cn("grid gap-4", waiting.length > 1 && "lg:grid-cols-2")}>
              {waiting.map((a) => (
                <ApprovalCard key={a.id} approval={a} />
              ))}
            </div>
          </RevealItem>
        )}

        {/* Files */}
        <RevealItem as="section" aria-labelledby="files-heading">
          <SectionHead
            id="files-heading"
            title="File access"
            note="Your vault is plain Markdown. The agent reads these notes through Search memory and writes new ones only after you approve."
            action={
              <Link href="/memory" className="flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground">
                Memory Vault <ArrowRight className="size-3" />
              </Link>
            }
          />
          <FileAccess files={files} />
        </RevealItem>

        {/* Night shift */}
        <RevealItem as="section" aria-labelledby="night-heading" id="night">
          <SectionHead id="night-heading" title="Night shift" note="A scheduled agent run. Anything it proposes still waits for your approval." />
          <NightShiftPanel />
        </RevealItem>

        {/* Research */}
        <RevealItem as="section" aria-labelledby="research-heading">
          <SectionHead id="research-heading" title="Research" note="Web research with real links. Summaries are saved to your vault only after you approve them." />
          <Research />
        </RevealItem>

        {/* Persona */}
        <RevealItem as="section" aria-labelledby="packs-heading">
          <SectionHead id="packs-heading" title="Persona pack" note="Choose who your future self becomes. It changes the voice, not your facts." />
          <Packs />
        </RevealItem>

        {/* Privacy */}
        <RevealItem as="section" aria-labelledby="privacy-heading">
          <SectionHead id="privacy-heading" title="Where it runs" note="What runs where, and what leaves your machine." />
          <Privacy />
        </RevealItem>

        {/* Actions */}
        <RevealItem as="section" aria-labelledby="actions-heading">
          <SectionHead
            id="actions-heading"
            title="Actions"
            note="Multi-step jobs you can hand off. They use the same tools and the same approval step."
            action={
              <Link href="/skills" className="flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground">
                Skills and Actions <ArrowRight className="size-3" />
              </Link>
            }
          />
          <Actions />
        </RevealItem>
      </Reveal>
    </PageFrame>
  );
}

function SectionHead({ id, title, note, action, dot }: { id: string; title: string; note?: string; action?: React.ReactNode; dot?: "warning" }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {dot && <span className="size-1.5 rounded-full bg-warning" aria-hidden />}
          <h2 id={id} className="t-section">
            {title}
          </h2>
        </div>
        {note && <p className="mt-1 text-[13px] text-muted-foreground">{note}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "warning" }) {
  return (
    <div className="border-border px-5 py-4 [&:not(:last-child)]:border-r max-sm:[&:nth-child(2)]:border-r-0 max-sm:[&:nth-child(-n+2)]:border-b">
      <p className="t-meta">{label}</p>
      <CountUp value={value} className={cn("mt-1 block font-display text-[2rem] leading-none", tone === "warning" && value > 0 && "text-warning")} />
    </div>
  );
}

/** The real tools, orbiting the agent. Unavailable tools are drawn faded. */
function ToolOrbit({ tools }: { tools: ToolInfo[] }) {
  const r = 118;
  return (
    <div className="relative size-[18rem]">
      <div className="absolute inset-0 flex items-center justify-center">
        <Orb size={170}>
          <Bot className="size-9 text-[#17191b] dark:text-foreground" aria-hidden />
        </Orb>
      </div>
      <div aria-hidden className="absolute inset-0 animate-orbit-slow">
        {tools.map((t, i) => {
          const a = (i / tools.length) * Math.PI * 2 - Math.PI / 2;
          const x = Math.round(Math.cos(a) * r * 100) / 100;
          const y = Math.round(Math.sin(a) * r * 100) / 100;
          return (
            <span
              key={t.name}
              className="absolute top-1/2 left-1/2 -mt-5 -ml-5"
              style={{ transform: `translate(${x}px, ${y}px)` }}
            >
              <span
                className={cn(
                  "flex size-10 animate-[orbit_60s_linear_infinite_reverse] items-center justify-center rounded-xl border bg-surface shadow-card",
                  t.gate === "unavailable" ? "border-dashed border-border-strong text-subtle opacity-60" : t.gate === "approval" ? "border-copper/30 text-copper" : "border-accent/40 text-accent-ink",
                )}
              >
                <t.icon className="size-4.5" />
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

const LOOP = [
  { icon: MessageCircle, title: "You ask", body: "In a conversation or by running an action." },
  { icon: Eye, title: "It reads", body: "Search memory pulls the notes that matter." },
  { icon: PenLine, title: "It proposes", body: "Plans and memories, drafted with its tools." },
  { icon: ShieldCheck, title: "You approve", body: "Nothing is written until you say yes." },
  { icon: Check, title: "It's saved", body: "Written to your roadmap or vault, then checked." },
];

function Loop() {
  return (
    <ol className="relative mt-5 grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-5 sm:gap-3">
      <div aria-hidden className="absolute top-5 right-[10%] left-[10%] hidden h-[2px] overflow-hidden rounded-full bg-surface-3 sm:block">
        <motion.div className="h-full bg-gradient-to-r from-accent via-copper to-accent" initial={{ x: "-100%" }} animate={{ x: "100%" }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }} />
      </div>
      {LOOP.map((s, i) => (
        <motion.li key={s.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.08 }} className="relative flex gap-3 sm:flex-col sm:items-center sm:text-center">
          <span className={cn("relative flex size-10 shrink-0 items-center justify-center rounded-full border bg-surface shadow-card", i === 3 ? "border-copper/40 text-copper" : "border-border text-foreground")}>
            <s.icon className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium">{s.title}</p>
            <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{s.body}</p>
          </div>
        </motion.li>
      ))}
    </ol>
  );
}

const GATE: Record<ToolInfo["gate"], { label: string; tone: "accent" | "copper" | "outline"; icon: React.ElementType }> = {
  auto: { label: "Runs on its own", tone: "accent", icon: Sparkles },
  approval: { label: "Needs your approval", tone: "copper", icon: ShieldCheck },
  unavailable: { label: "Not connected", tone: "outline", icon: Lock },
};

const ACCESS: Record<ToolInfo["access"], string> = { read: "Read", write: "Write", none: "No access" };

function ToolCard({ tool, usage }: { tool: ToolInfo; usage?: { count: number; last?: string } }) {
  const gate = GATE[tool.gate];
  const off = tool.gate === "unavailable";
  return (
    <article className={cn("card card-hover flex flex-col p-5", off && "border-dashed bg-surface/60 shadow-none")}>
      <div className="flex items-start gap-3.5">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl border",
            off ? "border-dashed border-border-strong text-subtle" : tool.gate === "approval" ? "border-copper/25 bg-copper-wash text-copper" : "border-accent/30 bg-accent-wash text-accent-ink",
          )}
        >
          <tool.icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cn("text-[15px] font-medium", off && "text-muted-foreground")}>{tool.label}</h3>
            <Badge tone={gate.tone}>
              <gate.icon aria-hidden /> {gate.label}
            </Badge>
          </div>
          <p className="mt-0.5 font-mono text-[11px] text-subtle">{tool.name}</p>
        </div>
      </div>
      <p className="mt-3 flex-1 text-[13px] leading-relaxed text-muted-foreground">{tool.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-[12px] text-subtle">
        <span>
          <span className="text-foreground">{ACCESS[tool.access]}</span> · {tool.touches}
        </span>
        {!off && <span className="ml-auto">{usage ? `${pluralize(usage.count, "call")} · last ${relativeDay(usage.last!).toLowerCase()}` : "Not used yet"}</span>}
      </div>
    </article>
  );
}

function FileAccess({ files }: { files: VaultFile[] }) {
  const folders = React.useMemo(() => {
    const m = new Map<string, VaultFile[]>();
    for (const f of files) m.set(f.folder, [...(m.get(f.folder) ?? []), f]);
    return [...m.entries()];
  }, [files]);
  const [open, setOpen] = React.useState<string | null>(null);
  const current = open ?? folders[0]?.[0] ?? null;
  const shown = folders.find(([f]) => f === current)?.[1] ?? [];

  if (!files.length)
    return (
      <div className="card p-5">
        <EmptyState icon={FileText} title="No files yet">
          Notes appear here as you save memories and reflections.
        </EmptyState>
      </div>
    );

  return (
    <div className="card grid grid-cols-[minmax(0,1fr)] overflow-hidden md:grid-cols-[14rem_minmax(0,1fr)]">
      <div className="border-b border-border bg-sunken/60 p-2 md:border-r md:border-b-0">
        <p className="px-2.5 pt-1.5 pb-2 font-mono text-[11px] text-subtle">vault/</p>
        <ul className="flex gap-1 overflow-x-auto md:flex-col" role="tablist" aria-label="Folders">
          {folders.map(([name, list]) => {
            const active = name === current;
            const Icon = active ? FolderOpen : Folder;
            return (
              <li key={name} className="shrink-0">
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setOpen(name)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors",
                    active ? "bg-surface text-foreground shadow-card" : "text-muted-foreground hover:bg-surface/70 hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", active ? "text-copper" : "text-subtle")} aria-hidden />
                  <span className="truncate">{name}</span>
                  <span className="ml-auto t-meta">{list.length}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <ul className="divide-y divide-border" role="tabpanel" aria-label={current ?? undefined}>
        {shown.map((f) => (
          <li key={f.path}>
            <Link href={f.href} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/70 sm:px-5">
              <FileText className="size-4 shrink-0 text-subtle" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium">{f.memory?.title ?? f.name.replace(/\.md$/, "")}</p>
                <p className="truncate font-mono text-[11px] text-subtle">{f.path}</p>
              </div>
              {f.memory && (
                <span className="hidden sm:inline-flex">
                  <ProvenanceBadge value={f.memory.provenance} compact />
                </span>
              )}
              <span className={cn("hidden shrink-0 items-center gap-1 text-[11.5px] md:inline-flex", f.readable ? "text-muted-foreground" : "text-subtle")}>
                {f.readable ? <Eye className="size-3.5" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />}
                {f.readable ? "Agent can read" : "Not searched"}
              </span>
              <ArrowUpRight className="size-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <div className="col-span-full grid grid-cols-[minmax(0,1fr)] gap-px border-t border-border bg-border sm:grid-cols-3">
        <Permission icon={Eye} label="Read" body="Any note in the vault, through Search memory." />
        <Permission icon={PenLine} label="Write" body="New notes and plans, only after you approve them." />
        <Permission icon={X} label="Delete or edit" body="Never. Only you can change or archive a note." />
      </div>
    </div>
  );
}

function Permission({ icon: Icon, label, body }: { icon: React.ElementType; label: string; body: string }) {
  return (
    <div className="flex gap-2.5 bg-surface px-4 py-3 sm:px-5">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden />
      <p className="text-[12px] text-muted-foreground">
        <span className="font-medium text-foreground">{label}:</span> {body}
      </p>
    </div>
  );
}

function Actions() {
  const { workspace } = useWorkspace();
  return (
    <div className="card divide-y divide-border">
      {workspace.skills.map((s) => {
        const run = workspace.skillRuns.find((r) => r.skillId === s.id);
        const writes = s.permissions.some((p) => /needs approval/i.test(p));
        return (
          <div key={s.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[14px] font-medium">{s.name}</p>
                {!s.available ? (
                  <Badge tone="outline">
                    <Lock aria-hidden /> Not available
                  </Badge>
                ) : writes ? (
                  <Badge tone="copper">
                    <ShieldCheck aria-hidden /> Asks before saving
                  </Badge>
                ) : (
                  <Badge tone="accent">
                    <Eye aria-hidden /> Read only
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">{s.available ? s.description : s.unavailableReason ?? s.description}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {run && <span className="t-meta">Last run {relativeDay(run.finishedAt ?? run.startedAt).toLowerCase()}</span>}
              <Button asChild variant="secondary" size="sm" className={cn(!s.available && "pointer-events-none opacity-50")}>
                <Link href={`/skills#skill-${s.id}`} aria-disabled={!s.available} tabIndex={s.available ? undefined : -1}>
                  <Play /> Run
                </Link>
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const LOG_ICON: Record<LogEntry["status"], { icon: React.ElementType; className: string }> = {
  done: { icon: Check, className: "border-success/40 text-success" },
  approved: { icon: Check, className: "border-success/40 text-success" },
  failed: { icon: X, className: "border-destructive/40 text-destructive" },
  rejected: { icon: X, className: "border-border-strong text-subtle" },
  running: { icon: Loader2, className: "border-accent/40 text-accent-ink [&>svg]:animate-spin" },
  pending: { icon: Clock, className: "border-warning/40 text-warning" },
};

function AgentLog() {
  const { workspace } = useWorkspace();
  const log = agentLog(workspace).slice(0, 24);
  return (
    <div>
      <RailSection title="Everything it did">
        {log.length ? (
          <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[9px] before:border-l before:border-dashed before:border-border-strong">
            {log.map((e) => {
              const m = LOG_ICON[e.status];
              return (
                <li key={e.id} className="relative flex gap-3">
                  <span className={cn("relative z-[1] mt-0.5 flex size-[19px] shrink-0 items-center justify-center rounded-full border bg-surface [&>svg]:size-2.5", m.className)} aria-hidden>
                    <m.icon strokeWidth={3} />
                  </span>
                  <Link href={e.href} className="min-w-0 rounded-md hover:text-foreground">
                    <p className="text-[13px] leading-snug">{e.title}</p>
                    {e.detail && <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">{e.detail}</p>}
                    <p className="mt-0.5 t-meta">
                      <span className={cn(e.tool && "font-mono")}>{logKind(e)}</span> · {relativeDay(e.at)}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ol>
        ) : (
          <EmptyState icon={CircleDashed} title="Nothing yet" className="px-4 py-4">
            Ask your future self something and each tool it uses is logged here.
          </EmptyState>
        )}
      </RailSection>
      <RailSection title="What counts as done">
        <p className="text-[12px] text-subtle">An action is only reported as done after the change shows up in your data. Proposals stay pending until you decide.</p>
      </RailSection>
    </div>
  );
}
