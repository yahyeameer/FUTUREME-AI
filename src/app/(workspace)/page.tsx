import type { Metadata } from "next";
import { WorkspaceGate } from "@/components/layout/workspace-gate";
import { Home } from "@/features/home/home";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  // A single root element: hidden routes kept by Cache Components are hidden by styling their root nodes.
  return (
    <div className="flex flex-1 flex-col">
      <WorkspaceGate>
        <Home />
      </WorkspaceGate>
    </div>
  );
}
