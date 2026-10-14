"use client";

import { PanelRight, PanelRightClose } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip } from "@/components/ui/tooltip";
import { usePreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";

/**
 * Route layout: the primary work area, plus an optional context rail.
 * The rail sits beside the content on wide screens, collapses on request, and becomes a sheet on smaller screens.
 */
export function PageFrame({
  children,
  rail,
  railTitle = "Context",
  toolbar,
  className,
  width = "default",
}: {
  children: React.ReactNode;
  rail?: React.ReactNode;
  railTitle?: string;
  toolbar?: React.ReactNode;
  className?: string;
  width?: "default" | "wide" | "full";
}) {
  const { railOpen, set } = usePreferences();
  const showRail = !!rail && railOpen;
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        {(toolbar || rail) && (
          <div className="sticky top-12 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:px-6 lg:top-0" data-print-hide>
            <div className="flex min-w-0 flex-1 items-center gap-2">{toolbar}</div>
            {rail && (
              <>
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="sm" className="xl:hidden">
                      <PanelRight /> {railTitle}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" aria-describedby={undefined}>
                    <SheetHeader>
                      <SheetTitle>{railTitle}</SheetTitle>
                    </SheetHeader>
                    <div className="flex-1 overflow-y-auto p-4">{rail}</div>
                  </SheetContent>
                </Sheet>
                <Tooltip content={railOpen ? `Hide ${railTitle.toLowerCase()}` : `Show ${railTitle.toLowerCase()}`}>
                  <Button variant="ghost" size="icon-sm" className="hidden xl:inline-flex" onClick={() => set("railOpen", !railOpen)} aria-label={railOpen ? `Hide ${railTitle}` : `Show ${railTitle}`} aria-pressed={railOpen}>
                    {railOpen ? <PanelRightClose /> : <PanelRight />}
                  </Button>
                </Tooltip>
              </>
            )}
          </div>
        )}
        <div
          className={cn(
            "mx-auto flex w-full min-w-0 flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-10",
            width === "default" && "max-w-[56rem]",
            width === "wide" && "max-w-[76rem]",
            className,
          )}
        >
          {children}
        </div>
      </div>
      {showRail && (
        <aside aria-label={railTitle} className="sticky top-0 hidden h-dvh w-[var(--rail-width)] shrink-0 overflow-y-auto border-l border-border bg-surface/60 px-5 py-5 scrollbar-thin xl:block">
          {rail}
        </aside>
      )}
    </div>
  );
}

export function RailSection({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mb-6 last:mb-0">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="t-label">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
