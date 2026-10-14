"use client";

import { ChevronsLeft, ChevronsRight, Menu, Monitor, Moon, Search, Settings, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Mark, Wordmark } from "@/components/brand/mark";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip } from "@/components/ui/tooltip";
import { pendingApprovals } from "@/lib/derive";
import { usePreferences, type ThemePref } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { useWorkspaceContext } from "@/lib/workspace-store";
import { useCommandPalette } from "./command-palette";
import { ModeBadge } from "./mode-badge";
import { isActive, NAV, SECONDARY_NAV } from "./nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed } = usePreferences();
  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only z-[60] rounded-md bg-accent px-3 py-2 text-accent-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <aside
        aria-label="Primary"
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 ease-out lg:flex",
          sidebarCollapsed ? "w-[3.75rem]" : "w-[var(--sidebar-width)]",
        )}
      >
        <SidebarContents collapsed={sidebarCollapsed} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBar />
        <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarContents({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { workspace } = useWorkspaceContext();
  const { set } = usePreferences();
  const palette = useCommandPalette();
  const waiting = workspace ? pendingApprovals(workspace).length : 0;

  const item = (n: (typeof NAV)[number] | (typeof SECONDARY_NAV)[number], badge?: number) => {
    const active = isActive(pathname, n.href);
    const link = (
      <Link
        key={n.href}
        href={n.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex items-center gap-2.5 rounded-md px-2.5 py-[calc(var(--row-y)-0.125rem)] text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface-3/60 hover:text-foreground",
          active && "bg-surface-3/70 text-foreground",
          collapsed && "justify-center px-0",
        )}
      >
        {active && <span aria-hidden className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-accent" />}
        <n.icon className={cn("size-4 shrink-0", active ? "text-accent-ink" : "text-subtle group-hover:text-muted-foreground")} aria-hidden />
        {!collapsed && <span className="truncate">{n.label}</span>}
        {!!badge && (
          <span
            className={cn("ml-auto rounded-[4px] bg-accent px-1.5 font-mono text-[10px] leading-4 font-semibold text-accent-foreground", collapsed && "absolute top-0.5 right-1 ml-0 px-1")}
            aria-label={`${badge} waiting for approval`}
          >
            {badge}
          </span>
        )}
      </Link>
    );
    return collapsed ? (
      <Tooltip key={n.href} content={n.label} side="right">
        {link}
      </Tooltip>
    ) : (
      link
    );
  };

  return (
    <>
      <div className={cn("flex h-14 items-center gap-2 px-4", collapsed && "justify-center px-0")}>
        <Link href="/" onClick={onNavigate} className="flex items-center gap-2 rounded-md outline-offset-4" aria-label="FutureMe home">
          <Mark />
          {!collapsed && <Wordmark />}
        </Link>
      </div>

      <div className={cn("px-3 pb-2", collapsed && "px-2")}>
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            palette.open();
          }}
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-md border border-border bg-sunken px-2.5 text-[12px] text-subtle transition-colors hover:border-border-strong hover:text-muted-foreground",
            collapsed && "justify-center px-0",
          )}
          aria-label="Search and commands"
        >
          <Search className="size-3.5" aria-hidden />
          {!collapsed && (
            <>
              Search or jump to…
              <Kbd className="ml-auto">⌘K</Kbd>
            </>
          )}
        </button>
      </div>

      <nav className={cn("flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2 scrollbar-none", collapsed && "px-2")}>
        {NAV.map((n) => item(n, n.href === "/future-self" ? waiting : undefined))}
        <div className="my-3 hairline" />
        {item(SECONDARY_NAV[0])}
      </nav>

      <div className={cn("flex flex-col gap-2 border-t border-border p-3", collapsed && "items-center px-2")}>
        {!collapsed && <ModeBadge />}
        <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
          <ProfileMenu collapsed={collapsed} onNavigate={onNavigate} />
          {!onNavigate && (
            <Tooltip content={collapsed ? "Expand sidebar" : "Collapse sidebar"} side="right">
              <Button variant="ghost" size="icon-sm" onClick={() => set("sidebarCollapsed", !collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
                {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
              </Button>
            </Tooltip>
          )}
        </div>
      </div>
    </>
  );
}

function ProfileMenu({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { workspace } = useWorkspaceContext();
  const { theme, set } = usePreferences();
  const name = workspace?.profile?.name ?? "You";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-3/60 data-[state=open]:bg-surface-3/60", collapsed && "flex-none p-1")}
        aria-label="Profile and appearance"
      >
        <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-[5px] border border-border-strong bg-surface-3 font-display text-[13px] text-foreground italic">
          {name.charAt(0)}
        </span>
        {!collapsed && <span className="truncate text-[13px] font-medium">{name}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-52">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => set("theme", v as ThemePref)}>
          <DropdownMenuRadioItem value="dark">
            <Moon /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">
            <Sun /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor /> Match system
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings" onClick={onNavigate}>
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileBar() {
  const [open, setOpen] = React.useState(false);
  const palette = useCommandPalette();
  return (
    <div className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md lg:hidden" data-print-hide>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open navigation">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[17rem] p-0" aria-describedby={undefined}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full flex-col">
            <SidebarContents collapsed={false} onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
      <Link href="/" className="flex items-center gap-2" aria-label="FutureMe home">
        <Mark />
        <Wordmark />
      </Link>
      <Button variant="ghost" size="icon" className="ml-auto" onClick={palette.open} aria-label="Search and commands">
        <Search />
      </Button>
    </div>
  );
}
