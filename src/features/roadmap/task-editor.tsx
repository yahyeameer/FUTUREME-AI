"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useWorkspace } from "@/lib/workspace-store";
import type { Task, TaskStatus } from "@/types";
import { STATUS_META } from "./task-status";

export function TaskEditor({ task, initialStatus, open, onOpenChange }: { task: Task; initialStatus?: TaskStatus; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { run, workspace } = useWorkspace();
  const [title, setTitle] = React.useState(task.title);
  const [notes, setNotes] = React.useState(task.notes ?? "");
  const [due, setDue] = React.useState(task.dueDate ?? "");
  const [status, setStatus] = React.useState<TaskStatus>(initialStatus ?? task.status);
  const [reason, setReason] = React.useState(task.blockedReason ?? "");
  const [saving, setSaving] = React.useState(false);
  const titleInvalid = !title.trim();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (titleInvalid) return;
    setSaving(true);
    const ok = await run(
      (s) => s.updateTask(task.id, { title, notes, dueDate: due || null, status, blockedReason: status === "blocked" ? reason.trim() || undefined : undefined }),
      "Task updated",
    );
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Edit task</DialogTitle>
            <DialogDescription>Changes are saved to your roadmap.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={titleInvalid} maxLength={200} />
            {titleInvalid && <p className="text-xs text-destructive">A task needs a title.</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="task-status">Status</Label>
              <Select id="task-status" value={status} onValueChange={setStatus} options={workspace.capabilities.taskStatuses.map((s) => ({ value: s, label: STATUS_META[s].label }))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="task-due">Due date</Label>
              <Input id="task-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
          {status === "blocked" && (
            <div className="grid gap-1.5">
              <Label htmlFor="task-reason">What&apos;s blocking it?</Label>
              <Input id="task-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Waiting for a reply" />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="task-notes">Notes</Label>
            <Textarea id="task-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving || titleInvalid}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
