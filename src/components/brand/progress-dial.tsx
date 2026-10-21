"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Progress as a dial in the logo's style: ticks, a citron arc that fills to `value` (0 to 1) with a light at its tip,
 * and a dashed outer ring that turns. The arc draws itself on mount and the whole dial brightens on hover.
 */
export function ProgressDial({ value, size = 120, className, children, label }: { value: number; size?: number; className?: string; children?: React.ReactNode; label: string }) {
  const v = Math.min(1, Math.max(0, value));
  const r = 40;
  const c = 2 * Math.PI * r;
  const tip = v * Math.PI * 2 - Math.PI / 2;
  const [drawn, setDrawn] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div role="img" aria-label={label} className={cn("group/dial relative flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }}>
      <div aria-hidden className="absolute inset-[12%] -z-10 rounded-full opacity-0 blur-xl transition-opacity duration-500 group-hover/dial:opacity-70" style={{ background: "radial-gradient(circle, var(--accent), transparent 70%)" }} />
      <svg viewBox="0 0 100 100" aria-hidden className="absolute inset-0 size-full overflow-visible">
        <g className="origin-center animate-[orbit_40s_linear_infinite] group-hover/dial:[animation-duration:8s]" style={{ transformBox: "view-box" }}>
          <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeDasharray="2 4" />
        </g>
        <g stroke="currentColor">
          {Array.from({ length: 40 }, (_, i) => {
            const a = (i / 40) * Math.PI * 2 - Math.PI / 2;
            const lit = i / 40 < v;
            return <line key={i} x1={round(50 + Math.cos(a) * 44)} y1={round(50 + Math.sin(a) * 44)} x2={round(50 + Math.cos(a) * 46)} y2={round(50 + Math.sin(a) * 46)} strokeOpacity={lit ? 0.55 : 0.15} strokeWidth="0.7" />;
          })}
        </g>
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="4" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${round(c)} ${round(c)}`}
          strokeDashoffset={drawn ? round(c * (1 - v)) : round(c)}
          transform="rotate(-90 50 50)"
          className="drop-shadow-[0_0_4px_var(--accent)] transition-[stroke-dashoffset] duration-[1400ms] ease-[cubic-bezier(0.2,0.7,0.2,1)]"
        />
        {v > 0 && <circle cx={round(50 + Math.cos(tip) * r)} cy={round(50 + Math.sin(tip) * r)} r="3.2" fill="var(--accent)" className={cn("drop-shadow-[0_0_6px_var(--accent)] transition-opacity delay-1000 duration-500", drawn ? "opacity-100" : "opacity-0")} />}
      </svg>
      <div className="relative flex flex-col items-center justify-center text-center transition-transform duration-500 group-hover/dial:scale-110">{children}</div>
    </div>
  );
}

// Trig results can differ in the last digit between server and browser, which breaks hydration.
function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
