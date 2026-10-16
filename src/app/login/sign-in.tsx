"use client";

import { LockKeyhole } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ERRORS: Record<string, string> = {
  wrong: "That code isn't right.",
  wait: "Too many wrong codes. Wait 15 minutes and try again.",
};

/** The access lock's sign-in form. It posts to /api/login, which sets the cookie and sends you back. */
export function SignIn() {
  const params = useSearchParams();
  const error = ERRORS[params.get("error") ?? ""];
  return (
    <form method="post" action="/api/login" className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-card">
      <LockKeyhole className="size-5 text-subtle" aria-hidden />
      <h1 className="mt-3 font-display text-2xl">FutureMe is locked</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">Enter the access code set on this server (FUTUREME_ACCESS_CODE).</p>
      <input type="hidden" name="next" value={params.get("next") ?? "/"} />
      <label htmlFor="code" className="mt-5 block text-[12.5px] text-muted-foreground">
        Access code
      </label>
      <Input id="code" name="code" type="password" autoComplete="current-password" required autoFocus className="mt-1.5" aria-invalid={!!error} aria-describedby={error ? "code-error" : undefined} />
      {error && (
        <p id="code-error" role="alert" className="mt-2 text-[12.5px] text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" className="mt-4 w-full">
        Sign in
      </Button>
    </form>
  );
}
