import { cn } from "@/lib/utils";

/** FutureMe's mark: the present (a point) and the future (an open arc) on one trajectory. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-5", className)}>
      <circle cx="7" cy="16" r="2.6" fill="currentColor" />
      <path d="M7 16 L15.5 7.5" stroke="currentColor" strokeOpacity=".35" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="1.2 2.4" />
      <circle cx="15.5" cy="7.5" r="5" stroke="var(--accent)" strokeWidth="1.6" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline text-[15px] font-semibold tracking-[-0.02em]", className)}>
      Future
      <span className="font-display text-[1.2em] font-normal tracking-normal italic">Me</span>
    </span>
  );
}
