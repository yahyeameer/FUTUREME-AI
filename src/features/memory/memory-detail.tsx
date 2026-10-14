"use client";

import { Archive, ArchiveRestore, ArrowLeft, Eye, EyeOff, Flag, Pencil, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Markdown } from "@/components/markdown";
import { PageFrame, RailSection } from "@/components/layout/page-frame";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { formatDate } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";
import { MemoryEditor } from "./memory-editor";
import { KIND_LABEL, MemoryPreview } from "./memory-preview";
import { ProvenanceBadge } from "./provenance";

export function MemoryDetail({ id }: { id: string }) {
  const { workspace, run } = useWorkspace();
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const memory = workspace.memories.find((m) => m.id === id);
  const caps = workspace.capabilities;

  if (!memory)
    return (
      <PageFrame>
        <EmptyState
          title="This memory doesn't exist"
          action={
            <Button asChild size="sm" variant="secondary">
              <Link href="/memory">Back to the vault</Link>
            </Button>
          }
        >
          It may have been deleted, or the link is out of date. FutureMe can&apos;t recall it.
        </EmptyState>
      </PageFrame>
    );

  const byTitle = new Map(workspace.memories.map((m) => [m.title.toLowerCase(), m.id]));
  const resolve = (title: string) => {
    const hit = byTitle.get(title.toLowerCase());
    if (hit) return `/memory/${encodeURIComponent(hit)}`;
    const ms = workspace.milestones.find((m) => m.title.toLowerCase() === title.toLowerCase());
    if (ms) return `/roadmap?milestone=${encodeURIComponent(ms.id)}`;
    const task = workspace.tasks.find((t) => t.title.toLowerCase() === title.toLowerCase());
    return task ? `/roadmap?milestone=${encodeURIComponent(task.milestoneId)}` : undefined;
  };
  const related = memory.relatedMemoryIds.map((r) => workspace.memories.find((m) => m.id === r)).filter((m) => !!m);
  const goals = memory.relatedMilestoneIds.map((r) => workspace.milestones.find((m) => m.id === r)).filter((m) => !!m);

  const remove = async () => {
    const ok = await run((s) => s.deleteMemories([memory.id]), "Memory deleted");
    if (ok) router.push("/memory");
  };

  const rail = (
    <div>
      <RailSection title="Related goals">
        {goals.length ? (
          <ul className="space-y-2">
            {goals.map((g) => (
              <li key={g.id}>
                <Link href={`/roadmap?milestone=${encodeURIComponent(g.id)}`} className="flex items-start gap-1.5 text-[13px] hover:underline">
                  <Flag className="mt-0.5 size-3.5 shrink-0 text-accent-ink" aria-hidden /> {g.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">Not linked to a goal.</p>
        )}
      </RailSection>
      <RailSection title="Related memories">
        {related.length ? (
          <div className="divide-y divide-border">
            {related.map((m) => (
              <MemoryPreview key={m.id} memory={m} showExcerpt={false} className="mx-0 rounded-none px-0 hover:bg-transparent" />
            ))}
          </div>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">No linked notes. Add a [[wiki-link]] to connect one.</p>
        )}
      </RailSection>
    </div>
  );

  return (
    <PageFrame rail={rail} railTitle="Connections" toolbar={
      <Link href="/memory" className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Memory Vault
      </Link>
    }>
      <article>
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <span className="t-label">{KIND_LABEL[memory.kind]}</span>
            <ProvenanceBadge value={memory.provenance} />
            {memory.archived && <span className="t-meta">Archived</span>}
          </div>
          <h1 className="mt-3 font-display text-[clamp(2rem,1.6rem+1.6vw,2.9rem)] leading-[1.05] text-balance">{memory.title}</h1>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-y border-border py-3 sm:grid-cols-4">
            <div>
              <dt className="t-label">Recorded</dt>
              <dd className="mt-0.5 text-[12.5px]">{formatDate(memory.createdAt, { day: "numeric", month: "short", year: "numeric" })}</dd>
            </div>
            <div>
              <dt className="t-label">Updated</dt>
              <dd className="mt-0.5 text-[12.5px]">{formatDate(memory.updatedAt, { day: "numeric", month: "short", year: "numeric" })}</dd>
            </div>
            <div className="col-span-2">
              <dt className="t-label">Why it exists</dt>
              <dd className="mt-0.5 text-[12.5px]">{memory.source}</dd>
            </div>
            {memory.path && (
              <div className="col-span-2 sm:col-span-4">
                <dt className="t-label">Vault file</dt>
                <dd className="mt-0.5 truncate t-meta !text-muted-foreground">{memory.path}</dd>
              </div>
            )}
          </dl>
        </header>

        {memory.provenance === "ai-inferred" && (
          <div className="mt-5 flex gap-3 rounded-md border border-copper/30 bg-copper-wash px-4 py-3 text-[13px]">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-copper" aria-hidden />
            <p>
              This is an AI interpretation or an imagined scenario, not something you stated. If it&apos;s wrong, edit it: your correction becomes your own statement.
            </p>
          </div>
        )}

        <Markdown source={memory.body} resolve={resolve} className="mt-6 max-w-[40rem] t-reading" />

        {memory.tags.length > 0 && <p className="mt-6 font-mono text-[12px] text-subtle">{memory.tags.map((t) => `#${t}`).join("  ")}</p>}

        <section aria-labelledby="controls" className="mt-10 rounded-lg border border-border bg-surface">
          <h2 id="controls" className="border-b border-border px-4 py-2.5 t-label">
            Your control over this memory
          </h2>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <Pencil /> {memory.provenance === "ai-inferred" ? "Correct it" : "Edit"}
            </Button>
            {caps.archiveMemories && (
              <Button variant="ghost" size="sm" onClick={() => run((s) => s.updateMemory(memory.id, { archived: !memory.archived }), memory.archived ? "Restored" : "Archived")}>
                {memory.archived ? <ArchiveRestore /> : <Archive />} {memory.archived ? "Restore" : "Archive"}
              </Button>
            )}
            <Button variant="destructive" size="sm" className="ml-auto" onClick={() => setConfirm(true)}>
              <Trash2 /> Delete
            </Button>
          </div>
          {caps.memoryRetrievalControl && (
            <label className="flex items-start gap-3 border-t border-border px-4 py-3">
              <Switch className="mt-0.5" checked={memory.retrievable} onCheckedChange={(c) => run((s) => s.updateMemory(memory.id, { retrievable: c }), c ? "FutureMe can recall this again" : "FutureMe won't recall this")} />
              <span>
                <span className="flex items-center gap-1.5 text-[13px] font-medium">
                  {memory.retrievable ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />} Let FutureMe recall this in conversations
                </span>
                <span className="mt-0.5 block text-[12px] text-muted-foreground">When off, the note stays in your vault but isn&apos;t retrieved or cited.</span>
              </span>
            </label>
          )}
        </section>
      </article>

      {editing && <MemoryEditor memory={memory} open onOpenChange={setEditing} onSaved={(title) => {
        // Renaming a vault note changes its path, which is its id in live mode.
        if (workspace.runtime.mode === "live" && title !== memory.title) router.replace("/memory");
      }} />}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{memory.title}”?</DialogTitle>
            <DialogDescription>FutureMe won&apos;t be able to recall it again, and conversations will stop citing it. This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove}>
              Delete memory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}
