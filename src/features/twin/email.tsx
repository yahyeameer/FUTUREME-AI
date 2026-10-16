"use client";

import { AtSign, Inbox, Loader2, Mail } from "lucide-react";
import * as React from "react";
import { SectionHeading } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { relativeDay } from "@/lib/utils";
import type { TwinState } from "@/app/api/twin/state";
import { post, type Act } from "./api";

// Phase 3: the twin's own inbox (AgentMail). It never writes from your address; you're cc'd on what it sends.

const fromSql = (s: string) => new Date(`${s.replace(" ", "T")}Z`).toISOString();

const STATUS: Record<string, { label: string; tone: "neutral" | "accent" | "success" }> = {
  received: { label: "New", tone: "accent" },
  drafted: { label: "Reply drafted", tone: "success" },
  read: { label: "No reply needed", tone: "neutral" },
  flagged: { label: "Held for review", tone: "accent" },
};

export function EmailSection({ state, act }: { state: TwinState; act: Act }) {
  const m = state.mail;
  const [cc, setCc] = React.useState(m.ownerEmail ?? "");
  const [busy, setBusy] = React.useState(false);
  const run = async (body: object, success: string) => {
    setBusy(true);
    await act(() => post(body), success);
    setBusy(false);
  };

  return (
    <section aria-labelledby="email-h">
      <SectionHeading id="email-h">Your twin&apos;s email</SectionHeading>
      {!m.configured ? (
        <p className="max-w-2xl rounded-2xl border border-dashed border-border-strong p-4 text-[13px] text-muted-foreground">
          Add AGENTMAIL_API_KEY on the server to give your twin its own inbox. Until then, approved emails wait on their cards.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <p className="t-label">Its address</p>
            {m.address ? (
              <p className="mt-2 flex items-center gap-2 font-mono text-[13px]">
                <AtSign className="size-3.5 text-subtle" aria-hidden /> {m.address}
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                <p className="text-[13px] text-muted-foreground">Your twin gets its own address, so it never writes as you.</p>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => run({ action: "setupInbox" }, "Your twin's inbox is ready.")}>
                  {busy ? <Loader2 className="animate-spin" /> : <Mail />} Create its inbox
                </Button>
              </div>
            )}
            <form
              className="mt-4 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run({ action: "setOwnerEmail", email: cc }, cc.trim() ? "You'll be cc'd on every email." : "You won't be cc'd.");
              }}
            >
              <label htmlFor="owner-email" className="text-[12.5px] text-muted-foreground">
                Your own address, cc&apos;d on everything it sends
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input id="owner-email" type="email" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="you@example.com" />
                <Button type="submit" variant="secondary" disabled={busy || cc.trim() === (m.ownerEmail ?? "")}>
                  Save
                </Button>
              </div>
            </form>
            {!m.webhook && <p className="mt-3 text-[12px] text-muted-foreground">To receive mail, point an AgentMail webhook at /api/twin/email and set AGENTMAIL_WEBHOOK_SECRET.</p>}
          </article>
          <article className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <p className="t-label">Its inbox</p>
            {m.inbox.length ? (
              <ul className="mt-2 divide-y divide-border">
                {m.inbox.map((e) => {
                  const s = STATUS[e.status] ?? STATUS.received;
                  return (
                    <li key={e.id} className="py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{e.subject}</p>
                        <Badge tone={s.tone}>{s.label}</Badge>
                      </div>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {e.from}
                        {e.contactId ? "" : " · not a contact, so no reply"} · {relativeDay(fromSql(e.receivedAt))}
                      </p>
                      {e.notePath && (
                        <a href={`/memory/${encodeURIComponent(e.notePath)}`} className="text-[12.5px] text-accent-ink underline-offset-2 hover:underline">
                          Read it
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 flex items-center gap-2 text-[13px] text-muted-foreground">
                <Inbox className="size-4 text-subtle" aria-hidden /> Nothing yet. Mail from your contacts gets a drafted reply for you to approve.
              </p>
            )}
          </article>
        </div>
      )}
    </section>
  );
}
