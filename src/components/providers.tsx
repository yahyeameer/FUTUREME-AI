"use client";

import { Toaster } from "sonner";
import { CommandPaletteProvider } from "@/components/layout/command-palette";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PreferencesProvider, usePreferences } from "@/lib/preferences";
import { WorkspaceProvider } from "@/lib/workspace-store";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PreferencesProvider>
      <WorkspaceProvider>
        <TooltipProvider delayDuration={350}>
          <CommandPaletteProvider>{children}</CommandPaletteProvider>
          <ThemedToaster />
        </TooltipProvider>
      </WorkspaceProvider>
    </PreferencesProvider>
  );
}

function ThemedToaster() {
  const { resolvedTheme } = usePreferences();
  return (
    <Toaster
      theme={resolvedTheme}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "!rounded-md !border !border-border-strong !bg-surface-2 !text-foreground !shadow-float !text-[13px] !font-sans",
          description: "!text-muted-foreground",
          success: "[&_[data-icon]]:!text-accent-ink",
          error: "[&_[data-icon]]:!text-destructive",
        },
      }}
    />
  );
}
