"use client";

import { Check, Container, Loader2, Lock, ShieldCheck, X } from "lucide-react";
import * as React from "react";
import { EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, relativeDay } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";
import type { DockerMcpInfo, DockerToolRequest } from "@/types";

// The agent's tools from the Docker MCP Gateway: whether it's reachable, which tools it offers, and the calls that
// wait for approval. Read-only tools run on their own; anything else runs only when the user approves it here.

const STATUS: Record<DockerMcpInfo["status"], { label: string; tone: "success" | "warning" | "neutral" | "info" }> = {
  connected: { label: "Connected", tone: "success" },
  connecting: { label: "Connecting", tone: "info" },
  unavailable: { label: "Not reachable", tone: "warning" },
  off: { label: "Not set up", tone: "neutral" },
};

export function DockerTools() {
  const { workspace } = useWorkspace();
  const mcp = workspace.dockerMcp;
  if (!mcp)
    return (
      <div className="card p-5">
        <EmptyState icon={Container} title="Docker tools need the server">
          On the TOMORA server the agent can use tools from Docker&apos;s MCP Toolkit, each running in its own container.
        </EmptyState>
      </div>
    );

  const pending = mcp.requests.filter((r) => r.status === "pending");
  const done = mcp.requests.filter((r) => r.status !== "pending").slice(0, 4);
  const status = STATUS[mcp.status];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <article className="card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Container className="size-4 text-subtle" aria-hidden />
          <h3 className="text-[14px] font-medium">Docker MCP Gateway</h3>
          <Badge tone={status.tone}>{status.label}</Badge>
          {mcp.tools.length > 0 && <span className="ml-auto t-meta">{mcp.tools.length} tools</span>}
        </div>
        <p className="mt-1 font-mono text-[11px] break-all text-subtle">{mcp.via}</p>
        {mcp.status === "off" ? (
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
            Turn on the MCP Toolkit in Docker Desktop, run <code className="font-mono text-[11.5px]">docker mcp gateway run --transport streaming --port 8811</code>, and set{" "}
            <code className="font-mono text-[11.5px]">DOCKER_MCP_GATEWAY_URL=http://localhost:8811/mcp</code>. Everything else keeps working without it.
          </p>
        ) : (
          mcp.detail && <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">{mcp.detail}</p>
        )}
        {mcp.tools.length > 0 && (
          <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2 border-t border-border pt-3 sm:grid-cols-2">
            {mcp.tools.map((t) => (
              <li key={t.name} className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[12.5px] font-medium">{t.title}</span>
                  <Badge tone={t.gate === "auto" ? "accent" : "copper"}>
                    {t.gate === "auto" ? <ShieldCheck aria-hidden /> : <Lock aria-hidden />} {t.gate === "auto" ? "Read-only" : "Asks first"}
                  </Badge>
                </div>
                <p className="line-clamp-2 text-[11.5px] text-subtle">{t.description || t.name}</p>
              </li>
            ))}
          </ul>
        )}
      </article>

      {pending.length > 0 && (
        <div className={cn("grid gap-4", pending.length > 1 && "lg:grid-cols-2")}>
          {pending.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </div>
      )}
      {done.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
          {done.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({ request: r }: { request: DockerToolRequest }) {
  const { run } = useWorkspace();
  const [busy, setBusy] = React.useState<"approve" | "reject" | null>(null);
  const decide = async (decision: "approve" | "reject") => {
    setBusy(decision);
    await run(
      (s) => {
        if (!s.decideDockerTool) throw new Error("Docker tools need the TOMORA server.");
        return s.decideDockerTool(r.id, decision);
      },
      decision === "approve" ? `Ran ${r.title}.` : "Declined. Nothing ran.",
    );
    setBusy(null);
  };
  const args = JSON.stringify(r.arguments, null, 2);

  return (
    <article className={cn("card flex flex-col p-5", r.status === "pending" && "ring-1 ring-copper/30")}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[14px] font-medium">{r.title}</h3>
        <Badge tone={r.status === "pending" ? "warning" : r.status === "rejected" ? "neutral" : r.isError ? "destructive" : "success"}>
          {r.status === "pending" ? "Waiting for you" : r.status === "rejected" ? "Declined" : r.isError ? "Ran with an error" : "Ran"}
        </Badge>
      </div>
      <p className="mt-0.5 t-meta">
        {r.tool} · {relativeDay(r.decidedAt ?? r.createdAt)}
      </p>
      {args !== "{}" && <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-surface-2 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">{args}</pre>}
      {r.result && <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-border p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-muted-foreground">{r.result}</pre>}
      {r.status === "pending" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" size="sm" disabled={!!busy} onClick={() => decide("approve")}>
            {busy === "approve" ? <Loader2 className="animate-spin" /> : <Check />} Approve and run
          </Button>
          <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => decide("reject")}>
            <X /> Decline
          </Button>
        </div>
      )}
    </article>
  );
}
