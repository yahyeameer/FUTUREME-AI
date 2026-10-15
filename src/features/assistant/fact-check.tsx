"use client";

import { ChevronDown, CircleHelp, Loader2, MessageCircleQuestion, RotateCw, ShieldCheck, ShieldQuestion } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useWorkspaceContext } from "@/lib/workspace-store";
import type { ClaimStatus, Message } from "@/types";

const STATUS: Record<ClaimStatus, { label: string; className: string; icon: React.ElementType }> = {
  supported: { label: "In your notes", className: "text-success", icon: ShieldCheck },
  unverified: { label: "Not in your notes", className: "text-warning", icon: ShieldQuestion },
  opinion: { label: "Advice or question", className: "text-subtle", icon: MessageCircleQuestion },
};

/** The fact checker's verdict on a reply: which claims your notes back up, and which they don't. */
export function FactCheck({ message }: { message: Message }) {
  const { workspace, checks, verify } = useWorkspaceContext();
  const [open, setOpen] = React.useState(false);
  const state = checks[message.id];
  const v = message.verification;
  if (!workspace?.capabilities.verify) return null;
  // Seeded demo replies aren't offered a check; new ones are checked automatically.
  if (message.simulated && !v && !state) return null;

  if (state === "checking")
    return (
      <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted-foreground" role="status">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> The fact checker is reading this against your notes…
      </p>
    );
  if (!v)
    return (
      <button type="button" onClick={() => void verify(message.id)} className="mt-2 flex items-center gap-1.5 text-[12px] text-subtle hover:text-foreground">
        {state === "failed" ? <RotateCw className="size-3.5" aria-hidden /> : <CircleHelp className="size-3.5" aria-hidden />}
        {state === "failed" ? "The check didn't finish. Try again" : "Check this reply against my notes"}
      </button>
    );

  const factual = v.claims.filter((c) => c.status !== "opinion");
  const unsupported = factual.filter((c) => c.status === "unverified").length;
  const memoryIds = new Set(workspace.memories.map((m) => m.id));
  const tone = v.verdict === "grounded" ? "border-success/30 bg-success-wash text-success" : v.verdict === "check" ? "border-warning/30 bg-warning-wash text-warning" : "border-border bg-surface-2 text-muted-foreground";
  const Icon = v.verdict === "check" ? ShieldQuestion : ShieldCheck;

  return (
    <div className="mt-2 max-w-xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors", tone)}
      >
        <Icon className="size-3.5" aria-hidden />
        {v.verdict === "grounded"
          ? `Fact-checked: ${factual.length} ${factual.length === 1 ? "claim" : "claims"} found in your notes`
          : v.verdict === "check"
            ? `Fact-checked: ${unsupported} of ${factual.length} ${factual.length === 1 ? "claim isn't" : "claims aren't"} in your notes`
            : "Fact-checked: no claims about your life"}
        {v.simulated && <span className="font-mono text-[10px] uppercase opacity-70">demo rules</span>}
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-2 space-y-1.5 overflow-hidden rounded-xl border border-border bg-surface p-3"
          >
            {v.claims.map((c, i) => {
              const s = STATUS[c.status];
              return (
                <li key={i} className="flex gap-2 text-[12.5px]">
                  <s.icon className={cn("mt-0.5 size-3.5 shrink-0", s.className)} aria-hidden />
                  <span className="min-w-0">
                    <span className="text-foreground">{c.text}</span>{" "}
                    <span className={cn("whitespace-nowrap", s.className)}>· {s.label}</span>
                    {c.source && (
                      <>
                        {" "}
                        {memoryIds.has(c.source) ? (
                          <Link href={`/memory/${encodeURIComponent(c.source)}`} className="font-mono text-[11px] text-subtle underline-offset-2 hover:underline">
                            {c.source}
                          </Link>
                        ) : (
                          <span className="font-mono text-[11px] text-subtle">{c.source}</span>
                        )}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
            <li className="pt-1 text-[11.5px] text-subtle">
              {v.simulated ? "Checked by demo rules in your browser." : "Checked by the fact-checker agent. A claim only counts as found if the note it cites exists."}
            </li>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
