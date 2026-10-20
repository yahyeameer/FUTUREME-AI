"use client";

import { Brain, ChevronRight } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Nemotron's reasoning behind a reply. Folded away by default; live while the reply is being written. */
export function Reasoning({ text, live, className }: { text: string; live?: boolean; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const tail = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (live && tail.current) tail.current.scrollTop = tail.current.scrollHeight;
  }, [text, live]);

  if (!text.trim()) return null;
  const words = text.trim().split(/\s+/).length;
  return (
    <div className={cn("max-w-[62ch]", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open || live}
        className="flex items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <Brain className={cn("size-3.5", live && "animate-pulse text-accent-ink")} aria-hidden />
        <span>{live ? "Nemotron is reasoning…" : "How I reasoned"}</span>
        <span className="t-meta">· {words} words</span>
        {!live && <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} aria-hidden />}
      </button>
      {(open || live) && (
        <div
          ref={tail}
          className={cn(
            "mt-1.5 overflow-y-auto border-l-2 border-accent/30 pl-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-muted-foreground",
            live ? "max-h-28" : "max-h-72",
          )}
        >
          {text.trim()}
        </div>
      )}
    </div>
  );
}
