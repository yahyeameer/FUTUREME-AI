"use client";

import { motion, useReducedMotionConfig } from "motion/react";
import * as React from "react";
import { BrandSymbol } from "@/components/brand/mark";
import { KIND_LABEL, formatSpan, standInSimulation, toPaths } from "@/lib/simulator-paths";
import { cn } from "@/lib/utils";

// The hero's product preview: one starting point, three clearly different roads. The roads are the app's own demo
// template (the same one demo mode and the stand-in model use), shown as an example, never as anyone's real result.

export const EXAMPLE_GOAL = "Move into data analysis";
const KINDS = ["self_study", "work_and_study", "formal_education"] as const;

export function exampleRoads() {
  const all = toPaths(standInSimulation({ goal: EXAMPLE_GOAL }).paths);
  return KINDS.map((k) => all.find((p) => p.kind === k)!).filter(Boolean);
}

const ENDS = [
  { x: 372, y: 54 },
  { x: 392, y: 150 },
  { x: 372, y: 246 },
];
const RISK_LABEL = { low: "Lower risk", medium: "Some risk", high: "Higher risk" } as const;

export function BranchingPreview() {
  const roads = React.useMemo(() => exampleRoads(), []);
  const [active, setActive] = React.useState(1);
  const reduce = useReducedMotionConfig();
  const road = roads[active];

  return (
    <figure className="card relative overflow-hidden p-4 sm:p-6" aria-labelledby="preview-caption">
      <div className="flex items-center justify-between gap-3">
        <p className="t-eyebrow">Example</p>
        <p className="t-meta">Goal: {EXAMPLE_GOAL}</p>
      </div>

      <svg viewBox="0 0 440 300" className="mt-3 w-full overflow-visible" role="img" aria-label={`Today branches into ${roads.length} possible roads: ${roads.map((r) => r.name).join(", ")}.`}>
        {/* The horizon: today on the left, possible futures on the right. */}
        <line x1="20" y1="150" x2="420" y2="150" stroke="var(--border)" strokeDasharray="2 5" />
        <text x="20" y="290" className="fill-subtle font-mono text-[9px] tracking-[0.12em]">
          TODAY
        </text>
        <text x="420" y="290" textAnchor="end" className="fill-subtle font-mono text-[9px] tracking-[0.12em]">
          POSSIBLE FUTURES
        </text>
        {ENDS.map((e, i) => {
          const on = i === active;
          return (
            <g key={i}>
              <motion.path
                d={`M64 150 C 170 150, 220 ${e.y}, ${e.x - 18} ${e.y}`}
                fill="none"
                stroke={on ? "var(--accent)" : "var(--border-strong)"}
                strokeWidth={on ? 2 : 1.25}
                strokeLinecap="round"
                initial={reduce ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 0.25 + i * 0.15, duration: 0.9, ease: [0.2, 0.7, 0.2, 1] }}
              />
              <circle cx={e.x} cy={e.y} r={on ? 17 : 14} fill="var(--surface)" stroke={on ? "var(--accent)" : "var(--border-strong)"} strokeWidth={on ? 1.6 : 1} className="transition-all duration-300" />
              <text x={e.x} y={e.y + 4.5} textAnchor="middle" className={cn("font-display text-[13px] italic", on ? "fill-foreground" : "fill-subtle")}>
                {String.fromCharCode(65 + i)}
              </text>
            </g>
          );
        })}
        <circle cx="52" cy="150" r="13" fill="var(--foreground)" />
        <circle cx="52" cy="150" r="4" fill="var(--background)" />
      </svg>

      <div role="tablist" aria-label="Example roads" className="mt-2 grid grid-cols-3 gap-1.5">
        {roads.map((r, i) => (
          <button
            key={r.name}
            role="tab"
            type="button"
            id={`road-tab-${i}`}
            aria-selected={i === active}
            aria-controls="road-panel"
            onClick={() => setActive(i)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const next = (i + (e.key === "ArrowRight" ? 1 : roads.length - 1)) % roads.length;
                setActive(next);
                document.getElementById(`road-tab-${next}`)?.focus();
              }
            }}
            tabIndex={i === active ? 0 : -1}
            className={cn(
              "min-h-11 rounded-lg border px-2 py-2 text-left text-[12px] leading-tight transition-colors duration-200",
              i === active ? "border-accent/60 bg-accent-wash text-foreground" : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
            )}
          >
            <span className="font-display text-[13px] italic">{String.fromCharCode(65 + i)}</span> · {KIND_LABEL[r.kind]}
          </button>
        ))}
      </div>

      <motion.div key={active} id="road-panel" role="tabpanel" aria-labelledby={`road-tab-${active}`} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }} className="mt-4 grid gap-3">
        <div>
          <p className="text-[15px] font-medium">{road.name}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            <span className="font-serif italic">If you take this road: </span>
            {road.summary}
          </p>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-surface-2/60 text-center">
          {[
            ["Time", formatSpan(road.months)],
            ["Each week", `~${road.hoursPerWeek} h`],
            ["Risk", RISK_LABEL[road.riskLevel]],
          ].map(([k, v]) => (
            <div key={k} className="px-2 py-2.5">
              <dt className="t-meta">{k}</dt>
              <dd className="mt-0.5 font-display text-[15px] leading-tight">{v}</dd>
            </div>
          ))}
        </dl>
        <div>
          <p className="t-label">Holds only if</p>
          <ul className="mt-1 space-y-0.5">
            {road.assumptions.slice(0, 2).map((a) => (
              <li key={a} className="flex gap-2 text-[12.5px]">
                <span aria-hidden className="mt-[0.5em] size-1 shrink-0 rounded-full bg-accent" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      </motion.div>

      <figcaption id="preview-caption" className="mt-4 flex items-start gap-2 border-t border-border pt-3 text-[11.5px] text-subtle">
        <BrandSymbol className="mt-px size-3.5 shrink-0 text-subtle" />
        An illustration from TOMORA&apos;s built-in example template. Your roads are generated from your own situation, and they are possibilities, not predictions.
      </figcaption>
    </figure>
  );
}
