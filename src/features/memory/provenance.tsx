import { BadgeCheck, Sparkles, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import type { Provenance } from "@/types";

const META: Record<Provenance, { label: string; tone: "neutral" | "copper" | "success"; icon: typeof UserRound; help: string }> = {
  "user-stated": { label: "You said", tone: "neutral", icon: UserRound, help: "Something you wrote or approved." },
  "ai-inferred": { label: "AI interpretation", tone: "copper", icon: Sparkles, help: "A model's interpretation or an imagined scenario. Not a record of fact." },
  verified: { label: "Recorded event", tone: "success", icon: BadgeCheck, help: "An event the app recorded, such as a completed task." },
};

export function ProvenanceBadge({ value, compact = false }: { value: Provenance; compact?: boolean }) {
  const m = META[value];
  return (
    <Tooltip content={m.help}>
      <Badge tone={m.tone} tabIndex={0} className="cursor-help">
        <m.icon aria-hidden />
        {compact ? <span className="sr-only">{m.label}</span> : m.label}
      </Badge>
    </Tooltip>
  );
}

export const PROVENANCE_LABEL: Record<Provenance, string> = { "user-stated": "You said", "ai-inferred": "AI interpretation", verified: "Recorded event" };
