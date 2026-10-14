import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton, WorkspaceGate } from "@/components/layout/workspace-gate";
import { Skills } from "@/features/skills/skills";

export const metadata: Metadata = { title: "Skills and Actions" };

export default function SkillsPage() {
  // A single root element: hidden routes kept by Cache Components are hidden by styling their root nodes.
  return (
    <div className="flex flex-1 flex-col">
      <Suspense fallback={<PageSkeleton />}>
        <WorkspaceGate>
          <Skills />
        </WorkspaceGate>
      </Suspense>
    </div>
  );
}
