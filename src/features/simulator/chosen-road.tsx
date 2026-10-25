"use client";

import { ArrowRight, Loader2, MessageCircle, Split, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCost, formatSpan, KIND_LABEL } from "@/lib/simulator-paths";
import { cn, relativeDay } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";

/** The road the user chose in the simulator, as the app works from it. `compact` fits a context rail. */
export function ChosenRoadCard({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { workspace, run } = useWorkspace();
  const [clearing, setClearing] = React.useState(false);
  const road = workspace.chosenRoad;
  if (!road) return null;
  const p = road.path;
  const planHref = `/future-self?prompt=${encodeURIComponent(`I chose the ${p.name.toLowerCase()} for "${road.goal}". Help me plan the next month on it, and check which of its assumptions I should test first.`)}`;

  if (compact) {
    return (
      <Link href="/simulator" className={cn("group block", className)}>
        <p className="flex items-start gap-1.5 text-[13px] font-medium group-hover:underline">
          <Split className="mt-0.5 size-3.5 shrink-0 text-copper" aria-hidden /> {p.name}
        </p>
        <p className="mt-1 t-meta">
          {formatSpan(p.months)} · {formatCost(p.cost)} · holds only if {p.assumptions[0]?.charAt(0).toLowerCase()}
          {p.assumptions[0]?.slice(1)}
        </p>
        <p className="mt-1.5 flex items-center gap-1.5 t-meta">
          <Badge tone="copper">Chosen</Badge> your future self plans with it
        </p>
      </Link>
    );
  }

  return (
    <section aria-labelledby="chosen-road" className={cn("card ring-gradient relative overflow-hidden p-5 sm:p-6", className)}>
      <div aria-hidden className="pointer-events-none absolute -top-20 -right-16 size-[18rem] rounded-full bg-[radial-gradient(circle,var(--copper-wash),transparent_65%)]" />
      <div className="relative flex flex-wrap items-center gap-2">
        <p id="chosen-road" className="t-label !text-copper">
          Your chosen road
        </p>
        <Badge tone="outline">{KIND_LABEL[p.kind]}</Badge>
        <span className="ml-auto t-meta">chosen {relativeDay(road.chosenAt)}</span>
      </div>
      <p className="relative mt-2 font-display text-[1.6rem] leading-tight">{p.name}</p>
      <p className="relative mt-1 text-[13.5px] text-muted-foreground">
        For “{road.goal}” · {formatSpan(p.months)} · {formatCost(p.cost)} · ~{p.hoursPerWeek} h a week
      </p>
      <p className="relative mt-3 text-[13px]">
        <span className="text-muted-foreground">Holds only if </span>
        {p.assumptions.map((a) => a.charAt(0).toLowerCase() + a.slice(1).replace(/\.$/, "")).join("; ")}.
      </p>
      <p className="relative mt-3 t-meta">Your future self, the council, missions and the night shift now plan with this road, and flag it if one of its assumptions stops holding.</p>
      <div className="relative mt-4 flex flex-wrap gap-2">
        <Button asChild variant="primary" size="sm">
          <Link href={planHref}>
            <MessageCircle /> Plan it with your future self
          </Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link href="/simulator">
            Compare roads again <ArrowRight />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={clearing}
          onClick={async () => {
            setClearing(true);
            await run((s) => s.clearRoad(), "Road cleared. Agents no longer plan with it.");
            setClearing(false);
          }}
        >
          {clearing ? <Loader2 className="animate-spin" /> : <X />} Clear
        </Button>
      </div>
    </section>
  );
}
