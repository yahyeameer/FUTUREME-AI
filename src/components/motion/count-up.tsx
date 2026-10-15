"use client";

import { useReducedMotion } from "motion/react";
import * as React from "react";

/** Counts up to a real value when it mounts. Shows the value directly under reduced motion. */
export function CountUp({ value, duration = 1100, className }: { value: number; duration?: number; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = React.useState(0);

  React.useEffect(() => {
    if (reduce) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(value * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduce]);

  return (
    <span className={className}>
      <span aria-hidden>{shown}</span>
      <span className="sr-only">{value}</span>
    </span>
  );
}
