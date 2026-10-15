import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton, WorkspaceGate } from "@/components/layout/workspace-gate";
import { Conversation } from "@/features/assistant/conversation";

export const metadata: Metadata = { title: "Future Self" };

export default function FutureSelfPage() {
  // A single root element: hidden routes kept by Cache Components are hidden by styling their root nodes.
  return (
    <div className="flex flex-1 flex-col">
      <Suspense fallback={<PageSkeleton />}>
        <WorkspaceGate>
          <Conversation />
        </WorkspaceGate>
      </Suspense>
    </div>
  );
}
