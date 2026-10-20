"use client";

import { Check, Copy, Library } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { cn, formatTime } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";
import type { Message } from "@/types";
import { ApprovalCard } from "./approval-card";
import { RunCard } from "@/features/missions/run-card";
import { FactCheck } from "./fact-check";
import { ProgressBlock } from "./progress-block";
import { ToolStatus } from "./tool-status";

export function UserMessage({ message }: { message: Message }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] sm:max-w-[75%]">
        <div className="sheen rounded-2xl rounded-br-md bg-primary px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap text-primary-foreground shadow-[0_10px_24px_-14px_rgb(0_0_0/0.5)] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-14px_rgb(0_0_0/0.55),0_0_0_1px_rgb(196_214_106/0.35),0_0_28px_-10px_var(--accent)]">{message.content}</div>
        <p className="mt-1 text-right t-meta">{formatTime(message.createdAt)}</p>
      </div>
    </div>
  );
}

const AVATAR =
  "halo absolute top-3.5 left-4 flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-accent to-copper font-display text-[15px] text-accent-foreground italic shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_6px_14px_-8px_rgb(120_80_30/0.6)]";

/**
 * Future-self replies read as writing, not chat bubbles: no box at rest, their working shown above. Hovering lifts a
 * glass panel behind the reply (see `.reply` in globals.css). `fresh` marks a reply that just arrived, which gets a
 * single pass of light and lets its chips and cards settle in.
 */
export function AssistantMessage({ message, name = "Future you", fresh = false }: { message: Message; name?: string; fresh?: boolean }) {
  const { workspace } = useWorkspace();
  const [copied, setCopied] = React.useState(false);
  const approvals = (message.approvalIds ?? []).map((id) => workspace.approvals.find((a) => a.id === id)).filter((a) => !!a);
  const memoryIds = new Set(workspace.memories.map((m) => m.id));
  const handoffs = (message.runIds ?? []).map((id) => workspace.runs.find((r) => r.id === id)).filter((r) => !!r);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; nothing to recover.
    }
  };

  return (
    <article data-spotlight className={cn("reply group", fresh && "reply-enter")} aria-label={`${name} replied`}>
      <span aria-hidden className={AVATAR}>
        {name.replace(/^Future /, "").charAt(0)}
      </span>
      <header className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="font-display text-[15px] italic">{name}</span>
        <span className="t-meta">{formatTime(message.createdAt)}</span>
        {message.simulated && (
          <Tooltip content="Scripted demo reply. No model was called.">
            <span tabIndex={0} className="cursor-help rounded-[4px] border border-copper/30 px-1 font-mono text-[10px] text-copper uppercase">
              Demo
            </span>
          </Tooltip>
        )}
      </header>
      {message.tools && message.tools.length > 0 && <ToolStatus tools={message.tools} className="mb-2.5" />}
      <Markdown source={message.content} className="reply-prose max-w-[62ch] text-[14.5px] leading-[1.7]" />

      <div className="reply-settle">
        {handoffs.length > 0 && (
          <div className="mt-3 flex max-w-xl flex-col gap-2" aria-label="Handed off">
            <p className="t-meta">Handed off while answering</p>
            {handoffs.map((r) => (
              <RunCard key={r.id} run={r} />
            ))}
          </div>
        )}
        {message.blocks?.map((b, i) => (b.type === "progress" ? <div key={i} className="mt-3 max-w-xl"><ProgressBlock block={b} /></div> : null))}
        {approvals.length > 0 && (
          <div className="mt-3 flex max-w-xl flex-col gap-2">
            {approvals.map((a) => (
              <ApprovalCard key={a.id} approval={a} />
            ))}
          </div>
        )}

        <FactCheck message={message} />

        <footer className="mt-2 flex flex-wrap items-center gap-1.5">
          {message.citations.length > 0 && (
            <span className="mr-1 flex items-center gap-1 t-meta">
              <Library className="size-3" aria-hidden /> Remembered
            </span>
          )}
          {message.citations.map((c) =>
            memoryIds.has(c.memoryId) ? (
              <Link
                key={c.memoryId}
                href={`/memory/${encodeURIComponent(c.memoryId)}`}
                className="max-w-56 truncate rounded-full border border-border bg-surface px-2 py-0.5 text-[11.5px] text-muted-foreground transition-all duration-300 hover:-translate-y-px hover:border-accent/60 hover:bg-accent-wash hover:text-foreground hover:shadow-[0_6px_16px_-8px_var(--accent)]"
              >
                {c.title}
              </Link>
            ) : (
              <span key={c.memoryId} className="rounded-[4px] border border-dashed border-border px-1.5 py-px text-[11.5px] text-subtle line-through" title="This memory was deleted">
                {c.title}
              </span>
            ),
          )}
          <Button variant="ghost" size="icon-sm" onClick={copy} className="ml-auto opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label="Copy reply">
            {copied ? <Check className="text-success" /> : <Copy />}
          </Button>
        </footer>
      </div>
    </article>
  );
}

export function PendingReply({ tools, draft, error, onRetry, name = "Future you" }: { tools: Message["tools"]; draft: string; error?: string; onRetry: () => void; name?: string }) {
  return (
    <article className="reply" aria-live="polite" aria-busy={!error}>
      <span aria-hidden data-busy={!error || undefined} className={AVATAR}>
        {name.replace(/^Future /, "").charAt(0)}
      </span>
      <header className="mb-1.5 flex items-center gap-2">
        <span className="font-display text-[15px] italic">{name}</span>
        {!error && <span className="text-shimmer font-mono text-[11px] tracking-wide">{draft ? "writing…" : "thinking…"}</span>}
      </header>
      {tools && <ToolStatus tools={tools} className="mb-2.5" />}
      {draft && (
        <p className={cn("max-w-[62ch] text-[14.5px] leading-[1.7] whitespace-pre-wrap")}>
          {draft}
          {!error && <span aria-hidden className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] animate-caret bg-accent" />}
        </p>
      )}
      {error && (
        <div role="alert" className="mt-2 flex max-w-xl flex-wrap items-center gap-3 rounded-md border border-destructive/30 bg-destructive-wash px-3 py-2 text-[12.5px] text-destructive">
          <span className="flex-1">{error}</span>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
    </article>
  );
}
