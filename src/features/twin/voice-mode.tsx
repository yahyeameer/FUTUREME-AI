"use client";

import { AnimatePresence, motion } from "motion/react";
import { Loader2, Mic, Square, Volume2, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { LivingMark } from "@/components/brand/living-mark";
import { Wordmark } from "@/components/brand/mark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TwinState } from "@/app/api/twin/state";
import { type Recording, recordingFile, useRecorder } from "./use-recorder";

type Phase = "idle" | "listening" | "thinking" | "speaking";
type Turn = { role: "user" | "assistant"; content: string };

/** How long to wait for a spoken reply before giving up: Nemotron thinks first, then ElevenLabs speaks. */
const REPLY_TIMEOUT_MS = 150_000;

/**
 * Sends one recording and returns the reply with a playable URL. Every failure, including a timeout, a server that is
 * restarting, or a garbled response, comes back as a readable error rather than breaking the page.
 */
export async function sendVoiceTurn(recording: Recording, history: Turn[]) {
  const form = new FormData();
  form.append("audio", recordingFile(recording, "speech"));
  form.append(
    "history",
    JSON.stringify(history.map(({ role, content }) => ({ role, content }))),
  );
  let res: Response;
  try {
    res = await fetch("/api/twin/voice-chat", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(REPLY_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(
      err instanceof DOMException && err.name === "TimeoutError"
        ? "Your future self took too long to answer. Try a shorter question."
        : "Couldn't reach TOMORA. Check your connection and try again.",
    );
  }
  const out = (await res.json().catch(() => ({}))) as {
    error?: string;
    heard?: string;
    reply?: string;
    audio?: string;
    type?: string;
  };
  if (!res.ok || !out.reply || !out.audio)
    throw new Error(
      out.error ??
        (res.status >= 500
          ? "TOMORA had a problem answering. Try again in a moment."
          : "That didn't work. Try again."),
    );
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = Uint8Array.from(atob(out.audio), (c) => c.charCodeAt(0));
  } catch {
    throw new Error("The spoken reply arrived damaged. Try again.");
  }
  const url = URL.createObjectURL(
    new Blob([bytes], { type: out.type ?? "audio/mpeg" }),
  );
  return { heard: out.heard ?? "", reply: out.reply, url };
}

const STATUS: Record<Phase, string> = {
  idle: "Tap to talk",
  listening: "Listening… tap when you're done",
  thinking: "Thinking it through…",
  speaking: "Speaking in your voice · tap to interrupt",
};

/**
 * Voice mode: a full-screen conversation with your future self, in your own cloned voice. The living mark is the face of
 * it: it spins while Nemotron thinks, pulses while you speak, and glows while your voice answers. Opens from the chat
 * window or the Voice Twin page. Without a cloned voice it sends you to the Voice Twin page to make one.
 */
function VoiceScreen({ onClose }: { onClose: () => void }) {
  const rec = useRecorder();
  const [twin, setTwin] = React.useState<TwinState | null>(null);
  const [loadError, setLoadError] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [lastAudio, setLastAudio] = React.useState<string | null>(null);
  const player = React.useRef<HTMLAudioElement | null>(null);
  const log = React.useRef<HTMLDivElement>(null);

  // This screen mounts fresh each time voice mode opens, so it always starts from a clean state.
  React.useEffect(() => {
    fetch("/api/twin", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<TwinState>) : Promise.reject()))
      .then(setTwin)
      .catch(() => setLoadError(true));
  }, []);

  const stopSound = React.useCallback(() => {
    player.current?.pause();
    player.current = null;
  }, []);

  const { stop: stopRecording } = rec;
  const close = () => {
    stopSound();
    stopRecording();
    setPhase("idle");
    onClose();
  };
  // The effect below must run only when voice mode opens and closes: re-running it (it used to, on every render) paused
  // the reply while it was being spoken. An effect event always sees the latest `close` without re-running it.
  const onEscape = React.useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  });

  React.useEffect(() => {
    window.addEventListener("keydown", onEscape);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onEscape);
      document.body.style.overflow = "";
      stopSound();
    };
  }, [stopSound]);

  React.useEffect(
    () =>
      log.current?.scrollTo({
        top: log.current.scrollHeight,
        behavior: "smooth",
      }),
    [turns, phase],
  );

  const clone = twin?.voice.active;
  const ready = clone?.status === "ready" && clone.provider === "elevenlabs";
  const hasKey = !!twin?.voice.preset.available;

  const speak = (url: string) => {
    stopSound();
    const audio = new Audio(url);
    player.current = audio;
    audio.onended = () => setPhase("idle");
    audio.onerror = () => {
      setPhase("idle");
      toast.error("This reply couldn't be played. Try again.");
    };
    setPhase("speaking");
    void audio.play().catch((err: unknown) => {
      // Pausing (to interrupt, or to close) also rejects play(); only a real refusal needs a message.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setPhase("idle");
      toast.error(
        "Your browser blocked the sound. Tap the speaker to hear it.",
      );
    });
  };

  const talk = async () => {
    if (phase === "speaking") stopSound();
    let recording;
    setPhase("listening");
    try {
      recording = await rec.start();
    } catch (err) {
      setPhase("idle");
      toast.error(
        err instanceof Error ? err.message : "Couldn't use the microphone.",
      );
      return;
    }
    if (recording.seconds < 1) {
      setPhase("idle");
      toast.message("That was very short. Tap, speak, then tap again.");
      return;
    }
    setPhase("thinking");
    try {
      const out = await sendVoiceTurn(recording, turns);
      setTurns((t) => [
        ...t,
        { role: "user", content: String(out.heard ?? "") },
        { role: "assistant", content: String(out.reply) },
      ]);
      setLastAudio((old) => {
        if (old) URL.revokeObjectURL(old);
        return out.url;
      });
      speak(out.url);
    } catch (err) {
      setPhase("idle");
      toast.error(
        err instanceof Error ? err.message : "That didn't work. Try again.",
      );
    }
  };

  const onMic = () => {
    if (phase === "listening") rec.stop();
    else if (phase !== "thinking") void talk();
  };

  return (
    <motion.div
      key="voice-mode"
      role="dialog"
      aria-modal="true"
      aria-label="Voice mode"
      data-theme="dark"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[120] flex flex-col overflow-hidden bg-[#07080B] text-[#F3F0E8]"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-25%] left-[-15%] size-[46rem] animate-[aurora_24s_ease-in-out_infinite] rounded-full bg-[radial-gradient(closest-side,rgb(200_146_95/0.22),transparent)] blur-3xl" />
        <div className="absolute right-[-20%] bottom-[-30%] size-[50rem] animate-[aurora_30s_ease-in-out_infinite_reverse] rounded-full bg-[radial-gradient(closest-side,rgb(200_183_143/0.2),transparent)] blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgb(0_0_0/0.55))]" />
      </div>

      <header className="relative flex items-center justify-between px-5 py-4 sm:px-8">
        <Wordmark withSymbol className="text-[#F3F0E8]" />
        <Button
          variant="ghost"
          size="icon"
          onClick={close}
          aria-label="Close voice mode"
          className="text-[#F3F0E8] hover:bg-white/10"
        >
          <X />
        </Button>
      </header>

      {!twin && !loadError && (
        <div className="relative flex flex-1 items-center justify-center">
          <Loader2
            className="size-6 animate-spin text-[#C8B78F]"
            aria-label="Loading"
          />
        </div>
      )}

      {(loadError || (twin && !ready)) && (
        <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="w-40">
            <LivingMark progress={0.3} />
          </div>
          <h2 className="mt-6 font-display text-3xl">
            {loadError ? "Couldn't reach TOMORA" : "Make your voice first"}
          </h2>
          <p className="mt-3 text-[14px] text-[#F3F0E8]/65">
            {loadError
              ? "Check your connection and try again."
              : hasKey
                ? "Voice mode speaks in your own cloned voice. Record the consent phrase on the Voice Twin page, and it's ready in a minute."
                : "Voice mode needs an ElevenLabs key and your cloned voice. Both are set up on the Voice Twin page."}
          </p>
          {!loadError && (
            <Button
              asChild
              size="lg"
              className="mt-6 border-0 bg-[#C8B78F] text-[#14120D] hover:bg-[#D6C79F]"
            >
              <Link href="/twin" onClick={close}>
                Go to Voice Twin
              </Link>
            </Button>
          )}
        </div>
      )}

      {twin && ready && (
        <>
          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-4">
            <div className="relative grid w-[min(30rem,70vw,50vh)] place-items-center">
              {phase === "listening" &&
                [0, 1, 2].map((i) => (
                  <span
                    key={i}
                    aria-hidden
                    className="absolute inset-[18%] animate-[sonar_2.4s_ease-out_infinite] rounded-full border border-[#C8B78F]/55"
                    style={{ animationDelay: `${i * 0.8}s` }}
                  />
                ))}
              {phase === "speaking" && (
                <span
                  aria-hidden
                  className="absolute inset-[8%] animate-[breathe_1.6s_ease-in-out_infinite] rounded-full bg-[radial-gradient(closest-side,rgb(200_183_143/0.35),transparent)]"
                />
              )}
              <LivingMark
                progress={phase === "idle" ? 0.35 : 0.6}
                busy={phase === "thinking" || phase === "listening"}
                label={STATUS[phase]}
              />
            </div>
            <p
              role="status"
              aria-live="polite"
              className="mt-4 text-center font-display text-[1.35rem] text-[#E9DFC6]"
            >
              {STATUS[phase]}
            </p>
          </div>

          <div
            ref={log}
            className="relative mx-auto max-h-[26vh] w-full max-w-2xl space-y-3 overflow-y-auto px-6 pb-2 text-center"
          >
            {turns.slice(-2).map((t, i) => (
              <p
                key={`${turns.length}-${i}`}
                className={cn(
                  "text-[14.5px] leading-relaxed",
                  t.role === "user"
                    ? "text-[#F3F0E8]/45 italic"
                    : "text-[#F3F0E8]/90",
                )}
              >
                {t.role === "user" ? `“${t.content}”` : t.content}
              </p>
            ))}
          </div>

          <footer className="relative flex flex-col items-center gap-3 px-6 pt-3 pb-8">
            <button
              type="button"
              onClick={onMic}
              disabled={phase === "thinking" || twin.twin.paused}
              aria-label={
                phase === "listening" ? "Stop and send" : "Start talking"
              }
              className={cn(
                "grid size-20 place-items-center rounded-full border transition-[transform,box-shadow,background-color] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[#C8B78F] active:scale-95 disabled:opacity-50",
                phase === "listening"
                  ? "border-[#C8B78F] bg-[#C8B78F] text-[#14120D] shadow-[0_0_44px_-4px_#C8B78F]"
                  : "border-white/20 bg-white/10 text-[#F3F0E8] hover:bg-white/15",
              )}
            >
              {phase === "thinking" ? (
                <Loader2 className="size-7 animate-spin" />
              ) : phase === "listening" ? (
                <Square className="size-6 fill-current" />
              ) : (
                <Mic className="size-7" />
              )}
            </button>
            {lastAudio && phase === "idle" && (
              <button
                type="button"
                onClick={() => speak(lastAudio)}
                className="inline-flex items-center gap-1.5 text-[12.5px] text-[#F3F0E8]/60 hover:text-[#F3F0E8]"
              >
                <Volume2 className="size-3.5" /> Hear the last answer again
              </button>
            )}
            {twin.twin.paused && (
              <p className="text-[12.5px] text-[#E9DFC6]">
                The twin is paused. Resume it on the Voice Twin page.
              </p>
            )}
          </footer>
        </>
      )}
    </motion.div>
  );
}

/**
 * Keeps a failure inside voice mode from replacing the whole page with Next's "This page couldn't load" screen: voice
 * mode shows what went wrong and lets you start it again or close it, and the page underneath keeps working.
 */
export class VoiceBoundary extends React.Component<
  { onClose: () => void; children: React.ReactNode },
  { error: Error | null; attempt: number }
> {
  state = { error: null as Error | null, attempt: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Voice mode failed:", error);
  }

  render() {
    const { error, attempt } = this.state;
    if (!error)
      return (
        <React.Fragment key={attempt}>{this.props.children}</React.Fragment>
      );
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Voice mode"
        className="fixed inset-0 z-[120] flex flex-col items-center justify-center gap-4 bg-[#07080B] px-6 text-center text-[#F3F0E8]"
      >
        <h2 className="font-display text-3xl">Voice mode hit a snag</h2>
        <p className="max-w-md text-[14px] text-[#F3F0E8]/65">
          Your chat is safe. Start voice mode again, or close it and carry on
          typing.
        </p>
        <p className="max-w-md font-mono text-[11px] break-words text-[#F3F0E8]/35">
          {error.message}
        </p>
        <div className="mt-2 flex gap-3">
          <Button
            size="lg"
            className="border-0 bg-[#C8B78F] text-[#14120D] hover:bg-[#D6C79F]"
            onClick={() => this.setState({ error: null, attempt: attempt + 1 })}
          >
            Start again
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="text-[#F3F0E8] hover:bg-white/10"
            onClick={() => {
              document.body.style.overflow = "";
              this.setState({ error: null, attempt: attempt + 1 });
              this.props.onClose();
            }}
          >
            Close
          </Button>
        </div>
      </div>
    );
  }
}

const subscribe = () => () => undefined;

/** Opens voice mode over the whole page. Rendered in a portal, and only on the client. */
export function VoiceMode({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const client = React.useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (!client) return null;
  return createPortal(
    <VoiceBoundary onClose={onClose}>
      <AnimatePresence>
        {open && <VoiceScreen key="screen" onClose={onClose} />}
      </AnimatePresence>
    </VoiceBoundary>,
    document.body,
  );
}
