import { cn } from "@/lib/utils";

/**
 * FutureMe's mark: the present (a copper point) and the future (a citron ring) on one trajectory, set in a glass tile.
 * A light circles the future ring like a second hand and the dial around it turns slowly; both speed up when the
 * brand link (`group/brand`) is hovered.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-[9px] border border-white/70 bg-gradient-to-br from-white/90 to-white/30 backdrop-blur",
        "shadow-[inset_0_1px_0_rgb(255_255_255/0.9),0_4px_12px_-6px_rgb(120_90_30/0.55)] transition-shadow duration-300 group-hover/brand:shadow-[inset_0_1px_0_rgb(255_255_255/0.9),0_0_16px_-2px_var(--accent)]",
        "dark:border-white/15 dark:from-white/[0.16] dark:to-white/[0.03] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_0_14px_-6px_var(--accent)]",
        className,
      )}
    >
      <span className="absolute -inset-1 animate-orbit bg-[conic-gradient(from_0deg,transparent,rgb(196_214_106/0.55),transparent_40%,rgb(187_128_92/0.4),transparent_75%)] opacity-50 blur-[6px] transition-opacity group-hover/brand:opacity-90 [animation-duration:8s]" />
      <svg viewBox="0 0 24 24" fill="none" className="relative size-5">
        <g className="origin-center animate-orbit [animation-duration:40s] group-hover/brand:[animation-duration:6s]" style={{ transformBox: "view-box" }} stroke="currentColor" strokeOpacity=".35" strokeWidth=".6">
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            const r1 = i % 3 === 0 ? 9.6 : 10.4;
            return <line key={i} x1={round(12 + Math.cos(a) * r1)} y1={round(12 + Math.sin(a) * r1)} x2={round(12 + Math.cos(a) * 11.4)} y2={round(12 + Math.sin(a) * 11.4)} />;
          })}
        </g>
        <path d="M7 16 L15.5 7.5" stroke="currentColor" strokeOpacity=".4" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="1.2 2.2" />
        <circle cx="7" cy="16" r="2.4" fill="var(--copper)" />
        <circle cx="15.5" cy="7.5" r="4.4" stroke="var(--accent)" strokeWidth="1.6" />
        <g className="origin-[15.5px_7.5px] animate-orbit [animation-duration:5s] group-hover/brand:[animation-duration:1.6s]" style={{ transformBox: "view-box" }}>
          <circle cx="15.5" cy="1.9" r="1.15" fill="var(--accent)" className="drop-shadow-[0_0_2px_var(--accent)]" />
        </g>
      </svg>
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline text-[15px] font-semibold tracking-[-0.02em]", className)}>
      Future
      <span className="text-gradient font-display text-[1.2em] font-normal tracking-normal italic">Me</span>
    </span>
  );
}

// Trig results can differ in the last digit between server and browser, which breaks hydration.
function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
