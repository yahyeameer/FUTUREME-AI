import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton, WorkspaceGate } from "@/components/layout/workspace-gate";
import { MemoryVault } from "@/features/memory/vault";

export const metadata: Metadata = { title: "Memory Vault" };

export default function MemoryPage() {
  // A single root element: hidden routes kept by Cache Components are hidden by styling their root nodes.
  return (
    <div className="flex flex-1 flex-col">
      <Suspense fallback={<PageSkeleton />}>
        <WorkspaceGate>
          <MemoryVault />
        </WorkspaceGate>
      </Suspense>
    </div>
  );
}
