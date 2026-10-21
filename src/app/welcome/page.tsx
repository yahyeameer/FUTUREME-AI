import type { Metadata } from "next";
import { Landing } from "@/features/landing/landing";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: { absolute: `${BRAND.name}: ${BRAND.tagline}` }, description: BRAND.description };

export default function WelcomePage() {
  // A single root element: hidden routes kept by Cache Components are hidden by styling their root nodes.
  return (
    <div>
      <Landing />
    </div>
  );
}
