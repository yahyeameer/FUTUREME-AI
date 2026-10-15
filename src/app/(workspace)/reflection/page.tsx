import type { Metadata } from "next";
import { WorkspaceGate } from "@/components/layout/workspace-gate";
import { ReflectionExperience } from "@/features/reflection/reflection";

export const metadata: Metadata = { title: "Future Reflection" };

export default function ReflectionPage() {
  // A single root element: hidden routes kept by Cache Components are hidden by styling their root nodes.
  return (
    <div className="flex flex-1 flex-col">
      <WorkspaceGate>
        <ReflectionExperience />
      </WorkspaceGate>
    </div>
  );
}
