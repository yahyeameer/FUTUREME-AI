"use client";

import { Shuffle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { EASE, HorizonScene, Plate, scatter } from "@/features/reflection/art";
import { yearsInWords } from "@/lib/utils";

// Magazine covers for the reflection. Each is a full scene in its own print style, sized 400×480,
// with the horizon year worked into the picture. Each one also draws the plan's length, one mark per year (`span`), so a
// three-year plan and a fifteen-year plan get visibly different pictures. They keep their own palette in both themes.

const MONO = { fontFamily: "var(--font-mono)" };
const DISPLAY = { fontFamily: "var(--font-display)" };
const SANS = { fontFamily: "var(--font-sans)" };

function useUid() {
  return React.useId().replace(/:/g, "");
}

function roman(n: number) {
  const table: [number, string][] = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let out = "";
  for (const [v, s] of table) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}

/** Props every cover scene takes: the horizon year, and how many years away it is. */
export interface SceneProps {
  year: number;
  span: number;
}

/** "TEN YEARS", for the spaced-out capitals the covers use. */
const spanCaps = (span: number) => yearsInWords(span).toUpperCase();

/** At most `max` marks, so a long plan still fits in the picture. */
const marks = (span: number, max = 20) => Math.max(1, Math.min(span, max));

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 400 480" className="block h-auto w-full" role="img" aria-label={label}>
      {children}
    </svg>
  );
}

/** Synthwave: a striped sun setting behind a lit skyline, over a neon grid. */
function SkylineScene({ year, span }: SceneProps) {
  const uid = useUid();
  const stars = React.useMemo(() => scatter(40, 11), []);
  const lights = React.useMemo(() => scatter(400, 5), []);
  const towers = [
    [0, 292, 44],
    [40, 250, 36],
    [72, 276, 30],
    [100, 206, 46],
    [144, 262, 34],
    [176, 172, 40],
    [214, 236, 32],
    [244, 196, 48],
    [290, 268, 30],
    [318, 224, 42],
    [358, 284, 42],
  ];
  const H = 360;
  // The city rises with the plan: a three-year skyline is low, a fifteen-year one crowds the sun.
  const rise = Math.min(1.2, Math.max(0.6, 0.55 + span * 0.045));
  return (
    <Frame label={`Illustration: a neon city skyline at sunset, built over ${yearsInWords(span)}, ${year}`}>
      <defs>
        <linearGradient id={`sk-sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#07061a" />
          <stop offset="0.5" stopColor="#24104a" />
          <stop offset="0.8" stopColor="#7a1c6b" />
          <stop offset="1" stopColor="#ff5e7e" />
        </linearGradient>
        <linearGradient id={`sk-sun-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe36e" />
          <stop offset="1" stopColor="#ff3d8b" />
        </linearGradient>
        <mask id={`sk-cut-${uid}`}>
          <rect width="400" height="480" fill="#fff" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x="0" y={262 + i * 16} width="400" height={2 + i * 1.6} fill="#000" />
          ))}
        </mask>
        <filter id={`sk-glow-${uid}`} x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="3.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="400" height={H} fill={`url(#sk-sky-${uid})`} />
      {stars.map((s, i) => (
        <circle key={i} cx={s.x * 400} cy={s.y * 180} r={s.r * 0.8} fill="#fff" opacity={s.o} />
      ))}
      <motion.g initial={{ y: 50 }} animate={{ y: 0 }} transition={{ duration: 2, ease: EASE }}>
        <circle cx="200" cy="262" r="112" fill={`url(#sk-sun-${uid})`} mask={`url(#sk-cut-${uid})`} />
      </motion.g>
      {towers.map(([x, tall, width], t) => {
        const top = H - (H - tall) * rise;
        return (
          <g key={t}>
            <rect x={x} y={top} width={width} height={H - top} fill="#0b0819" />
            {Array.from({ length: Math.floor((H - top - 12) / 14) }, (_, r) =>
              Array.from({ length: Math.floor((width - 8) / 9) }, (_, c) => {
                const l = lights[(t * 97 + r * 13 + c) % lights.length];
                if (l.o < 0.55) return null;
                return <rect key={`${r}-${c}`} x={x + 6 + c * 9} y={top + 10 + r * 14} width="4" height="6" fill={l.x > 0.7 ? "#34e1ff" : "#ffd36e"} opacity={0.5 + l.o * 0.5} />;
              }),
            )}
          </g>
        );
      })}
      <rect y={H} width="400" height="120" fill="#0b0819" />
      <g stroke="#ff4fd8" strokeWidth="1" opacity="0.75">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
          <line key={k} x1="0" x2="400" y1={H + 3 + k * k * 2.2} y2={H + 3 + k * k * 2.2} />
        ))}
        {Array.from({ length: 17 }, (_, k) => (
          <line key={`v${k}`} x1="200" y1={H} x2={-600 + k * 75} y2="480" />
        ))}
      </g>
      <line x1="0" x2="400" y1={H} y2={H} stroke="#ff4fd8" strokeWidth="2" filter={`url(#sk-glow-${uid})`} />
      <text x="200" y="96" textAnchor="middle" fill="none" stroke="#34e1ff" strokeWidth="2" filter={`url(#sk-glow-${uid})`} style={{ ...SANS, fontSize: 92, fontWeight: 800, fontStyle: "italic", letterSpacing: "-0.02em" }}>
        {year}
      </text>
      <text x="200" y="126" textAnchor="middle" fill="#ff9fe4" style={{ ...MONO, fontSize: 10, letterSpacing: "0.4em" }}>
        BUILT IN {spanCaps(span)}
      </text>
    </Frame>
  );
}

/** Engraving: a small boat on cross-hatched seas, a lighthouse sweeping the dark. */
function VoyageScene({ year, span }: SceneProps) {
  const uid = useUid();
  const ink = "#14263b";
  const paper = "#efe6d0";
  const wave = (y: number, amp: number, len: number, phase: number) => {
    let d = `M-10 ${y}`;
    for (let x = -10; x <= 410; x += 10) d += ` L${x} ${(y + Math.sin((x + phase) / len) * amp).toFixed(1)}`;
    return d;
  };
  return (
    <Frame label={`Illustration: an engraving of a sailboat on a ${yearsInWords(span)} voyage to a lighthouse, ${year}`}>
      <defs>
        <pattern id={`vo-hatch-${uid}`} width="6" height="5" patternUnits="userSpaceOnUse">
          <path d="M0 2.5 H6" stroke={ink} strokeWidth="0.7" opacity="0.35" />
        </pattern>
      </defs>
      <rect width="400" height="480" fill={paper} />
      <rect width="400" height="320" fill={`url(#vo-hatch-${uid})`} />
      <circle cx="120" cy="170" r="54" fill={paper} stroke={ink} strokeWidth="1.2" />
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return <line key={i} x1={120 + Math.cos(a) * 62} y1={170 + Math.sin(a) * 62} x2={120 + Math.cos(a) * (i % 2 ? 72 : 80)} y2={170 + Math.sin(a) * (i % 2 ? 72 : 80)} stroke={ink} strokeWidth="1" />;
      })}
      <motion.polygon points="330,236 -20,180 -20,290" fill="#f6d27a" initial={{ opacity: 0.25 }} animate={{ opacity: [0.25, 0.6, 0.25] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} />
      <path d="M300 330 Q330 300 372 318 L400 330 Z" fill={ink} />
      <path d="M320 318 L326 240 L338 240 L344 318 Z" fill={paper} stroke={ink} strokeWidth="1.2" />
      {[256, 280, 304].map((y) => (
        <path key={y} d={`M${325 - (y - 240) * 0.07} ${y} L${339 + (y - 240) * 0.07} ${y} L${340 + (y - 228) * 0.07} ${y + 10} L${324 - (y - 228) * 0.07} ${y + 10} Z`} fill="#b4442c" />
      ))}
      <rect x="323" y="226" width="18" height="14" fill="#f6d27a" stroke={ink} strokeWidth="1.2" />
      <path d="M320 226 L332 214 L344 226 Z" fill={ink} />
      <rect y="320" width="400" height="160" fill={paper} />
      {Array.from({ length: 22 }, (_, i) => (
        <path key={i} d={wave(326 + i * 7, 3 + (i % 4), 14 + (i % 5) * 3, i * 23)} fill="none" stroke={ink} strokeWidth={i % 3 === 0 ? 1.3 : 0.8} />
      ))}
      {/* The charted course to the light, a buoy for every year of the passage. */}
      <path d="M24 458 C 120 440 190 420 236 386 S 300 340 318 330" fill="none" stroke={ink} strokeWidth="1" strokeDasharray="3 4" />
      {Array.from({ length: marks(span) }, (_, i) => {
        const t = (i + 1) / (marks(span) + 1);
        const x = 24 + (318 - 24) * t;
        const y = 458 - (458 - 330) * t ** 1.3;
        return <circle key={i} cx={x} cy={y} r="3" fill={paper} stroke={ink} strokeWidth="1.2" />;
      })}
      <motion.g initial={{ y: 0, rotate: 0 }} animate={{ y: [0, -5, 0], rotate: [-2, 2, -2] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}>
        <path d="M170 362 L250 362 L238 380 L182 380 Z" fill={ink} />
        <line x1="212" y1="362" x2="212" y2="270" stroke={ink} strokeWidth="2" />
        <path d="M214 274 L214 356 L262 356 Z" fill={paper} stroke={ink} strokeWidth="1.2" />
        <path d="M210 284 L210 356 L176 356 Z" fill={paper} stroke={ink} strokeWidth="1.2" />
        <path d="M212 270 L232 276 L212 282 Z" fill="#b4442c" />
      </motion.g>
      <text x="200" y="56" textAnchor="middle" fill={ink} style={{ ...DISPLAY, fontSize: 46, letterSpacing: "0.12em" }}>
        {roman(year)}
      </text>
      <line x1="120" x2="280" y1="70" y2="70" stroke={ink} />
      <text x="200" y="88" textAnchor="middle" fill={ink} style={{ ...DISPLAY, fontSize: 15, fontStyle: "italic" }}>
        the voyage out, {yearsInWords(span)}
      </text>
    </Frame>
  );
}

/** Bauhaus: primary shapes stacked into a poster, the year running up the edge. */
function BauhausScene({ year, span }: SceneProps) {
  const shape = (delay: number) => ({ initial: { opacity: 0, scale: 0.6 }, animate: { opacity: 1, scale: 1 }, transition: { delay, type: "spring" as const, stiffness: 120, damping: 14 } });
  return (
    <Frame label={`Illustration: a Bauhaus poster of circles and blocks, one dot for each of ${yearsInWords(span)}, ${year}`}>
      <rect width="400" height="480" fill="#ece3cf" />
      <g stroke="#161616" strokeWidth="0.6" opacity="0.18">
        {[80, 160, 240, 320].map((x) => (
          <line key={x} x1={x} x2={x} y1="0" y2="480" />
        ))}
        {[120, 240, 360].map((y) => (
          <line key={y} x1="0" x2="400" y1={y} y2={y} />
        ))}
      </g>
      <g transform="rotate(-12 94 177)">
        <motion.rect x="46" y="70" width="96" height="214" fill="#e8b22a" {...shape(0.1)} />
      </g>
      <motion.circle cx="236" cy="190" r="118" fill="#c8402f" {...shape(0.25)} />
      <motion.circle cx="236" cy="190" r="46" fill="#ece3cf" {...shape(0.5)} />
      <motion.path d="M30 452 A124 124 0 0 1 278 452 Z" fill="#1d3a6e" {...shape(0.4)} />
      <motion.line x1="18" y1="330" x2="330" y2="40" stroke="#161616" strokeWidth="9" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.6, duration: 0.8, ease: EASE }} />
      {Array.from({ length: marks(span) }, (_, i) => (
        <motion.circle key={i} cx={40 + (i % 8) * 20} cy={360 + Math.floor(i / 8) * 20} r="7" fill="#161616" {...shape(0.8 + i * 0.05)} />
      ))}
      <text x="384" y="470" fill="#161616" transform="rotate(-90 384 470)" style={{ ...SANS, fontSize: 96, fontWeight: 800, letterSpacing: "-0.04em" }}>
        {year}
      </text>
      <text x="22" y="30" fill="#161616" style={{ ...MONO, fontSize: 10, letterSpacing: "0.3em" }}>
        FORM · WORK · {spanCaps(span)}
      </text>
    </Frame>
  );
}

/** Blueprint: signals racing along circuit traces into a chip stamped with the year. */
function CircuitScene({ year, span }: SceneProps) {
  const uid = useUid();
  const traces = [
    "M0 70 H60 V150 H130",
    "M0 210 H90 V196 H130",
    "M0 300 H70 V252 H130",
    "M400 90 H320 V160 H270",
    "M400 230 H330 V214 H270",
    "M400 380 H340 V262 H270",
    "M150 0 V60 H170 V130",
    "M250 0 V40 H230 V130",
    "M120 480 V400 H170 V290",
    "M290 480 V420 H230 V290",
    "M200 480 V290",
  ];
  return (
    <Frame label={`Illustration: a glowing circuit board blueprint, a ${yearsInWords(span)} build, ${year}`}>
      <defs>
        <pattern id={`ci-grid-${uid}`} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0 H0 V20" fill="none" stroke="#0e3553" strokeWidth="1" />
        </pattern>
        <radialGradient id={`ci-glow-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#4fd1c5" stopOpacity="0.35" />
          <stop offset="1" stopColor="#4fd1c5" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="480" fill="#04192b" />
      <rect width="400" height="480" fill={`url(#ci-grid-${uid})`} />
      <circle cx="200" cy="210" r="170" fill={`url(#ci-glow-${uid})`} />
      {traces.map((d, i) => (
        <g key={i}>
          <path d={d} fill="none" stroke="#1d6f7a" strokeWidth="2" />
          <motion.path
            d={d}
            fill="none"
            stroke="#8ffff0"
            strokeWidth="2.5"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="7 93"
            initial={{ strokeDashoffset: 100 }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: 2.2 + (i % 4) * 0.4, delay: i * 0.25, repeat: Infinity, ease: "linear" }}
          />
        </g>
      ))}
      {[
        [60, 70],
        [90, 210],
        [70, 300],
        [320, 90],
        [330, 230],
        [340, 380],
        [120, 400],
        [290, 420],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="4" fill="#04192b" stroke="#6ff5e3" strokeWidth="2" />
      ))}
      <rect x="130" y="130" width="140" height="160" rx="10" fill="#072a44" stroke="#4fd1c5" strokeWidth="2" />
      <rect x="142" y="142" width="116" height="136" rx="6" fill="none" stroke="#4fd1c5" strokeOpacity="0.4" strokeDasharray="3 4" />
      <text x="200" y="222" textAnchor="middle" fill="#c8fff7" style={{ ...MONO, fontSize: 36, fontWeight: 600, letterSpacing: "0.04em" }}>
        {year}
      </text>
      <text x="200" y="246" textAnchor="middle" fill="#4fd1c5" style={{ ...MONO, fontSize: 9, letterSpacing: "0.3em" }}>
        FM-CORE · ONLINE
      </text>
      {/* A register with one cell per year, filling in turn. */}
      {Array.from({ length: marks(span) }, (_, i) => i).map((i, _, all) => {
        const w = (108 - (all.length - 1) * 2) / all.length;
        return (
          <motion.rect
            key={i}
            x={146 + i * (w + 2)}
            y="258"
            width={w}
            height="8"
            rx="1"
            fill="#8ffff0"
            initial={{ opacity: 0.15 }}
            animate={{ opacity: [0.15, 1, 1] }}
            transition={{ duration: 0.6, delay: 0.4 + i * 0.12, ease: "easeOut" }}
          />
        );
      })}
      <text x="20" y="462" fill="#4fd1c5" opacity="0.8" style={{ ...MONO, fontSize: 9, letterSpacing: "0.2em" }}>
        SCHEMATIC · TODAY → {year} · {span} YR BUILD
      </text>
    </Frame>
  );
}

/** Botanical plate: a seedling drawn with its roots and annotated like a field guide. */
function SeedlingScene({ year, span }: SceneProps) {
  const ink = "#2b3a2a";
  return (
    <Frame label={`Illustration: a botanical drawing of a seedling grown over ${yearsInWords(span)}, ${year}`}>
      <rect width="400" height="480" fill="#f3ecdc" />
      <rect x="14" y="14" width="372" height="452" fill="none" stroke={ink} strokeWidth="0.8" />
      <circle cx="318" cy="96" r="30" fill="none" stroke="#c98a2b" strokeWidth="1.5" />
      <circle cx="318" cy="96" r="20" fill="#e8b85c" opacity="0.6" />
      <rect x="15" y="356" width="370" height="109" fill="#e5d7b8" />
      {[372, 392, 416, 444].map((y, i) => (
        <path key={y} d={`M15 ${y} C 120 ${y - 6 + i * 2} 260 ${y + 8} 385 ${y - 2}`} fill="none" stroke={ink} strokeOpacity="0.25" strokeDasharray={i % 2 ? "2 4" : undefined} />
      ))}
      <g>
        {["M200 360 C 196 390 180 400 168 430", "M200 360 C 206 392 226 402 236 440", "M200 362 C 200 400 202 420 196 452", "M186 410 C 176 414 166 412 156 420", "M222 404 C 236 404 246 398 258 404"].map((d, i) => (
          <motion.path key={i} d={d} fill="none" stroke={ink} strokeWidth={i < 3 ? 1.6 : 1} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.2 + i * 0.15, duration: 1, ease: EASE }} />
        ))}
      </g>
      <motion.path d="M200 360 C 196 320 210 290 202 250 C 196 220 204 190 200 160" fill="none" stroke="#2f5d3a" strokeWidth="3" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: EASE }} />
      <motion.g initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.1, duration: 0.8, ease: EASE }} style={{ originX: 1, originY: 1 }}>
        <path d="M201 268 C 160 250 128 262 110 292 C 150 300 182 292 201 268 Z" fill="#6b9a4b" stroke={ink} strokeWidth="1" />
        <path d="M201 268 C 168 276 140 284 112 291" fill="none" stroke={ink} strokeWidth="0.8" />
      </motion.g>
      <motion.g initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.3, duration: 0.8, ease: EASE }} style={{ originX: 0, originY: 1 }}>
        <path d="M203 222 C 240 196 276 200 298 226 C 262 240 228 240 203 222 Z" fill="#7fae57" stroke={ink} strokeWidth="1" />
        <path d="M203 222 C 236 222 264 224 296 226" fill="none" stroke={ink} strokeWidth="0.8" />
      </motion.g>
      <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.6, type: "spring", stiffness: 140, damping: 12 }}>
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse key={a} cx="200" cy="146" rx="7" ry="15" fill="#e7a0a0" stroke={ink} strokeWidth="0.8" transform={`rotate(${a} 200 160)`} />
        ))}
        <circle cx="200" cy="160" r="6" fill="#e8b85c" stroke={ink} strokeWidth="0.8" />
      </motion.g>
      <g stroke={ink} strokeWidth="0.6" fill={ink} style={{ ...DISPLAY, fontSize: 12, fontStyle: "italic" }}>
        <line x1="130" y1="280" x2="58" y2="252" />
        <text x="30" y="246" stroke="none">
          a. first habit
        </text>
        <line x1="260" y1="214" x2="320" y2="182" />
        <text x="304" y="174" stroke="none">
          b. reach
        </text>
        <line x1="236" y1="436" x2="300" y2="452" />
        <text x="276" y="446" stroke="none" dy="-2">
          c. roots
        </text>
      </g>
      {/* A field-guide height scale, marked in years from the soil to the flower. */}
      <g stroke={ink} strokeWidth="0.8">
        <line x1="362" x2="362" y1="360" y2="160" />
        {Array.from({ length: marks(span, 30) + 1 }, (_, i) => i).map((i, _, all) => {
          const y = 360 - (200 * i) / (all.length - 1);
          const major = i === 0 || i === all.length - 1 || i % 5 === 0;
          return <line key={i} x1={major ? 354 : 357} x2="362" y1={y} y2={y} />;
        })}
      </g>
      <g fill={ink} textAnchor="end" style={{ ...MONO, fontSize: 8 }}>
        <text x="372" y="374" textAnchor="middle">
          0
        </text>
        <text x="372" y="150" textAnchor="middle">
          {span} yr
        </text>
      </g>
      <text x="30" y="52" fill={ink} style={{ ...DISPLAY, fontSize: 30, fontStyle: "italic" }}>
        Perennis futura
      </text>
      <text x="30" y="72" fill={ink} opacity="0.75" style={{ ...MONO, fontSize: 9, letterSpacing: "0.25em" }}>
        FIG. {year} · {span} {span === 1 ? "YEAR" : "YEARS"} OF GROWTH
      </text>
    </Frame>
  );
}

/** Risograph: a rocket in misregistered pink and blue, lifting off on a halftone plume. */
function RocketScene({ year, span }: SceneProps) {
  const uid = useUid();
  const blend = { mixBlendMode: "multiply" as const };
  const rocket = "M200 96 C 232 136 238 196 232 266 L168 266 C 162 196 168 136 200 96 Z";
  return (
    <Frame label={`Illustration: a risograph print of a rocket on a ${yearsInWords(span)} countdown, ${year}`}>
      <defs>
        <pattern id={`ro-dots-${uid}`} width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="4" cy="4" r="2.3" fill="#ff48b0" />
        </pattern>
        <pattern id={`ro-fine-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <circle cx="3" cy="3" r="1.6" fill="#0078bf" />
        </pattern>
      </defs>
      <rect width="400" height="480" fill="#f6efe1" />
      <circle cx="318" cy="98" r="64" fill="#ffe800" style={blend} />
      <circle cx="40" cy="430" r="150" fill={`url(#ro-dots-${uid})`} style={blend} />
      <circle cx="380" cy="470" r="90" fill={`url(#ro-fine-${uid})`} style={blend} />
      {[
        [60, 80],
        [110, 170],
        [300, 240],
        [350, 200],
        [80, 290],
        [260, 50],
      ].map(([x, y], i) => (
        <path key={i} d={`M${x - 6} ${y} H${x + 6} M${x} ${y - 6} V${y + 6}`} stroke="#0078bf" strokeWidth="2" />
      ))}
      <motion.g initial={{ y: 40 }} animate={{ y: [0, -10, 0] }} transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}>
        <path d="M176 270 C 160 330 186 380 200 420 C 214 380 240 330 224 270 Z" fill="#ffe800" style={blend} />
        <path d="M184 270 C 176 320 190 350 200 380 C 210 350 224 320 216 270 Z" fill={`url(#ro-dots-${uid})`} style={blend} />
        <path d="M168 220 L138 280 L170 262 Z" fill="#ff48b0" style={blend} />
        <path d="M232 220 L262 280 L230 262 Z" fill="#ff48b0" style={blend} />
        <path d={rocket} fill="#ff48b0" transform="translate(4 3)" style={blend} />
        <path d={rocket} fill="#0078bf" style={blend} />
        <circle cx="200" cy="168" r="18" fill="#f6efe1" />
        <circle cx="200" cy="168" r="18" fill="none" stroke="#ff48b0" strokeWidth="5" style={blend} />
        <text x="200" y="232" textAnchor="middle" fill="#f6efe1" style={{ ...SANS, fontSize: 15, fontWeight: 800, letterSpacing: "0.08em" }}>
          {year}
        </text>
      </motion.g>
      <text x="22" y="52" fill="#0078bf" style={{ ...SANS, fontSize: 24, fontWeight: 900, letterSpacing: "0.02em", ...blend }}>
        T–{span} YRS
      </text>
      <text x="24" y="54" fill="#ff48b0" style={{ ...SANS, fontSize: 24, fontWeight: 900, letterSpacing: "0.02em", ...blend }}>
        T–{span} YRS
      </text>
      {/* The countdown: a pip for each year, the last one lit. */}
      {Array.from({ length: marks(span) }, (_, i) => i).map((i, _, all) => (
        <rect key={i} x={24 + i * 9} y="62" width="6" height="6" fill={i === all.length - 1 ? "#ff48b0" : "#0078bf"} style={blend} />
      ))}
      <text x="22" y="456" fill="#0078bf" style={{ ...SANS, fontSize: 58, fontWeight: 900, letterSpacing: "-0.03em", ...blend }}>
        LIFTOFF
      </text>
      <text x="25" y="459" fill="#ff48b0" style={{ ...SANS, fontSize: 58, fontWeight: 900, letterSpacing: "-0.03em", ...blend }}>
        LIFTOFF
      </text>
    </Frame>
  );
}

/** Cartography: contour lines around a summit, and a dashed route from here to the year. */
function MapScene({ year, span }: SceneProps) {
  const ink = "#6b4e2e";
  // One contour per year of the climb: a short plan is a gentle hill, a long one a tall peak.
  const count = Math.max(2, marks(span));
  const rings = React.useMemo(
    () =>
      Array.from({ length: count }, (_, k) => {
        const base = 16 + (k * 171) / (count - 1);
        let d = "";
        for (let i = 0; i <= 72; i++) {
          const a = (i / 72) * Math.PI * 2;
          const r = base * (1 + 0.13 * Math.sin(3 * a + k * 0.45) + 0.06 * Math.sin(5 * a + 1.3));
          d += `${i ? "L" : "M"}${(258 + Math.cos(a) * r).toFixed(1)} ${(196 + Math.sin(a) * r * 0.82).toFixed(1)}`;
        }
        return d + "Z";
      }),
    [count],
  );
  return (
    <Frame label={`Illustration: a topographic map with ${count} contour lines, one per year, and a route to the summit, ${year}`}>
      <rect width="400" height="480" fill="#ece5d3" />
      <g stroke={ink} strokeOpacity="0.15">
        {[50, 130, 210, 290, 370].map((x) => (
          <line key={x} x1={x} x2={x} y1="0" y2="480" />
        ))}
        {[60, 160, 260, 360, 460].map((y) => (
          <line key={y} x1="0" x2="400" y1={y} y2={y} />
        ))}
      </g>
      {rings.map((d, k) => (
        <path key={k} d={d} fill={k === 0 ? "#d9c7a2" : "none"} stroke={ink} strokeWidth={k % 5 === 0 ? 1.4 : 0.7} />
      ))}
      <path d="M-10 380 C 40 360 90 372 120 400 C 140 430 110 470 60 490 L-10 490 Z" fill="#9fbfd0" stroke="#5f8aa3" />
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M${10 + i * 14} ${420 + i * 16} q 14 -6 28 0`} fill="none" stroke="#5f8aa3" />
      ))}
      <motion.path
        d="M80 446 C 140 430 160 380 150 340 C 140 300 200 300 214 270 C 228 240 200 220 230 206 C 246 198 252 200 258 196"
        fill="none"
        stroke="#b4442c"
        strokeWidth="2.5"
        strokeDasharray="7 6"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 2.4, ease: EASE, delay: 0.3 }}
      />
      <circle cx="80" cy="446" r="6" fill="#ece5d3" stroke="#b4442c" strokeWidth="2.5" />
      <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 2.5, type: "spring", stiffness: 160, damping: 12 }}>
        <path d="M250 188 L266 204 M266 188 L250 204" stroke="#b4442c" strokeWidth="3.5" strokeLinecap="round" />
      </motion.g>
      <rect x="92" y="450" width="94" height="17" rx="3" fill="#ece5d3" stroke={ink} strokeWidth="0.8" />
      <text x="100" y="462" fill={ink} style={{ ...MONO, fontSize: 10, letterSpacing: "0.12em" }}>
        YOU ARE HERE
      </text>
      <g transform="translate(274 150)">
        <rect width="104" height="40" rx="3" fill="#ece5d3" stroke={ink} strokeWidth="0.8" />
        <text x="10" y="20" fill="#b4442c" style={{ ...MONO, fontSize: 15, fontWeight: 600, letterSpacing: "0.08em" }}>
          {year}
        </text>
        <text x="10" y="32" fill={ink} style={{ ...MONO, fontSize: 8, letterSpacing: "0.12em" }}>
          SUMMIT · YOURS
        </text>
      </g>
      <g transform="translate(56 66)">
        <circle r="26" fill="none" stroke={ink} strokeWidth="0.8" />
        <path d="M0 -30 L6 0 L0 30 L-6 0 Z" fill={ink} />
        <path d="M-30 0 L0 -5 L30 0 L0 5 Z" fill={ink} opacity="0.5" />
        <text y="-34" textAnchor="middle" fill={ink} style={{ ...DISPLAY, fontSize: 14 }}>
          N
        </text>
      </g>
      <g transform="translate(270 448)" fill={ink} style={{ ...MONO, fontSize: 8 }}>
        <rect width="40" height="5" />
        <rect x="40" width="40" height="5" fill="none" stroke={ink} />
        <text y="-5">0</text>
        <text x="80" y="-5" textAnchor="end">
          {span} YRS
        </text>
        <text y="18">1 LINE = 1 YEAR</text>
      </g>
    </Frame>
  );
}

/** Woodblock: a red sun over a snow-capped peak, bands of mist and curling waves. */
function WoodblockScene({ year, span }: SceneProps) {
  const uid = useUid();
  const indigo = "#1f3b5a";
  const cream = "#efe0c2";
  // A switchback trail up the mountain, one turn for each year.
  const turns = marks(span, 16);
  const trail = Array.from({ length: turns + 1 }, (_, i) => {
    const y = 384 - (i * (384 - 212)) / turns;
    const half = (370 - 1.55 * (390 - y)) / 2;
    const x = 204 + (i === 0 || i === turns ? 0 : (i % 2 ? -1 : 1) * half * 0.5);
    return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  return (
    <Frame label={`Illustration: a Japanese woodblock print of a mountain with a ${turns}-turn trail and a red sun, ${year}`}>
      <defs>
        <linearGradient id={`wb-sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={indigo} />
          <stop offset="0.3" stopColor={cream} />
        </linearGradient>
      </defs>
      <rect width="400" height="480" fill={`url(#wb-sky-${uid})`} />
      <motion.circle cx="292" cy="150" r="54" fill="#c8382e" initial={{ cy: 190 }} animate={{ cy: 150 }} transition={{ duration: 2.4, ease: EASE }} />
      <path d="M20 390 L176 182 C 188 168 212 168 224 182 L390 390 Z" fill="#2f4c6e" />
      <path d="M176 182 C 188 168 212 168 224 182 L246 212 L232 206 L222 222 L208 208 L196 226 L186 208 L170 220 L160 204 Z" fill="#f7f1e3" />
      <motion.path d={trail} fill="none" stroke={cream} strokeOpacity="0.75" strokeWidth="1.6" strokeDasharray="4 4" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2.2, ease: EASE, delay: 0.4 }} />
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1={150 - i * 26} y1={240 + i * 30} x2={168 - i * 22} y2={250 + i * 30} stroke={cream} strokeOpacity="0.35" strokeWidth="2" />
      ))}
      {[
        [40, 296, 170],
        [210, 316, 170],
        [100, 340, 220],
      ].map(([x, y, w], i) => (
        <motion.rect key={i} x={x} y={y} width={w} height="18" rx="9" fill={cream} initial={{ x: i % 2 ? 20 : -20 }} animate={{ x: 0 }} transition={{ duration: 2, ease: EASE, delay: 0.2 * i }} />
      ))}
      <rect y="390" width="400" height="90" fill={indigo} />
      {[20, 90, 160, 230, 300, 370].map((x, i) => (
        <g key={x} transform={`translate(${x} ${400 + (i % 2) * 18})`}>
          <path d="M-28 30 C -20 4 10 -6 26 8 C 14 4 2 10 6 22 C 10 16 20 16 22 22" fill="none" stroke={cream} strokeWidth="3" strokeLinecap="round" />
          {[0, 1, 2].map((k) => (
            <circle key={k} cx={-6 + k * 9} cy={-6 - k * 2} r="2" fill={cream} />
          ))}
        </g>
      ))}
      <rect x="28" y="36" width="44" height="190" fill="#e9d6ad" stroke={indigo} strokeWidth="2" />
      {String(year)
        .split("")
        .map((d, i) => (
          <text key={i} x="50" y={86 + i * 40} textAnchor="middle" fill={indigo} style={{ ...DISPLAY, fontSize: 38 }}>
            {d}
          </text>
        ))}
      <rect x="338" y="414" width="34" height="34" fill="#c8382e" />
      <text x="355" y="436" textAnchor="middle" fill={cream} style={{ ...DISPLAY, fontSize: span > 9 ? 13 : 15 }}>
        {span}年
      </text>
    </Frame>
  );
}

/** Surrealism: a doorway standing alone in the desert, opening onto a bright day. */
function DoorwayScene({ year, span }: SceneProps) {
  const uid = useUid();
  const stars = React.useMemo(() => scatter(30, 31), []);
  return (
    <Frame label={`Illustration: a surreal open door in the desert with daylight beyond, and ${yearsInWords(span)} of footprints leading to it, ${year}`}>
      <defs>
        <linearGradient id={`do-sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e1b3a" />
          <stop offset="0.6" stopColor="#5b3f6e" />
          <stop offset="1" stopColor="#d98c6a" />
        </linearGradient>
        <linearGradient id={`do-ground-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9805c" />
          <stop offset="1" stopColor="#5a3628" />
        </linearGradient>
        <linearGradient id={`do-day-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fd0ff" />
          <stop offset="1" stopColor="#fff4cf" />
        </linearGradient>
        <clipPath id={`do-open-${uid}`}>
          <rect x="164" y="166" width="76" height="168" />
        </clipPath>
      </defs>
      <rect width="400" height="480" fill={`url(#do-sky-${uid})`} />
      {stars.map((s, i) => (
        <circle key={i} cx={s.x * 400} cy={s.y * 200} r={s.r * 0.8} fill="#fff" opacity={s.o * 0.8} />
      ))}
      <circle cx="320" cy="126" r="16" fill="#f5e9c8" />
      <circle cx="326" cy="122" r="14" fill="#2b2548" />
      <rect y="334" width="400" height="146" fill={`url(#do-ground-${uid})`} />
      <motion.polygon points="164,334 240,334 330,480 70,480" fill="#fff1b8" initial={{ opacity: 0.35 }} animate={{ opacity: [0.35, 0.6, 0.35] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} />
      <rect x="154" y="156" width="96" height="178" fill="#f3e9d8" />
      <rect x="164" y="166" width="76" height="168" fill={`url(#do-day-${uid})`} />
      <g clipPath={`url(#do-open-${uid})`}>
        <motion.g initial={{ x: -30 }} animate={{ x: 30 }} transition={{ duration: 14, repeat: Infinity, repeatType: "mirror", ease: "linear" }}>
          {[
            [170, 206],
            [222, 250],
            [188, 290],
          ].map(([x, y], i) => (
            <g key={i} fill="#fff">
              <circle cx={x} cy={y} r="10" />
              <circle cx={x + 12} cy={y - 5} r="12" />
              <circle cx={x + 26} cy={y} r="9" />
              <rect x={x} y={y} width="26" height="9" />
            </g>
          ))}
        </motion.g>
      </g>
      <path d="M164 166 L124 176 L124 340 L164 334 Z" fill="#3b2c3f" />
      <circle cx="132" cy="258" r="3" fill="#d9b45a" />
      <rect x="182" y="140" width="40" height="13" rx="2" fill="#3b2c3f" />
      <text x="202" y="150" textAnchor="middle" fill="#f3e9d8" style={{ ...MONO, fontSize: 9, letterSpacing: "0.1em" }}>
        {year}
      </text>
      <path d="M205 404 L215 404 L280 470 L262 470 Z" fill="#5a3628" opacity="0.45" />
      {/* Footprints up to the door, a step for each year. */}
      {Array.from({ length: marks(span) }, (_, i) => i).map((i, _, all) => {
        const t = all.length === 1 ? 0 : i / (all.length - 1);
        const x = 186 + 22 * t + (i % 2 ? 5 : -5) * (1 - t * 0.5);
        const y = 474 - 62 * t;
        return <ellipse key={i} cx={x} cy={y} rx={4 - 1.8 * t} ry={2.2 - t} fill="#2a1a1c" opacity="0.75" />;
      })}
      <g fill="#241a26">
        <circle cx="210" cy="372" r="5" />
        <path d="M204 380 H216 L214 400 H206 Z" />
        <rect x="205" y="399" width="3.5" height="7" />
        <rect x="211.5" y="399" width="3.5" height="7" />
      </g>
      <text x="200" y="64" textAnchor="middle" fill="#f5e9c8" style={{ ...DISPLAY, fontSize: 34, fontStyle: "italic" }}>
        Ceci n&apos;est pas un rêve
      </text>
    </Frame>
  );
}

/** Art Deco: a gold orrery, today and the future on their orbits around a sunburst. */
function OrbitScene({ year, span }: SceneProps) {
  const uid = useUid();
  const gold = "#d9b45a";
  const stars = React.useMemo(() => scatter(50, 17), []);
  const orbit = (rx: number, ry: number, steps = 36, start = 0) => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = start + (i / steps) * Math.PI * 2;
      xs.push(200 + Math.cos(a) * rx);
      ys.push(236 + Math.sin(a) * ry);
    }
    return { cx: xs, cy: ys };
  };
  const planets = [
    { rx: 74, ry: 30, r: 6, d: 14, start: 0.4, label: "TODAY" },
    { rx: 116, ry: 48, r: 8, d: 24, start: 2.2, label: "" },
    { rx: 158, ry: 66, r: 11, d: 36, start: 4.1, label: String(year) },
  ];
  return (
    <Frame label={`Illustration: an Art Deco orrery in gold, its outer orbit marked in ${yearsInWords(span)}, ${year}`}>
      <defs>
        <radialGradient id={`or-sun-${uid}`} cx="40%" cy="40%" r="60%">
          <stop offset="0" stopColor="#fff2c2" />
          <stop offset="1" stopColor={gold} />
        </radialGradient>
      </defs>
      <rect width="400" height="480" fill="#0b0b0d" />
      {stars.map((s, i) => (
        <circle key={i} cx={s.x * 400} cy={s.y * 480} r={s.r * 0.6} fill={gold} opacity={s.o * 0.6} />
      ))}
      <rect x="16" y="16" width="368" height="448" fill="none" stroke={gold} strokeWidth="1.5" />
      <rect x="24" y="24" width="352" height="432" fill="none" stroke={gold} strokeWidth="0.6" />
      {[
        [24, 24, 0],
        [376, 24, 90],
        [376, 456, 180],
        [24, 456, 270],
      ].map(([x, y, r]) => (
        <g key={`${x}-${y}`} transform={`translate(${x} ${y}) rotate(${r})`} stroke={gold} strokeWidth="0.8" fill="none">
          {[14, 24, 34].map((rad) => (
            <path key={rad} d={`M${rad} 0 A${rad} ${rad} 0 0 1 0 ${rad}`} />
          ))}
        </g>
      ))}
      <motion.g initial={{ rotate: 0 }} animate={{ rotate: 360 }} transition={{ duration: 120, repeat: Infinity, ease: "linear" }}>
        {Array.from({ length: 48 }, (_, i) => {
          const a = (i / 48) * Math.PI * 2;
          const len = i % 2 ? 60 : 110;
          return <line key={i} x1={200 + Math.cos(a) * 34} y1={236 + Math.sin(a) * 34} x2={200 + Math.cos(a) * len} y2={236 + Math.sin(a) * len} stroke={gold} strokeOpacity="0.3" strokeWidth="0.8" />;
        })}
      </motion.g>
      {planets.map((p) => (
        <ellipse key={p.rx} cx="200" cy="236" rx={p.rx} ry={p.ry} fill="none" stroke={gold} strokeOpacity="0.7" strokeWidth="0.9" />
      ))}
      {/* The future's orbit, marked in years. */}
      {Array.from({ length: marks(span, 30) }, (_, i) => i).map((i, _, all) => {
        const a = (i / all.length) * Math.PI * 2 - Math.PI / 2;
        const [c, s] = [Math.cos(a), Math.sin(a)];
        return <line key={i} x1={200 + c * 152} y1={236 + s * 62} x2={200 + c * 166} y2={236 + s * 71} stroke={gold} strokeWidth="1.2" />;
      })}
      <circle cx="200" cy="236" r="26" fill={`url(#or-sun-${uid})`} />
      <circle cx="200" cy="236" r="32" fill="none" stroke={gold} strokeWidth="0.8" />
      {planets.map((p) => {
        const path = orbit(p.rx, p.ry, 36, p.start);
        return (
          <motion.g key={p.rx} initial={{ x: path.cx[0] - 200, y: path.cy[0] - 236 }} animate={{ x: path.cx.map((v) => v - 200), y: path.cy.map((v) => v - 236) }} transition={{ duration: p.d, repeat: Infinity, ease: "linear" }}>
            <circle cx="200" cy="236" r={p.r} fill={p.label === String(year) ? "#c4d66a" : gold} />
            {p.label && (
              <text x="200" y={236 - p.r - 6} textAnchor="middle" fill={p.label === String(year) ? "#c4d66a" : gold} style={{ ...MONO, fontSize: 9, letterSpacing: "0.15em" }}>
                {p.label}
              </text>
            )}
          </motion.g>
        );
      })}
      <text x="200" y="74" textAnchor="middle" fill={gold} style={{ ...DISPLAY, fontSize: 30, letterSpacing: "0.3em" }}>
        ANNO {year}
      </text>
      <line x1="130" x2="270" y1="88" y2="88" stroke={gold} strokeWidth="0.8" />
      <text x="200" y="106" textAnchor="middle" fill={gold} opacity="0.8" style={{ ...MONO, fontSize: 9, letterSpacing: "0.3em" }}>
        {spanCaps(span)} AROUND THE SUN
      </text>
      <text x="200" y="420" textAnchor="middle" fill={gold} style={{ ...DISPLAY, fontSize: 20, fontStyle: "italic", letterSpacing: "0.08em" }}>
        per aspera ad astra
      </text>
    </Frame>
  );
}

export interface Cover {
  id: string;
  caption: (year: number, span: number) => string;
  /** Words in the aspiration that make this cover a good fit. */
  keywords?: RegExp;
  Scene: (props: SceneProps) => React.ReactNode;
}

export const COVERS: Cover[] = [
  { id: "horizon", caption: (y, s) => `The horizon you named, ${y}, ${yearsInWords(s)} down the road.`, keywords: /\b(dream|horizon|hope|someday)\b/, Scene: HorizonScene },
  { id: "skyline", caption: (y, s) => `The city you built in ${yearsInWords(s)}, ${y}. After the synthwave posters.`, keywords: /\b(compan(y|ies)|business|startup|city|career|ceo|founder|money|finance|brand|market)\b/, Scene: SkylineScene },
  { id: "voyage", caption: (_, s) => `A voyage of ${yearsInWords(s)}, a buoy for each year. After the old sea engravings.`, keywords: /\b(travel|world|sea|ocean|explore|abroad|freedom|journey|sail)\b/, Scene: VoyageScene },
  { id: "bauhaus", caption: (y, s) => `Form follows future, ${y}: a dot for each of ${yearsInWords(s)}. After the Bauhaus.`, keywords: /\b(design|art|artist|architect\w*|creative|create|craft|product|music)\b/, Scene: BauhausScene },
  { id: "circuit", caption: (y, s) => `Schematic for ${y}, ${yearsInWords(s)} in the build. A blueprint in progress.`, keywords: /\b(ai|software|code|coding|tech\w*|engineer\w*|data|computer|app|developer|digital|robot\w*)\b/, Scene: CircuitScene },
  { id: "seedling", caption: (_, s) => `Perennis futura, grown over ${yearsInWords(s)}. A botanical plate.`, keywords: /\b(grow\w*|farm\w*|crop\w*|health|garden|family|nature|heal\w*|teach\w*|community|children)\b/, Scene: SeedlingScene },
  { id: "rocket", caption: (y, s) => `Liftoff in ${y}, after a ${yearsInWords(s).replace(/ years?$/, "-year")} countdown. A risograph print.`, keywords: /\b(launch|scale|million|rocket|space|ambition|global|fast)\b/, Scene: RocketScene },
  { id: "map", caption: (y, s) => `The route to ${y}, one contour for each of ${yearsInWords(s)}. A survey map.`, keywords: /\b(path|map|adventure|research|discover|africa|country|land|home)\b/, Scene: MapScene },
  { id: "woodblock", caption: (y, s) => `View of the summit, ${y}, a turn in the trail for each of ${yearsInWords(s)}. After the woodblock masters.`, keywords: /\b(discipline|master\w*|peace|mind|calm|balance|focus|sport\w*|athlete|fitness)\b/, Scene: WoodblockScene },
  { id: "doorway", caption: (_, s) => `The door you opened, ${yearsInWords(s)} of footsteps away. After the surrealists.`, keywords: /\b(new|change|opportunit\w*|study|universit\w*|degree|move|start|school)\b/, Scene: DoorwayScene },
  { id: "orbit", caption: (y, s) => `Anno ${y}, ${yearsInWords(s)} around the sun. An Art Deco orrery.`, keywords: /\b(science|scien\w*|physics|vision|lead\w*|universe|impact|star\w*)\b/, Scene: OrbitScene },
];

/** The cover that fits this reflection: one whose subject matches the aspiration, varied by the reflection. */
export function coverIndexFor(seed: string, aspiration: string) {
  const text = aspiration.toLowerCase();
  const fits = COVERS.filter((c) => c.keywords?.test(text));
  const pool = fits.length ? fits : COVERS;
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COVERS.indexOf(pool[h % pool.length]);
}

/** Plate I: the issue's cover, with a button to try another one. */
export function CoverPlate({ index, year, span, onShuffle, className }: SceneProps & { index: number; onShuffle?: () => void; className?: string }) {
  const cover = COVERS[index % COVERS.length];
  return (
    <Plate
      className={className}
      caption={
        <>
          <span className="text-copper">Plate I.</span>
          <span className="min-w-0 flex-1">{cover.caption(year, span)}</span>
          {onShuffle && (
            <button
              type="button"
              onClick={onShuffle}
              className="inline-flex shrink-0 items-center gap-1.5 self-center rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            >
              <Shuffle className="size-3" /> Another cover
            </button>
          )}
        </>
      }
    >
      <div className="grid">
        <AnimatePresence initial={false}>
          <motion.div key={cover.id} className="[grid-area:1/1]" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: EASE }}>
            <cover.Scene year={year} span={span} />
          </motion.div>
        </AnimatePresence>
      </div>
    </Plate>
  );
}
