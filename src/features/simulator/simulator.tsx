"use client";

import {
  AlertTriangle,
  ArrowRight,
  AtSign,
  BookmarkPlus,
  BookOpen,
  CheckCircle2,
  Briefcase,
  Check,
  Clock,
  Coins,
  Compass,
  Flag,
  GraduationCap,
  Hammer,
  Library,
  Loader2,
  MapPin,
  Pin,
  RotateCcw,
  Route,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Split,
  UserRound,
  Zap,
} from "lucide-react";
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
import { fieldClass } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { ProvenanceBadge } from "@/features/memory/provenance";
import { ChosenRoadCard } from "@/features/simulator/chosen-road";
import { activeMilestone } from "@/lib/derive";
import { FUNDING_LABEL, KIND_LABEL, PLACE_LABEL, SIMULATION_FRAMING, formatCost, formatSpan, money, rankPaths, type Assessment } from "@/lib/simulator-paths";
import { cn, relativeDay } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";
import type { SimulatedPath, Simulation, Situation } from "@/types";

const EASE = [0.2, 0.7, 0.2, 1] as const;

const KIND_STYLE: Record<SimulatedPath["kind"], { icon: React.ElementType; tint: string }> = {
  self_study: { icon: BookOpen, tint: "bg-accent-wash text-accent-ink border-accent/30" },
  formal_education: { icon: GraduationCap, tint: "bg-info-wash text-info border-info/25" },
  work_and_study: { icon: Briefcase, tint: "bg-copper-wash text-copper border-copper/25" },
  bootcamp: { icon: Zap, tint: "bg-warning-wash text-warning border-warning/25" },
  apprenticeship: { icon: Hammer, tint: "bg-success-wash text-success border-success/25" },
  other: { icon: Route, tint: "bg-surface-3 text-muted-foreground border-border" },
};
const LETTERS = ["A", "B", "C"];
const DEFAULT_SITUATION: Situation = { location: "", currency: "USD", monthlyIncome: 0, savings: 0, hoursPerWeek: 10, dependents: 0, risk: "medium" };
const RISK_OPTIONS = [
  { value: "low" as const, label: "Safe" },
  { value: "medium" as const, label: "Some" },
  { value: "high" as const, label: "Bold" },
];

/** The Future Simulator: one goal, many conditional routes, rated against where the person really starts from. */
export function Simulator() {
  const { workspace, service, apply } = useWorkspace();
  const params = useSearchParams();
  const simulations = workspace.simulations ?? [];
  const [goal, setGoal] = React.useState(() => params.get("goal")?.slice(0, 300) ?? "");
  // The last starting point the person gave, so they don't type it twice.
  const [situation, setSituation] = React.useState<Situation>(() => simulations.find((s) => s.situation)?.situation ?? DEFAULT_SITUATION);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const current = simulations.find((s) => s.id === selected) ?? simulations[0] ?? null;
  const profile = workspace.profile!;

  const simulate = async (g: string) => {
    const text = g.trim();
    if (text.length < 5 || busy) return;
    setBusy(text);
    setError(null);
    try {
      const { workspace: ws, simulation } = await service.simulatePaths(text, situation);
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
          <form
            className="relative grid grid-cols-[minmax(0,1fr)] gap-6 p-5 sm:p-8"
            onSubmit={(e) => {
              e.preventDefault();
              void simulate(goal);
            }}
          >
            <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <p className="t-label">Future Simulator</p>
                <h1 id="sim-heading" className="mt-3 font-display text-[2.1rem] leading-[1.02] tracking-[-0.02em] text-balance sm:text-[2.8rem]">
                  One goal. <span className="text-copper italic">Many</span> possible roads.
                </h1>
                <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
                  FutureMe looks wide, mixing how you could learn, how you could pay and where, then rates every road against where you really start from. The best fits are compared side by side, and the rest stay one tap away.
                </p>
                <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
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
                    {busy ? <Loader2 className="animate-spin" /> : <Split />} {busy ? "Exploring roads…" : "Explore the roads"}
                  </Button>
                </div>
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
              </div>
              <Fork busy={!!busy} />
            </div>
            <StartingPoint value={situation} onChange={setSituation} disabled={!!busy} />
            {error && (
              <p role="alert" className="-mt-2 text-[13px] text-destructive">
                {error}
              </p>
            )}
          </form>
        </RevealItem>

        <RevealItem aria-label="How to read these scenarios">
          <Framing />
        </RevealItem>

        {workspace.chosenRoad && <ChosenRoadCard />}

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
                  Try a goal like &ldquo;Become an AI engineer&rdquo;. You&apos;ll get many roads rated for your situation, and nothing is saved to your vault unless you choose to.
                </EmptyState>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Reveal>
    </PageFrame>
  );
}

/** Where the person starts from: every road is priced in their currency and rated against these numbers. */
function StartingPoint({ value, onChange, disabled }: { value: Situation; onChange: (s: Situation) => void; disabled: boolean }) {
  const set = <K extends keyof Situation>(key: K, v: Situation[K]) => onChange({ ...value, [key]: v });
  const num = (v: string) => Math.max(0, Number(v.replace(/[^\d.]/g, "")) || 0);
  const field = cn(fieldClass, "h-10 bg-surface");
  return (
    <fieldset disabled={disabled} className="rounded-2xl border border-border bg-surface/60 p-4 backdrop-blur sm:p-5">
      <legend className="sr-only">Your starting point</legend>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="t-label">Your starting point</span>
        <span className="t-meta">Roads change with where you live, what you earn and the time you have.</span>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <label className="col-span-2 grid gap-1 text-[12px] text-muted-foreground">
          Where you live
          <input className={field} value={value.location} onChange={(e) => set("location", e.target.value.slice(0, 120))} placeholder="City, country" autoComplete="address-level2" />
        </label>
        <label className="grid gap-1 text-[12px] text-muted-foreground">
          Currency
          <input className={cn(field, "uppercase")} value={value.currency} onChange={(e) => set("currency", e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))} placeholder="USD" maxLength={3} />
        </label>
        <label className="grid gap-1 text-[12px] text-muted-foreground">
          Hours a week for this
          <input className={field} inputMode="numeric" value={value.hoursPerWeek || ""} onChange={(e) => set("hoursPerWeek", Math.min(80, num(e.target.value)))} placeholder="10" />
        </label>
        <label className="grid gap-1 text-[12px] text-muted-foreground">
          Monthly income
          <input className={field} inputMode="numeric" value={value.monthlyIncome || ""} onChange={(e) => set("monthlyIncome", num(e.target.value))} placeholder="0" />
        </label>
        <label className="grid gap-1 text-[12px] text-muted-foreground">
          Savings
          <input className={field} inputMode="numeric" value={value.savings || ""} onChange={(e) => set("savings", num(e.target.value))} placeholder="0" />
        </label>
        <label className="grid gap-1 text-[12px] text-muted-foreground">
          People who rely on your income
          <input className={field} inputMode="numeric" value={value.dependents || ""} onChange={(e) => set("dependents", Math.min(20, num(e.target.value)))} placeholder="0" />
        </label>
        <div className="grid gap-1 text-[12px] text-muted-foreground">
          <span>Risk you can take</span>
          <Segmented size="sm" label="Risk you can take" value={value.risk} onValueChange={(v) => set("risk", v)} options={RISK_OPTIONS} className="h-10 w-full [&>button]:h-full [&>button]:flex-1 [&>button]:justify-center" />
        </div>
      </div>
    </fieldset>
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

/** A point that splits into many roads, in the logo's dial style. The roads draw while the simulator runs. */
function Fork({ busy }: { busy: boolean }) {
  const ends = [20, 62, 112, 162, 204].map((y, i) => ({ x: i % 2 ? 206 : 192, y }));
  const main = new Set([0, 2, 4]);
  return (
    <div className="relative mx-auto hidden h-[14rem] w-[15rem] lg:block" aria-hidden>
      <svg viewBox="0 0 240 224" className="absolute inset-0 size-full overflow-visible">
        <circle cx="34" cy="112" r="26" fill="none" stroke="var(--border-strong)" strokeDasharray="2 4" className="origin-[34px_112px] animate-[orbit_30s_linear_infinite]" />
        {ends.map((e, i) => (
          <g key={i} opacity={main.has(i) ? 1 : 0.45}>
            <motion.path
              d={`M34 112 C 100 112, 120 ${e.y}, ${e.x} ${e.y}`}
              fill="none"
              stroke={i === 2 ? "var(--accent)" : "var(--copper)"}
              strokeOpacity={0.8}
              strokeWidth="1.6"
              strokeDasharray="4 5"
              className={cn("animate-[dash-flow_1.6s_linear_infinite]", !busy && "[animation-duration:5s]")}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.2 + i * 0.12, duration: 1.1, ease: EASE }}
            />
            <motion.circle cx={e.x} cy={e.y} r={main.has(i) ? 13 : 7} fill="var(--surface)" stroke="var(--border-strong)" animate={busy ? { scale: [1, 1.15, 1] } : { scale: 1 }} transition={busy ? { duration: 1.2, repeat: Infinity, delay: i * 0.25 } : undefined} />
            {main.has(i) && (
              <text x={e.x} y={e.y + 4} textAnchor="middle" className="fill-foreground font-display text-[12px] italic">
                {LETTERS[i / 2]}
              </text>
            )}
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
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Reading your profile, notes and starting point, then exploring roads to <span className="text-foreground">“{goal}”</span>
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
  // "What if": the starting point the roads are rated against right now. Starts at what the person gave.
  const [whatIf, setWhatIf] = React.useState<Situation | null>(simulation.situation);
  // Roads the person chose to compare; null compares the three best fits.
  const [pinned, setPinned] = React.useState<number[] | null>(null);
  const [focus, setFocus] = React.useState(0);
  const memoryIds = new Set(workspace.memories.map((m) => m.id));
  const paths = simulation.paths;
  const ranked = React.useMemo(() => rankPaths(paths, whatIf), [paths, whatIf]);
  const assessments = new Map(ranked.map((r) => [r.index, r.assessment]));
  const compared = pinned ?? ranked.slice(0, 3).map((r) => r.index);
  const rest = ranked.filter((r) => !compared.includes(r.index));
  const shown = Math.min(focus, compared.length - 1);
  const [choosing, setChoosing] = React.useState<number | null>(null);
  const chosen = workspace.chosenRoad?.simulationId === simulation.id ? workspace.chosenRoad.index : null;
  const choose = async (index: number) => {
    setChoosing(index);
    await run((s) => s.chooseRoad(simulation.id, index), "Road chosen. Your future self and the team now plan with it.");
    setChoosing(null);
  };

  const compare = (index: number) => {
    // The new road takes the last column; the person's earlier picks stay.
    setPinned([...compared.slice(0, 2), index]);
    setFocus(Math.min(2, compared.length));
    document.getElementById("sim-compare")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="grid gap-5">
      <section aria-labelledby="sim-result" className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4 sm:px-6">
          <h2 id="sim-result" className="t-label">
            {paths.length} roads explored
          </h2>
          {simulation.simulated && <Badge tone="copper">{workspace.runtime.mode === "demo" ? "Demo template" : "Stand-in model"}</Badge>}
          <span className="ml-auto t-meta">{relativeDay(simulation.createdAt)}</span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="font-display text-[1.5rem] leading-snug text-balance italic">“{simulation.goal}”</p>
              <Grounding simulation={simulation} memoryIds={memoryIds} />
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

          {whatIf && simulation.situation ? (
            <WhatIf value={whatIf} original={simulation.situation} costliest={Math.max(...paths.filter((p) => p.cost.currency === whatIf.currency).map((p) => p.cost.max), 0)} onChange={setWhatIf} />
          ) : (
            <p className="rounded-xl border border-dashed border-border px-4 py-3 text-[12.5px] text-muted-foreground">
              This run had no starting point, so roads are ordered by how realistic they look. Fill in your starting point above and explore again to rate them against your money and time.
            </p>
          )}

          {/* At a glance: one dial per compared road, filled by how well it fits the starting point. */}
          <div id="sim-compare" className="scroll-mt-20">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="t-label">{pinned ? "Your comparison" : whatIf ? "Best fits for you" : "Most realistic"}</p>
              {pinned && (
                <Button size="sm" variant="ghost" onClick={() => setPinned(null)}>
                  <RotateCcw /> Back to best fits
                </Button>
              )}
            </div>
            <ol aria-label="At a glance" className="grid grid-cols-3 gap-2 sm:gap-4">
              {compared.map((index, i) => {
                const p = paths[index];
                const a = assessments.get(index)!;
                const k = KIND_STYLE[p.kind] ?? KIND_STYLE.other;
                return (
                  <li key={index}>
                    <button
                      type="button"
                      onClick={() => setFocus(i)}
                      aria-pressed={shown === i}
                      className={cn(
                        "group flex h-full w-full flex-col items-center rounded-2xl border bg-surface/70 px-1.5 py-4 text-center backdrop-blur transition-colors hover:border-border-strong sm:px-3",
                        shown === i ? "border-border-strong max-lg:bg-surface" : "border-border",
                      )}
                    >
                      <ProgressDial value={a.score / 100} size={92} label={`${p.name}: fit ${a.score} out of 100`} className="text-muted-foreground">
                        <span className="font-display text-[22px] leading-none text-foreground tabular-nums">{a.score}</span>
                        <span className="mt-1 font-mono text-[7.5px] tracking-[0.16em] uppercase">{whatIf ? "fit" : "realism"}</span>
                      </ProgressDial>
                      <span className="mt-2 flex items-center gap-1.5 text-[12px] font-medium sm:text-[13px]">
                        <k.icon className="hidden size-3.5 shrink-0 sm:block" aria-hidden />
                        <span className="line-clamp-2">{p.name}</span>
                      </span>
                      <span className="mt-1 t-meta">{formatSpan(p.months)}</span>
                      <span className="t-meta">{formatCost(p.cost)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </section>

      <div className="lg:hidden">
        <Segmented
          size="sm"
          label="Show road"
          value={String(shown)}
          onValueChange={(v) => setFocus(Number(v))}
          options={compared.map((index, i) => ({ value: String(i), label: `${LETTERS[i]} · ${KIND_LABEL[paths[index].kind]}` }))}
          className="w-full"
        />
      </div>

      <section aria-label="The roads compared" className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
        {compared.map((index, i) => (
          <PathCard
            key={index}
            path={paths[index]}
            assessment={assessments.get(index)!}
            situation={whatIf}
            letter={LETTERS[i]}
            order={i}
            goal={simulation.goal}
            chosen={chosen === index}
            choosing={choosing === index}
            onChoose={() => choose(index)}
            className={cn(shown !== i && "max-lg:hidden")}
          />
        ))}
      </section>

      {rest.length > 0 && (
        <section aria-labelledby="sim-more" className="card overflow-hidden">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-5 py-4 sm:px-6">
            <h2 id="sim-more" className="t-label">
              More roads
            </h2>
            <span className="t-meta">Ranked lower for your situation, with the reason. Pick any to compare.</span>
          </div>
          <ul className="divide-y divide-border">
            {rest.map(({ index, assessment: a }) => (
              <MoreRoad key={index} path={paths[index]} assessment={a} rated={!!whatIf} chosen={chosen === index} onCompare={() => compare(index)} />
            ))}
          </ul>
        </section>
      )}

      {(simulation.sharedUnknowns.length > 0 || simulation.howToChoose) && (
        <section aria-labelledby="sim-choose" className="card ring-gradient grid grid-cols-[minmax(0,1fr)] gap-5 p-5 sm:p-6 lg:grid-cols-2">
          {simulation.sharedUnknowns.length > 0 && (
            <div>
              <p className="t-label">Unknown on every road</p>
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

/** Sliders that re-rate every road at once, in the browser, without asking the model again. */
function WhatIf({ value, original, costliest, onChange }: { value: Situation; original: Situation; costliest: number; onChange: (s: Situation) => void }) {
  const changed = JSON.stringify(value) !== JSON.stringify(original);
  // Savings can slide far enough to afford the costliest road; income to three times what was given.
  const max = (n: number, floor: number) => Math.ceil(Math.max(floor, n * 3, 100) / 100) * 100;
  const sliders: { key: "savings" | "monthlyIncome" | "hoursPerWeek"; label: string; max: number; step: number; show: (n: number) => string }[] = [
    { key: "savings", label: "Savings", max: max(original.savings, costliest), step: 100, show: (n) => money(n, value.currency) },
    { key: "monthlyIncome", label: "Monthly income", max: max(original.monthlyIncome, costliest / 12), step: 50, show: (n) => money(n, value.currency) },
    { key: "hoursPerWeek", label: "Hours a week", max: 60, step: 1, show: (n) => `${n} h` },
  ];
  return (
    <div className="rounded-2xl border border-border bg-surface-2/50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <SlidersHorizontal className="size-4 text-accent-ink" aria-hidden />
        <p className="text-[13px] font-medium">What if?</p>
        <span className="t-meta">Move these to see how the roads re-rank. Nothing is re-run or saved.</span>
        {changed && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onChange(original)}>
            <RotateCcw /> Reset
          </Button>
        )}
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        {sliders.map((s) => (
          <label key={s.key} className="grid gap-1.5">
            <span className="flex items-baseline justify-between gap-2 text-[12px] text-muted-foreground">
              {s.label}
              <span className="font-display text-[15px] text-foreground tabular-nums">{s.show(value[s.key])}</span>
            </span>
            <input type="range" min={s.key === "hoursPerWeek" ? 1 : 0} max={s.max} step={s.step} value={Math.min(value[s.key], s.max)} onChange={(e) => onChange({ ...value, [s.key]: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
          </label>
        ))}
        <div className="grid gap-1.5">
          <span className="text-[12px] text-muted-foreground">Risk you can take</span>
          <Segmented size="sm" label="Risk you can take" value={value.risk} onValueChange={(v) => onChange({ ...value, risk: v })} options={RISK_OPTIONS} className="w-full [&>button]:flex-1 [&>button]:justify-center" />
        </div>
      </div>
    </div>
  );
}

function Grounding({ simulation, memoryIds }: { simulation: Simulation; memoryIds: Set<string> }) {
  const g = simulation.grounding;
  const chip = "flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[11.5px] text-muted-foreground";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="t-meta">Grounded in</span>
      {g.profile && (
        <span className={chip}>
          <UserRound className="size-3" aria-hidden /> Your profile
        </span>
      )}
      {simulation.situation?.location && (
        <span className={chip}>
          <MapPin className="size-3" aria-hidden /> {simulation.situation.location}
        </span>
      )}
      {g.notes.map((n) =>
        memoryIds.has(n.memoryId) ? (
          <Link key={n.memoryId} href={`/memory/${encodeURIComponent(n.memoryId)}`} className={cn(chip, "max-w-56 truncate hover:text-foreground")}>
            <Library className="size-3 shrink-0" aria-hidden /> <span className="truncate">{n.title}</span>
          </Link>
        ) : (
          <span key={n.memoryId} className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11.5px] text-subtle">
            {n.title}
          </span>
        ),
      )}
      {g.social.length > 0 && (
        <span className={chip}>
          <AtSign className="size-3" aria-hidden /> {g.social.join(", ")}
        </span>
      )}
    </div>
  );
}

/** Three checks against the starting point: money, time and risk. */
function Checks({ path: p, assessment: a, situation }: { path: SimulatedPath; assessment: Assessment; situation: Situation }) {
  const rows = [
    {
      ok: a.budget.ok,
      label: "Money",
      text: !a.budget.comparable
        ? `Priced in ${p.cost.currency}, not compared with your ${situation.currency} savings`
        : a.budget.ok
          ? `Within your ${money(a.budget.available, situation.currency)} ${p.keepsIncome ? "of savings and spare income" : "of savings"}`
          : `About ${money(a.budget.shortfall, situation.currency)} short`,
    },
    { ok: a.hours.ok, label: "Time", text: a.hours.ok ? `Fits your ${situation.hoursPerWeek} hours a week` : `Needs ${a.hours.gap} more hours a week` },
    { ok: a.risk.ok, label: "Risk", text: a.risk.ok ? `Within the risk you can take` : `${p.riskLevel === "high" ? "High" : "More"} risk than you said you can take` },
  ];
  return (
    <ul className="mt-4 grid gap-1.5" aria-label="How it fits your starting point">
      {rows.map((r) => (
        <li key={r.label} className="flex items-start gap-2 text-[12.5px]">
          {r.ok ? <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-label="Fits" /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-label="Strain" />}
          <span>
            <span className="text-muted-foreground">{r.label}: </span>
            {r.text}
          </span>
        </li>
      ))}
      {situation.dependents > 0 && !p.keepsIncome && (
        <li className="flex items-start gap-2 text-[12.5px]">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-label="Strain" />
          <span>
            <span className="text-muted-foreground">Income: </span>You&apos;d stop earning while others rely on it
          </span>
        </li>
      )}
    </ul>
  );
}

function PathCard({
  path: p,
  assessment,
  situation,
  letter,
  order,
  goal,
  chosen,
  choosing,
  onChoose,
  className,
}: {
  path: SimulatedPath;
  assessment: Assessment;
  situation: Situation | null;
  letter: string;
  order: number;
  goal: string;
  chosen: boolean;
  choosing: boolean;
  onChoose: () => void;
  className?: string;
}) {
  const k = KIND_STYLE[p.kind] ?? KIND_STYLE.other;
  const planHref = `/future-self?prompt=${encodeURIComponent(
    `From the Future Simulator, for my goal "${goal}": I'm considering the ${p.name.toLowerCase()} (${p.summary}) It assumes: ${p.assumptions.join("; ")}. Help me test the riskiest assumption first and plan small first steps.`,
  )}`;
  return (
    <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * order, duration: 0.5, ease: EASE }} className={cn("card card-hover flex flex-col p-5", chosen && "ring-gradient", className)} aria-labelledby={`path-${letter}`}>
      <header className="flex items-start gap-3">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl border", k.tint)}>
          <k.icon className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="t-label">
            Road {letter} · {KIND_LABEL[p.kind]}
          </p>
          <h3 id={`path-${letter}`} className="mt-1 font-display text-[1.45rem] leading-tight">
            {p.name}
          </h3>
        </div>
      </header>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge tone="outline">{FUNDING_LABEL[p.funding]}</Badge>
        <Badge tone="outline">{PLACE_LABEL[p.place]}</Badge>
        {p.keepsIncome && <Badge tone="success">Keeps an income</Badge>}
        {chosen && <Badge tone="copper">Your road</Badge>}
      </div>
      <p className="mt-3 text-[13.5px] leading-relaxed">
        <span className="font-serif text-muted-foreground italic">If you take this road: </span>
        {p.summary}
      </p>

      <dl className="mt-4 divide-y divide-border rounded-xl border border-border bg-surface-2/60">
        <Stat icon={Clock} label="Time" value={formatSpan(p.months)} />
        <Stat icon={Coins} label="Cost" value={formatCost(p.cost)} />
        <Stat icon={Flag} label="Each week" value={`~${p.hoursPerWeek} hours`} />
      </dl>
      {p.cost.note && <p className="mt-1.5 t-meta">{p.cost.note}</p>}

      {situation && <Checks path={p} assessment={assessment} situation={situation} />}

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

      <div className="mt-auto grid gap-2 pt-5">
        {chosen ? (
          <p className="flex items-center justify-center gap-1.5 rounded-md border border-copper/30 bg-copper-wash py-1.5 text-[12.5px] font-medium text-copper">
            <CheckCircle2 className="size-3.5" aria-hidden /> Your road. The team plans with it.
          </p>
        ) : (
          <Button variant="primary" size="sm" className="w-full" onClick={onChoose} disabled={choosing}>
            {choosing ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Choose this road
          </Button>
        )}
        <Button asChild variant="secondary" size="sm" className="w-full">
          <Link href={planHref}>
            Plan this road <ArrowRight />
          </Link>
        </Button>
      </div>
    </motion.article>
  );
}

function MoreRoad({ path: p, assessment: a, rated, chosen, onCompare }: { path: SimulatedPath; assessment: Assessment; rated: boolean; chosen: boolean; onCompare: () => void }) {
  const k = KIND_STYLE[p.kind] ?? KIND_STYLE.other;
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 px-5 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-6">
      <span className="relative flex size-11 items-center justify-center rounded-full border border-border bg-surface font-display text-[16px] tabular-nums">
        <span aria-hidden>{a.score}</span>
        <svg viewBox="0 0 44 44" className="absolute inset-0 size-full -rotate-90" aria-hidden>
          <circle cx="22" cy="22" r="20" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeDasharray={`${Math.round(1.2566 * a.score)} 200`} />
        </svg>
        <span className="sr-only">
          {rated ? "Fit" : "Realism"} {a.score} out of 100
        </span>
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <k.icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-[14px] font-medium">{p.name}</span>
          {chosen && <Badge tone="copper">Your road</Badge>}
          <span className="t-meta">
            {KIND_LABEL[p.kind]} · {FUNDING_LABEL[p.funding]} · {PLACE_LABEL[p.place]}
          </span>
        </p>
        <p className="mt-0.5 t-meta">
          {formatSpan(p.months)} · {formatCost(p.cost)} · ~{p.hoursPerWeek} h/week
        </p>
        {a.concerns.length > 0 ? (
          <p className="mt-1 flex items-start gap-1.5 text-[12.5px] text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
            {a.concerns.slice(0, 2).join(" · ")}
          </p>
        ) : (
          <p className="mt-1 line-clamp-2 text-[12.5px] text-muted-foreground">{p.summary}</p>
        )}
      </div>
      <Button size="sm" variant="secondary" className="col-start-2 justify-self-start sm:col-start-3" onClick={onCompare}>
        <Pin /> Compare
      </Button>
    </li>
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
                  <p className="mt-0.5 t-meta">
                    {relativeDay(s.createdAt)} · {s.paths.length} roads
                  </p>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-subtle">Simulations you run are kept here.</p>
        )}
      </RailSection>
      <RailSection title="How roads are rated">
        <p className="text-[12px] text-subtle">
          Each road gets a fit score out of 100: whether your savings (plus a quarter of your income, on roads where you keep earning) cover its cost, whether it fits your hours, whether its risk is within what you can take, and how realistic it is where you live. Roads that stop your income score lower when others rely on it.
        </p>
      </RailSection>
      <RailSection title="What it reads">
        <p className="text-[12px] text-subtle">Your starting point, your profile, the notes in your vault that match the goal, and what you imported from your accounts. It never writes to your roadmap; you choose a road and plan it with your future self.</p>
      </RailSection>
      <RailSection title="How it runs">
        <p className="text-[12px] text-subtle">
          {workspace.runtime.mode === "demo"
            ? "Demo mode fills in template roads in your browser. No model is called."
            : workspace.runtime.simulated
              ? "The stand-in model fills in template roads. Add a Nebius key to explore with Nemotron."
              : `Nemotron (${workspace.runtime.model}) explores with reasoning on and returns JSON that must follow a fixed schema: 6 to 10 roads, each with ranges and assumptions.`}
        </p>
      </RailSection>
    </div>
  );
}
