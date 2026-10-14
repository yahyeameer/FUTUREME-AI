"use client";

import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return <CommandPrimitive className={cn("flex h-full w-full flex-col overflow-hidden", className)} {...props} />;
}

export function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex items-center gap-2.5 border-b border-glass-border px-4">
      <SearchIcon className="size-4 shrink-0 text-subtle" aria-hidden />
      <CommandPrimitive.Input className={cn("h-12 w-full bg-transparent text-sm outline-none placeholder:text-subtle", className)} {...props} />
    </div>
  );
}

export function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return <CommandPrimitive.List className={cn("max-h-[min(60dvh,420px)] scroll-py-2 overflow-y-auto p-1.5 scrollbar-thin", className)} {...props} />;
}

export function CommandEmpty(props: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className="py-8 text-center text-[13px] text-muted-foreground" {...props} />;
}

export function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cn("overflow-hidden py-1 [&_[cmdk-group-heading]]:t-label [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-1.5 [&_[cmdk-group-heading]]:pb-1", className)}
      {...props}
    />
  );
}

export function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        "relative flex cursor-default items-center gap-2.5 rounded-[5px] px-2.5 py-2 text-[13px] outline-none select-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-surface-3/80 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-subtle data-[selected=true]:[&_svg]:text-accent-ink",
        className,
      )}
      {...props}
    />
  );
}
