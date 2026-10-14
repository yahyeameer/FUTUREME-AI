import * as React from "react";
import { cn } from "@/lib/utils";

export const fieldClass =
  "w-full min-w-0 rounded-md border border-input bg-surface-2 px-3 text-[13px] text-foreground placeholder:text-subtle outline-none transition-[border-color,box-shadow] focus-visible:border-ring/70 focus-visible:ring-2 focus-visible:ring-ring/25 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20";

export function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(fieldClass, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(fieldClass, "min-h-20 py-2 leading-relaxed", className)} {...props} />;
}
