import type { Metadata } from "next";
import { Onboarding } from "@/features/onboarding/onboarding";

export const metadata: Metadata = { title: "Welcome" };

export default function OnboardingPage() {
  // A single root element: hidden routes kept by Cache Components are hidden by styling their root nodes.
  return (
    <div>
      <Onboarding />
    </div>
  );
}
