import { CircleDashed, CircleDot, CircleSlash, CircleCheck } from "lucide-react";
import type { TaskStatus } from "@/types";

export const STATUS_META: Record<TaskStatus, { label: string; icon: typeof CircleDot; className: string }> = {
  todo: { label: "To do", icon: CircleDashed, className: "text-subtle" },
  in_progress: { label: "In progress", icon: CircleDot, className: "text-accent-ink" },
  blocked: { label: "Blocked", icon: CircleSlash, className: "text-warning" },
  done: { label: "Done", icon: CircleCheck, className: "text-success" },
};
