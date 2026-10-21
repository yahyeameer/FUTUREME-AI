"use client";

import { motion, useMotionTemplate, useMotionValue, useReducedMotionConfig, useSpring, useTransform } from "motion/react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/use-now";

/**
 * The glass time-orb around the Presence. A clock dial in the ring: the copper pip is the current minute, a comet sweeps
 * the real seconds, and the citron star at the top is the future you're steering toward. Around it, today's date and
 * time and the horizon year turn slowly. It tilts toward the pointer, and spins faster while the future self is working.
 * Everything here is decorative; the Presence inside carries the meaning for screen readers.
 */
export function Orb({ size = 280, className, children, horizonYear, active = false }: { size?: number; className?: string; children?: React.ReactNode; horizonYear?: number; active?: boolean }) {
  const uid = React.useId().replace(/:/g, "");
  const reduce = useReducedMotionConfig();
  const now = useNow();
  const sweep = React.useRef<HTMLDivElement>(null);

  // Start the comet at the real second, so it reads as a second hand.
  React.useEffect(() => {
    if (sweep.current) sweep.current.style.animationDelay = `-${(Date.now() / 1000) % 60}s`;
  }, []);

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const spring = { stiffness: 140, damping: 16 };
  const rotateX = useSpring(
    useTransform(py, (v) => v * -16),
    spring,
  );
  const rotateY = useSpring(
    useTransform(px, (v) => v * 16),
    spring,
  );
  const glareX = useTransform(px, (v) => `${35 + v * 70}%`);
  const glareY = useTransform(py, (v) => `${28 + v * 70}%`);
  const glare = useMotionTemplate`radial-gradient(circle at ${glareX} ${glareY}, rgb(255 255 255 / 0.6), rgb(255 255 255 / 0) 42%)`;

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };

  const stamp = now ? `NOW · ${now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).toUpperCase()} · ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "NOW";
  const future = horizonYear ? `${horizonYear} · THE FUTURE YOU` : "THE FUTURE YOU";
  const ring = `${stamp}  ✦  ${future}  ✦  `;
  const minuteAngle = now ? (now.getMinutes() / 60) * Math.PI * 2 - Math.PI / 2 : -Math.PI / 2;

  return (
    <div
      className={cn("group/orb relative isolate flex items-center justify-center [perspective:900px]", className)}
      style={{ width: size, height: size }}
      onPointerMove={onMove}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
      }}
    >
      {/* Aura: citron for the future, copper for today. */}
      <div
        aria-hidden
        className={cn("absolute inset-[4%] -z-10 animate-orbit rounded-full opacity-80 blur-2xl transition-opacity duration-500 group-hover/orb:opacity-100", active && "opacity-100 [animation-duration:5s]")}
        style={{
          background: "conic-gradient(from 90deg, var(--accent), transparent 30%, var(--copper) 55%, transparent 75%, var(--accent))",
        }}
      />

      <motion.div className="absolute inset-0 [transform-style:preserve-3d]" style={{ rotateX, rotateY }}>
        <svg viewBox="0 0 200 200" aria-hidden className="absolute inset-0 size-full overflow-visible">
          <defs>
            <path id={`ring-${uid}`} d="M100 100 m -91 0 a 91 91 0 1 1 182 0 a 91 91 0 1 1 -182 0" />
            <radialGradient id={`star-${uid}`}>
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.9" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* The dial: an hour mark every five minutes. */}
          <g stroke="currentColor">
            {Array.from({ length: 60 }, (_, i) => {
              const a = (i / 60) * Math.PI * 2;
              const major = i % 5 === 0;
              const r1 = major ? 76 : 80;
              return (
                <line
                  key={i}
                  x1={round(100 + Math.cos(a) * r1)}
                  y1={round(100 + Math.sin(a) * r1)}
                  x2={round(100 + Math.cos(a) * 84)}
                  y2={round(100 + Math.sin(a) * 84)}
                  strokeOpacity={major ? 0.4 : 0.16}
                  strokeWidth={major ? 1 : 0.6}
                />
              );
            })}
          </g>

          {/* Today's date and time, and the year you named, turning around the dial. */}
          <g className={cn("origin-center animate-[orbit_90s_linear_infinite]", active && "[animation-duration:16s]")} style={{ transformBox: "view-box" }}>
            <text
              fill="currentColor"
              fillOpacity="0.62"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 7.5,
                letterSpacing: "0.12em",
              }}
            >
              <textPath href={`#ring-${uid}`} textLength="570" lengthAdjust="spacing">
                {ring}
                {ring}
              </textPath>
            </text>
          </g>

          {/* Now: the current minute. */}
          <circle cx={round(100 + Math.cos(minuteAngle) * 80)} cy={round(100 + Math.sin(minuteAngle) * 80)} r="3" fill="var(--copper)" className="drop-shadow-[0_0_4px_var(--copper)]" />
          {/* The future: where the hands are heading. */}
          <circle cx="100" cy="20" r="9" fill={`url(#star-${uid})`} className="animate-breathe origin-[100px_20px]" />
          <path d="M100 13.5 L101.6 18.4 L106.5 20 L101.6 21.6 L100 26.5 L98.4 21.6 L93.5 20 L98.4 18.4 Z" fill="var(--accent)" />
        </svg>

        {/* Seconds: a comet of light running the dial in real time. */}
        <div
          ref={sweep}
          aria-hidden
          className="absolute inset-[7.5%] animate-[orbit_60s_linear_infinite] rounded-full"
          style={{
            background: "conic-gradient(from 0deg, transparent 0turn, transparent 0.8turn, color-mix(in oklab, var(--accent) 75%, transparent) 0.995turn, transparent 1turn)",
            WebkitMask: "radial-gradient(circle, transparent 87%, #000 88%, #000 99%, transparent 100%)",
            mask: "radial-gradient(circle, transparent 87%, #000 88%, #000 99%, transparent 100%)",
          }}
        />

        {/* The glass sphere. */}
        <div
          aria-hidden
          className={cn(
            "absolute inset-[17%] rounded-full border border-white/60 bg-gradient-to-br from-white/70 via-white/25 to-white/5 backdrop-blur-md transition-shadow duration-500 dark:border-white/15 dark:from-white/[0.14] dark:via-white/[0.05] dark:to-transparent",
            "shadow-[inset_0_2px_6px_rgb(255_255_255/0.9),inset_0_-14px_30px_-10px_rgb(187_128_92/0.3),0_24px_50px_-22px_rgb(60_45_20/0.5),0_0_0_1px_rgb(196_214_106/0.12)] dark:shadow-[inset_0_1px_2px_rgb(255_255_255/0.25),inset_0_-14px_30px_-10px_rgb(187_128_92/0.25),0_24px_50px_-22px_rgb(0_0_0/0.8)]",
            "group-hover/orb:shadow-[inset_0_2px_6px_rgb(255_255_255/0.9),inset_0_-14px_30px_-10px_rgb(187_128_92/0.3),0_0_42px_-6px_var(--accent)] dark:group-hover/orb:shadow-[inset_0_1px_2px_rgb(255_255_255/0.25),0_0_46px_-8px_var(--accent)]",
            active && "animate-pulse",
          )}
        />
        <motion.div aria-hidden className="pointer-events-none absolute inset-[17%] rounded-full opacity-70 mix-blend-soft-light" style={{ background: glare }} />

        {/* Satellites: today (copper) and the future (citron), on their own orbits. */}
        <div aria-hidden className="absolute inset-0 animate-orbit [animation-duration:18s]">
          <span className="absolute top-[2%] left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_14px_var(--accent)]" />
        </div>
        <div aria-hidden className="absolute inset-[10%] animate-orbit [animation-direction:reverse] [animation-duration:30s]">
          <span className="absolute bottom-0 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-copper shadow-[0_0_10px_var(--copper)]" />
        </div>

        <div className="absolute inset-0 flex items-center justify-center [transform:translateZ(36px)]">{children}</div>
      </motion.div>
    </div>
  );
}

// Trig results can differ in the last digit between server and browser, which breaks hydration.
function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
