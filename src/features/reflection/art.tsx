"use client";

import { motion, useMotionValue, useReducedMotionConfig, useSpring, useTransform } from "motion/react";
import * as React from "react";
import { cn } from "@/lib/utils";

// The plates are printed at dusk in both themes, like photographs in a magazine: they don't follow the page colours.
export const DUSK = { night: "#0c0d0e", deep: "#17191b", ember: "#3a2a24", copper: "#c98d67", rust: "#a15f39", citron: "#c4d66a", glow: "#e9f2b0", ivory: "#f5f2ea" };
export const EASE = [0.2, 0.7, 0.2, 1] as const;

/** Deterministic scatter, so the stars sit in the same place on every render. */
export function scatter(count: number, seed: number) {
  let s = seed;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: count }, () => ({ x: rand(), y: rand(), r: 0.4 + rand() * 1.1, o: 0.25 + rand() * 0.6 }));
}

export function Plate({ children, caption, className, ...props }: React.ComponentProps<"figure"> & { caption: React.ReactNode }) {
  return (
    <figure className={cn("relative", className)} {...props}>
      <div className="ring-gradient relative overflow-hidden rounded-[22px] shadow-[var(--shadow-lift)]">{children}</div>
      <figcaption className="mt-3 flex items-baseline gap-2 t-meta">{caption}</figcaption>
    </figure>
  );
}

/** The first cover: a sun rising over three ridges, a road running toward it, and the year in the sky. */
export function HorizonScene({ year }: { year: number }) {
  const uid = React.useId().replace(/:/g, "");
  const reduce = useReducedMotionConfig();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 60, damping: 20 });
  const sy = useSpring(py, { stiffness: 60, damping: 20 });
  const farX = useTransform(sx, (v) => v * -6);
  const farY = useTransform(sy, (v) => v * -4);
  const midX = useTransform(sx, (v) => v * 5);
  const nearX = useTransform(sx, (v) => v * 12);
  const stars = React.useMemo(() => scatter(46, 7), []);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };

  return (
    <div
      onPointerMove={onMove}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
      }}
    >
      <svg viewBox="0 0 400 480" className="block h-auto w-full" role="img" aria-label={`Illustration: a sun rising over the hills toward ${year}`}>
        <defs>
          <linearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={DUSK.night} />
            <stop offset="0.5" stopColor="#241c19" />
            <stop offset="0.78" stopColor={DUSK.rust} />
            <stop offset="1" stopColor={DUSK.copper} />
          </linearGradient>
          <radialGradient id={`sun-${uid}`} cx="50%" cy="45%" r="55%">
            <stop offset="0" stopColor={DUSK.glow} />
            <stop offset="0.55" stopColor={DUSK.citron} />
            <stop offset="1" stopColor={DUSK.copper} />
          </radialGradient>
          <radialGradient id={`halo-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor={DUSK.citron} stopOpacity="0.45" />
            <stop offset="1" stopColor={DUSK.citron} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`road-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={DUSK.citron} stopOpacity="0.05" />
            <stop offset="1" stopColor={DUSK.citron} stopOpacity="0.32" />
          </linearGradient>
        </defs>

        <rect width="400" height="480" fill={`url(#sky-${uid})`} />

        <motion.g style={{ x: farX, y: farY }}>
          {stars.map((s, i) => (
            <circle key={i} cx={s.x * 400} cy={s.y * 230} r={s.r} fill={DUSK.ivory} opacity={s.o} className={cn(i % 5 === 0 && "animate-breathe")} style={{ transformOrigin: `${s.x * 400}px ${s.y * 230}px` }} />
          ))}
          <text x="200" y="168" textAnchor="middle" fill="none" stroke={DUSK.ivory} strokeOpacity="0.28" strokeWidth="1" style={{ fontFamily: "var(--font-display)", fontSize: 150, letterSpacing: "-0.02em" }}>
            {year}
          </text>
        </motion.g>

        <motion.g initial={{ y: 70, opacity: 0.4 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 2.2, ease: EASE, delay: 0.2 }}>
          <circle cx="200" cy="318" r="150" fill={`url(#halo-${uid})`} />
          <circle cx="200" cy="318" r="118" fill="none" stroke={DUSK.citron} strokeOpacity="0.18" />
          <circle cx="200" cy="318" r="96" fill="none" stroke={DUSK.citron} strokeOpacity="0.3" strokeDasharray="2 6" />
          <circle cx="200" cy="318" r="74" fill={`url(#sun-${uid})`} />
        </motion.g>

        <motion.path style={{ x: farX }} d="M-20 330 C 40 300 80 296 130 312 S 220 290 270 300 S 360 286 420 304 L 420 480 L -20 480 Z" fill={DUSK.ember} />
        <motion.path style={{ x: midX }} d="M-20 356 C 50 330 110 342 160 352 S 260 326 320 338 S 390 346 420 336 L 420 480 L -20 480 Z" fill="#241b18" />
        <motion.g style={{ x: nearX }}>
          <path d="M-30 392 C 60 372 120 384 175 380 C 230 376 300 360 430 384 L 430 480 L -30 480 Z" fill={DUSK.night} />
          <path d="M150 480 C 176 440 196 410 197 381 L 203 381 C 206 410 232 444 262 480 Z" fill={`url(#road-${uid})`} />
          <motion.path
            d="M206 480 C 204 446 201 412 200 382"
            fill="none"
            stroke={DUSK.citron}
            strokeWidth="1.6"
            strokeDasharray="6 7"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.6, ease: EASE, delay: 0.9 }}
          />
        </motion.g>
        <text x="20" y="462" fill={DUSK.ivory} fillOpacity="0.55" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em" }}>
          TODAY
        </text>
        <text x="380" y="462" textAnchor="end" fill={DUSK.citron} fillOpacity="0.85" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em" }}>
          {year}
        </text>
      </svg>
    </div>
  );
}

/** Plate II: a fixed point to steer by. A constellation that draws itself toward one bright star. */
export function NorthStarPlate({ className }: { className?: string }) {
  const uid = React.useId().replace(/:/g, "");
  const stars = React.useMemo(() => scatter(60, 23), []);
  const points: [number, number][] = [
    [46, 236],
    [92, 196],
    [84, 142],
    [140, 118],
    [176, 150],
    [212, 92],
  ];
  const line = points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  return (
    <Plate
      className={className}
      caption={
        <>
          <span className="text-copper">Plate II.</span> A fixed point to steer by.
        </>
      }
    >
      <svg viewBox="0 0 300 300" className="block h-auto w-full" role="img" aria-label="Illustration: a constellation leading to one bright star">
        <defs>
          <radialGradient id={`ns-sky-${uid}`} cx="72%" cy="28%" r="90%">
            <stop offset="0" stopColor="#2b2420" />
            <stop offset="0.6" stopColor={DUSK.deep} />
            <stop offset="1" stopColor={DUSK.night} />
          </radialGradient>
          <radialGradient id={`ns-glow-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor={DUSK.citron} stopOpacity="0.55" />
            <stop offset="1" stopColor={DUSK.citron} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="300" height="300" fill={`url(#ns-sky-${uid})`} />
        {stars.map((s, i) => (
          <circle key={i} cx={s.x * 300} cy={s.y * 300} r={s.r * 0.8} fill={DUSK.ivory} opacity={s.o * 0.7} />
        ))}
        <circle cx="236" cy="70" r="58" fill={`url(#ns-glow-${uid})`} className="animate-breathe" style={{ transformOrigin: "236px 70px" }} />
        <motion.path d={`${line} L236 70`} fill="none" stroke={DUSK.copper} strokeOpacity="0.7" strokeWidth="1" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2.4, ease: EASE, delay: 0.3 }} />
        {points.map(([x, y], i) => (
          <motion.circle key={i} cx={x} cy={y} r="2.6" fill={DUSK.ivory} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + i * 0.35 }} />
        ))}
        <motion.path
          d="M236 40 L242 64 L266 70 L242 76 L236 100 L230 76 L206 70 L230 64 Z"
          fill={DUSK.glow}
          initial={{ scale: 0, rotate: -45 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 2.3, type: "spring", stiffness: 120, damping: 12 }}
        />
        <text x="22" y="34" fill={DUSK.ivory} fillOpacity="0.5" style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em" }}>
          N ↑
        </text>
      </svg>
    </Plate>
  );
}

/** A circular postmark: where (when) the letter was sent from. Follows the page colours. */
export function Postmark({ year, name, className }: { year: number; name: string; className?: string }) {
  const uid = React.useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 140 120" className={cn("text-copper", className)} aria-hidden>
      <defs>
        <path id={`pm-${uid}`} d="M60 60 m-41 0 a41 41 0 1 1 82 0 a41 41 0 1 1 -82 0" />
      </defs>
      <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="60" cy="60" r="31" fill="none" stroke="currentColor" strokeWidth="1" />
      <text fill="currentColor" style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.22em" }}>
        <textPath href={`#pm-${uid}`}>{`FUTUREME · POSTED BY ${name.toUpperCase().slice(0, 14)} · `}</textPath>
      </text>
      <text x="60" y="66" textAnchor="middle" fill="currentColor" style={{ fontFamily: "var(--font-display)", fontSize: 21 }}>
        {year}
      </text>
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={`M104 ${46 + i * 9} q 8 -5 16 0 t 16 0`} fill="none" stroke="currentColor" strokeWidth="1" opacity="0.7" />
      ))}
    </svg>
  );
}

/**
 * The obstacles as a ridge: one summit per obstacle. Facing one plants a flag on it,
 * and the sun climbs from behind the range as more are faced.
 */
export function Summits({ count, faced, className }: { count: number; faced: Set<number>; className?: string }) {
  const uid = React.useId().replace(/:/g, "");
  const W = 1000;
  const H = 150;
  const heights = [44, 66, 34, 58, 50, 72];
  const peaks = Array.from({ length: count }, (_, i) => ({ x: ((i + 0.5) * W) / count, y: heights[i % heights.length] }));
  const valley = 116;
  let skyline = `M0 ${valley + 8}`;
  peaks.forEach((p, i) => {
    const left = i === 0 ? 0 : (peaks[i - 1].x + p.x) / 2;
    skyline += ` L${left} ${valley} L${p.x - 16} ${p.y + 12} L${p.x} ${p.y} L${p.x + 20} ${p.y + 16}`;
  });
  skyline += ` L${W} ${valley + 4}`;
  const share = count ? faced.size / count : 0;

  return (
    <svg viewBox={`0 -24 ${W} ${H + 24}`} className={cn("block h-auto w-full", className)} aria-hidden>
      <defs>
        <radialGradient id={`sm-sun-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.95" />
          <stop offset="0.55" stopColor="var(--accent)" stopOpacity="0.4" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`sm-ridge-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--border-strong)" />
          <stop offset="1" stopColor="var(--background)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.circle cx={W * 0.82} r="64" fill={`url(#sm-sun-${uid})`} initial={false} animate={{ cy: 150 - share * 118 }} transition={{ type: "spring", stiffness: 40, damping: 14 }} />
      <path d={`M0 ${valley + 6} C 200 ${valley - 34} 420 ${valley - 4} 620 ${valley - 36} S 900 ${valley - 18} ${W} ${valley - 24} L ${W} ${H} L0 ${H} Z`} fill="var(--surface-3)" opacity="0.7" />
      <path d={`${skyline} L${W} ${H} L0 ${H} Z`} fill={`url(#sm-ridge-${uid})`} />
      <path d={skyline} fill="none" stroke="var(--foreground)" strokeOpacity="0.55" strokeWidth="1.5" strokeLinejoin="round" />
      {peaks.map((p, i) => (
        <g key={i}>
          <path d={`M${p.x - 16} ${p.y + 12} L${p.x} ${p.y} L${p.x + 20} ${p.y + 16} L${p.x + 6} ${p.y + 12} L${p.x - 4} ${p.y + 17} Z`} fill="var(--surface)" stroke="var(--foreground)" strokeOpacity="0.55" strokeWidth="1.5" strokeLinejoin="round" />
          <text x={p.x} y={H - 6} textAnchor="middle" className="max-sm:hidden" fill="var(--subtle-foreground)" style={{ fontFamily: "var(--font-mono)", fontSize: 13, letterSpacing: "0.1em" }}>
            {String(i + 1).padStart(2, "0")}
          </text>
          <motion.g initial={false} animate={{ scaleY: faced.has(i) ? 1 : 0, opacity: faced.has(i) ? 1 : 0 }} transition={{ type: "spring", stiffness: 220, damping: 16 }} style={{ originX: 0, originY: 1 }}>
            <line x1={p.x} y1={p.y} x2={p.x} y2={p.y - 44} stroke="var(--foreground)" strokeWidth="2" />
            <path d={`M${p.x} ${p.y - 44} L${p.x + 30} ${p.y - 36} L${p.x} ${p.y - 28} Z`} fill="var(--copper)" />
          </motion.g>
        </g>
      ))}
    </svg>
  );
}
