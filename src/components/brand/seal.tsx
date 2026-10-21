"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A round seal: words running around a ring that turns slowly (faster on hover), with anything in the middle.
 * The logo's dial motif, sized for page furniture: the Daily's ears, the roadmap's countdown.
 */
export function Seal({ text, children, size = 92, className }: { text: string; children?: React.ReactNode; size?: number; className?: string }) {
  const uid = React.useId().replace(/:/g, "");
  return (
    <div className={cn("group/seal relative flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden className="absolute inset-0 size-full overflow-visible">
        <defs>
          <path id={`seal-${uid}`} d="M50 50 m -40 0 a 40 40 0 1 1 80 0 a 40 40 0 1 1 -80 0" />
        </defs>
        <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeOpacity="0.25" />
        <circle cx="50" cy="50" r="31" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeDasharray="1.5 3" />
        <g className="origin-center animate-[orbit_30s_linear_infinite] group-hover/seal:[animation-duration:6s]" style={{ transformBox: "view-box" }}>
          <text fill="currentColor" style={{ fontFamily: "var(--font-mono)", fontSize: 8.4, letterSpacing: "0.18em" }}>
            <textPath href={`#seal-${uid}`} textLength="246" lengthAdjust="spacing">
              {text}
            </textPath>
          </text>
        </g>
      </svg>
      <div className="relative flex flex-col items-center justify-center text-center transition-transform duration-500 group-hover/seal:scale-110">{children}</div>
    </div>
  );
}
