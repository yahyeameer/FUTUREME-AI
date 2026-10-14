import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-px text-[11px] font-medium leading-4 whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "border-border bg-surface-3/60 text-muted-foreground",
        accent: "border-accent/25 bg-accent-wash text-accent-ink",
        copper: "border-copper/25 bg-copper-wash text-copper",
        success: "border-success/25 bg-success-wash text-success",
        warning: "border-warning/25 bg-warning-wash text-warning",
        destructive: "border-destructive/25 bg-destructive-wash text-destructive",
        info: "border-info/25 bg-info-wash text-info",
        outline: "border-border-strong text-muted-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({ className, tone, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}
