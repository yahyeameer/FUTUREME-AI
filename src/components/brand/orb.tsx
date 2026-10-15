"use client";

import { cn } from "@/lib/utils";

/**
 * Ambient light around the Presence: citron for the future, copper for today.
 * Purely decorative; it breathes slowly and stops under reduced motion.
 */
export function Orb({ size = 280, className, children }: { size?: number; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("relative isolate flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <div aria-hidden className="absolute inset-[6%] -z-10 animate-orbit rounded-full opacity-90 blur-2xl" style={{ background: "conic-gradient(from 90deg, var(--accent), transparent 30%, var(--copper) 55%, transparent 75%, var(--accent))" }} />
      <div aria-hidden className="absolute inset-[16%] -z-10 animate-breathe rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, rgb(255 255 255 / 0.95), var(--surface) 45%, var(--surface-2) 70%)", boxShadow: "inset 0 -12px 30px -8px rgb(187 128 92 / 0.25), inset 0 10px 24px -6px rgb(255 255 255 / 0.9), 0 30px 60px -24px rgb(60 45 20 / 0.45)" }} />
      <div aria-hidden className="absolute inset-0 -z-10 animate-orbit-slow rounded-full border border-dashed border-border-strong/70" />
      <div aria-hidden className="absolute inset-0 animate-orbit [animation-duration:18s]">
        <span className="absolute top-[2%] left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_14px_var(--accent)]" />
      </div>
      <div aria-hidden className="absolute inset-[9%] animate-orbit [animation-direction:reverse] [animation-duration:30s]">
        <span className="absolute bottom-0 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-copper shadow-[0_0_10px_var(--copper)]" />
      </div>
      {children}
    </div>
  );
}
