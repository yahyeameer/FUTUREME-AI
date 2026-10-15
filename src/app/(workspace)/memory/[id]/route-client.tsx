"use client";

import { use } from "react";
import { MemoryDetail } from "@/features/memory/memory-detail";

export function MemoryDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <MemoryDetail id={decodeURIComponent(id)} />;
}
