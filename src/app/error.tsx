"use client";

import { Button } from "@/components/ui/button";
import { useRecoverFromDeploy } from "./recover";

/** Any page that fails shows this inside the app (sidebar and all) instead of Next's blank "This page couldn't load". */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const updating = useRecoverFromDeploy(error);
  return (
    <div className="mx-auto w-full max-w-xl px-6 py-20 text-center">
      <h1 className="font-display text-3xl">{updating ? "TOMORA just updated" : "This part of TOMORA hit a snag"}</h1>
      <p className="mt-3 text-[14px] text-muted-foreground">
        {updating ? "Loading the new version…" : "Your notes and chats are safe. Try again, or reload the page."}
      </p>
      {!updating && (
        <>
          <p className="mt-3 font-mono text-[11px] break-words text-muted-foreground/70">{error.digest ? `Server error ${error.digest}` : error.message}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button onClick={() => retry()}>Try again</Button>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
