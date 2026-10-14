import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton, WorkspaceGate } from "@/components/layout/workspace-gate";
import { Settings } from "@/features/settings/settings";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  // A single root element: hidden routes kept by Cache Components are hidden by styling their root nodes.
  return (
    <div className="flex flex-1 flex-col">
      <Suspense fallback={<PageSkeleton />}>
        <WorkspaceGate>
          <Settings />
        </WorkspaceGate>
      </Suspense>
    </div>
  );
}
