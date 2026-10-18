"use client";

import * as React from "react";

/** Feeds the pointer position to the card under it (as --mx/--my), so its light follows the cursor. Mouse only. */
export function SpotlightTracker() {
  React.useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    const paint = () => {
      frame = 0;
      const e = last;
      if (!e || !(e.target instanceof Element)) return;
      const card = e.target.closest<HTMLElement>(".card");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
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
