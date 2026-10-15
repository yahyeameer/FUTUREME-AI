import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton, WorkspaceGate } from "@/components/layout/workspace-gate";
import { Twin } from "@/features/twin/twin";

export const metadata: Metadata = { title: "Voice Twin" };

export default function TwinPage() {
  // A single root element: hidden routes kept by Cache Components are hidden by styling their root nodes.
  return (
    <div className="flex flex-1 flex-col">
      <Suspense fallback={<PageSkeleton />}>
        <WorkspaceGate>
          <Twin />
        </WorkspaceGate>
      </Suspense>
    </div>
  );
}
