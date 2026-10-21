"use client";

import { ArrowRight, AtSign, BookmarkPlus, BookOpen, Briefcase, Check, Clock, Coins, Compass, Flag, GraduationCap, Library, Loader2, Route, ShieldAlert, Sparkles, Split, UserRound } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { ProgressDial } from "@/components/brand/progress-dial";
import { PageFrame, RailSection } from "@/components/layout/page-frame";
import { Reveal, RevealItem } from "@/components/motion/reveal";
import { EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { ProvenanceBadge } from "@/features/memory/provenance";
import { activeMilestone } from "@/lib/derive";
import { SIMULATION_FRAMING, formatCost, formatSpan } from "@/lib/simulator-paths";
import { cn, relativeDay } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";
import type { SimulatedPath, Simulation } from "@/types";

const EASE = [0.2, 0.7, 0.2, 1] as const;

const KIND_STYLE: Record<SimulatedPath["kind"], { icon: React.ElementType; tint: string; label: string }> = {
  self_study: { icon: BookOpen, tint: "bg-accent-wash text-accent-ink border-accent/30", label: "Self-study" },
  formal_education: { icon: GraduationCap, tint: "bg-info-wash text-info border-info/25", label: "Formal education" },
  work_and_study: { icon: Briefcase, tint: "bg-copper-wash text-copper border-copper/25", label: "Work and study" },
  other: { icon: Route, tint: "bg-surface-3 text-muted-foreground border-border", label: "Another route" },
};
const LETTERS = ["A", "B", "C"];

/** The Future Simulator: one goal, three conditional routes to it, side by side. */
export function Simulator() {
  const { workspace, service, apply } = useWorkspace();
  const params = useSearchParams();
  const [goal, setGoal] = React.useState(() => params.get("goal")?.slice(0, 300) ?? "");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const simulations = workspace.simulations ?? [];
  const current = simulations.find((s) => s.id === selected) ?? simulations[0] ?? null;
  const profile = workspace.profile!;

  const simulate = async (g: string) => {
    const text = g.trim();
    if (text.length < 5 || busy) return;
    setBusy(text);
    setError(null);
    try {
      const { workspace: ws, simulation } = await service.simulatePaths(text);
      apply(ws);
      setSelected(simulation.id);
      setGoal("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The simulator couldn't run.");
    } finally {
      setBusy(null);
    }
  };

  const active = activeMilestone(workspace);
  const suggestions = [profile.dream.length <= 160 ? profile.dream : null, active?.title, "Become an AI engineer"].filter((s, i, all): s is string => !!s && all.indexOf(s) === i);

  return (
    <PageFrame rail={<History simulations={simulations} current={current?.id} onPick={setSelected} />} railTitle="Past simulations" width="wide">
      <Reveal className="grid grid-cols-[minmax(0,1fr)] gap-5">
        <RevealItem as="section" aria-labelledby="sim-heading" className="card ring-gradient paper relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 size-[24rem] rounded-full bg-[radial-gradient(circle,var(--accent-wash),transparent_65%)]" />
          <div className="relative grid grid-cols-[minmax(0,1fr)] gap-6 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
              <p className="t-label">Future Simulator</p>
              <h1 id="sim-heading" className="mt-3 font-display text-[2.1rem] leading-[1.02] tracking-[-0.02em] text-balance sm:text-[2.8rem]">
                One goal. <span className="text-copper italic">Three</span> possible roads.
              </h1>
              <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
                Name a goal and FutureMe lays out three clearly different routes to it, with time, cost, prerequisites, risks and the assumptions each one rests on, so you can compare them side by side.
              </p>
              <form
                className="mt-5 flex flex-col gap-2.5 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void simulate(goal);
                }}
              >
                <label htmlFor="sim-goal" className="sr-only">
                  The goal to simulate
                </label>
                <input
                  id="sim-goal"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  maxLength={300}
                  placeholder="What do you want to become?"
                  disabled={!!busy}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 text-[14px] shadow-card outline-none placeholder:text-subtle focus:border-border-strong focus:shadow-[var(--shadow-lift)]"
                />
                <Button type="submit" variant="primary" size="lg" disabled={!!busy || goal.trim().length < 5}>
                  {busy ? <Loader2 className="animate-spin" /> : <Split />} {busy ? "Simulating…" : "Compare three paths"}
                </Button>
              </form>
              <div className="mt-3 flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={!!busy}
                    onClick={() => setGoal(s)}
                    className="flex max-w-full items-center gap-1.5 truncate rounded-full border border-border bg-surface-2/70 px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
                  >
                    <Sparkles className="size-3 shrink-0 text-accent-ink" aria-hidden />
                    <span className="truncate">{s}</span>
                  </button>
                ))}
              </div>
              {error && (
                <p role="alert" className="mt-3 text-[13px] text-destructive">
                  {error}
                </p>
              )}
            </div>
            <Fork busy={!!busy} />
          </div>
        </RevealItem>

        <RevealItem aria-label="How to read these scenarios">
          <Framing />
        </RevealItem>

        <AnimatePresence mode="wait">
          {busy ? (
            <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Simulating goal={busy} />
            </motion.div>
          ) : current ? (
            <motion.div key={current.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Result simulation={current} />
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="card p-6">
                <EmptyState icon={Split} title="No simulations yet">
                  Try a goal like &ldquo;Become an AI engineer&rdquo;. You&apos;ll get three routes to compare, and nothing is saved to your vault unless you choose to.
                </EmptyState>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Reveal>
    </PageFrame>
  );
}

/** The framing, always on screen: these are "if … then roughly …" scenarios, not a forecast. */
function Framing() {
  return (
    <div role="note" className="flex items-start gap-3 rounded-2xl border border-copper/25 bg-copper-wash/60 px-4 py-3.5 backdrop-blur sm:px-5">
      <Compass className="mt-0.5 size-4.5 shrink-0 text-copper" aria-hidden />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
          Conditional scenarios, not predictions <Badge tone="copper">Imagined</Badge>
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{SIMULATION_FRAMING}</p>
      </div>
    </div>
  );
}

/** A point that splits into three roads, in the logo's dial style. The roads draw while the simulator runs. */
function Fork({ busy }: { busy: boolean }) {
  const ends = [
    { x: 196, y: 34 },
    { x: 206, y: 112 },
    { x: 196, y: 190 },
  ];
  return (
    <div className="relative mx-auto hidden h-[14rem] w-[15rem] lg:block" aria-hidden>
      <svg viewBox="0 0 240 224" className="absolute inset-0 size-full overflow-visible">
        <circle cx="34" cy="112" r="26" fill="none" stroke="var(--border-strong)" strokeDasharray="2 4" className="origin-[34px_112px] animate-[orbit_30s_linear_infinite]" />
        {ends.map((e, i) => (
          <g key={i}>
            <motion.path
              d={`M34 112 C 100 112, 120 ${e.y}, ${e.x} ${e.y}`}
              fill="none"
              stroke={i === 1 ? "var(--accent)" : "var(--copper)"}
              strokeOpacity={0.8}
              strokeWidth="1.6"
              strokeDasharray="4 5"
              className={cn("animate-[dash-flow_1.6s_linear_infinite]", !busy && "[animation-duration:5s]")}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.2 + i * 0.15, duration: 1.1, ease: EASE }}
            />
            <motion.circle cx={e.x} cy={e.y} r="13" fill="var(--surface)" stroke="var(--border-strong)" animate={busy ? { scale: [1, 1.15, 1] } : { scale: 1 }} transition={busy ? { duration: 1.2, repeat: Infinity, delay: i * 0.3 } : undefined} />
            <text x={e.x} y={e.y + 4} textAnchor="middle" className="fill-foreground font-display text-[12px] italic">
              {LETTERS[i]}
            </text>
          </g>
        ))}
        <circle cx="34" cy="112" r="7" fill="var(--accent)" className="drop-shadow-[0_0_8px_var(--accent)]" />
      </svg>
    </div>
  );
}

function Simulating({ goal }: { goal: string }) {
  return (
    <div className="grid gap-4">
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Reading your profile and notes, then weighing three routes to <span className="text-foreground">“{goal}”</span>
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
        {LETTERS.map((l, i) => (
          <div key={l} className="card p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl border border-border font-display text-[16px] italic">{l}</span>
              <motion.div className="h-3 w-32 rounded-full bg-surface-3" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.15 }} />
            </div>
            <div className="mt-5 space-y-2">
              {[94, 82, 70, 56].map((w, j) => (
                <motion.div key={j} className="h-2.5 rounded-full bg-surface-3" style={{ width: `${w}%` }} animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.15 + j * 0.1 }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Result({ simulation }: { simulation: Simulation }) {
  const { workspace, run } = useWorkspace();
  const [saving, setSaving] = React.useState(false);
  const [focus, setFocus] = React.useState("0");
  const memoryIds = new Set(workspace.memories.map((m) => m.id));
  const paths = simulation.paths;
  const longest = Math.max(...paths.map((p) => p.months.max));
  const g = simulation.grounding;

  return (
    <div className="grid gap-5">
      <section aria-labelledby="sim-result" className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4 sm:px-6">
          <h2 id="sim-result" className="t-label">
            Three routes, compared
          </h2>
          {simulation.simulated && <Badge tone="copper">{workspace.runtime.mode === "demo" ? "Demo template" : "Stand-in model"}</Badge>}
          <span className="ml-auto t-meta">{relativeDay(simulation.createdAt)}</span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="font-display text-[1.5rem] leading-snug text-balance italic">“{simulation.goal}”</p>
              <Grounding grounding={g} memoryIds={memoryIds} />
            </div>
            {simulation.memoryId ? (
              <Button asChild variant="secondary" className="self-start lg:self-auto">
                <Link href={memoryIds.has(simulation.memoryId) ? `/memory/${encodeURIComponent(simulation.memoryId)}` : "/memory"}>
                  <Check /> Saved to your vault
                </Link>
              </Button>
            ) : (
              <Button
                variant="secondary"
                className="self-start lg:self-auto"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  await run((s) => s.saveSimulation(simulation.id), "Comparison saved to your vault as an imagined scenario");
                  setSaving(false);
                }}
              >
                {saving ? <Loader2 className="animate-spin" /> : <BookmarkPlus />} Save comparison
              </Button>
            )}
          </div>

          {/* At a glance: one dial per route, filled by how long it might take against the longest. */}
          <ol aria-label="At a glance" className="grid grid-cols-3 gap-2 sm:gap-4">
            {paths.map((p, i) => {
              const k = KIND_STYLE[p.kind] ?? KIND_STYLE.other;
              return (
                <li key={p.name}>
                  <button
                    type="button"
                    onClick={() => setFocus(String(i))}
                    aria-pressed={focus === String(i)}
                    className={cn(
                      "group flex h-full w-full flex-col items-center rounded-2xl border bg-surface/70 px-1.5 py-4 text-center backdrop-blur transition-colors hover:border-border-strong sm:px-3",
                      focus === String(i) ? "border-border-strong max-lg:bg-surface" : "border-border",
                    )}
                  >
                    <ProgressDial value={p.months.max / longest} size={92} label={`${p.name}: ${formatSpan(p.months)}`} className="text-muted-foreground">
                      <span className="font-display text-[15px] leading-none text-foreground tabular-nums">{formatSpan(p.months).split(" ")[0]}</span>
                      <span className="mt-1 font-mono text-[7.5px] tracking-[0.16em] uppercase">{formatSpan(p.months).split(" ")[1]}</span>
                    </ProgressDial>
                    <span className="mt-2 flex items-center gap-1.5 text-[12px] font-medium sm:text-[13px]">
                      <k.icon className="hidden size-3.5 shrink-0 sm:block" aria-hidden />
                      <span className="line-clamp-2">{p.name}</span>
                    </span>
                    <span className="mt-1 t-meta">{formatCost(p.cost)}</span>
                    <span className="t-meta">~{p.hoursPerWeek} h/week</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <div className="lg:hidden">
        <Segmented size="sm" label="Show route" value={focus} onValueChange={setFocus} options={paths.map((p, i) => ({ value: String(i), label: `${LETTERS[i]} · ${KIND_STYLE[p.kind]?.label ?? p.name}` }))} className="w-full" />
      </div>

      <section aria-label="The three routes" className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
        {paths.map((p, i) => (
          <PathCard key={p.name} path={p} index={i} goal={simulation.goal} className={cn(focus !== String(i) && "max-lg:hidden")} />
        ))}
      </section>

      {(simulation.sharedUnknowns.length > 0 || simulation.howToChoose) && (
        <section aria-labelledby="sim-choose" className="card ring-gradient grid grid-cols-[minmax(0,1fr)] gap-5 p-5 sm:p-6 lg:grid-cols-2">
          {simulation.sharedUnknowns.length > 0 && (
            <div>
              <p className="t-label">Unknown on every route</p>
              <ul className="mt-2 space-y-1.5">
                {simulation.sharedUnknowns.map((u) => (
                  <li key={u} className="flex gap-2 text-[13.5px]">
                    <span aria-hidden className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-warning" />
                    {u}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {simulation.howToChoose && (
            <div>
              <h2 id="sim-choose" className="t-label">
                How to choose
              </h2>
              <p className="mt-2 font-serif text-[15.5px] leading-relaxed">{simulation.howToChoose}</p>
              <p className="mt-2 flex items-center gap-1.5 t-meta">
                <ProvenanceBadge value="ai-inferred" compact /> Test the assumptions, not the forecast.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Grounding({ grounding, memoryIds }: { grounding: Simulation["grounding"]; memoryIds: Set<string> }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="t-meta">Grounded in</span>
      {grounding.profile && (
        <span className="flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[11.5px] text-muted-foreground">
          <UserRound className="size-3" aria-hidden /> Your profile
        </span>
      )}
      {grounding.notes.map((n) =>
        memoryIds.has(n.memoryId) ? (
          <Link key={n.memoryId} href={`/memory/${encodeURIComponent(n.memoryId)}`} className="flex max-w-56 items-center gap-1 truncate rounded-full border border-border bg-surface px-2 py-0.5 text-[11.5px] text-muted-foreground hover:text-foreground">
            <Library className="size-3 shrink-0" aria-hidden /> <span className="truncate">{n.title}</span>
          </Link>
        ) : (
          <span key={n.memoryId} className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11.5px] text-subtle">
            {n.title}
          </span>
        ),
      )}
      {grounding.social.length > 0 && (
        <span className="flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[11.5px] text-muted-foreground">
          <AtSign className="size-3" aria-hidden /> {grounding.social.join(", ")}
        </span>
      )}
    </div>
  );
}

function PathCard({ path: p, index, goal, className }: { path: SimulatedPath; index: number; goal: string; className?: string }) {
  const k = KIND_STYLE[p.kind] ?? KIND_STYLE.other;
  const planHref = `/future-self?prompt=${encodeURIComponent(
    `From the Future Simulator, for my goal "${goal}": I'm considering the ${p.name.toLowerCase()} (${p.summary}) It assumes: ${p.assumptions.join("; ")}. Help me test the riskiest assumption first and plan small first steps.`,
  )}`;
  return (
    <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * index, duration: 0.5, ease: EASE }} className={cn("card card-hover flex flex-col p-5", className)} aria-labelledby={`path-${index}`}>
      <header className="flex items-start gap-3">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl border", k.tint)}>
          <k.icon className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="t-label">
            Route {LETTERS[index]} · {k.label}
          </p>
          <h3 id={`path-${index}`} className="mt-1 font-display text-[1.45rem] leading-tight">
            {p.name}
          </h3>
        </div>
      </header>
      <p className="mt-3 text-[13.5px] leading-relaxed">
        <span className="font-serif text-muted-foreground italic">If you take this route: </span>
        {p.summary}
      </p>

      <dl className="mt-4 divide-y divide-border rounded-xl border border-border bg-surface-2/60">
        <Stat icon={Clock} label="Time" value={formatSpan(p.months)} />
        <Stat icon={Coins} label="Cost" value={formatCost(p.cost)} />
        <Stat icon={Flag} label="Each week" value={`~${p.hoursPerWeek} hours`} />
      </dl>
      {p.cost.note && <p className="mt-1.5 t-meta">{p.cost.note}</p>}

      <div className="mt-4 rounded-xl border border-copper/30 bg-copper-wash px-3.5 py-3">
        <p className="t-label !text-copper">Holds only if</p>
        <ul className="mt-1.5 space-y-1">
          {p.assumptions.map((a) => (
            <li key={a} className="flex gap-2 text-[13px]">
              <span aria-hidden className="mt-[0.5em] size-1.5 shrink-0 rounded-full bg-copper" />
              {a}
            </li>
          ))}
        </ul>
      </div>

      {p.prerequisites.length > 0 && <List title="Prerequisites" items={p.prerequisites} tone="bg-info" />}
      {p.risks.length > 0 && (
        <div className="mt-4">
          <p className="flex items-center gap-1.5 t-label">
            <ShieldAlert className="size-3.5 text-warning" aria-hidden /> Risks
          </p>
          <ul className="mt-1.5 space-y-2">
            {p.risks.map((r) => (
              <li key={r.risk} className="text-[13px]">
                <p>{r.risk}</p>
                {r.mitigation && <p className="mt-0.5 text-[12.5px] text-muted-foreground">↳ {r.mitigation}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.firstSteps.length > 0 && <List title="First steps this month" items={p.firstSteps} tone="bg-accent" />}

      {p.fit && (
        <p className="mt-4 border-l-2 border-border-strong pl-3 text-[12.5px] leading-relaxed text-muted-foreground">
          <span className="mr-1.5 inline-flex align-middle">
            <ProvenanceBadge value="ai-inferred" compact />
          </span>
          {p.fit}
        </p>
      )}

      <div className="mt-auto pt-5">
        <Button asChild variant="secondary" size="sm" className="w-full">
          <Link href={planHref}>
            Plan this route <ArrowRight />
          </Link>
        </Button>
      </div>
    </motion.article>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <dt className="flex items-center gap-1.5 t-label">
        <Icon className="size-3" aria-hidden /> {label}
      </dt>
      <dd className="text-right font-display text-[16px] leading-none tabular-nums">{value}</dd>
    </div>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <div className="mt-4">
      <p className="t-label">{title}</p>
      <ul className="mt-1.5 space-y-1">
        {items.map((a) => (
          <li key={a} className="flex gap-2 text-[13px]">
            <span aria-hidden className={cn("mt-[0.5em] size-1.5 shrink-0 rounded-full", tone)} />
            {a}
          </li>
        ))}
      </ul>
    </div>
  );
}

function History({ simulations, current, onPick }: { simulations: Simulation[]; current?: string; onPick: (id: string) => void }) {
  const { workspace } = useWorkspace();
  return (
    <div>
      <RailSection title="Past simulations">
        {simulations.length ? (
          <ul className="space-y-1">
            {simulations.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onPick(s.id)}
                  aria-current={s.id === current}
                  className={cn("w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-2", s.id === current && "bg-surface-2")}
                >
                  <p className="line-clamp-2 text-[13px]">{s.goal}</p>
                  <p className="mt-0.5 t-meta">{relativeDay(s.createdAt)}</p>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-subtle">Simulations you run are kept here.</p>
        )}
      </RailSection>
      <RailSection title="What it reads">
        <p className="text-[12px] text-subtle">Your profile, the notes in your vault that match the goal, and what you imported from your accounts. It never writes to your roadmap; you choose a route and plan it with your future self.</p>
      </RailSection>
      <RailSection title="How it runs">
        <p className="text-[12px] text-subtle">
          {workspace.runtime.mode === "demo"
            ? "Demo mode fills in three template routes in your browser. No model is called."
            : workspace.runtime.simulated
              ? "The stand-in model fills in three template routes. Add a Nebius key to plan with Nemotron."
              : `Nemotron (${workspace.runtime.model}) plans with reasoning on and returns JSON that must follow a fixed schema: exactly three routes, each with ranges and assumptions.`}
        </p>
      </RailSection>
    </div>
  );
}
