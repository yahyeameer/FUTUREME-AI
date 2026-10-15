"use client";

import { useState, useTransition } from "react";
import { generateDailyAction } from "@/app/actions";
import { primaryButton } from "@/components/ui";

export function PrintButton({ hasIssue }: { hasIssue: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="space-y-2">
      <button className={primaryButton} disabled={pending} onClick={() => start(async () => setError((await generateDailyAction()).error))}>
        {pending ? "Going to press…" : hasIssue ? "Reprint today's issue" : "Print today's issue"}
      </button>
      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}
