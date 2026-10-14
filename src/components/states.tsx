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
    <div className={cn("flex flex-col items-start gap-2 rounded-lg border border-dashed border-border-strong px-5 py-6", className)}>
      {Icon && <Icon className="size-4 text-subtle" aria-hidden />}
      <p className="t-section">{title}</p>
      {children && <p className="max-w-md text-[13px] text-muted-foreground">{children}</p>}
      {action && <div className="mt-1">{action}</div>}
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
