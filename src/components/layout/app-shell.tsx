"use client";

import { ChevronsLeft, ChevronsRight, Menu, Monitor, Moon, MoreHorizontal, Search, Settings, Sun } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";
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
          "sticky top-0 hidden h-dvh shrink-0 p-3 pr-0 transition-[width] duration-300 ease-out lg:flex",
          sidebarCollapsed ? "w-[4.75rem]" : "w-[calc(var(--sidebar-width)+0.75rem)]",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface/80 shadow-card backdrop-blur-xl">
          {/* The active route is only known at request time on dynamic routes, so the nav streams in. */}
          <React.Suspense fallback={null}>
            <SidebarContents collapsed={sidebarCollapsed} />
          </React.Suspense>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <React.Suspense fallback={<div className="h-12 border-b border-border lg:hidden" />}>
          <MobileBar />
        </React.Suspense>
        <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col pb-[var(--tabbar)] outline-none">
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
          "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-[calc(var(--row-y)-0.05rem)] text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface-3/70 hover:text-foreground",
          active && "text-primary-foreground hover:bg-transparent hover:text-primary-foreground",
          collapsed && "justify-center px-0",
        )}
      >
        {active && (
          <motion.span
            layoutId={onNavigate ? "nav-pill-mobile" : "nav-pill"}
            aria-hidden
            className="absolute inset-0 rounded-lg bg-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_8px_22px_-10px_var(--primary-glow)]"
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
          />
        )}
        <n.icon className={cn("relative size-4 shrink-0 transition-[color,transform] duration-200", active ? "text-accent dark:text-primary-foreground" : "text-subtle group-hover:scale-110 group-hover:-rotate-6 group-hover:text-accent-ink")} aria-hidden />
        {!collapsed && <span className="relative truncate">{n.label}</span>}
        {!!badge && (
          <span
            className={cn("pulse-ring relative ml-auto rounded-full bg-accent px-1.5 font-mono text-[10px] leading-4 font-semibold text-accent-foreground", collapsed && "absolute top-0.5 right-1 ml-0 px-1")}
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
        <Link href="/" onClick={onNavigate} className="group/brand flex items-center gap-2 rounded-md outline-offset-4" aria-label="FutureMe home">
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
            "flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 text-[12px] text-subtle shadow-[inset_0_1px_2px_rgb(40_30_10/0.04)] transition-colors hover:border-border-strong hover:text-muted-foreground",
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
        {!collapsed && <p className="px-2.5 pt-1 pb-1.5 text-[10px] font-semibold tracking-[0.12em] text-subtle uppercase">Companion</p>}
        {NAV.slice(0, 6).map((n) => item(n, n.href === "/future-self" ? waiting : undefined))}
        {collapsed ? <div className="my-2 hairline" /> : <p className="px-2.5 pt-4 pb-1.5 text-[10px] font-semibold tracking-[0.12em] text-subtle uppercase">Your plan</p>}
        {NAV.slice(6).map((n) => item(n))}
        <div className="my-3 hairline" />
        {item(SECONDARY_NAV[0])}
      </nav>

      <div className={cn("flex flex-col gap-2 border-t border-border bg-surface-2/60 p-3", collapsed && "items-center px-2")}>
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
        <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-copper font-display text-[14px] text-accent-foreground italic shadow-[inset_0_1px_0_rgb(255_255_255/0.4)]">
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

const TABS = [NAV[0], NAV[1], NAV[6], NAV[7]] as const;

function MobileBar() {
  const [open, setOpen] = React.useState(false);
  const palette = useCommandPalette();
  const pathname = usePathname();
  const { workspace } = useWorkspaceContext();
  const waiting = workspace ? pendingApprovals(workspace).length : 0;
  // The conversation has its own composer at the bottom, so the tab bar steps aside there.
  const showTabs = pathname !== "/future-self" && pathname !== "/onboarding";
  const inMore = !TABS.some((t) => isActive(pathname, t.href));
  return (
    <>
      <div className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-border bg-surface/80 px-3 backdrop-blur-xl lg:hidden" data-print-hide>
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
        <Link href="/" className="group/brand flex items-center gap-2" aria-label="FutureMe home">
          <Mark />
          <Wordmark />
        </Link>
        <Button variant="ghost" size="icon" className="ml-auto" onClick={palette.open} aria-label="Search and commands">
          <Search />
        </Button>
      </div>
      {showTabs && (
        <nav
          aria-label="Quick navigation"
          data-tabbar
          data-print-hide
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/85 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_30px_-20px_rgb(0_0_0/0.35)] backdrop-blur-xl lg:hidden"
        >
          <ul className="mx-auto grid h-[3.75rem] max-w-md grid-cols-5">
            {TABS.map((t) => {
              const active = isActive(pathname, t.href);
              const badge = t.href === "/future-self" ? waiting : 0;
              return (
                <li key={t.href}>
                  <Link href={t.href} aria-current={active ? "page" : undefined} className="relative flex h-full flex-col items-center justify-center gap-1 text-[10.5px] font-medium text-muted-foreground transition-colors active:scale-95">
                    {active && <motion.span layoutId="tab-dot" aria-hidden className="absolute top-0 h-[3px] w-8 rounded-b-full bg-gradient-to-r from-accent to-copper" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
                    <span className={cn("relative flex h-7 w-11 items-center justify-center rounded-full transition-colors", active && "bg-accent-wash text-accent-ink")}>
                      <t.icon className="size-[18px]" aria-hidden />
                      {!!badge && <span className="absolute -top-0.5 right-1 size-2 rounded-full bg-accent ring-2 ring-surface" aria-label={`${badge} waiting for approval`} />}
                    </span>
                    <span className={cn(active && "text-foreground")}>{t.label.replace("Life ", "").replace("Memory Vault", "Memory")}</span>
                  </Link>
                </li>
              );
            })}
            <li>
              <button type="button" onClick={() => setOpen(true)} className="flex h-full w-full flex-col items-center justify-center gap-1 text-[10.5px] font-medium text-muted-foreground transition-colors active:scale-95">
                <span className={cn("flex h-7 w-11 items-center justify-center rounded-full", inMore && "bg-accent-wash text-accent-ink")}>
                  <MoreHorizontal className="size-[18px]" aria-hidden />
                </span>
                <span className={cn(inMore && "text-foreground")}>More</span>
              </button>
            </li>
          </ul>
        </nav>
      )}
    </>
  );
}
