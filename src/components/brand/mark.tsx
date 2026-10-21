import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * TOMORA's symbol: a threshold. The horizon (champagne) is the line between today and what comes next; the road below
 * narrows toward it in perspective and stops just short, because the next step is still yours. Together they read as
 * a geometric T. The same geometry is used for the favicon (src/app/icon.svg) and the share image.
 */
export function BrandSymbol({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <rect x="5" y="8.5" width="22" height="2.25" rx="1.125" fill="var(--accent, #C8B78F)" />
      <path d="M12.6 27 L15.15 13.6 H16.85 L19.4 27 Z" fill="currentColor" />
    </svg>
  );
}

/** The symbol in a quiet tile, for the sidebar, the phone bar and small brand moments. */
export function Mark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] border border-border bg-surface text-foreground transition-colors duration-200 group-hover/brand:border-border-strong",
        className,
      )}
    >
      <BrandSymbol className="size-5" />
    </span>
  );
}

/** The wordmark: TOMORA in the display serif, widely spaced. Optionally led by the symbol. */
export function Wordmark({ className, withSymbol = false }: { className?: string; withSymbol?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-foreground", className)}>
      {withSymbol && <BrandSymbol className="size-[1.35em]" />}
      <span className="font-display text-[17px] leading-none tracking-[0.22em]" style={{ marginRight: "-0.22em" }}>
        {BRAND.name}
      </span>
    </span>
  );
}
