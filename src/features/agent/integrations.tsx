"use client";

import { CalendarDays, Check, FilePen, ListChecks, Loader2, Lock, Mail, MessageSquare, Plug, ShieldCheck, Unplug, X, type LucideIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, relativeDay } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";
import type { AgentActionRequest, AgentActionsInfo, AgentIntegration } from "@/types";

// The agent's integrations (src/lib/connectors): what's connected, and the actions it asked to take. Reading runs on
// its own; an email, a chat message, a new event or task, or a changed file runs only when the user approves it here.

const ICON: Record<AgentIntegration["id"], LucideIcon> = { google: Plug, email: Mail, calendar: CalendarDays, messaging: MessageSquare, tasks: ListChecks, files: FilePen };

const STATUS: Record<AgentIntegration["status"], { label: string; tone: "success" | "info" | "neutral" }> = {
  connected: { label: "Connected", tone: "success" },
  partial: { label: "Partly set up", tone: "info" },
  off: { label: "Not set up", tone: "neutral" },
};

export function Integrations() {
  const { workspace } = useWorkspace();
  const info = workspace.agentActions;

  // Back from Google's consent screen.
  React.useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const connected = q.get("connected");
    const failed = q.get("error");
    if (!connected && !failed) return;
    if (connected) toast.success(connected === "google" ? "Google connected." : `Google connected as ${connected}.`);
    if (failed) toast.error(failed);
    window.history.replaceState(null, "", `${window.location.pathname}#integrations`);
  }, []);

  if (!info)
    return (
      <div className="card p-5">
        <EmptyState icon={Plug} title="Integrations need the server">
          On the TOMORA server the agent can read and send your email, manage your calendar and tasks, and post to Slack, Discord or Telegram, always asking before it sends or changes anything.
        </EmptyState>
      </div>
    );

  const pending = info.requests.filter((r) => r.status === "pending");
  const done = info.requests.filter((r) => r.status !== "pending").slice(0, 4);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {pending.length > 0 && (
        <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-4", pending.length > 1 && "lg:grid-cols-2")}>
          {pending.map((r) => (
            <ActionCard key={r.id} request={r} />
          ))}
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-3">
        {info.integrations.map((i) => (
          <IntegrationCard key={i.id} integration={i} google={i.id === "google" ? info.google : undefined} />
        ))}
      </div>
      {done.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
          {done.map((r) => (
            <ActionCard key={r.id} request={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function IntegrationCard({ integration: i, google }: { integration: AgentIntegration; google?: AgentActionsInfo["google"] }) {
  const { run } = useWorkspace();
  const Icon = ICON[i.id];
  const status = STATUS[i.status];
  const [busy, setBusy] = React.useState(false);
  const disconnect = async () => {
    setBusy(true);
    await run((s) => {
      if (!s.disconnectGoogle) throw new Error("Needs the TOMORA server.");
      return s.disconnectGoogle();
    }, "Google disconnected.");
    setBusy(false);
  };

  return (
    <article className="card flex min-w-0 flex-col p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="size-4 text-subtle" aria-hidden />
        <h3 className="text-[14px] font-medium">{i.label}</h3>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <p className="mt-1 text-[12.5px] break-words text-muted-foreground">{i.via}</p>
      {i.setup && <p className="mt-2 text-[12px] leading-relaxed break-words text-subtle">{i.setup}</p>}
      {i.tools.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
          {i.tools.map((t) => (
            <li key={t.name}>
              <Badge tone={t.gate === "auto" ? "accent" : "copper"}>
                {t.gate === "auto" ? <ShieldCheck aria-hidden /> : <Lock aria-hidden />} <span className="font-mono">{t.name}</span>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {google && (
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          {!google.connected && google.clientConfigured && (
            <Button asChild variant="primary" size="sm">
              <a href="/api/integrations/google">
                <Plug /> Connect Google
              </a>
            </Button>
          )}
          {google.connected && google.via === "app" && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={disconnect}>
              {busy ? <Loader2 className="animate-spin" /> : <Unplug />} Disconnect
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

/** One thing the agent asked to do. `compact` is the version shown under the reply that asked for it. */
export function ActionCard({ request: r, compact = false }: { request: AgentActionRequest; compact?: boolean }) {
  const { run } = useWorkspace();
  const [busy, setBusy] = React.useState<"approve" | "reject" | null>(null);
  const decide = async (decision: "approve" | "reject") => {
    setBusy(decision);
    await run(
      (s) => {
        if (!s.decideAgentAction) throw new Error("Integrations need the TOMORA server.");
        return s.decideAgentAction(r.id, decision);
      },
      decision === "approve" ? "Done." : "Declined. Nothing was sent or changed.",
    );
    setBusy(null);
  };

  return (
    <article className={cn("card flex min-w-0 flex-col", compact ? "p-4" : "p-5", r.status === "pending" && "ring-1 ring-copper/30")}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[14px] font-medium">{r.title}</h3>
        <Badge tone={r.status === "pending" ? (r.error ? "destructive" : "warning") : r.status === "rejected" ? "neutral" : "success"}>
          {r.status === "pending" ? (r.error ? "Didn't work, try again" : "Waiting for you") : r.status === "rejected" ? "Declined" : "Done"}
        </Badge>
      </div>
      <p className="mt-0.5 t-meta">
        <span className="font-mono">{r.tool}</span> · {relativeDay(r.decidedAt ?? r.createdAt)}
      </p>
      {r.details.length > 0 && (
        <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px]">
          {r.details.map((d) => (
            <React.Fragment key={d.label}>
              <dt className="text-subtle">{d.label}</dt>
              <dd className="break-words">{d.value}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}
      {r.body && <pre className="mt-3 max-h-56 overflow-auto rounded-md bg-surface-2 p-2.5 font-sans text-[12.5px] leading-relaxed whitespace-pre-wrap break-words">{r.body}</pre>}
      {r.error && <p className="mt-2 text-[12px] break-words text-destructive">{r.error}</p>}
      {r.result && <p className="mt-2 text-[12px] break-words text-muted-foreground">{r.result}</p>}
      {r.status === "pending" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" size="sm" disabled={!!busy} onClick={() => decide("approve")}>
            {busy === "approve" ? <Loader2 className="animate-spin" /> : <Check />} {r.tool === "email_send" ? "Approve and send" : r.tool === "send_message" ? "Approve and post" : "Approve"}
          </Button>
          <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => decide("reject")}>
            <X /> Decline
          </Button>
        </div>
      )}
    </article>
  );
}
