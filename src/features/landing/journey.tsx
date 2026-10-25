"use client";

import { Check, Compass, MessageSquareText, Route, Scale } from "lucide-react";
import { AnimatePresence, motion, useInView, useReducedMotionConfig } from "motion/react";
import * as React from "react";
import { LivingMark } from "@/components/brand/living-mark";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
const DWELL_MS = 5200;

const STEPS = [
  { title: "Understand me", icon: MessageSquareText, body: "A short conversation about where you are, what you want and what's in the way. Skip anything you'd rather not share, and change it later." },
  { title: "Explore futures", icon: Route, body: "Clearly different roads to your goal: how you might learn, pay and where. Each one names its assumptions, ranges and risks." },
  { title: "Compare and choose", icon: Scale, body: "Every road is rated against your money, your time and the risk you can take. Change a number and they re-rank on the spot." },
  { title: "Act, review, adapt", icon: Compass, body: "Your future self turns the road you chose into the next few steps. You check in as life changes, and the plan changes with it." },
] as const;

/**
 * How it works, as the journey itself: four steps on a lit rail, and a glass screen that acts each one out. It moves on
 * by itself while it's on screen, pauses while you point at it or focus it, and any step can be picked. The scenes are
 * illustrations with fixed example data; nothing here calls a model.
 */
export function Journey() {
  const [active, setActive] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const root = React.useRef<HTMLDivElement>(null);
  const inView = useInView(root, { amount: 0.35 });
  const reduce = useReducedMotionConfig();
  const running = inView && !paused && !reduce;

  React.useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % STEPS.length), DWELL_MS);
    return () => clearTimeout(t);
  }, [running, active]);

  return (
    <div
      ref={root}
      className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-10"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setPaused(false)}
    >
      <ol className="relative grid gap-3">
        <span aria-hidden className="absolute top-7 bottom-7 left-[27px] w-px bg-border">
          <motion.span className="absolute inset-x-0 top-0 bg-gradient-to-b from-bronze to-accent shadow-[0_0_10px_var(--accent)]" initial={false} animate={{ height: `${(active / (STEPS.length - 1)) * 100}%` }} transition={{ duration: 0.8, ease: EASE }} />
        </span>
        {STEPS.map((s, i) => {
          const on = i === active;
          const Icon = s.icon;
          return (
            <li key={s.title}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-current={on ? "step" : undefined}
                className={cn(
                  "group relative flex w-full items-start gap-4 overflow-hidden rounded-2xl border p-4 text-left transition-[background-color,border-color,box-shadow] duration-300 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "border-accent/50 bg-surface shadow-[0_18px_44px_-26px_rgb(30_26_18/0.5),0_0_0_1px_rgb(200_183_143/0.25)]" : "border-transparent hover:border-border hover:bg-surface/60",
                )}
              >
                <span className={cn("relative z-10 flex size-[23px] shrink-0 items-center justify-center rounded-full border bg-background font-mono text-[10.5px] tabular-nums transition-colors duration-300", on ? "border-accent text-accent-ink shadow-[0_0_14px_-2px_var(--accent)]" : "border-border text-subtle")}>
                  {i < active ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <Icon className={cn("size-4 transition-colors", on ? "text-accent-ink" : "text-subtle")} aria-hidden />
                    <span className="text-[16px] font-semibold tracking-[-0.01em]">{s.title}</span>
                  </span>
                  <span className={cn("mt-1.5 block text-[13.5px] leading-relaxed text-muted-foreground transition-opacity", on ? "opacity-100" : "opacity-75")}>{s.body}</span>
                </span>
                {on && running && <motion.span key={`bar-${active}`} aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-gradient-to-r from-bronze to-accent" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: DWELL_MS / 1000, ease: "linear" }} />}
              </button>
            </li>
          );
        })}
      </ol>

      <Stage active={active} />
    </div>
  );
}

/** The glass screen: always the night scene, with the living mark watching and a scene per step. */
function Stage({ active }: { active: number }) {
  return (
    <div data-theme="dark" className="relative isolate min-h-[26rem] overflow-hidden rounded-[1.75rem] bg-[#0B0C10] p-5 text-foreground ring-1 ring-black/10 sm:p-7">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-1/3 -left-1/4 size-[36rem] animate-[aurora_22s_ease-in-out_infinite] rounded-full bg-[radial-gradient(closest-side,rgb(200_183_143/0.22),transparent)] blur-3xl" />
        <div className="absolute -right-1/4 -bottom-1/3 size-[32rem] animate-[aurora_28s_ease-in-out_infinite_reverse] rounded-full bg-[radial-gradient(closest-side,rgb(200_146_95/0.18),transparent)] blur-3xl" />
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.04)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,#000_25%,transparent_80%)]" />
      </div>

      <div className="flex items-center gap-3">
        <div className="w-12 shrink-0">
          <LivingMark progress={0.15 + active * 0.28} />
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[10.5px] tracking-[0.24em] text-[#C8B78F] uppercase">Step 0{active + 1} of 04</p>
          <p className="font-display text-[1.35rem] leading-tight text-[#F3F0E8]">{STEPS[active].title}</p>
        </div>
        <div className="ml-auto flex gap-1.5" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className={cn("h-1.5 rounded-full transition-all duration-500", i === active ? "w-5 bg-[#C8B78F] shadow-[0_0_8px_#C8B78F]" : "w-1.5 bg-white/20")} />
          ))}
        </div>
      </div>

      <div className="glass-panel mt-5 min-h-[18.5rem] rounded-2xl p-5" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={active} initial={{ opacity: 0, y: 14, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -10, filter: "blur(8px)" }} transition={{ duration: 0.45, ease: EASE }}>
            {active === 0 && <UnderstandScene />}
            {active === 1 && <FuturesScene />}
            {active === 2 && <CompareScene />}
            {active === 3 && <ActScene />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

const appear = (i: number) => ({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.15 + i * 0.35, duration: 0.45, ease: EASE } });

function UnderstandScene() {
  return (
    <div className="grid gap-3 text-[13px]">
      <motion.p {...appear(0)} className="max-w-[85%] rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-[#F3F0E8]/90">
        Where are you now, and what&apos;s in the way?
      </motion.p>
      <motion.p {...appear(1)} className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[#C8B78F] px-3.5 py-2.5 text-[#14120D]">
        Full-stack developer, two hours most evenings. No GPU, no publications yet.
      </motion.p>
      <motion.div {...appear(2)} className="mt-1 flex flex-wrap gap-1.5">
        {["Ambition: AI lab, 2036", "Time: ~10 h/week", "Blocker: compute", "Values: craft, family"].map((c) => (
          <span key={c} className="rounded-full border border-[#C8B78F]/35 bg-[#C8B78F]/10 px-2.5 py-1 text-[11.5px] text-[#E9DFC6]">
            {c}
          </span>
        ))}
      </motion.div>
      <motion.p {...appear(3)} className="text-[11.5px] text-[#F3F0E8]/45">
        Saved as notes you can read, edit or delete.
      </motion.p>
    </div>
  );
}

function FuturesScene() {
  const roads = [
    { d: "M30 120 C 110 120, 140 40, 260 40", label: "A · Self-study", y: 40 },
    { d: "M30 120 C 110 120, 160 120, 260 120", label: "B · Work and study", y: 120 },
    { d: "M30 120 C 110 120, 140 200, 260 200", label: "C · Formal education", y: 200 },
  ];
  return (
    <svg viewBox="0 0 420 240" className="w-full" role="img" aria-label="Three different roads branching from today">
      <circle cx="30" cy="120" r="7" fill="#C8925F" />
      <circle cx="30" cy="120" r="14" stroke="#C8925F" strokeOpacity="0.35" />
      <text x="30" y="150" textAnchor="middle" className="fill-[#F3F0E8]/50 font-mono text-[10px] tracking-[0.2em]">
        TODAY
      </text>
      {roads.map((r, i) => (
        <g key={r.label}>
          <motion.path d={r.d} stroke="#C8B78F" strokeOpacity="0.85" strokeWidth="2" fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.15 + i * 0.3, duration: 1, ease: EASE }} />
          <motion.g initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.9 + i * 0.3, duration: 0.4 }} style={{ transformOrigin: `260px ${r.y}px` }}>
            <circle cx="260" cy={r.y} r="9" fill="#0B0C10" stroke="#C8B78F" strokeWidth="1.5" />
            <text x="276" y={r.y + 4} className="fill-[#F3F0E8]/85 text-[11.5px]">
              {r.label}
            </text>
          </motion.g>
        </g>
      ))}
    </svg>
  );
}

function CompareScene() {
  const roads = [
    { name: "Self-study", money: 90, time: 45, risk: 55 },
    { name: "Work and study", money: 70, time: 75, risk: 85, best: true },
    { name: "Formal education", money: 25, time: 60, risk: 70 },
  ];
  return (
    <div className="grid gap-3.5">
      {roads.map((r, i) => (
        <motion.div key={r.name} {...appear(i * 0.6)} className={cn("rounded-xl border px-3.5 py-3", r.best ? "border-[#C8B78F]/55 bg-[#C8B78F]/[0.08] shadow-[0_0_30px_-14px_#C8B78F]" : "border-white/10 bg-white/[0.03]")}>
          <div className="flex items-center justify-between text-[13px] text-[#F3F0E8]">
            {r.name}
            {r.best && <span className="rounded-full bg-[#C8B78F] px-2 py-0.5 text-[10.5px] font-medium text-[#14120D]">Best fit for you</span>}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-3">
            {(["money", "time", "risk"] as const).map((k, j) => (
              <div key={k}>
                <p className="text-[10.5px] text-[#F3F0E8]/45 capitalize">{k}</p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <motion.div className="h-full rounded-full bg-gradient-to-r from-[#C8925F] to-[#C8B78F]" initial={{ width: 0 }} animate={{ width: `${r[k]}%` }} transition={{ delay: 0.3 + i * 0.2 + j * 0.08, duration: 0.8, ease: EASE }} />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function ActScene() {
  const steps = ["Pick one crop-disease dataset", "Train a small classifier this week", "Show it to one farmer by Sunday"];
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <ul className="grid gap-2.5">
        {steps.map((s, i) => (
          <motion.li key={s} {...appear(i)} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-[#F3F0E8]/90">
            <motion.span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-[#C8B78F]" initial={{ backgroundColor: "rgba(200,183,143,0)" }} animate={{ backgroundColor: "rgba(200,183,143,1)" }} transition={{ delay: 0.6 + i * 0.45, duration: 0.3 }}>
              <motion.span initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.7 + i * 0.45 }}>
                <Check className="size-3 text-[#14120D]" strokeWidth={3} />
              </motion.span>
            </motion.span>
            {s}
          </motion.li>
        ))}
        <motion.li {...appear(3.2)} className="text-[11.5px] text-[#F3F0E8]/45">
          Review in two weeks. If life changes, the plan changes with it.
        </motion.li>
      </ul>
      <div className="relative mx-auto size-28">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r="42" stroke="rgb(255 255 255 / 0.1)" strokeWidth="6" fill="none" />
          <motion.circle cx="50" cy="50" r="42" stroke="#C8B78F" strokeWidth="6" strokeLinecap="round" fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.6, duration: 1.6, ease: EASE }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl text-[#F3F0E8]">3/3</span>
          <span className="text-[10.5px] text-[#F3F0E8]/50">this week</span>
        </div>
      </div>
    </div>
  );
}
