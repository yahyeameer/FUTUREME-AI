"use client";

import Link from "next/link";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useWorkspaceContext } from "@/lib/workspace-store";

/** Always-visible statement of where answers come from: demo script, stand-in model, or the real model. */
export function ModeBadge({ className }: { className?: string }) {
  const { workspace, status } = useWorkspaceContext();
  if (status !== "ready" || !workspace) return null;
  const { runtime } = workspace;
  const label = runtime.mode === "demo" ? "Demo data" : runtime.simulated ? "Server · stand-in model" : "Connected";
  const detail =
    runtime.mode === "demo"
      ? "Sample data stored in this browser. Replies are scripted; no model is called."
      : runtime.simulated
        ? "Your data is on the TOMORA server. Replies come from a built-in stand-in model until a Nebius key is configured."
        : `${runtime.agent}. ${runtime.model}.`;
  return (
    <Tooltip content={detail} side="right">
      <Link
        href="/settings#data"
        className={cn("flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground", className)}
      >
        <span aria-hidden className={cn("size-1.5 rounded-full", runtime.mode === "demo" ? "bg-copper" : runtime.simulated ? "bg-warning" : "bg-accent")} />
        {label}
      </Link>
    </Tooltip>
  );
}
