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
import { recordingFile, useRecorder } from "./use-recorder";

type Phase = "idle" | "listening" | "thinking" | "speaking";
type Turn = { role: "user" | "assistant"; content: string };

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

  const close = React.useCallback(() => {
    stopSound();
    rec.stop();
    setPhase("idle");
    onClose();
  }, [onClose, rec, stopSound]);

  React.useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = "";
      player.current?.pause();
    };
  }, [close]);

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
    setPhase("speaking");
    void audio.play().catch(() => {
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
      const form = new FormData();
      form.append("audio", recordingFile(recording, "speech"));
      form.append("history", JSON.stringify(turns));
      const res = await fetch("/api/twin/voice-chat", {
        method: "POST",
        body: form,
      });
      const out = (await res.json().catch(() => ({}))) as {
        error?: string;
        heard?: string;
        reply?: string;
        audio?: string;
        type?: string;
      };
      if (!res.ok || !out.reply || !out.audio)
        throw new Error(out.error ?? "That didn't work. Try again.");
      const url = URL.createObjectURL(
        new Blob([Uint8Array.from(atob(out.audio), (c) => c.charCodeAt(0))], {
          type: out.type ?? "audio/mpeg",
        }),
      );
      setTurns((t) => [
        ...t,
        { role: "user", content: out.heard ?? "" },
        { role: "assistant", content: out.reply! },
      ]);
      setLastAudio(url);
      speak(url);
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
    <AnimatePresence>
      {open && <VoiceScreen key="screen" onClose={onClose} />}
    </AnimatePresence>,
    document.body,
  );
}
