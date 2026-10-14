"use client";

import { CheckIcon } from "lucide-react";
import { DropdownMenu as Menu } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;
export const DropdownMenuRadioGroup = Menu.RadioGroup;

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-44 overflow-hidden rounded-md border border-border-strong bg-surface-2 p-1 shadow-float",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

const itemClass =
  "relative flex cursor-default items-center gap-2 rounded-[4px] px-2 py-1.5 text-[13px] outline-none select-none data-[highlighted]:bg-surface-3 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-3.5 [&_svg]:text-subtle";

export function DropdownMenuItem({ className, destructive, ...props }: React.ComponentProps<typeof Menu.Item> & { destructive?: boolean }) {
  return <Menu.Item className={cn(itemClass, destructive && "text-destructive [&_svg]:text-destructive", className)} {...props} />;
}

export function DropdownMenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem className={cn(itemClass, "pl-7", className)} {...props}>
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <Menu.ItemIndicator>
          <CheckIcon className="!text-accent-ink" />
        </Menu.ItemIndicator>
      </span>
      {children}
    </Menu.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={cn("t-label px-2 pt-1.5 pb-1", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}
