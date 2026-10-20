import { cn } from "@/lib/utils";

/** A voice waveform drawn in bars that rise and fall like speech; it speaks up (faster, taller) while hovered or `live`. */
export function VoiceWave({ bars = 36, live = false, className }: { bars?: number; live?: boolean; className?: string }) {
  return (
    <span aria-hidden className={cn("group/wave flex h-12 items-center gap-[3px]", className)}>
      {Array.from({ length: bars }, (_, i) => {
        // A fixed, speech-like envelope: louder in the middle of the phrase, with some unevenness.
        const env = Math.sin((i / (bars - 1)) * Math.PI);
        const h = Math.round((0.25 + env * 0.75 * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7)))) * 100);
        return (
          <span
            key={i}
            className={cn(
              "w-[3px] origin-center animate-[wave_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-t from-copper to-accent opacity-80 transition-opacity group-hover/wave:opacity-100 group-hover/wave:[animation-duration:0.7s]",
              live && "opacity-100 [animation-duration:0.7s]",
            )}
            style={{ height: `${h}%`, animationDelay: `${-((i * 0.13) % 1.4)}s` }}
          />
        );
      })}
    </span>
  );
}
