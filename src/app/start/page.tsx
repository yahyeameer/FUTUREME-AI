import type { Metadata } from "next";
import { Start } from "./start";

export const metadata: Metadata = { title: "Starting" };

export default function StartPage() {
  // A single root element: hidden routes kept by Cache Components are hidden by styling their root nodes.
  return (
    <div>
      <Start />
    </div>
  );
}
