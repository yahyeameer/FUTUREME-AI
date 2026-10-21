import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton, WorkspaceGate } from "@/components/layout/workspace-gate";
import { Daily } from "@/features/daily/daily";

export const metadata: Metadata = { title: "TOMORA Daily" };

export default function DailyPage() {
  // A single root element: hidden routes kept by Cache Components are hidden by styling their root nodes.
  return (
    <div className="flex flex-1 flex-col">
      <Suspense fallback={<PageSkeleton />}>
        <WorkspaceGate>
          <Daily />
        </WorkspaceGate>
      </Suspense>
    </div>
  );
}
