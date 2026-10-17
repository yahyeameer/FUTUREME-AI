import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton, WorkspaceGate } from "@/components/layout/workspace-gate";
import { Missions } from "@/features/missions/missions";

export const metadata: Metadata = { title: "Missions" };

export default function MissionsPage() {
  // A single root element: hidden routes kept by Cache Components are hidden by styling their root nodes.
  return (
    <div className="flex flex-1 flex-col">
      <Suspense fallback={<PageSkeleton />}>
        <WorkspaceGate>
          <Missions />
        </WorkspaceGate>
      </Suspense>
    </div>
  );
}
