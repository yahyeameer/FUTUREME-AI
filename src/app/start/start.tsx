"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { PageSkeleton } from "@/components/layout/workspace-gate";
import { useWorkspaceContext } from "@/lib/workspace-store";

/**
 * Where "Explore my future" leads: onboarding for someone new, the app for someone with a profile. Deciding here,
 * once the workspace has loaded, means a quick click on the welcome page never sends a returning person to onboarding.
 */
export function Start() {
  const { status, workspace } = useWorkspaceContext();
  const router = useRouter();
  React.useEffect(() => {
    if (status === "ready") router.replace(workspace?.profile ? "/" : "/onboarding");
    if (status === "error") router.replace("/onboarding");
  }, [status, workspace, router]);
  return <PageSkeleton />;
}
