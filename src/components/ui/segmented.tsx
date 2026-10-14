"use client";

import { ToggleGroup } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

// Single-choice segmented control (built on Radix ToggleGroup): theme, density, filters.
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
  size = "md",
}: {
  value: T;
  onValueChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; icon?: React.ReactNode }[];
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(v) => v && onValueChange(v as T)}
      className={cn("inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-md border border-border bg-sunken p-0.5 scrollbar-none", className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[5px] px-2.5 font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=on]:bg-surface-3 data-[state=on]:text-foreground [&_svg]:size-3.5",
            size === "sm" ? "h-6 text-[11px]" : "h-7 text-xs",
          )}
        >
          {o.icon}
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
