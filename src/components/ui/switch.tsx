"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border border-border-strong bg-surface-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 data-[state=checked]:border-accent/60 data-[state=checked]:bg-accent",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-3 translate-x-[3px] rounded-full bg-foreground/80 transition-transform data-[state=checked]:translate-x-[15px] data-[state=checked]:bg-accent-foreground" />
    </SwitchPrimitive.Root>
  );
}
