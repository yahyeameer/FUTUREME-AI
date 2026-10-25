"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "@/components/brand/mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ERRORS: Record<string, string> = {
  wrong: "That code isn't right.",
  wait: "Too many wrong codes. Wait 15 minutes and try again.",
};

/**
 * The access lock's sign-in form. It posts to /api/login, which sets the cookie and sends you back.
 * shownCode: a demo server that wants one-click entry passes the code, and the form offers to fill it in.
 * workspaces: in multi-user mode every visitor gets a private workspace; the optional field picks up an old one.
 */
export function SignIn({ shownCode = null, workspaces = false }: { shownCode?: string | null; workspaces?: boolean }) {
  const params = useSearchParams();
  const error = ERRORS[params.get("error") ?? ""];
  const [code, setCode] = useState("");
  return (
    <form method="post" action="/api/login" className="w-full max-w-sm rounded-2xl border border-border bg-surface p-7 shadow-card">
      <Wordmark withSymbol />
      <h1 className="mt-8 font-display text-[1.9rem] leading-tight">{workspaces ? "Meet your future self." : "Welcome back."}</h1>
      <p className="mt-1.5 text-[13px] text-muted-foreground">
        {workspaces ? "Enter the access code to open a private workspace of your own. Nobody else sees what you create." : "This TOMORA is private. Enter the access code to open it."}
      </p>
      <input type="hidden" name="next" value={params.get("next") ?? "/"} />
      {shownCode && (
        <div className="mt-5 rounded-xl border border-border bg-background px-3.5 py-3">
          <p className="text-[12px] text-muted-foreground">Judges, your access code:</p>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <code className="min-w-0 break-all font-mono text-[13px] text-foreground">{shownCode}</code>
            <Button type="button" variant="secondary" size="sm" onClick={() => setCode(shownCode)}>
              Use it
            </Button>
          </div>
        </div>
      )}
      <label htmlFor="code" className="mt-5 block text-[12.5px] text-muted-foreground">
        Access code
      </label>
      <Input
        id="code"
        name="code"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="mt-1.5"
        aria-invalid={!!error}
        aria-describedby={error ? "code-error" : undefined}
      />
      {error && (
        <p id="code-error" role="alert" className="mt-2 text-[12.5px] text-destructive">
          {error}
        </p>
      )}
      {workspaces && (
        <details className="mt-4 text-[12.5px] text-muted-foreground">
          <summary className="cursor-pointer select-none">Coming back? Use your workspace code</summary>
          <Input name="workspace" autoComplete="off" spellCheck={false} placeholder="32-character workspace code (optional)" className="mt-2 font-mono text-[12px]" />
          <p className="mt-1.5 text-[12px] text-subtle">You&apos;ll find it under Settings. Leave this empty to start a new future self.</p>
        </details>
      )}
      <Button type="submit" variant="primary" className="mt-4 w-full">
        {workspaces ? "Open my workspace" : "Sign in"}
      </Button>
      <p className="mt-5 text-center text-[12px] text-subtle">
        New here? <Link href="/welcome" className="text-accent-ink underline-offset-4 hover:underline">See what TOMORA is</Link>
      </p>
    </form>
  );
}
