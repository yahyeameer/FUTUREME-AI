"use client";

import * as React from "react";

/** Feeds the pointer position to the card under it (as --mx/--my, and --px/--py from -0.5 to 0.5), so its light follows the cursor and it can lean toward it. Mouse only. */
export function SpotlightTracker() {
  React.useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    const paint = () => {
      frame = 0;
      const e = last;
      if (!e || !(e.target instanceof Element)) return;
      const card = e.target.closest<HTMLElement>(".card, .card-hover, [data-spotlight]");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
      card.style.setProperty("--px", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
      card.style.setProperty("--py", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
    };
    const onMove = (e: PointerEvent) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
