"use client";

import { Brain, ChevronRight, CornerDownRight, X } from "lucide-react";
import * as React from "react";
import { splitTrail } from "@/lib/reasoning-steps";
import { cn } from "@/lib/utils";

/**
 * Nemotron's reasoning behind a reply, with the tool calls it led to woven in where they happened (an email search,
 * a request to send one). Folded away by default; live while the reply is being written.
 */
export function Reasoning({ text, live, className }: { text: string; live?: boolean; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const tail = React.useRef<HTMLDivElement>(null);
  const parts = React.useMemo(() => splitTrail(text), [text]);

  React.useEffect(() => {
    if (live && tail.current) tail.current.scrollTop = tail.current.scrollHeight;
  }, [text, live]);

  if (!text.trim()) return null;
  const thoughts = parts.filter((p) => p.kind === "thought");
  const steps = parts.length - thoughts.length;
  const words = thoughts.reduce((n, p) => n + p.text.split(/\s+/).length, 0);
  const label = live ? (parts.at(-1)?.kind === "step" ? "Working…" : "Nemotron is reasoning…") : thoughts.length ? "How I reasoned" : "What I did";
  const meta = [words ? `${words} words` : null, steps ? `${steps} ${steps === 1 ? "step" : "steps"}` : null].filter(Boolean).join(" · ");

  return (
    <div className={cn("max-w-[62ch]", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open || live}
        className="flex items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <Brain className={cn("size-3.5", live && "animate-pulse text-accent-ink")} aria-hidden />
        <span>{label}</span>
        {meta && <span className="t-meta">· {meta}</span>}
        {!live && <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} aria-hidden />}
      </button>
      {(open || live) && (
        <div ref={tail} className={cn("mt-1.5 flex flex-col gap-1.5 overflow-y-auto border-l-2 border-accent/30 pl-3", live ? "max-h-36" : "max-h-80")}>
          {parts.map((p, i) =>
            p.kind === "thought" ? (
              <p key={i} className="font-mono text-[11.5px] leading-relaxed break-words whitespace-pre-wrap text-muted-foreground">
                {p.text}
              </p>
            ) : (
              <p key={i} className={cn("flex items-start gap-1.5 text-[12px] leading-snug break-words", p.failed ? "text-destructive" : "text-foreground")}>
                {p.failed ? <X className="mt-0.5 size-3 shrink-0" aria-hidden /> : <CornerDownRight className="mt-0.5 size-3 shrink-0 text-accent-ink" aria-hidden />}
                <span className="min-w-0">{p.text}</span>
              </p>
            ),
          )}
        </div>
      )}
    </div>
  );
}
