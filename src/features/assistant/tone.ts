import type { CoachingStyle } from "@/types";

export const TONES: { value: CoachingStyle; label: string; hint: string }[] = [
  { value: "reflective", label: "Reflective", hint: "Empathetic. Helps you understand what's going on." },
  { value: "strategic", label: "Strategic", hint: "Direct. Names avoidance and asks for commitments." },
  { value: "encouraging", label: "Encouraging", hint: "Warm. Notices progress and celebrates it." },
  { value: "analytical", label: "Analytical", hint: "Practical. Leverage, trade-offs and sequencing." },
];
