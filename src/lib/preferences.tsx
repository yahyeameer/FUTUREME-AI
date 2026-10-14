"use client";

import { MotionConfig } from "motion/react";
import * as React from "react";

// Per-device preferences. They change how the app looks and moves, never what data it holds.

export type ThemePref = "system" | "dark" | "light";
export type MotionPref = "system" | "reduced" | "full";
export type DensityPref = "comfortable" | "compact";
export type ModePref = "auto" | "demo" | "live";

export interface Preferences {
  theme: ThemePref;
  motion: MotionPref;
  density: DensityPref;
  mode: ModePref;
  sidebarCollapsed: boolean;
  railOpen: boolean;
}

export const PREFS_KEY = "futureme.prefs";

const DEFAULTS: Preferences = { theme: "dark", motion: "system", density: "comfortable", mode: "auto", sidebarCollapsed: false, railOpen: true };

// Runs before first paint (inlined in <head>) so the theme never flashes.
export const PREFS_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem("${PREFS_KEY}")||"{}");var t=p.theme||"dark";if(t==="system")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";var d=document.documentElement;d.dataset.theme=t;d.dataset.density=p.density||"comfortable";d.dataset.motion=p.motion||"system";}catch(e){document.documentElement.dataset.theme="dark";}})();`;

interface PrefsContext extends Preferences {
  resolvedTheme: "dark" | "light";
  /** False until stored preferences have been read on the client. */
  hydrated: boolean;
  set: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
}

const Ctx = React.createContext<PrefsContext | null>(null);

function readPrefs(): Preferences {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Preferences>) };
  } catch {
    return DEFAULTS;
  }
}

function subscribeSystemTheme(cb: () => void) {
  const mq = matchMedia("(prefers-color-scheme: light)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = React.useState<Preferences>(DEFAULTS);
  const [hydrated, setHydrated] = React.useState(false);
  const systemLight = React.useSyncExternalStore(
    subscribeSystemTheme,
    () => matchMedia("(prefers-color-scheme: light)").matches,
    () => false,
  );

  React.useEffect(() => {
    // Read stored preferences after mount; the inline script already applied them to <html>.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(readPrefs());
    setHydrated(true);
  }, []);

  const resolvedTheme = prefs.theme === "system" ? (systemLight ? "light" : "dark") : prefs.theme;

  React.useEffect(() => {
    if (!hydrated) return;
    const d = document.documentElement;
    d.dataset.theme = resolvedTheme;
    d.dataset.density = prefs.density;
    d.dataset.motion = prefs.motion;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Preferences are a convenience; ignore storage failures.
    }
  }, [prefs, resolvedTheme, hydrated]);

  const set = React.useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => setPrefs((p) => ({ ...p, [key]: value })), []);
  const value = React.useMemo(() => ({ ...prefs, resolvedTheme, hydrated, set }), [prefs, resolvedTheme, hydrated, set]);

  return (
    <Ctx.Provider value={value}>
      <MotionConfig reducedMotion={prefs.motion === "reduced" ? "always" : prefs.motion === "full" ? "never" : "user"}>{children}</MotionConfig>
    </Ctx.Provider>
  );
}

export function usePreferences() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("usePreferences must be used inside PreferencesProvider");
  return ctx;
}
