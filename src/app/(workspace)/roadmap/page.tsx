import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton, WorkspaceGate } from "@/components/layout/workspace-gate";
import { Roadmap } from "@/features/roadmap/roadmap";

export const metadata: Metadata = { title: "Life Roadmap" };

export default function RoadmapPage() {
  // A single root element: hidden routes kept by Cache Components are hidden by styling their root nodes.
  return (
    <div className="flex flex-1 flex-col">
      <Suspense fallback={<PageSkeleton />}>
        <WorkspaceGate>
          <Roadmap />
        </WorkspaceGate>
      </Suspense>
    </div>
  );
}
