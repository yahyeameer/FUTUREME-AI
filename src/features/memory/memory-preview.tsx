import { Archive, EyeOff } from "lucide-react";
import Link from "next/link";
import { cn, relativeDay } from "@/lib/utils";
import type { Memory, MemoryKind } from "@/types";
import { ProvenanceBadge } from "./provenance";

export const KIND_LABEL: Record<MemoryKind, string> = {
  profile: "Profile",
  goal: "Goal",
  reflection: "Reflection",
  milestone: "Milestone",
  experience: "Experience",
  task: "Task",
  daily: "Daily",
  note: "Note",
};

export function excerpt(body: string, n = 140) {
  const plain = body
    .replace(/^#+\s.*$/gm, "")
    .replace(/^\s*[-*]\s+\[[ x]\]\s+/gim, "")
    .replace(/^\s*(?:[-*+]|>)\s*/gm, "")
    .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, "$1")
    // Markdown marks only: hyphens inside words and dates ("open-source", "2026-10-19") stay.
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > n ? `${plain.slice(0, n - 1)}…` : plain;
}

/** A compact, linkable memory: title, kind, provenance and when it was recorded. */
export function MemoryPreview({ memory, className, showExcerpt = true }: { memory: Memory; className?: string; showExcerpt?: boolean }) {
  return (
    <Link
      href={`/memory/${encodeURIComponent(memory.id)}`}
      className={cn("group block rounded-md px-3 py-[var(--row-y)] -mx-3 transition-colors hover:bg-surface-3/50", className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate text-[13px] font-medium group-hover:text-foreground">{memory.title}</p>
        <span className="shrink-0 t-meta">{relativeDay(memory.updatedAt)}</span>
      </div>
      {showExcerpt && <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted-foreground">{excerpt(memory.body)}</p>}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="t-meta uppercase">{KIND_LABEL[memory.kind]}</span>
        <span className="text-subtle" aria-hidden>
          ·
        </span>
        <ProvenanceBadge value={memory.provenance} />
        {memory.archived && (
          <span className="flex items-center gap-1 t-meta">
            <Archive className="size-3" aria-hidden /> Archived
          </span>
        )}
        {!memory.retrievable && (
          <span className="flex items-center gap-1 t-meta">
            <EyeOff className="size-3" aria-hidden /> Not retrieved
          </span>
        )}
      </div>
    </Link>
  );
}
