import { cn } from "@/lib/utils";

export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-border-strong bg-surface-3/60 px-1 font-mono text-[10px] text-muted-foreground", className)}
      {...props}
    />
  );
}
