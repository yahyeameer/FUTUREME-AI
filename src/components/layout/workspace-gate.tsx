"use client";

import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePreferences } from "@/lib/preferences";
import { useWorkspaceContext } from "@/lib/workspace-store";

/** Renders children once the workspace has loaded; sends people without a profile to the TOMORA welcome page. */
export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const { status, workspace, error, reload } = useWorkspaceContext();
  const { set } = usePreferences();
  const router = useRouter();
  const pathname = usePathname();
  const needsOnboarding = status === "ready" && !workspace?.profile && pathname !== "/settings";

  React.useEffect(() => {
    // Someone new starts at the welcome page, whose "Explore my future" leads into onboarding.
    if (needsOnboarding) router.replace("/welcome");
  }, [needsOnboarding, router]);

  if (status === "error") {
    return (
      <div className="mx-auto w-full max-w-xl px-6 py-16">
        <ErrorState title="Couldn't open your workspace" message={error ?? "Unknown error."} onRetry={reload} />
        <Button variant="link" className="mt-4" onClick={() => set("mode", "demo")}>
          Explore with demo data instead
        </Button>
      </div>
    );
  }
  if (status === "loading" || needsOnboarding) return <PageSkeleton />;
  return <>{children}</>;
}

export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[56rem] px-4 py-8 sm:px-6 lg:px-10" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-8 w-80 max-w-full" />
      <Skeleton className="mt-8 h-44 w-full" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    </div>
  );
}
