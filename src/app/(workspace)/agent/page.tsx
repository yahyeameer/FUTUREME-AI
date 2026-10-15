import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton, WorkspaceGate } from "@/components/layout/workspace-gate";
import { Agent } from "@/features/agent/agent";

export const metadata: Metadata = { title: "Agent" };

export default function AgentPage() {
  // A single root element: hidden routes kept by Cache Components are hidden by styling their root nodes.
  return (
    <div className="flex flex-1 flex-col">
      <Suspense fallback={<PageSkeleton />}>
        <WorkspaceGate>
          <Agent />
        </WorkspaceGate>
      </Suspense>
    </div>
  );
}
