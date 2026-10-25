"use client";

import { Library, ListFilter, Network, Plus, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { PageFrame, RailSection } from "@/components/layout/page-frame";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pluralize } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";
import type { Memory, MemoryKind, Provenance } from "@/types";
import { buildGraph, MemoryGraph } from "./memory-graph";
import { MemoryEditor } from "./memory-editor";
import { KIND_LABEL, MemoryPreview } from "./memory-preview";
import { PROVENANCE_LABEL, ProvenanceBadge } from "./provenance";

type Filter = "all" | "memories" | "goals" | "reflections" | "milestones" | "experiences" | "records";

const FILTERS: { value: Filter; label: string; kinds: MemoryKind[] | null }[] = [
  { value: "all", label: "All", kinds: null },
  { value: "memories", label: "Memories", kinds: ["note", "profile"] },
  { value: "goals", label: "Goals", kinds: ["goal"] },
  { value: "milestones", label: "Milestones", kinds: ["milestone"] },
  { value: "reflections", label: "Reflections", kinds: ["reflection"] },
  { value: "experiences", label: "Experiences", kinds: ["experience"] },
  { value: "records", label: "Tasks & issues", kinds: ["task", "daily"] },
];

export function MemoryVault() {
  const { workspace, run } = useWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [prov, setProv] = React.useState<"any" | Provenance>("any");
  const [tag, setTag] = React.useState<string | null>(null);
  const [showArchived, setShowArchived] = React.useState(false);
  const [selecting, setSelecting] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [confirm, setConfirm] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    if (params.get("new") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCreating(true);
      router.replace("/memory", { scroll: false });
    }
  }, [params, router]);

  const filters = FILTERS.filter((f) => !f.kinds || workspace.memories.some((m) => f.kinds!.includes(m.kind)));
  const tags = [...new Set(workspace.memories.flatMap((m) => m.tags))].sort();
  const archivedCount = workspace.memories.filter((m) => m.archived).length;

  const q = query.trim().toLowerCase();
  const kinds = FILTERS.find((f) => f.value === filter)?.kinds;
  const list = workspace.memories.filter(
    (m) =>
      (showArchived || !m.archived) &&
      (!kinds || kinds.includes(m.kind)) &&
      (prov === "any" || m.provenance === prov) &&
      (!tag || m.tags.includes(tag)) &&
      (!q || m.title.toLowerCase().includes(q) || m.body.toLowerCase().includes(q) || m.tags.some((t) => t.includes(q))),
  );

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const remove = async () => {
    const ok = await run((s) => s.deleteMemories([...selected]), `${pluralize(selected.size, "memory", "memories")} deleted`);
    if (ok) {
      setSelected(new Set());
      setSelecting(false);
      setConfirm(false);
    }
  };

  const graph = buildGraph(workspace.memories, workspace.milestones);

  return (
    <PageFrame width="wide" rail={<VaultRail />} railTitle="Privacy">
      <PageHeader
        eyebrow="Memory Vault"
        title="What TOMORA remembers"
        description="Every memory is a readable note you can open, correct or delete. The vault is plain Markdown with wiki-links, so it also opens in Obsidian."
        actions={
          <>
            <Button variant={selecting ? "secondary" : "ghost"} onClick={() => (setSelecting((s) => !s), setSelected(new Set()))} aria-pressed={selecting}>
              {selecting ? <X /> : <ListFilter />} {selecting ? "Done" : "Select"}
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus /> New memory
            </Button>
          </>
        }
      />

      <div role="group" aria-label="Jump to a kind of memory" className="mt-7 grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
        {filters
          .filter((f) => f.kinds)
          .map((f, i) => {
            const n = workspace.memories.filter((m) => !m.archived && f.kinds!.includes(m.kind)).length;
            const live = workspace.memories.filter((m) => !m.archived).length || 1;
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(filter === f.value ? "all" : f.value)}
                className="card card-hover group/kind relative overflow-hidden px-3 py-2.5 text-left transition-[transform,box-shadow] duration-300 animate-[settle_0.6s_cubic-bezier(0.2,0.7,0.2,1)_backwards] aria-pressed:shadow-[var(--shadow-card),var(--glow-accent)]"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="t-label transition-colors group-hover/kind:text-foreground group-aria-pressed/kind:!text-accent-ink">{f.label}</span>
                  <span className="font-display text-[22px] leading-none tabular-nums transition-transform duration-300 group-hover/kind:-translate-y-0.5">{n}</span>
                </span>
                <span aria-hidden className="mt-2 block h-1 overflow-hidden rounded-full bg-surface-3">
                  <span className="block h-full origin-left rounded-full bg-gradient-to-r from-accent to-copper shadow-[0_0_8px_var(--accent)] transition-transform duration-700 group-hover/kind:scale-x-105" style={{ width: `${Math.max(6, (n / live) * 100)}%` }} />
                </span>
              </button>
            );
          })}
      </div>

      <Tabs defaultValue="list" className="mt-6">
        <div className="flex flex-wrap items-center gap-3">
          <TabsList>
            <TabsTrigger value="list">
              <Library /> List
            </TabsTrigger>
            <TabsTrigger value="graph">
              <Network /> Connections
            </TabsTrigger>
          </TabsList>
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" aria-hidden />
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search memories" className="h-8 pl-8" aria-label="Search memories" />
          </div>
        </div>

        <TabsContent value="list" className="mt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented label="Filter by type" value={filter} onValueChange={setFilter} options={filters.map((f) => ({ value: f.value, label: f.label }))} />
            <Select
              aria-label="Filter by source"
              value={prov}
              onValueChange={setProv}
              className="h-8 w-44 text-xs"
              options={[{ value: "any", label: "Any source" }, ...(["user-stated", "ai-inferred", "verified"] as const).map((p) => ({ value: p, label: PROVENANCE_LABEL[p] }))]}
            />
            {workspace.capabilities.archiveMemories && archivedCount > 0 && (
              <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <Switch checked={showArchived} onCheckedChange={setShowArchived} /> Show archived ({archivedCount})
              </label>
            )}
          </div>
          {tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1" aria-label="Tags">
              {tags.slice(0, 18).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTag(tag === t ? null : t)}
                  aria-pressed={tag === t}
                  className="rounded-[4px] border border-border px-1.5 py-px font-mono text-[11px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground aria-pressed:border-accent/50 aria-pressed:bg-accent-wash aria-pressed:text-accent-ink"
                >
                  #{t}
                </button>
              ))}
            </div>
          )}

          {selecting && (
            <div className="glass sticky top-28 z-20 mt-4 flex items-center gap-3 rounded-lg px-3 py-2 lg:top-16">
              <Checkbox
                aria-label="Select all shown"
                checked={list.length > 0 && list.every((m) => selected.has(m.id))}
                onCheckedChange={(c) => setSelected(c ? new Set(list.map((m) => m.id)) : new Set())}
              />
              <span className="text-[12.5px]">{selected.size ? `${selected.size} selected` : "Select memories to delete"}</span>
              <Button size="sm" variant="destructive" className="ml-auto" disabled={!selected.size} onClick={() => setConfirm(true)}>
                <Trash2 /> Delete
              </Button>
            </div>
          )}

          <div className="mt-5">
            {list.length ? (
              <ul className="divide-y divide-border border-y border-border">
                {list.map((m, i) => (
                  <li key={m.id} className="flex items-start gap-3 animate-[settle_0.5s_cubic-bezier(0.2,0.7,0.2,1)_backwards]" style={{ animationDelay: `${Math.min(i, 12) * 0.03}s` }}>
                    {selecting && <Checkbox className="mt-4" checked={selected.has(m.id)} onCheckedChange={() => toggle(m.id)} aria-label={`Select ${m.title}`} />}
                    <MemoryPreview memory={m} className="relative mx-0 min-w-0 flex-1 rounded-none px-0 transition-[padding,background-color] duration-200 before:absolute before:top-3 before:bottom-3 before:left-0 before:w-[3px] before:rounded-full before:bg-gradient-to-b before:from-accent before:to-copper before:opacity-0 before:transition-opacity hover:bg-[linear-gradient(90deg,var(--accent-wash),transparent_70%)] hover:pl-4 hover:before:opacity-100" />
                  </li>
                ))}
              </ul>
            ) : workspace.memories.length ? (
              <EmptyState icon={Search} title="No memories match" action={<Button size="sm" variant="secondary" onClick={() => (setQuery(""), setFilter("all"), setProv("any"), setTag(null))}>Clear filters</Button>}>
                Try a different search or filter.
              </EmptyState>
            ) : (
              <EmptyState icon={Library} title="Your vault is empty" action={<Button size="sm" variant="primary" onClick={() => setCreating(true)}>Add your first memory</Button>}>
                Memories you add, or approve in conversations, are kept here.
              </EmptyState>
            )}
          </div>
        </TabsContent>

        <TabsContent value="graph" className="mt-4">
          <p className="mb-3 max-w-2xl text-[13px] text-muted-foreground">
            Lines are real links: a wiki-link between two notes, or a note attached to a milestone. Hover to see a note&apos;s neighbours; select one to open it.
          </p>
          {graph.edges.length ? (
            <>
              <div className="hidden sm:block">
                <MemoryGraph memories={workspace.memories} milestones={workspace.milestones} />
              </div>
              <ConnectionList memories={workspace.memories} />
            </>
          ) : (
            <EmptyState icon={Network} title="No links yet">
              Link notes with [[wiki-links]] or approve plans in a conversation, and the connections appear here.
            </EmptyState>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {pluralize(selected.size, "memory", "memories")}?</DialogTitle>
            <DialogDescription>
              {workspace.runtime.mode === "live" ? "The notes are removed from your vault. " : ""}TOMORA won&apos;t be able to recall them again. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {creating && <MemoryEditor open onOpenChange={setCreating} />}
    </PageFrame>
  );
}

/** Accessible, small-screen version of the graph: each note and what it links to. */
function ConnectionList({ memories }: { memories: Memory[] }) {
  const { workspace } = useWorkspace();
  const byId = new Map(memories.map((m) => [m.id, m]));
  const linked = memories.filter((m) => !m.archived && (m.relatedMemoryIds.length || m.relatedMilestoneIds.length) && m.kind !== "task" && m.kind !== "daily");
  return (
    <details className="group mt-4 rounded-lg border border-border sm:mt-3" open={undefined}>
      <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium select-none">Connections as a list ({linked.length} notes)</summary>
      <ul className="divide-y divide-border border-t border-border">
        {linked.map((m) => (
          <li key={m.id} className="px-4 py-2.5">
            <Link href={`/memory/${encodeURIComponent(m.id)}`} className="text-[13px] font-medium hover:underline">
              {m.title}
            </Link>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Links to:{" "}
              {[
                ...m.relatedMilestoneIds.map((id) => workspace.milestones.find((x) => x.id === id)?.title).filter(Boolean).map((t) => `${t} (milestone)`),
                ...m.relatedMemoryIds.map((id) => byId.get(id)?.title).filter(Boolean),
              ].join(" · ")}
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}

function VaultRail() {
  const { workspace } = useWorkspace();
  const live = workspace.memories.filter((m) => !m.archived);
  const counts = (["user-stated", "ai-inferred", "verified"] as const).map((p) => [p, live.filter((m) => m.provenance === p).length] as const);
  const hidden = live.filter((m) => !m.retrievable).length;
  return (
    <div>
      <RailSection title="Where memories live">
        <p className="text-[12.5px] text-muted-foreground">{workspace.runtime.storage}.</p>
        <p className="mt-2 text-[12.5px] text-muted-foreground">{workspace.runtime.inference}</p>
      </RailSection>
      <RailSection title="By source">
        <ul className="space-y-2">
          {counts.map(([p, n]) => (
            <li key={p} className="flex items-center justify-between">
              <ProvenanceBadge value={p} />
              <span className="t-meta">{n}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-subtle">AI interpretations and imagined scenarios are never treated as evidence that something happened.</p>
      </RailSection>
      <RailSection title="What TOMORA can recall">
        {workspace.capabilities.memoryRetrievalControl ? (
          <p className="text-[12.5px] text-muted-foreground">
            {hidden ? `${pluralize(hidden, "memory", "memories")} excluded from conversations.` : "Every memory here can be recalled."} Open a memory to change this.
          </p>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">Everything in the vault can be recalled. To keep something out of conversations, delete it.</p>
        )}
        <Link href="/settings#memory" className="mt-2 inline-block text-[12px] text-accent-ink hover:underline">
          Memory settings
        </Link>
      </RailSection>
      <RailSection title="Types">
        <ul className="space-y-1">
          {Object.entries(
            live.reduce<Record<string, number>>((acc, m) => {
              acc[m.kind] = (acc[m.kind] ?? 0) + 1;
              return acc;
            }, {}),
          ).map(([k, n]) => (
            <li key={k} className="flex justify-between text-[12.5px] text-muted-foreground">
              {KIND_LABEL[k as MemoryKind]} <span className="t-meta">{n}</span>
            </li>
          ))}
        </ul>
      </RailSection>
    </div>
  );
}
