"use client";

import { useMotionValue, useReducedMotionConfig, useSpring, type MotionValue } from "motion/react";
import * as React from "react";

/**
 * Where the pointer is, seen from an element: x and y from -1 to 1 (a unit disc), springy, so things can "look" at the
 * cursor anywhere on the page, not only while hovered. On touch screens, where there is no pointer to follow, the gaze
 * wanders slowly in a circle so the mark still feels alive. Stays at 0 under reduced motion.
 */
export function useGaze(ref: React.RefObject<HTMLElement | null>, { reach = 520, stiffness = 90, damping = 14 } = {}): { x: MotionValue<number>; y: MotionValue<number> } {
  const reduce = useReducedMotionConfig();
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, { stiffness, damping });
  const y = useSpring(rawY, { stiffness, damping });

  React.useEffect(() => {
    if (reduce) {
      rawX.set(0);
      rawY.set(0);
      return;
    }
    const look = (cx: number, cy: number) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      let dx = (cx - (r.left + r.width / 2)) / reach;
      let dy = (cy - (r.top + r.height / 2)) / reach;
      const d = Math.hypot(dx, dy);
      if (d > 1) {
        dx /= d;
        dy /= d;
      }
      rawX.set(dx);
      rawY.set(dy);
    };

    if (window.matchMedia("(hover: none)").matches) {
      let frame = 0;
      const start = performance.now();
      const wander = (t: number) => {
        const s = (t - start) / 1000;
        rawX.set(Math.cos(s * 0.55) * 0.55);
        rawY.set(Math.sin(s * 0.8) * 0.4);
        frame = requestAnimationFrame(wander);
      };
      frame = requestAnimationFrame(wander);
      return () => cancelAnimationFrame(frame);
    }

    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => look(e.clientX, e.clientY));
    };
    const rest = () => {
      rawX.set(0);
      rawY.set(0);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", rest);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", rest);
    };
  }, [reduce, reach, ref, rawX, rawY]);

  return { x, y };
}
