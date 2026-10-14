"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The FutureMe presence: two circles, today and the future you described.
 * Their overlap is driven by real task completion (`convergence`), so the image changes only when the record does.
 * It moves only while the agent is working.
 */
export function Presence({
  convergence,
  state = "idle",
  size = 200,
  horizonLabel,
  className,
}: {
  convergence: number;
  state?: "idle" | "thinking";
  size?: number;
  horizonLabel?: string;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const c = Math.min(1, Math.max(0, convergence));
  const offset = 30 - c * 20; // 30 apart when nothing is done, 10 when everything is
  const r = 46;
  const ticks = Array.from({ length: 72 }, (_, i) => i);

  return (
    <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={`Today and your future self. ${Math.round(c * 100)}% of planned tasks are done.`} className={cn("overflow-visible", className)}>
      <defs>
        <clipPath id={`present-${uid}`}>
          <motion.circle initial={false} animate={{ cx: 100 - offset }} transition={{ type: "spring", stiffness: 60, damping: 18 }} cy="100" r={r} />
        </clipPath>
        <radialGradient id={`glow-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Instrument dial: a quiet reference frame */}
      <g stroke="currentColor" className="text-border-strong">
        {ticks.map((i) => {
          const a = (i / ticks.length) * Math.PI * 2;
          const long = i % 6 === 0;
          const r1 = long ? 86 : 89;
          return <line key={i} x1={100 + Math.cos(a) * r1} y1={100 + Math.sin(a) * r1} x2={100 + Math.cos(a) * 92} y2={100 + Math.sin(a) * 92} strokeWidth={long ? 1 : 0.6} />;
        })}
      </g>
      <line x1="14" y1="100" x2="186" y2="100" stroke="currentColor" className="text-border" strokeWidth="0.6" strokeDasharray="2 4" />
      <circle cx="100" cy="100" r="70" fill={`url(#glow-${uid})`} />

      {/* Today */}
      <motion.circle initial={false} animate={{ cx: 100 - offset }} transition={{ type: "spring", stiffness: 60, damping: 18 }} cy="100" r={r} fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1" />
      {/* The overlap: where today already looks like the future */}
      <g clipPath={`url(#present-${uid})`}>
        <motion.circle initial={false} animate={{ cx: 100 + offset }} transition={{ type: "spring", stiffness: 60, damping: 18 }} cy="100" r={r} fill="var(--accent)" fillOpacity="0.14" />
      </g>
      {/* The future */}
      <motion.circle initial={false} animate={{ cx: 100 + offset }} transition={{ type: "spring", stiffness: 60, damping: 18 }} cy="100" r={r} fill="none" stroke="var(--accent)" strokeWidth="1.4" />

      {/* Working state: a short arc travels the future circle */}
      {state === "thinking" && !reduce && (
        <motion.g initial={false} animate={{ x: offset }}>
          <g className="origin-[100px_100px] animate-sweep">
            <path d={`M ${100 + r + 5} 100 A ${r + 5} ${r + 5} 0 0 1 ${100 + (r + 5) * Math.cos(0.9)} ${100 + (r + 5) * Math.sin(0.9)}`} stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" fill="none" />
          </g>
        </motion.g>
      )}

      <motion.circle initial={false} animate={{ cx: 100 - offset }} cy="100" r="2.5" fill="currentColor" />
      {horizonLabel && (
        <>
          <motion.text initial={false} animate={{ x: 100 - offset - r + 2 }} y="172" className="fill-subtle font-mono text-[8px] tracking-wider uppercase">
            Today
          </motion.text>
          <motion.text initial={false} animate={{ x: 100 + offset + r - 2 }} y="172" textAnchor="end" className="fill-accent-ink font-mono text-[8px] tracking-wider uppercase">
            {horizonLabel}
          </motion.text>
        </>
      )}
    </svg>
  );
}
