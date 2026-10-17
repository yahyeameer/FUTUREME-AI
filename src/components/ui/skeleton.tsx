import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" aria-hidden className={cn("animate-shimmer rounded-md bg-[linear-gradient(90deg,var(--surface-3)_0%,var(--surface-2)_45%,var(--surface-3)_90%)] bg-[length:200%_100%] opacity-80", className)} {...props} />;
}
