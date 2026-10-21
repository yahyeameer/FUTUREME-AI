import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * TOMORA's mark: an old clock where the past and the future turn together. The bronze point is where you stand today,
 * the champagne ring is the future you're steering toward, joined by one trajectory. Around them, two dials turn in
 * opposite directions: the outer one forward (the future), the inner bronze one back (the past). A light circles the
 * future ring like a second hand. Everything speeds up and glows brighter when the brand link (`group/brand`) is
 * hovered. Decorative; the link around it carries the name.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/70 bg-gradient-to-br from-white/90 to-white/30 backdrop-blur",
        "shadow-[inset_0_1px_0_rgb(255_255_255/0.9),0_4px_12px_-6px_rgb(120_90_30/0.55)] transition-shadow duration-300 group-hover/brand:shadow-[inset_0_1px_0_rgb(255_255_255/0.9),0_0_16px_-2px_var(--accent)]",
        "dark:border-white/15 dark:from-white/[0.16] dark:to-white/[0.03] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_0_14px_-5px_var(--accent)]",
        className,
      )}
    >
      <span className="absolute -inset-1 animate-orbit bg-[conic-gradient(from_0deg,transparent,rgb(200_183_143/0.65),transparent_40%,rgb(168_112_63/0.45),transparent_75%)] opacity-60 blur-[6px] transition-opacity group-hover/brand:opacity-100 [animation-duration:8s]" />
      <ClockFace className="relative size-[22px]" animated />
    </span>
  );
}

/**
 * The clock itself, without the glass tile. Animated in the app; still where motion would be noise (the welcome page
 * caption, the favicon, the share image use the same drawing).
 */
export function ClockFace({ className, animated = false }: { className?: string; animated?: boolean }) {
  const spin = (cls: string) => (animated ? cls : undefined);
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      {/* The future dial: twelve hour marks, the quarters longer, with a small diamond at twelve. Turns forward. */}
      <g className={spin("origin-center animate-orbit [animation-duration:40s] group-hover/brand:[animation-duration:6s]")} style={{ transformBox: "view-box" }} stroke="currentColor" strokeOpacity=".4" strokeWidth=".6">
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          const r1 = i % 3 === 0 ? 9.4 : 10.3;
          return <line key={i} x1={round(12 + Math.cos(a) * r1)} y1={round(12 + Math.sin(a) * r1)} x2={round(12 + Math.cos(a) * 11.4)} y2={round(12 + Math.sin(a) * 11.4)} />;
        })}
        <path d="M12 0.4 L12.8 1.4 L12 2.4 L11.2 1.4 Z" fill="var(--accent)" stroke="none" />
      </g>
      {/* The past dial: a bronze ring of beads, turning back. */}
      <g className={spin("origin-center animate-orbit [animation-direction:reverse] [animation-duration:28s] group-hover/brand:[animation-duration:4s]")} style={{ transformBox: "view-box" }} fill="var(--bronze)">
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
          return <circle key={i} cx={round(12 + Math.cos(a) * 8.1)} cy={round(12 + Math.sin(a) * 8.1)} r={i % 3 === 0 ? 0.55 : 0.32} opacity={i % 3 === 0 ? 0.9 : 0.55} />;
        })}
      </g>
      {/* Today and the future, on one trajectory. */}
      <path d="M7.6 15.6 L14.6 8.6" stroke="currentColor" strokeOpacity=".45" strokeWidth="1.1" strokeLinecap="round" strokeDasharray="1.1 2" />
      <circle cx="7.6" cy="15.6" r="2.1" fill="var(--bronze)" />
      <circle cx="14.6" cy="8.6" r="3.7" stroke="var(--accent)" strokeWidth="1.5" />
      {/* The second hand: a light running the future ring. */}
      <g className={spin("origin-[14.6px_8.6px] animate-orbit [animation-duration:5s] group-hover/brand:[animation-duration:1.6s]")} style={{ transformBox: "view-box" }}>
        <circle cx="14.6" cy="4.1" r="1" fill="var(--accent)" className="drop-shadow-[0_0_2px_var(--accent)]" />
      </g>
    </svg>
  );
}

/** Kept for places that want the still clock at text size. */
export function BrandSymbol({ className }: { className?: string }) {
  return <ClockFace className={className} />;
}

/** The wordmark: TOMORA in the display serif, widely spaced. Optionally led by the clock mark. */
export function Wordmark({ className, withSymbol = false }: { className?: string; withSymbol?: boolean }) {
  return (
    <span className={cn("group/brand inline-flex items-center gap-2.5 text-foreground", className)}>
      {withSymbol && <Mark />}
      <span className="font-display text-[17px] leading-none tracking-[0.22em]" style={{ marginRight: "-0.22em" }}>
        {BRAND.name}
      </span>
    </span>
  );
}

// Trig results can differ in the last digit between server and browser, which breaks hydration.
function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
