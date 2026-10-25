"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useWorkspace } from "@/lib/workspace-store";
import type { Memory, MemoryKind } from "@/types";
import { KIND_LABEL } from "./memory-preview";

const Schema = z.object({
  title: z.string().trim().min(1, "Give the memory a title.").max(120, "Keep the title under 120 characters."),
  body: z.string().trim().min(1, "Write something to remember.").max(20000),
  kind: z.enum(["note", "experience", "reflection", "goal", "profile"]),
  tags: z.string().max(400),
});
type Values = z.infer<typeof Schema>;

const KINDS: MemoryKind[] = ["note", "experience", "reflection", "goal", "profile"];

export function MemoryEditor({ memory, open, onOpenChange, onSaved }: { memory?: Memory; open: boolean; onOpenChange: (o: boolean) => void; onSaved?: (title: string) => void }) {
  const { run } = useWorkspace();
  const form = useForm<Values>({
    resolver: zodResolver(Schema),
    defaultValues: {
      title: memory?.title ?? "",
      body: memory?.body ?? "",
      kind: memory && (KINDS as string[]).includes(memory.kind) ? (memory.kind as Values["kind"]) : "note",
      tags: memory?.tags.join(", ") ?? "",
    },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (v) => {
    const draft = {
      title: v.title,
      body: v.body,
      kind: v.kind,
      tags: v.tags
        .split(",")
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean),
    };
    const ok = await run((s) => (memory ? s.updateMemory(memory.id, draft) : s.createMemory(draft)), memory ? "Memory updated" : "Memory saved");
    if (ok) {
      onOpenChange(false);
      onSaved?.(v.title);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{memory ? "Edit memory" : "New memory"}</DialogTitle>
            <DialogDescription>
              {memory?.provenance === "ai-inferred"
                ? "This started as an AI interpretation. Once you edit it, it's recorded as your own statement."
                : "Saved as a Markdown note TOMORA can recall in conversations. Wiki-links like [[Values]] connect notes."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="mem-title">Title</Label>
            <Input id="mem-title" {...form.register("title")} aria-invalid={!!errors.title} aria-describedby={errors.title ? "mem-title-err" : undefined} />
            {errors.title && (
              <p id="mem-title-err" className="text-xs text-destructive">
                {errors.title.message}
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="mem-kind">Type</Label>
              <Controller
                control={form.control}
                name="kind"
                render={({ field }) => <Select id="mem-kind" value={field.value} onValueChange={field.onChange} options={KINDS.map((k) => ({ value: k as Values["kind"], label: KIND_LABEL[k] }))} />}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mem-tags">Tags</Label>
              <Input id="mem-tags" placeholder="research, family" {...form.register("tags")} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mem-body">Content</Label>
            <Textarea id="mem-body" rows={8} className="font-serif text-[15px]" {...form.register("body")} aria-invalid={!!errors.body} aria-describedby={errors.body ? "mem-body-err" : undefined} />
            {errors.body && (
              <p id="mem-body-err" className="text-xs text-destructive">
                {errors.body.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : memory ? "Save changes" : "Save memory"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
