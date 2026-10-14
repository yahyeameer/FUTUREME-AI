"use client";

import { useState, useTransition } from "react";
import { generateStoryAction } from "@/app/actions";
import { primaryButton } from "@/components/ui";

export function StoryButton({ hasStory }: { hasStory: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="space-y-2">
      <button
        className={primaryButton}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError((await generateStoryAction()).error);
          })
        }
      >
        {pending ? "Your future self is writing…" : hasStory ? "Write a new letter" : "Read a letter from my future self"}
      </button>
      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}
