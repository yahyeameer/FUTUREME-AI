"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/use-now";

/**
 * The frame around the Presence: a fine dial with today's date on the left of the horizon and the year you named on
 * the right. It stays still. While the future self is working, one short champagne arc travels the dial, so motion
 * always means work in progress. Everything here is decorative; the Presence inside carries the meaning for screen
 * readers.
 */
export function Orb({ size = 280, className, children, horizonYear, active = false }: { size?: number; className?: string; children?: React.ReactNode; horizonYear?: number; active?: boolean }) {
  const now = useNow();
  const today = now ? now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Today";
  const small = size < 200;

  return (
    <div className={cn("relative isolate flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <div aria-hidden className="absolute inset-[12%] -z-10 rounded-full bg-[radial-gradient(circle,var(--accent-wash),transparent_70%)]" />
      <svg viewBox="0 0 200 200" aria-hidden className="absolute inset-0 size-full overflow-visible text-foreground">
        <circle cx="100" cy="100" r="88" fill="none" stroke="currentColor" strokeOpacity="0.1" />
        <g stroke="currentColor">
          {Array.from({ length: 60 }, (_, i) => {
            const a = (i / 60) * Math.PI * 2;
            const major = i % 5 === 0;
            const r1 = major ? 80 : 83;
            return (
              <line
                key={i}
                x1={round(100 + Math.cos(a) * r1)}
                y1={round(100 + Math.sin(a) * r1)}
                x2={round(100 + Math.cos(a) * 86)}
                y2={round(100 + Math.sin(a) * 86)}
                strokeOpacity={major ? 0.28 : 0.1}
                strokeWidth={major ? 0.9 : 0.6}
              />
            );
          })}
        </g>
        {active && (
          <g className="origin-center animate-[orbit_2.4s_linear_infinite]" style={{ transformBox: "view-box" }}>
            <path d="M 100 12 A 88 88 0 0 1 162.2 37.8" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
          </g>
        )}
        {!small && (
          <g style={{ fontFamily: "var(--font-mono)", fontSize: 6.5, letterSpacing: "0.1em" }}>
            <text x="16" y="196" fill="currentColor" fillOpacity="0.5">
              {today.toUpperCase()}
            </text>
            <text x="184" y="196" textAnchor="end" fill="var(--accent-ink)">
              {horizonYear ? `${horizonYear}` : "LATER"}
            </text>
          </g>
        )}
      </svg>
      <div className="relative flex items-center justify-center">{children}</div>
    </div>
  );
}

// Trig results can differ in the last digit between server and browser, which breaks hydration.
function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
