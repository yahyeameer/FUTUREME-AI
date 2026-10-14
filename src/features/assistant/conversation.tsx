"use client";

import { ArrowDown } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Presence } from "@/components/brand/presence";
import { PageFrame } from "@/components/layout/page-frame";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Tooltip } from "@/components/ui/tooltip";
import { activeMilestone, blockedTasks, convergence, nextStep } from "@/lib/derive";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";
import type { CoachingStyle } from "@/types";
import { Composer } from "./composer";
import { FutureSelfContext } from "./context-rail";
import { AssistantMessage, PendingReply, UserMessage } from "./message";
import { TONES } from "./tone";

const OPENING = "I'm here to help you connect where you are today with where you want to go. What's weighing on your mind?";

export function Conversation() {
  const { workspace, pending, send, stop, retry, run } = useWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const [text, setText] = React.useState("");
  const endRef = React.useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = React.useState(true);
  const style: CoachingStyle = workspace.profile?.style ?? "reflective";
  const name = workspace.profile ? `Future ${workspace.profile.name}` : "Future you";
  const messages = workspace.conversation;
  const prompts = usePrompts();

  // A prompt handed over from another screen (Daily, Skills, Home) lands in the composer for review, not auto-sent.
  React.useEffect(() => {
    const p = params.get("prompt");
    if (p) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setText(p);
      router.replace("/future-self", { scroll: false });
    }
  }, [params, router]);

  React.useEffect(() => {
    const onScroll = () => setPinned(window.innerHeight + window.scrollY >= document.body.scrollHeight - 160);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    if (pinned) window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [messages.length, pending?.draft, pending?.tools.length, pinned]);

  const submit = (t: string) => {
    setText("");
    setPinned(true);
    void send(t, style);
  };

  const toolbar = (
    <>
      <span className="truncate font-display text-[16px] italic">{name}</span>
      <span className="hidden t-meta sm:inline">· {workspace.profile?.horizonYear}</span>
      <div className="ml-auto flex items-center gap-2">
        <Tooltip content={TONES.find((t) => t.value === style)?.hint}>
          <span className="hidden t-label md:inline">Tone</span>
        </Tooltip>
        <Select
          aria-label="Conversation tone"
          value={style}
          onValueChange={(v) => run((s) => s.setStyle(v))}
          options={TONES.map((t) => ({ value: t.value, label: t.label }))}
          className="h-7 w-[8.5rem] text-xs"
        />
      </div>
    </>
  );

  return (
    <PageFrame rail={<FutureSelfContext />} railTitle="Context" toolbar={toolbar} className="pb-0 sm:pb-0">
      <div className="flex flex-1 flex-col">
        <section className={cn("flex flex-col items-center text-center", messages.length ? "pt-0 pb-8" : "pt-6 pb-10")}>
          <Presence convergence={convergence(workspace.tasks)} state={pending && !pending.error ? "thinking" : "idle"} size={messages.length ? 104 : 148} className="text-foreground" />
          <p className={cn("mt-5 max-w-md font-display leading-snug text-balance italic", messages.length ? "text-[19px]" : "text-[22px] sm:text-[24px]")}>{OPENING}</p>
          <p className="mt-3 max-w-sm text-[12px] text-subtle">
            FutureMe speaks as one possible future you, based on what you&apos;ve shared. It remembers what&apos;s in your vault and asks before changing anything.
          </p>
        </section>

        <div className="flex flex-col gap-7" role="log" aria-label="Conversation" aria-live="off">
          {messages.map((m) => (m.role === "user" ? <UserMessage key={m.id} message={m} /> : <AssistantMessage key={m.id} message={m} name={name} />))}
          {pending && <PendingReply tools={pending.tools} draft={pending.draft} error={pending.error} onRetry={retry} name={name} />}
        </div>
        <div ref={endRef} className="h-4" />

        <div className="sticky bottom-0 mt-auto bg-gradient-to-t from-background from-60% to-transparent pt-8 pb-4 sm:pb-6">
          <div className="relative">
            {!pinned && (
              <Button size="sm" variant="secondary" className="absolute -top-10 left-1/2 -translate-x-1/2 shadow-float" onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" })}>
                <ArrowDown /> Latest
              </Button>
            )}
            {!text && !pending && prompts.length > 0 && (
              <div className={cn("mb-2 flex gap-1.5 overflow-x-auto scrollbar-none", messages.length === 0 && "flex-wrap justify-center")}>
                {prompts.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => (p.send ? submit(p.text) : setText(p.text))}
                    className="shrink-0 rounded-md border border-border bg-surface/80 px-2.5 py-1.5 text-left text-[12px] text-muted-foreground backdrop-blur transition-colors hover:border-border-strong hover:text-foreground"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            <Composer value={text} onChange={setText} onSend={submit} onStop={stop} busy={!!pending && !pending.error} autoFocus />
          </div>
        </div>
      </div>
    </PageFrame>
  );
}

/** Suggested openers built from the actual roadmap, so none of them reference something that isn't there. */
function usePrompts() {
  const { workspace } = useWorkspace();
  const active = activeMilestone(workspace);
  const next = nextStep(workspace);
  const blocked = blockedTasks(workspace.tasks)[0];
  const out: { label: string; text: string; send: boolean }[] = [];
  if (next) out.push({ label: `Help me start “${trim(next.title)}”`, text: `Help me plan how to start: ${next.title}`, send: true });
  if (blocked) out.push({ label: `I'm stuck on “${trim(blocked.title)}”`, text: `I'm stuck on "${blocked.title}". Why do I keep avoiding it?`, send: true });
  if (active) out.push({ label: "How am I doing this week?", text: "How am I doing this week? Review my progress.", send: true });
  if (!active) out.push({ label: "Break my dream into a first goal", text: "Help me plan a first goal toward my dream, in small steps.", send: true });
  out.push({ label: "Remember something", text: "Remember that ", send: false });
  return out;
}

function trim(s: string, n = 34) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
