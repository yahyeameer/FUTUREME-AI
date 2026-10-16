"use client";

import { Ban, Check, ShieldAlert } from "lucide-react";
import { SectionHeading } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { relativeDay } from "@/lib/utils";
import type { TwinState } from "@/app/api/twin/state";
import { post, type Act } from "./api";

// Phase 4's review queue: signs of abuse or misuse (strangers, blocked callers, mail that gives orders, hit limits).
// Nothing here happened without the twin refusing it first; the queue is so you know, and can block or dismiss.

const fromSql = (s: string) => new Date(`${s.replace(" ", "T")}Z`).toISOString();
const isPhone = (s: string) => /^\+[1-9]\d{6,14}$/.test(s);

export function ReviewSection({ state, act }: { state: TwinState; act: Act }) {
  const flags = state.guard.flags;
  if (!flags.length) return null;
  return (
    <section aria-labelledby="review-h">
      <SectionHeading id="review-h">Needs a look · {flags.length}</SectionHeading>
      <p className="-mt-1 mb-3 max-w-2xl text-[12.5px] text-muted-foreground">Your twin refused each of these. They&apos;re here so you know, and can block a number or dismiss the item.</p>
      <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
        {flags.map((f) => {
          const blocked = state.calls.blocked.includes(f.subject);
          const canBlock = (f.kind === "repeat_caller" || f.kind === "blocked_caller") && isPhone(f.subject) && !blocked;
          return (
            <li key={f.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-copper" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                  {f.label}
                  {f.count > 1 && <Badge tone="neutral">{f.count} times</Badge>}
                </p>
                <p className="mt-0.5 text-[12.5px] break-words text-muted-foreground">{f.detail}</p>
                <p className="mt-0.5 text-[12px] text-subtle">{relativeDay(fromSql(f.at))}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {canBlock && (
                  <Button size="sm" variant="secondary" onClick={() => act(() => post({ action: "setBlocked", number: f.subject, blocked: true }), "Blocked. Your twin won't talk to this number.")}>
                    <Ban /> Block
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => act(() => post({ action: "dismissFlag", id: f.id }))}>
                  <Check /> Dismiss
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
