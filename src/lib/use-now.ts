"use client";

import * as React from "react";

// One shared ticker for clocks on screen. It reports whole minutes, so components re-render once a minute at most.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  timer ??= setInterval(() => listeners.forEach((l) => l()), 10_000);
  return () => {
    listeners.delete(onChange);
    if (!listeners.size) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const minuteNow = () => Math.floor(Date.now() / 60_000);

/** The current time to the minute, or null while rendering on the server (so the markup hydrates cleanly). */
export function useNow(): Date | null {
  const minute = React.useSyncExternalStore(subscribe, minuteNow, () => null);
  return React.useMemo(() => (minute === null ? null : new Date(minute * 60_000)), [minute]);
}
