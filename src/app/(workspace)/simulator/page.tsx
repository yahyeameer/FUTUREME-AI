import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton, WorkspaceGate } from "@/components/layout/workspace-gate";
import { Simulator } from "@/features/simulator/simulator";

export const metadata: Metadata = { title: "Future Simulator" };

export default function SimulatorPage() {
  // A single root element: hidden routes kept by Cache Components are hidden by styling their root nodes.
  return (
    <div className="flex flex-1 flex-col">
      <Suspense fallback={<PageSkeleton />}>
        <WorkspaceGate>
          <Simulator />
        </WorkspaceGate>
      </Suspense>
    </div>
  );
}
