"use client";

import { CalendarClock, ChevronDown, Calculator, Eye, Signpost } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { changeConditions, checkpoints, recalculate, warningSignals } from "@/lib/scenario-math";
import { formatSpan, money } from "@/lib/simulator-paths";
import { cn } from "@/lib/utils";
import type { SimulatedPath, Situation } from "@/types";

// What a road looks like over time, worked out in the browser from the road and the what-if (src/lib/scenario-math.ts).
// Everything here is labelled "Recalculated": it is arithmetic on the model's estimate, never new AI analysis.

export const SLIP_OPTIONS = [
  { value: "0", label: "On time" },
  { value: "3", label: "+3 mo" },
  { value: "6", label: "+6 mo" },
] as const;

/** "What if I miss the first milestone?": shifts every road's timeline by the slip. */
export function SlipControl({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-surface-2/50 px-4 py-3">
      <CalendarClock className="size-4 text-accent-ink" aria-hidden />
      <p className="text-[13px] font-medium">If the first milestone slips</p>
      <span className="t-meta">Recalculated in your browser; no model call.</span>
      <Segmented size="sm" label="If the first milestone slips" value={String(value)} onValueChange={(v) => onChange(Number(v))} options={[...SLIP_OPTIONS]} className="ml-auto" />
    </div>
  );
}

/** Timeline, funding, checkpoints, warning signs and when to switch, for one road under the current what-if. */
export function RoadOutlook({ path: p, paths, situation, slipMonths }: { path: SimulatedPath; paths: SimulatedPath[]; situation: Situation | null; slipMonths: number }) {
  const [open, setOpen] = React.useState(false);
  const r = React.useMemo(() => recalculate(p, situation, { slipMonths }), [p, situation, slipMonths]);
  const marks = React.useMemo(() => checkpoints(r.months), [r.months]);
  const signals = warningSignals(p, r);
  const switches = changeConditions(p, paths);
  const id = React.useId();

  return (
    <div className="mt-4 rounded-xl border border-border">
      {(r.changed || (r.funds && r.funds.shortfall > 0)) && (
        <div className="border-b border-border px-3.5 py-3">
          <p className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <Calculator className="size-3.5 text-accent-ink" aria-hidden />
            <span className="font-medium">For your what-if</span>
            <Badge tone="accent">Recalculated</Badge>
          </p>
          {r.changed && (
            <p className="mt-1.5 text-[13px]">
              About <span className="font-display text-[15px] tabular-nums">{formatSpan(r.months)}</span>
              <span className="text-muted-foreground"> instead of {formatSpan(p.months)}</span>
            </p>
          )}
          {r.funds && r.funds.shortfall > 0 && situation && <p className="mt-1 text-[12.5px] text-muted-foreground">Funding gap of about {money(r.funds.shortfall, situation.currency)}.</p>}
          <ul className="mt-1.5 space-y-1">
            {r.notes.map((n) => (
              <li key={n} className="text-[12px] text-muted-foreground">
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[12.5px] font-medium transition-colors hover:bg-surface-2/60">
        <Signpost className="size-3.5 text-muted-foreground" aria-hidden />
        Checkpoints, warning signs and when to switch
        <ChevronDown className={cn("ml-auto size-3.5 text-muted-foreground transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      <div id={id} hidden={!open} className="space-y-4 border-t border-border px-3.5 py-3.5">
        <div>
          <p className="t-label">Checkpoints</p>
          <ol className="mt-2 space-y-2.5 border-l border-border-strong pl-3.5">
            {marks.map((m) => (
              <li key={m.label} className="relative text-[12.5px]">
                <span aria-hidden className="absolute top-[0.45em] -left-[1.1rem] size-1.5 rounded-full bg-accent" />
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{m.label}</span>
                  <span className="t-meta">
                    {m.window.from === m.window.to ? m.window.from : `${m.window.from} – ${m.window.to}`}
                  </span>
                </p>
                <p className="text-muted-foreground">{m.prompt}</p>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <p className="flex items-center gap-1.5 t-label">
            <Eye className="size-3.5" aria-hidden /> Early warning signs
          </p>
          <ul className="mt-1.5 space-y-1">
            {signals.map((s) => (
              <li key={s} className="flex gap-2 text-[12.5px]">
                <span aria-hidden className="mt-[0.5em] size-1.5 shrink-0 rounded-full bg-warning" />
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="t-label">Consider changing direction if</p>
          <ul className="mt-1.5 space-y-1">
            {switches.map((s) => (
              <li key={s} className="flex gap-2 text-[12.5px]">
                <span aria-hidden className="mt-[0.5em] size-1.5 shrink-0 rounded-full bg-copper" />
                {s}
              </li>
            ))}
          </ul>
        </div>
        <p className="t-meta">Worked out from this road&apos;s own estimate and assumptions. Dates are review windows, not predictions.</p>
      </div>
    </div>
  );
}
