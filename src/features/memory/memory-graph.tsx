"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { cn } from "@/lib/utils";
import type { Memory, Milestone } from "@/types";

// Knowledge graph of real links only: wiki-links between notes and notes attached to milestones.
// Layout is a small deterministic force simulation, so the same vault always draws the same picture.

interface Node {
  id: string;
  label: string;
  type: "memory" | "milestone";
  provenance?: Memory["provenance"];
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export function buildGraph(memories: Memory[], milestones: Milestone[]) {
  const visible = memories.filter((m) => !m.archived && m.kind !== "task" && m.kind !== "daily");
  const ids = new Set(visible.map((m) => m.id));
  const msIds = new Set(milestones.map((m) => m.id));
  const edges = new Map<string, [string, string]>();
  const add = (a: string, b: string) => {
    if (a === b) return;
    const key = [a, b].sort().join("|");
    if (!edges.has(key)) edges.set(key, [a, b]);
  };
  for (const m of visible) {
    for (const r of m.relatedMemoryIds) if (ids.has(r)) add(m.id, r);
    for (const r of m.relatedMilestoneIds) if (msIds.has(r)) add(m.id, `ms:${r}`);
  }
  const linkedMs = milestones.filter((ms) => [...edges.values()].some(([a, b]) => a === `ms:${ms.id}` || b === `ms:${ms.id}`));
  return {
    nodes: [
      ...visible.map((m) => ({ id: m.id, label: m.title, type: "memory" as const, provenance: m.provenance })),
      ...linkedMs.map((ms) => ({ id: `ms:${ms.id}`, label: ms.title, type: "milestone" as const })),
    ],
    edges: [...edges.values()],
  };
}

function layout(nodes: Omit<Node, "x" | "y" | "vx" | "vy">[], edges: [string, string][], w: number, h: number): Node[] {
  const out: Node[] = nodes.map((n, i) => {
    const a = (i / Math.max(1, nodes.length)) * Math.PI * 2;
    return { ...n, x: w / 2 + Math.cos(a) * w * 0.32, y: h / 2 + Math.sin(a) * h * 0.32, vx: 0, vy: 0 };
  });
  const idx = new Map(out.map((n, i) => [n.id, i]));
  for (let step = 0; step < 320; step++) {
    const alpha = 1 - step / 320;
    for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const d2 = Math.max(dx * dx + dy * dy, 30);
        const f = (2600 / d2) * alpha;
        const d = Math.sqrt(d2);
        dx /= d;
        dy /= d;
        a.vx += dx * f;
        a.vy += dy * f;
        b.vx -= dx * f;
        b.vy -= dy * f;
      }
    for (const [s, t] of edges) {
      const a = out[idx.get(s)!];
      const b = out[idx.get(t)!];
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 110) * 0.02 * alpha;
      a.vx += (dx / d) * f;
      a.vy += (dy / d) * f;
      b.vx -= (dx / d) * f;
      b.vy -= (dy / d) * f;
    }
    for (const n of out) {
      n.vx += (w / 2 - n.x) * 0.004;
      n.vy += (h / 2 - n.y) * 0.006;
      n.x = Math.min(w - 40, Math.max(40, n.x + n.vx));
      n.y = Math.min(h - 30, Math.max(30, n.y + n.vy));
      n.vx *= 0.6;
      n.vy *= 0.6;
    }
  }
  return out;
}

export function MemoryGraph({ memories, milestones }: { memories: Memory[]; milestones: Milestone[] }) {
  const router = useRouter();
  const [hover, setHover] = React.useState<string | null>(null);
  const W = 860;
  const H = 520;
  const graph = React.useMemo(() => buildGraph(memories, milestones), [memories, milestones]);
  const nodes = React.useMemo(() => layout(graph.nodes, graph.edges, W, H), [graph]);
  const pos = new Map(nodes.map((n) => [n.id, n]));
  const neighbours = React.useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const [a, b] of graph.edges) {
      if (!m.has(a)) m.set(a, new Set());
      if (!m.has(b)) m.set(b, new Set());
      m.get(a)!.add(b);
      m.get(b)!.add(a);
    }
    return m;
  }, [graph]);
  const lit = (id: string) => !hover || hover === id || neighbours.get(hover)?.has(id);

  const open = (n: Node) => router.push(n.type === "milestone" ? `/roadmap?milestone=${encodeURIComponent(n.id.slice(3))}` : `/memory/${encodeURIComponent(n.id)}`);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-sunken">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="group" aria-label="Graph of linked memories and milestones">
        {graph.edges.map(([a, b]) => {
          const s = pos.get(a);
          const t = pos.get(b);
          if (!s || !t) return null;
          const on = hover && (hover === a || hover === b);
          return (
            <line
              key={`${a}|${b}`}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke={on ? "var(--accent)" : "var(--border-strong)"}
              strokeWidth={on ? 1.4 : 0.9}
              strokeDasharray={a.startsWith("ms:") || b.startsWith("ms:") ? "3 3" : undefined}
              className="transition-[stroke,opacity] duration-150"
              opacity={lit(a) && lit(b) ? 1 : 0.2}
            />
          );
        })}
        {nodes.map((n) => {
          const isMs = n.type === "milestone";
          const fill = isMs ? "var(--accent)" : n.provenance === "ai-inferred" ? "var(--copper)" : n.provenance === "verified" ? "var(--success)" : "var(--foreground)";
          return (
            <g
              key={n.id}
              transform={`translate(${n.x} ${n.y})`}
              tabIndex={0}
              role="link"
              aria-label={`${isMs ? "Milestone" : "Memory"}: ${n.label}`}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(n.id)}
              onBlur={() => setHover(null)}
              onClick={() => open(n)}
              onKeyDown={(e) => e.key === "Enter" && open(n)}
              className={cn("cursor-pointer outline-none transition-opacity duration-150", !lit(n.id) && "opacity-25")}
            >
              {isMs ? <rect x={-6} y={-6} width={12} height={12} transform="rotate(45)" fill="var(--background)" stroke={fill} strokeWidth={1.6} /> : <circle r={hover === n.id ? 6 : 4.5} fill={fill} />}
              <text y={isMs ? 20 : 17} textAnchor="middle" className={cn("pointer-events-none fill-muted-foreground text-[10.5px]", hover === n.id && "fill-foreground")}>
                {n.label.length > 32 ? `${n.label.slice(0, 31)}…` : n.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2.5 t-meta">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-foreground" /> You said
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-copper" /> AI interpretation
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rotate-45 border border-accent" /> Milestone
        </span>
        <span className="ml-auto">
          {graph.nodes.length} notes · {graph.edges.length} links
        </span>
      </div>
    </div>
  );
}
