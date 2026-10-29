"use client";

import { AudioLines, Loader2, Mic, Play, Square } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TwinState } from "@/app/api/twin/state";
import { useRecorder } from "./use-recorder";
import { sendVoiceTurn, VoiceMode } from "./voice-mode";

type Turn = { role: "user" | "assistant"; content: string; audio?: string };

const play = (url: string) => {
  const audio = new Audio(url);
  void audio.play().catch((err: unknown) => {
    if (err instanceof DOMException && err.name === "AbortError") return;
    toast.error(
      "Your browser blocked the sound. Press the play button on the reply.",
    );
  });
  return audio;
};

/**
 * Talk to your future self in your own cloned voice. ElevenLabs won't run live call agents with an instant clone and
 * Nemotron, so this does it turn by turn: you speak, Nemotron writes the reply from your notes, and your clone says it.
 */
export function VoiceChat({ state }: { state: TwinState }) {
  return (
    <CardBoundary>
      <VoiceChatCard state={state} />
    </CardBoundary>
  );
}

/** If this card fails, it says so in place, and the rest of the Voice Twin page keeps working. */
class CardBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Voice chat failed:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <article className="rounded-2xl border border-border bg-surface p-5 shadow-card lg:col-span-2">
        <p className="t-label">Talk in your own voice</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Something went wrong here ({this.state.error.message}).
        </p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => this.setState({ error: null })}
        >
          Try again
        </Button>
      </article>
    );
  }
}

function VoiceChatCard({ state }: { state: TwinState }) {
  const rec = useRecorder();
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [speaking, setSpeaking] = React.useState(false);
  const [modeOpen, setModeOpen] = React.useState(false);
  const end = React.useRef<HTMLDivElement>(null);
  const clone = state.voice.active;
  const ready = clone?.status === "ready" && clone.provider === "elevenlabs";
  const paused = state.twin.paused;

  React.useEffect(
    () => end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    [turns, busy],
  );

  if (!ready) return null;

  const send = async () => {
    let recording;
    try {
      recording = await rec.start();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't use the microphone.",
      );
      return;
    }
    if (recording.seconds < 1) {
      toast.message(
        "That was very short. Press the button, speak, then press it again.",
      );
      return;
    }
    setBusy(true);
    try {
      const { heard, reply, url } = await sendVoiceTurn(recording, turns);
      setTurns((t) => [
        ...t,
        { role: "user", content: String(heard) },
        { role: "assistant", content: String(reply), audio: url },
      ]);
      setSpeaking(true);
      play(url).addEventListener("ended", () => setSpeaking(false));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "That didn't work. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const recording = rec.state === "recording";
  return (
    <article className="rounded-2xl border border-border bg-surface p-5 shadow-card lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="t-label">Talk in your own voice</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Nemotron thinks each answer through using your notes, and your
            cloned voice says it. Open voice mode for the full-screen version,
            or press Talk here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="lg"
            disabled={paused}
            onClick={() => setModeOpen(true)}
          >
            <AudioLines /> Open voice mode
          </Button>
          <Button
            variant={recording ? "destructive" : "primary"}
            size="lg"
            disabled={busy || paused}
            onClick={() => (recording ? rec.stop() : void send())}
            aria-label={recording ? "Stop and send" : "Start talking"}
          >
            {busy ? (
              <Loader2 className="animate-spin" />
            ) : recording ? (
              <Square />
            ) : (
              <Mic />
            )}
            {busy
              ? "Thinking…"
              : recording
                ? `Stop and send · ${rec.seconds}s`
                : "Talk"}
          </Button>
        </div>
        <VoiceMode open={modeOpen} onClose={() => setModeOpen(false)} />
      </div>
      {state.calls.callsUseReadyVoice && (
        <p className="mt-3 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-[12.5px] text-muted-foreground">
          Live calls (Call now) use a ready-made voice, because ElevenLabs
          doesn&apos;t allow an instant voice clone together with Nemotron on a
          live call. Here, your own voice is used.
        </p>
      )}
      {turns.length > 0 && (
        <ol
          className="mt-4 max-h-80 space-y-2.5 overflow-y-auto pr-1"
          aria-live="polite"
        >
          {turns.map((t, i) => (
            <li
              key={i}
              className={cn(
                "flex gap-2",
                t.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <p
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-[13.5px]",
                  t.role === "user"
                    ? "rounded-br-sm bg-accent text-[#14120D]"
                    : "rounded-bl-sm border border-border bg-background",
                )}
              >
                {t.content}
              </p>
              {t.audio && (
                <button
                  type="button"
                  aria-label="Play this reply again"
                  onClick={() => play(t.audio!)}
                  className="self-center rounded-full p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                >
                  <Play className="size-3.5" />
                </button>
              )}
            </li>
          ))}
          <div ref={end} />
        </ol>
      )}
      {speaking && (
        <p className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
          <AudioLines
            className="size-3.5 animate-pulse text-accent-ink"
            aria-hidden
          />{" "}
          Your future self is speaking…
        </p>
      )}
    </article>
  );
}
