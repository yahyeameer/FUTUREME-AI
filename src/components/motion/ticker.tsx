import { cn } from "@/lib/utils";

/** A news-ticker strip: the items scroll by on a loop and stop while the pointer is over them. */
export function Ticker({ items, className, label }: { items: React.ReactNode[]; className?: string; label: string }) {
  const run = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-8 pr-8">
      {items.map((it, i) => (
        <li key={i} className="flex items-center gap-8 whitespace-nowrap">
          {it}
          <span aria-hidden className="size-1 rounded-full bg-accent shadow-[0_0_6px_var(--accent)]" />
        </li>
      ))}
    </ul>
  );
  return (
    <div aria-label={label} className={cn("group/ticker relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]", className)}>
      <div className="flex w-max animate-[ticker_38s_linear_infinite] group-hover/ticker:[animation-play-state:paused]">
        {run(false)}
        {run(true)}
      </div>
    </div>
  );
}
