import { AlertTriangle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group/empty relative flex flex-col items-start gap-2 overflow-hidden rounded-xl border border-dashed border-border-strong bg-[radial-gradient(120%_90%_at_0%_0%,var(--accent-wash),transparent_60%)] px-5 py-6 transition-[border-color,box-shadow] duration-500 hover:border-accent/50 hover:shadow-[var(--glow-accent)]",
        className,
      )}
    >
      <span aria-hidden className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-[radial-gradient(circle,var(--ambient-a),transparent_65%)] opacity-0 blur-2xl transition-opacity duration-700 group-hover/empty:opacity-100" />
      {Icon && (
        // A small orbit: the icon in a glass bead, a dashed ring turning around it and a light circling, faster on hover.
        <span aria-hidden className="relative mb-1.5 flex size-14 items-center justify-center">
          <span className="absolute inset-0 animate-[orbit_16s_linear_infinite] rounded-full border border-dashed border-accent/50 group-hover/empty:[animation-duration:4s]" />
          <span className="absolute inset-0 animate-[orbit_7s_linear_infinite] group-hover/empty:[animation-duration:2s]">
            <span className="absolute -top-[3px] left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
          </span>
          <span className="relative flex size-10 items-center justify-center rounded-full border border-white/60 bg-gradient-to-br from-white/80 to-white/20 text-accent-ink shadow-[inset_0_1px_2px_rgb(255_255_255/0.9),0_8px_18px_-10px_rgb(60_45_20/0.5)] backdrop-blur transition-transform duration-500 group-hover/empty:scale-110 group-hover/empty:-rotate-12 dark:border-white/15 dark:from-white/[0.14] dark:to-white/[0.03] dark:shadow-[inset_0_1px_1px_rgb(255_255_255/0.2),0_0_18px_-6px_var(--accent)]">
            <Icon className="size-4" />
          </span>
        </span>
      )}
      <p className="relative t-section">{title}</p>
      {children && <p className="relative max-w-md text-[13px] text-muted-foreground">{children}</p>}
      {action && <div className="relative mt-1">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-destructive/30 bg-destructive-wash px-5 py-5">
      <AlertTriangle className="size-4 text-destructive" aria-hidden />
      <p className="t-section">{title}</p>
      <p className="max-w-md text-[13px] text-muted-foreground">{message}</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} className="mt-1">
          Try again
        </Button>
      )}
    </div>
  );
}
