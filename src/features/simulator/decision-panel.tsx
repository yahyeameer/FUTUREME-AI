"use client";

import { Calculator, Check, ChevronDown, CircleCheck, CircleDashed, CircleHelp, CircleX, Cpu, FlaskConical, History, Link2, Loader2, Scale, Sparkles, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { BranchResult, DecisionRequest, DecisionResult, DecisionStatus, Fact, RankedOption } from "@/lib/decision/contract";
import { HARD_CONSTRAINTS, RANK_CRITERIA, optionIndex, type DecisionExtras } from "@/lib/decision/rules";
import { extrasOf, rejudge, routeOf, triggersFor } from "@/lib/decision/view";
import { formatCost, formatSpan, money } from "@/lib/simulator-paths";
import { cn, relativeDay } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";
import type { DecisionView, SimulatedPath, Simulation, Situation } from "@/types";

// The decision check under the Future Simulator. Three components, always named for what they did:
//   Nemotron wrote the roads (above). The rules check money, time, risk and debt, and do every sum. Jev, TypeSafe's
//   decision model, rates only the roads that passed, on what the person said matters. Nothing here is decided for them.

const STATUS: Record<DecisionStatus, { label: string; tone: "success" | "warning" | "destructive" | "neutral"; icon: React.ElementType }> = {
  decided: { label: "Recommended", tone: "success", icon: CircleCheck },
  needs_review: { label: "Needs your review", tone: "warning", icon: CircleHelp },
  abstained: { label: "No safe pick", tone: "destructive", icon: CircleX },
  pending: { label: "Rules only", tone: "neutral", icon: CircleDashed },
};

const PROV: Record<Fact["provenance"], { label: string; tone: "neutral" | "copper" | "success" | "info" | "warning" }> = {
  user: { label: "You said", tone: "neutral" },
  estimate: { label: "What if", tone: "copper" },
  verified: { label: "Looked up", tone: "success" },
  calculated: { label: "Calculated", tone: "info" },
  unknown: { label: "Unknown", tone: "warning" },
};

const CONSTRAINT_LABEL = Object.fromEntries(HARD_CONSTRAINTS.map((c) => [c.id, c.label]));
const CRITERION = Object.fromEntries(RANK_CRITERIA.map((c) => [c.id, c]));
const pct = (n: number) => `${Math.round(n * 100)}`;

export function DecisionPanel({ simulation, whatIf, onCompare }: { simulation: Simulation; whatIf: Situation | null; onCompare: (index: number) => void }) {
  const { workspace, service, apply, run } = useWorkspace();
  const decisions = React.useMemo(() => simulation.decisions ?? [], [simulation.decisions]);
  const latest = decisions.find((d) => d.kind === "rank_paths") ?? null;
  const [inputs, setInputs] = React.useState<DecisionExtras>(() => (latest ? extrasOf(latest.request as DecisionRequest) : { monthlyCosts: null, allowDebt: false, verifiedPrices: [] }));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const model = workspace.platform.decisionModel;
  const live = workspace.runtime.mode === "live";

  if (!simulation.situation || !whatIf) {
    return (
      <section aria-labelledby="decision-heading" className="card p-5 sm:p-6">
        <Heading />
        <p className="mt-3 text-[13px] text-muted-foreground">Add your starting point and explore again, so the roads can be checked against your money, time and risk before anything is recommended.</p>
      </section>
    );
  }

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      const { workspace: ws } = await service.decideRoutes(simulation.id, whatIf, inputs);
      apply(ws);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The check couldn't run.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="decision-heading" className="card ring-gradient overflow-hidden">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Heading />
          <WhoDidWhat live={live} configured={!!model?.configured} model={model?.model} />
        </div>

        <Inputs value={inputs} onChange={setInputs} paths={simulation.paths} currency={whatIf.currency} disabled={busy} />

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={check} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Scale />} {busy ? "Checking…" : latest ? "Check again" : "Check these roads"}
          </Button>
          {live && !model?.configured && (
            <p className="text-[12.5px] text-muted-foreground">
              Jev isn&apos;t set up, so you&apos;ll get the rules&apos; order only. <Link href="/settings#decision-model" className="text-accent-ink underline-offset-4 hover:underline">Add a TypeSafe key</Link>
            </p>
          )}
          {!live && <p className="text-[12.5px] text-muted-foreground">Demo mode can&apos;t reach Jev, so you&apos;ll see the rules&apos; half only.</p>}
          {error && (
            <p role="alert" className="text-[13px] text-destructive">
              {error}
            </p>
          )}
        </div>

        {latest && <Outcome key={latest.id} decision={latest} simulation={simulation} whatIf={whatIf} inputs={inputs} onCompare={onCompare} onRecheck={check} busy={busy} />}

        {decisions.length > 0 && (
          <HistoryList
            decisions={decisions}
            paths={simulation.paths}
            onDelete={() => run((s) => s.deleteDecisions(simulation.id), "Decision history for this simulation deleted")}
          />
        )}
      </div>
    </section>
  );
}

function Heading() {
  return (
    <div className="min-w-0">
      <p className="t-label">Decision check</p>
      <h2 id="decision-heading" className="mt-2 font-display text-[1.6rem] leading-tight">
        Which road holds up for you?
      </h2>
      <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
        Every road is checked against your money, time, risk and debt first. Only the ones that pass are rated, and you always make the call.
      </p>
    </div>
  );
}

function WhoDidWhat({ live, configured, model }: { live: boolean; configured: boolean; model?: string }) {
  return (
    <ul aria-label="Who does what" className="grid gap-1 text-[11.5px] text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <Sparkles className="size-3.5 text-accent-ink" aria-hidden /> Nemotron wrote the roads
      </li>
      <li className="flex items-center gap-1.5">
        <Calculator className="size-3.5 text-info" aria-hidden /> Rules check and calculate
      </li>
      <li className="flex items-center gap-1.5">
        <Cpu className="size-3.5 text-copper" aria-hidden /> {live && configured ? `Jev (${model}) rates the ones that pass` : "Jev rates them (not available here)"}
      </li>
    </ul>
  );
}

function Inputs({ value, onChange, paths, currency, disabled }: { value: DecisionExtras; onChange: (v: DecisionExtras) => void; paths: SimulatedPath[]; currency: string; disabled: boolean }) {
  const [open, setOpen] = React.useState(value.verifiedPrices.length > 0);
  const [draft, setDraft] = React.useState({ optionId: "r0", amount: "", url: "", date: new Date().toISOString().slice(0, 10) });
  const add = () => {
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount < 0 || !/^https?:\/\//.test(draft.url)) return;
    onChange({ ...value, verifiedPrices: [...value.verifiedPrices.filter((p) => p.optionId !== draft.optionId), { optionId: draft.optionId, amount, currency, sourceUrl: draft.url, retrievedAt: draft.date }] });
    setDraft({ ...draft, amount: "", url: "" });
  };
  return (
    <div className="grid gap-3 rounded-xl border border-border bg-surface-2/60 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="t-label">Monthly living costs ({currency})</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Needed for roads that stop your income"
            value={value.monthlyCosts ?? ""}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, monthlyCosts: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2">
          <span className="grid">
            <span className="text-[13px] font-medium">I&apos;d consider a loan</span>
            <span className="t-meta">Off by default. Roads funded by debt fail until you say yes.</span>
          </span>
          <Switch checked={value.allowDebt} disabled={disabled} onCheckedChange={(v) => onChange({ ...value, allowDebt: v })} aria-label="I'd consider a loan" />
        </label>
      </div>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-1.5 self-start text-[12.5px] text-muted-foreground hover:text-foreground">
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
        Prices you looked up {value.verifiedPrices.length > 0 && `(${value.verifiedPrices.length})`}
      </button>
      {open && (
        <div className="grid gap-2">
          <p className="t-meta">A real price with its source replaces the simulator&apos;s estimate for that road. Prices older than 90 days are ignored until you check them again.</p>
          {value.verifiedPrices.map((p) => (
            <div key={p.optionId} className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <Badge tone="success">
                <Link2 aria-hidden /> Looked up
              </Badge>
              <span className="font-medium">{routeOf(paths, p.optionId)?.name}</span>
              <span>{money(p.amount, p.currency)}</span>
              <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="truncate text-accent-ink underline-offset-4 hover:underline">
                {new URL(p.sourceUrl).hostname}
              </a>
              <span className="t-meta">{p.retrievedAt}</span>
              <Button size="icon-sm" variant="ghost" aria-label="Remove price" onClick={() => onChange({ ...value, verifiedPrices: value.verifiedPrices.filter((x) => x.optionId !== p.optionId) })}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,1.4fr)_auto_auto]">
            <select aria-label="Road" value={draft.optionId} onChange={(e) => setDraft({ ...draft, optionId: e.target.value })} className="h-9 min-w-0 rounded-md border border-input bg-surface-2 px-2 text-[13px]">
              {paths.map((p, i) => (
                <option key={p.name} value={`r${i}`}>
                  {p.name}
                </option>
              ))}
            </select>
            <Input aria-label={`Price in ${currency}`} type="number" min={0} placeholder={`Price (${currency})`} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
            <Input aria-label="Source link" type="url" placeholder="https://… where you found it" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
            <Input aria-label="Date you read it" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            <Button size="md" onClick={add} disabled={!draft.amount || !/^https?:\/\//.test(draft.url)}>
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Outcome({ decision, simulation, whatIf, inputs, onCompare, onRecheck, busy }: { decision: DecisionView; simulation: Simulation; whatIf: Situation; inputs: DecisionExtras; onCompare: (i: number) => void; onRecheck: () => void; busy: boolean }) {
  const { run } = useWorkspace();
  const req = decision.request as DecisionRequest;
  const stored = decision.result as DecisionResult;
  const paths = simulation.paths;
  // The rules re-run on every what-if change; Jev's answers are reused unless a fact they read changed.
  const again = React.useMemo(() => rejudge(req, stored, paths, whatIf, inputs), [req, stored, paths, whatIf, inputs]);
  const moved = again.changed.length > 0;
  const view = moved ? again.result : stored;
  const s = STATUS[view.status];
  const selected = routeOf(paths, view.selectedOptionId);
  const top = view.ranking.find((r) => r.optionId === view.selectedOptionId) ?? null;
  const topCheck = again.checks.find((c) => c.optionId === view.selectedOptionId) ?? null;
  const alternatives = view.ranking.filter((r) => r.eligible && r.optionId !== view.selectedOptionId).slice(0, 4);
  const ruledOut = view.ranking.filter((r) => !r.eligible);
  const checks = (simulation.decisions ?? []).filter((d) => d.kind === "branch_condition" && d.parentId === decision.id);
  const [reason, setReason] = React.useState("");
  const [outcome, setOutcome] = React.useState("");

  const choose = (optionId: string | null, kind: "accepted" | "rejected") =>
    run((x) => x.chooseDecisionRoute(decision.id, optionId, kind, reason || undefined), kind === "rejected" ? "Recommendation turned down" : "Road chosen. Your future self will plan with it.");

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      {moved && (
        <div role="status" className="rounded-xl border border-copper/30 bg-copper-wash px-4 py-3 text-[13px]">
          <p className="font-medium text-copper">Your what-if values differ from this check.</p>
          <p className="mt-1 text-muted-foreground">
            The rules re-checked every road instantly.{" "}
            {again.jevNeeded.criteria.length || again.jevNeeded.routes.length
              ? `Jev would need to look again (${[...again.jevNeeded.criteria.map((c) => CRITERION[c]?.label.toLowerCase()), again.jevNeeded.routes.length ? `${again.jevNeeded.routes.length} newly eligible road${again.jevNeeded.routes.length === 1 ? "" : "s"}` : ""].filter(Boolean).join("; ")}).`
              : "Jev's earlier answers still apply, because nothing they read changed."}
          </p>
          <Button size="sm" className="mt-2" onClick={onRecheck} disabled={busy}>
            <Scale /> Save this as a new check
          </Button>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={s.tone}>
              <s.icon aria-hidden /> {s.label}
            </Badge>
            <Badge tone={view.producer === "jev" ? "copper" : "neutral"}>{view.producer === "jev" ? `Rated by Jev · ${stored.meta.model ?? ""}` : "Rules only, no model"}</Badge>
            <span className="ml-auto t-meta">{relativeDay(decision.createdAt)}</span>
          </div>
          {selected ? (
            <>
              <p className="mt-3 t-label">{view.status === "decided" ? "Recommended road" : "Leading road"}</p>
              <h3 className="mt-1 font-display text-[1.5rem] leading-tight break-words">{selected.name}</h3>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {formatSpan(selected.months)} · {formatCost(selected.cost)} · ~{selected.hoursPerWeek} h a week
              </p>
            </>
          ) : (
            <p className="mt-3 font-display text-[1.25rem] leading-snug">{view.status === "pending" ? "Nothing is recommended yet." : "No road can be recommended safely."}</p>
          )}
          <ul className="mt-3 space-y-1.5">
            {view.reasons.map((r) => (
              <li key={r} className="flex gap-2 text-[13px]">
                <span aria-hidden className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                {r}
              </li>
            ))}
          </ul>
          {top && <Scores row={top} />}
          {selected && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={() => choose(view.selectedOptionId, "accepted")}>
                <Check /> Take this road
              </Button>
              <Button size="sm" onClick={() => onCompare(optionIndex(view.selectedOptionId!))}>
                Compare it
              </Button>
              <Button size="sm" variant="ghost" onClick={() => choose(null, "rejected")}>
                <Undo2 /> Not for me
              </Button>
            </div>
          )}
          {(selected || alternatives.length > 0 || ruledOut.length > 0) && <Input className="mt-3" placeholder="Why? (optional, kept with your choice)" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} aria-label="Reason for your choice" />}
          {decision.choice && (
            <p className="mt-3 text-[12.5px] text-muted-foreground">
              {decision.choice.kind === "rejected"
                ? "You turned this recommendation down."
                : `You took "${routeOf(paths, decision.choice.optionId)?.name}"${decision.choice.kind === "override" ? ", your own pick over the recommendation" : ""}.`}
              {decision.choice.reason && ` Your reason: "${decision.choice.reason}".`}
            </p>
          )}
          {decision.choice && decision.choice.kind !== "rejected" && (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (outcome.trim()) void run((x) => x.recordDecisionOutcome(decision.id, outcome), "Noted how it went").then(() => setOutcome(""));
              }}
            >
              <Input placeholder={decision.outcome ? `Last: ${decision.outcome.text}` : "How is it going? (a milestone, a result)"} value={outcome} maxLength={1000} onChange={(e) => setOutcome(e.target.value)} aria-label="How it went" />
              <Button size="md" type="submit" disabled={!outcome.trim()}>
                Save
              </Button>
            </form>
          )}
        </div>

        <div className="grid min-w-0 content-start gap-4">
          {topCheck && selected && (
            <Block title="Hard constraints" icon={Calculator}>
              <ul className="space-y-1.5">
                {topCheck.checks.map((c) => (
                  <li key={c.constraintId} className="flex gap-2 text-[12.5px]">
                    <CheckIcon ok={c.ok} />
                    <span>
                      <span className="font-medium">{CONSTRAINT_LABEL[c.constraintId]}.</span> {c.detail}
                    </span>
                  </li>
                ))}
              </ul>
              {topCheck.calc.notes.map((n) => (
                <p key={n} className="mt-2 text-[12px] text-warning">
                  {n}
                </p>
              ))}
            </Block>
          )}
          {selected && topCheck && (
            <Block title="This would change if" icon={FlaskConical}>
              <ul className="space-y-1">
                {triggersFor(selected, topCheck, whatIf, inputs).map((t) => (
                  <li key={t} className="text-[12.5px]">
                    {t}
                  </li>
                ))}
                <li className="text-[12.5px]">One of its assumptions turns out false (check them below)</li>
              </ul>
            </Block>
          )}
          {req.missingInformation.length > 0 && (
            <Block title="Still needs checking" icon={CircleHelp}>
              <ul className="space-y-1">
                {req.missingInformation.map((m) => (
                  <li key={m.key} className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                    {m.label}
                    {m.blocks.length > 0 && <Badge tone="warning">blocks {m.blocks.length} road{m.blocks.length === 1 ? "" : "s"}</Badge>}
                  </li>
                ))}
              </ul>
            </Block>
          )}
        </div>
      </div>

      {selected && view.selectedOptionId && <Assumptions decisionId={decision.id} optionId={view.selectedOptionId} path={selected} checks={checks} paths={paths} onCompare={onCompare} />}

      {alternatives.length > 0 && (
        <div>
          <p className="t-label">Alternatives that also pass</p>
          <ul className="mt-2 grid gap-2">
            {alternatives.map((r) => {
              const p = routeOf(paths, r.optionId)!;
              return (
                <li key={r.optionId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border bg-surface px-3.5 py-2.5">
                  <span className="min-w-[12rem] flex-1">
                    <span className="block text-[13.5px] font-medium">{p.name}</span>
                    <span className="t-meta">{r.composite !== null ? `Score ${pct(r.composite)}` : "Not rated by Jev"} · {formatCost(p.cost)}</span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => onCompare(optionIndex(r.optionId))}>
                    Compare
                  </Button>
                  <Button size="sm" onClick={() => choose(r.optionId, "accepted")}>
                    Take instead
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {ruledOut.length > 0 && (
        <details className="group rounded-xl border border-border bg-surface-2/50 px-4 py-3">
          <summary className="flex cursor-pointer items-center gap-2 text-[13px] font-medium">
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
            {ruledOut.length} road{ruledOut.length === 1 ? "" : "s"} ruled out by the rules
          </summary>
          <ul className="mt-2 space-y-2">
            {ruledOut.map((r) => {
              const p = routeOf(paths, r.optionId)!;
              const failed = r.checks.filter((c) => c.ok !== true);
              return (
                <li key={r.optionId} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-muted-foreground">{failed.map((c) => c.detail).join(" ")}</span>
                  <button type="button" className="text-accent-ink underline-offset-4 hover:underline" onClick={() => choose(r.optionId, "accepted")}>
                    Take it anyway
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <Facts facts={moved ? [] : req.verifiedFacts} memory={req.relevantMemoryReferences} />
      <Meta result={stored} />
    </div>
  );
}

function Scores({ row }: { row: RankedOption }) {
  return (
    <div className="mt-4 grid gap-2">
      <p className="t-label">Why it ranks here</p>
      {row.scores.map((s) => (
        <div key={s.criterionId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
          <span className="flex min-w-0 items-center gap-1.5 text-[12.5px]">
            {s.by === "jev" ? <Cpu className="size-3.5 shrink-0 text-copper" aria-label="Jev" /> : <Calculator className="size-3.5 shrink-0 text-info" aria-label="Rules" />}
            <span className="truncate">{CRITERION[s.criterionId]?.label}</span>
          </span>
          <span className="t-meta tabular-nums">
            {pct(s.value)}
            {s.confidence !== null && ` · conf. ${s.confidence.toFixed(2)}`}
          </span>
          <span aria-hidden className="col-span-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <span className={cn("block h-full rounded-full", s.by === "jev" ? "bg-copper" : "bg-info")} style={{ width: `${Math.round(s.value * 100)}%` }} />
          </span>
        </div>
      ))}
      {row.composite !== null && <p className="t-meta">Weighted in code: 40% calculated fit, 20% each Jev criterion. Total {pct(row.composite)}.</p>}
    </div>
  );
}

function Assumptions({ decisionId, optionId, path: p, checks, paths, onCompare }: { decisionId: string; optionId: string; path: SimulatedPath; checks: DecisionView[]; paths: SimulatedPath[]; onCompare: (i: number) => void }) {
  const { service, apply } = useWorkspace();
  const [open, setOpen] = React.useState<string | null>(null);
  const [evidence, setEvidence] = React.useState("");
  const [source, setSource] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const last = (a: string) => checks.find((c) => (c.request as { optionId: string; assumption: string }).optionId === optionId && (c.request as { assumption: string }).assumption === a);
  const submit = async (assumption: string) => {
    setBusy(true);
    setError(null);
    try {
      const { workspace } = await service.checkAssumption(decisionId, optionId, assumption, evidence, source || undefined);
      apply(workspace);
      setOpen(null);
      setEvidence("");
      setSource("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The check couldn't run.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-copper/30 bg-copper-wash px-4 py-3">
      <p className="t-label !text-copper">Estimates and assumptions this road rests on</p>
      <p className="mt-1 t-meta">These come from Nemotron and aren&apos;t facts. Add what you found and Jev checks whether it supports each one.</p>
      <ul className="mt-2 space-y-2">
        {p.assumptions.map((a) => {
          const c = last(a)?.result as BranchResult | undefined;
          return (
            <li key={a} className="text-[13px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1">{a}</span>
                {c && <Badge tone={c.outcome === "holds" ? "success" : c.outcome === "fails" ? "destructive" : "neutral"}>{c.outcome === "holds" ? "Supported" : c.outcome === "fails" ? "Contradicted" : c.outcome === "no_evidence" ? "Not checked" : "Unclear"}</Badge>}
                <Button size="sm" variant="ghost" onClick={() => setOpen(open === a ? null : a)} aria-expanded={open === a}>
                  <FlaskConical /> Check
                </Button>
              </div>
              {c && (
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {c.reasons.join(" ")} {c.producer === "jev" ? `(Jev · ${c.meta.model})` : "(not checked by Jev)"}
                  {c.switchTo && (
                    <button type="button" className="ml-1 text-accent-ink underline-offset-4 hover:underline" onClick={() => onCompare(optionIndex(c.switchTo!))}>
                      Compare {routeOf(paths, c.switchTo)?.name}
                    </button>
                  )}
                </p>
              )}
              {open === a && (
                <div className="mt-2 grid gap-2">
                  <Textarea placeholder="What did you find? A quote, a result, a reply from someone who knows." value={evidence} maxLength={2000} onChange={(e) => setEvidence(e.target.value)} aria-label="Evidence" />
                  <div className="flex flex-wrap gap-2">
                    <Input className="min-w-0 flex-1" placeholder="Source (a link or who told you), optional" value={source} maxLength={300} onChange={(e) => setSource(e.target.value)} aria-label="Source" />
                    <Button size="md" onClick={() => submit(a)} disabled={busy || evidence.trim().length < 12}>
                      {busy ? <Loader2 className="animate-spin" /> : <Check />} Check it
                    </Button>
                  </div>
                  {error && (
                    <p role="alert" className="text-[12.5px] text-destructive">
                      {error}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Facts({ facts, memory }: { facts: Fact[]; memory: DecisionRequest["relevantMemoryReferences"] }) {
  if (!facts.length && !memory.length) return null;
  return (
    <details className="group rounded-xl border border-border px-4 py-3">
      <summary className="flex cursor-pointer items-center gap-2 text-[13px] font-medium">
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
        What this check read
      </summary>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {facts.map((f) => (
          <li key={f.key} className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
            <Badge tone={f.stale ? "warning" : PROV[f.provenance].tone}>{f.stale ? "Out of date" : PROV[f.provenance].label}</Badge>
            <span className="text-muted-foreground">{f.label}:</span>
            <span className="font-medium">{f.value === null ? "unknown" : typeof f.value === "boolean" ? (f.value ? "yes" : "no") : `${f.value}${f.unit && f.unit !== "h" ? ` ${f.unit}` : f.unit === "h" ? " h" : ""}`}</span>
            {f.sourceUrl && (
              <a href={f.sourceUrl} target="_blank" rel="noreferrer" className="text-accent-ink underline-offset-4 hover:underline">
                source, {f.retrievedAt}
              </a>
            )}
          </li>
        ))}
        {memory.map((m) => (
          <li key={m.path} className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
            <Badge tone={m.stale ? "warning" : "neutral"}>{m.stale ? "Old note" : "Note"}</Badge>
            <span>{m.title}</span>
            <span className="t-meta">context, not proof</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Meta({ result }: { result: DecisionResult }) {
  const m = result.meta;
  return (
    <p className="t-meta">
      {result.producer === "jev"
        ? `Jev ${m.model}: ${m.calls} request${m.calls === 1 ? "" : "s"}, ${m.inputTokens.toLocaleString()} input tokens, about $${m.costUsd.toFixed(6)}, ${(m.latencyMs / 1000).toFixed(1)} s.`
        : m.error
          ? `Jev wasn't used: ${m.error}`
          : "Jev wasn't used for this check."}{" "}
      The roads came from Nemotron; every calculation came from TOMORA&apos;s rules.
    </p>
  );
}

function HistoryList({ decisions, paths, onDelete }: { decisions: DecisionView[]; paths: SimulatedPath[]; onDelete: () => void }) {
  const ranks = decisions.filter((d) => d.kind === "rank_paths");
  return (
    <details className="group rounded-xl border border-border px-4 py-3">
      <summary className="flex cursor-pointer items-center gap-2 text-[13px] font-medium">
        <History className="size-3.5" aria-hidden /> Decision history ({ranks.length})
      </summary>
      <ul className="mt-2 divide-y divide-border">
        {ranks.map((d) => {
          const r = d.result as DecisionResult;
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-2 py-2 text-[12.5px]">
              <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
              <span>{routeOf(paths, r.selectedOptionId)?.name ?? "No selection"}</span>
              <span className="t-meta">{r.producer === "jev" ? `Jev ${r.meta.model}` : "rules only"}</span>
              {d.choice && <span className="t-meta">· you {d.choice.kind === "rejected" ? "turned it down" : `took ${routeOf(paths, d.choice.optionId)?.name}${d.choice.kind === "override" ? " (override)" : ""}`}</span>}
              {d.outcome && <span className="t-meta">· {d.outcome.text}</span>}
              <span className="ml-auto t-meta">{relativeDay(d.createdAt)}</span>
            </li>
          );
        })}
      </ul>
      <Button size="sm" variant="ghost" className="mt-1" onClick={onDelete}>
        <Trash2 /> Delete this history
      </Button>
    </details>
  );
}

function CheckIcon({ ok }: { ok: boolean | null }) {
  if (ok === true) return <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-label="Passes" />;
  if (ok === false) return <CircleX className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-label="Fails" />;
  return <CircleHelp className="mt-0.5 size-3.5 shrink-0 text-warning" aria-label="Can't be checked" />;
}

function Block({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/60 px-4 py-3">
      <p className="mb-2 flex items-center gap-1.5 t-label">
        <Icon className="size-3.5" aria-hidden /> {title}
      </p>
      {children}
    </div>
  );
}
