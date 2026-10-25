"use client";

import { motion, useMotionTemplate, useReducedMotionConfig, useTransform, type MotionValue } from "motion/react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useGaze } from "./use-gaze";

/**
 * TOMORA's mark, alive: the clock (see mark.tsx) inside a glass sphere, with lights orbiting it on tilted paths.
 * It looks at you: the sphere tilts toward the pointer, the layers shift with depth, and the bronze point (today) moves
 * like a pupil toward the cursor while it pulses. `progress` (0 to 1) moves today along its trajectory to the champagne
 * ring (the future you described), so the mark shows how far along you are; at 1 they meet. `busy` makes everything
 * turn faster, for moments when TOMORA is working. Decorative: pass a label to name it for screen readers.
 */
export function LivingMark({ progress = 0.15, busy = false, ring, label, compact = false, className }: { progress?: number; busy?: boolean; ring?: string; label?: string; compact?: boolean; className?: string }) {
  const uid = React.useId().replace(/:/g, "");
  const box = React.useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionConfig();
  const { x, y } = useGaze(box);

  const tiltX = useTransform(y, (v) => v * -14);
  const tiltY = useTransform(x, (v) => v * 14);
  const [backX, backY] = useDepth(x, y, -5);
  const [faceX, faceY] = useDepth(x, y, 5);
  const [eyeX, eyeY] = useDepth(x, y, 11);
  const [glareX, glareY] = useDepth(x, y, -22);
  const haloX = useTransform(x, (v) => `${50 + v * 18}%`);
  const haloY = useTransform(y, (v) => `${46 + v * 18}%`);
  const halo = useMotionTemplate`radial-gradient(circle at ${haloX} ${haloY}, rgb(200 183 143 / 0.42), rgb(200 146 95 / 0.16) 38%, transparent 66%)`;

  // The clock's 24-unit drawing, scaled into the sphere.
  const K = 4.4;
  const at = (u: number) => round(100 + (u - 12) * K);
  const today = { x: 7.6, y: 15.6 };
  const future = { x: 14.6, y: 8.6 };
  const p = Math.min(1, Math.max(0, progress));
  const eye = { x: today.x + (future.x - today.x) * p, y: today.y + (future.y - today.y) * p };
  const fast = busy ? 0.25 : 1;
  const dur = (s: number) => `${round(s * fast)}s`;

  // At icon size (compact) the orbits and their lights are drawn bolder so they still read.
  const bold = compact ? 3.2 : 1;
  const orbits = [
    { tilt: -18, rx: 94, ry: 25, dur: 9, color: "#E9DFC6", r: 2.6 * bold },
    { tilt: 28, rx: 90, ry: 30, dur: 13, color: "#C8925F", r: 2.2 * bold },
    { tilt: 78, rx: 86, ry: 22, dur: 17, color: "#C8B78F", r: 1.8 * bold },
  ].slice(0, compact ? 2 : 3);
  const ellipse = (rx: number, ry: number) => `M ${-rx} 0 A ${rx} ${ry} 0 1 0 ${rx} 0 A ${rx} ${ry} 0 1 0 ${-rx} 0`;

  return (
    <div ref={box} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} className={cn("relative aspect-square w-full [perspective:900px]", className)}>
      <motion.div aria-hidden className={cn("absolute rounded-full", compact ? "-inset-[6%] blur-sm" : "-inset-[12%] blur-2xl")} style={{ background: halo }} animate={reduce ? undefined : { scale: [1, 1.06, 1] }} transition={{ duration: busy ? 1.6 : 5, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div className="absolute inset-0 [transform-style:preserve-3d]" style={{ rotateX: tiltX, rotateY: tiltY }}>
        {/* Frosted glass behind the sphere's drawing, so whatever drifts behind it blurs. */}
        <div aria-hidden className="absolute top-[21%] left-[21%] size-[58%] rounded-full bg-[radial-gradient(circle_at_32%_28%,rgb(255_255_255/0.2),rgb(255_255_255/0.04)_55%,rgb(255_255_255/0.02))] shadow-[inset_0_1px_1px_rgb(255_255_255/0.45),inset_0_-12px_30px_rgb(0_0_0/0.35),0_30px_60px_-20px_rgb(0_0_0/0.6)] ring-1 ring-white/15 backdrop-blur-md" />
        <svg viewBox="0 0 200 200" className="absolute inset-0 size-full overflow-visible text-[#F3F0E8]" fill="none" aria-hidden>
          <defs>
            <clipPath id={`${uid}-sphere`}>
              <circle cx="100" cy="100" r="58" />
            </clipPath>
            <radialGradient id={`${uid}-glare`}>
              <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${uid}-today`} cx="0.38" cy="0.35" r="0.75">
              <stop offset="0" stopColor="#F2C79B" />
              <stop offset="0.55" stopColor="#C8925F" />
              <stop offset="1" stopColor="#7A4A24" />
            </radialGradient>
            <linearGradient id={`${uid}-trail`} x1={at(today.x)} y1={at(today.y)} x2={at(future.x)} y2={at(future.y)} gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#C8925F" />
              <stop offset="1" stopColor="#C8B78F" />
            </linearGradient>
            <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {ring && <path id={`${uid}-ring`} d="M 100 100 m -97 0 a 97 97 0 1 1 194 0 a 97 97 0 1 1 -194 0" />}
          </defs>

          {/* The far side of each orbit, behind the sphere. */}
          <motion.g style={{ x: backX, y: backY }}>
            {orbits.map((o, i) => (
              <g key={i} transform={`translate(100 100) rotate(${o.tilt})`}>
                <path d={ellipse(o.rx, o.ry)} stroke="currentColor" strokeOpacity={compact ? 0.22 : 0.1} strokeWidth={0.6 * bold} />
              </g>
            ))}
            {ring && !compact && (
              <g className="origin-center animate-orbit" style={{ transformBox: "view-box", animationDuration: dur(140) }}>
                <text className="fill-[#E9DFC6]/45 font-mono text-[5.4px] tracking-[0.42em] uppercase">
                  <textPath href={`#${uid}-ring`}>{`${ring} ✦ ${ring} ✦ `}</textPath>
                </text>
              </g>
            )}
          </motion.g>

          {/* Inside the glass: the clock. */}
          <g clipPath={`url(#${uid}-sphere)`}>
            <motion.g style={{ x: faceX, y: faceY }}>
              <g className="origin-center animate-orbit" style={{ transformBox: "view-box", animationDuration: dur(40) }} stroke="currentColor" strokeOpacity="0.38" strokeWidth="1.1">
                {Array.from({ length: 12 }, (_, i) => {
                  const a = (i / 12) * Math.PI * 2;
                  const r1 = (i % 3 === 0 ? 9.4 : 10.3) * K;
                  return <line key={i} x1={round(100 + Math.cos(a) * r1)} y1={round(100 + Math.sin(a) * r1)} x2={round(100 + Math.cos(a) * 11.4 * K)} y2={round(100 + Math.sin(a) * 11.4 * K)} />;
                })}
                <path d={`M100 ${at(0.4)} L103.4 ${at(1.4)} L100 ${at(2.4)} L96.6 ${at(1.4)} Z`} fill="#C8B78F" stroke="none" filter={`url(#${uid}-glow)`} />
              </g>
              <g className="origin-center animate-orbit [animation-direction:reverse]" style={{ transformBox: "view-box", animationDuration: dur(28) }} fill="#C8925F">
                {Array.from({ length: 12 }, (_, i) => {
                  const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
                  return <circle key={i} cx={round(100 + Math.cos(a) * 8.1 * K)} cy={round(100 + Math.sin(a) * 8.1 * K)} r={i % 3 === 0 ? 2.2 : 1.3} opacity={i % 3 === 0 ? 0.9 : 0.5} />;
                })}
              </g>
              {/* The trajectory: light flowing from today toward the future. */}
              <line x1={at(today.x)} y1={at(today.y)} x2={at(future.x)} y2={at(future.y)} stroke={`url(#${uid}-trail)`} strokeOpacity="0.75" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="2.5 6" className="animate-[dash-flow_1.2s_linear_infinite] [animation-direction:reverse]" style={{ animationDuration: dur(1.2) }} />
              <circle cx={at(future.x)} cy={at(future.y)} r={3.7 * K} stroke="#C8B78F" strokeWidth="3.2" filter={`url(#${uid}-glow)`} />
              <circle cx={at(future.x)} cy={at(future.y)} r={3.7 * K} fill="#C8B78F" fillOpacity={0.06 + p * 0.18} />
              {/* The second hand: a light running the future ring. */}
              <g className="animate-orbit" style={{ transformOrigin: `${at(future.x)}px ${at(future.y)}px`, transformBox: "view-box", animationDuration: dur(5) }}>
                <circle cx={at(future.x)} cy={at(future.y) - 4.5 * K} r="3.2" fill="#F7F1E1" filter={`url(#${uid}-glow)`} />
              </g>
            </motion.g>

            {/* Today, as an eye: it looks toward the pointer and keeps a pulse. */}
            <motion.g style={{ x: eyeX, y: eyeY }}>
              <motion.g initial={false} animate={{ x: at(eye.x) - at(today.x), y: at(eye.y) - at(today.y) }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}>
                {[0, 1].map((i) => (
                  <circle key={i} cx={at(today.x)} cy={at(today.y)} r={2.1 * K} stroke="#C8925F" strokeWidth="1.2" className="animate-[sonar_2.6s_ease-out_infinite] [transform-box:fill-box] [transform-origin:center]" style={{ animationDelay: `${i * 1.3 * fast}s`, animationDuration: dur(2.6) }} />
                ))}
                <circle cx={at(today.x)} cy={at(today.y)} r={2.1 * K} fill={`url(#${uid}-today)`} filter={`url(#${uid}-glow)`} />
                <motion.circle cx={at(today.x) - 2.4} cy={at(today.y) - 2.6} r="2.1" fill="#FFF8EC" fillOpacity="0.9" style={{ x: faceX, y: faceY }} />
              </motion.g>
            </motion.g>

            {/* Specular light on the glass, sliding the other way. */}
            <motion.ellipse cx="78" cy="70" rx="34" ry="24" fill={`url(#${uid}-glare)`} style={{ x: glareX, y: glareY }} opacity="0.55" />
          </g>
          <circle cx="100" cy="100" r="58" stroke="#fff" strokeOpacity="0.16" strokeWidth="0.8" />

          {/* The near side of each orbit, in front, with its moving light. */}
          <motion.g style={{ x: faceX, y: faceY }}>
            {orbits.map((o, i) => (
              <g key={i} transform={`translate(100 100) rotate(${o.tilt})`}>
                <path d={`M ${-o.rx} 0 A ${o.rx} ${o.ry} 0 0 0 ${o.rx} 0`} stroke={o.color} strokeOpacity={compact ? 0.55 : 0.32} strokeWidth={0.8 * bold} />
                {!reduce && (
                  <circle r={o.r} fill={o.color} filter={`url(#${uid}-glow)`}>
                    <animateMotion dur={dur(o.dur)} repeatCount="indefinite" path={ellipse(o.rx, o.ry)} />
                  </circle>
                )}
              </g>
            ))}
          </motion.g>
        </svg>
      </motion.div>
    </div>
  );
}

/**
 * The living mark on a dark glass jewel, so it keeps its night colours on light pages too. Use this wherever the mark
 * sits on the app's own background (sidebar, Home, Future Self); `className` sets the size.
 */
export function LivingEmblem({ className, ...mark }: React.ComponentProps<typeof LivingMark>) {
  return (
    <div data-theme="dark" className={cn("relative shrink-0 rounded-full bg-[radial-gradient(circle_at_35%_28%,#2B2E36,#0B0C10_72%)] shadow-[0_18px_36px_-16px_rgb(60_45_20/0.55),inset_0_1px_0_rgb(255_255_255/0.12)] ring-1 ring-black/10 dark:ring-white/10", className)}>
      <LivingMark {...mark} />
    </div>
  );
}

/** The gaze, scaled to how far a layer sits from the glass: positive moves with the pointer, negative against it. */
function useDepth(x: MotionValue<number>, y: MotionValue<number>, d: number) {
  return [useTransform(x, (v) => v * d), useTransform(y, (v) => v * d)] as const;
}

// Trig results can differ in the last digit between server and browser, which breaks hydration.
function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
