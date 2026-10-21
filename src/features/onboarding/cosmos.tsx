import { cn } from "@/lib/utils";

/**
 * The night sky behind onboarding: drifting light, time rings turning in opposite directions (the past backward, the
 * future forward), a beam sweeping like a clock hand, and embers rising from today toward the future. Purely
 * decorative, and it stops under reduced motion with the rest of the app's animation.
 */
export function Cosmos({ step = 0, className }: { step?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {/* Drifting light; it warms as you move through the steps. */}
      <div className="absolute -top-1/4 -right-1/4 size-[80%] animate-[drift_18s_ease-in-out_infinite] rounded-full bg-[radial-gradient(closest-side,rgb(200_183_143/0.22),transparent)] blur-2xl transition-opacity duration-1000" style={{ opacity: 0.55 + step * 0.15 }} />
      <div className="absolute -bottom-1/4 -left-1/4 size-[70%] animate-[drift_24s_ease-in-out_infinite_reverse] rounded-full bg-[radial-gradient(closest-side,rgb(200_146_95/0.16),transparent)] blur-2xl" />

      <TimeRings className="absolute top-1/2 left-1/2 size-[150%] -translate-x-1/2 -translate-y-[58%]" />
      <Embers />
      {/* Grain, so the gradients don't band. */}
      <div className="absolute inset-0 opacity-[0.07] mix-blend-overlay [background-image:radial-gradient(rgb(255_255_255/0.5)_0.5px,transparent_0.5px)] [background-size:3px_3px]" />
    </div>
  );
}

/** Concentric dials: Roman hours forward, a dotted past ring backward, and a sweeping beam. */
export function TimeRings({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" className={cn("text-[#F3F0E8]", className)} fill="none">
      <defs>
        <radialGradient id="cosmos-fade">
          <stop offset="0.35" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="cosmos-mask">
          <rect width="400" height="400" fill="url(#cosmos-fade)" />
        </mask>
        <linearGradient id="cosmos-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#C8B78F" stopOpacity="0" />
          <stop offset="1" stopColor="#C8B78F" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <g mask="url(#cosmos-mask)">
        <g className="origin-center animate-[orbit_120s_linear_infinite]" style={{ transformBox: "view-box" }}>
          <circle cx="200" cy="200" r="190" stroke="currentColor" strokeOpacity="0.08" />
          {Array.from({ length: 120 }, (_, i) => {
            const a = (i / 120) * Math.PI * 2;
            const major = i % 10 === 0;
            const r1 = major ? 178 : 184;
            return <line key={i} x1={round(200 + Math.cos(a) * r1)} y1={round(200 + Math.sin(a) * r1)} x2={round(200 + Math.cos(a) * 190)} y2={round(200 + Math.sin(a) * 190)} stroke="currentColor" strokeOpacity={major ? 0.22 : 0.08} />;
          })}
        </g>
        <g className="origin-center animate-[orbit_80s_linear_infinite] [animation-direction:reverse]" style={{ transformBox: "view-box" }}>
          <circle cx="200" cy="200" r="150" stroke="#C8925F" strokeOpacity="0.22" strokeDasharray="1 7" strokeLinecap="round" strokeWidth="2" />
        </g>
        <g className="origin-center animate-[orbit_50s_linear_infinite]" style={{ transformBox: "view-box" }}>
          <circle cx="200" cy="200" r="118" stroke="#C8B78F" strokeOpacity="0.14" strokeDasharray="40 14 4 14" />
        </g>
        {/* The beam: a hand of light sweeping the dial. */}
        <g className="origin-center animate-[orbit_14s_linear_infinite]" style={{ transformBox: "view-box" }}>
          <path d="M200 200 L390 200 A190 190 0 0 0 381 142 Z" fill="url(#cosmos-beam)" opacity="0.5" />
        </g>
      </g>
    </svg>
  );
}

// Fixed positions so the server and the browser draw the same sky.
const EMBERS = (() => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  return Array.from({ length: 26 }, () => ({
    left: rand() * 100,
    size: 1.5 + rand() * 2.5,
    duration: 9 + rand() * 10,
    delay: -rand() * 18,
    bronze: rand() > 0.6,
  }));
})();

function Embers() {
  return (
    <div className="absolute inset-0">
      {EMBERS.map((e, i) => (
        <span
          key={i}
          className="absolute bottom-0 animate-[rise_linear_infinite] rounded-full"
          style={{
            left: `${e.left}%`,
            width: e.size,
            height: e.size,
            animationDuration: `${e.duration}s`,
            animationDelay: `${e.delay}s`,
            background: e.bronze ? "#C8925F" : "#E9DFC6",
            boxShadow: `0 0 ${e.size * 4}px ${e.bronze ? "#C8925F" : "#C8B78F"}`,
          }}
        />
      ))}
    </div>
  );
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
