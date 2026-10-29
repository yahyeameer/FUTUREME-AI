"use client";

import * as React from "react";

/**
 * A tab that was open while a new version was deployed asks for code files that no longer exist. That isn't a real
 * failure: reloading once picks up the new version. The flag stops a page that keeps failing from reloading forever.
 */
const STALE = /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Failed to find Server Action|module factory is not available/i;
const KEY = "tomora-reloaded-after-deploy";

export function useRecoverFromDeploy(error: Error) {
  const stale = STALE.test(`${error.name} ${error.message}`);
  React.useEffect(() => {
    console.error(error);
    if (!stale) return;
    try {
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, "1");
    } catch {
      return;
    }
    window.location.reload();
  }, [error, stale]);
  React.useEffect(() => {
    // Once a page has been up for a while, a later deploy may reload it again.
    const t = setTimeout(() => {
      try {
        sessionStorage.removeItem(KEY);
      } catch {}
    }, 30_000);
    return () => clearTimeout(t);
  }, []);
  return stale;
}
