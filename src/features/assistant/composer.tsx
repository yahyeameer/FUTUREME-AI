"use client";

import { ArrowUp, AudioLines, Paperclip, Square, X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

/** Files that can be read as text and sent along with a message. */
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|yaml|yml|xml|html|css|log|js|jsx|ts|tsx|py|java|c|cpp|go|rs|rb|php|sh|sql|toml|ini|env\.example|rtf|tex)$/i;
const MAX_FILE_BYTES = 400_000;
const MAX_FILE_CHARS = 20_000;
const FILE_ACCEPT = ".txt,.md,.markdown,.csv,.tsv,.json,.jsonl,.yaml,.yml,.xml,.html,.css,.log,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.go,.rs,.rb,.php,.sh,.sql,.toml,.ini,.tex,text/*";

/** Shrinks a photo to at most 1280px on its long side and re-encodes it as JPEG, so it travels light. */
async function toDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** Floating glass composer. Enter sends, Shift+Enter adds a line. With allowPhotos, a photo can go with the message. */
export function Composer({
  onSend,
  onStop,
  busy,
  disabled,
  value,
  onChange,
  placeholder = "Tell your future self what's on your mind…",
  autoFocus,
  className,
  allowPhotos,
  onVoice,
}: {
  onSend: (text: string, image?: string) => void;
  onStop?: () => void;
  busy: boolean;
  disabled?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  allowPhotos?: boolean;
  /** Opens voice mode: talk with your future self in your own cloned voice. */
  onVoice?: () => void;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = React.useState<string | null>(null);
  const [file, setFile] = React.useState<{ name: string; text: string; cut: boolean } | null>(null);
  const [photoError, setPhotoError] = React.useState<string | null>(null);

  const pick = async (picked: File | undefined) => {
    setPhotoError(null);
    if (!picked) return;
    if (picked.type.startsWith("image/")) {
      if (!allowPhotos) return setPhotoError("This model can't look at photos right now. Attach a text file, or describe it.");
      try {
        setPhoto(await toDataUrl(picked));
      } catch {
        setPhotoError("Couldn't read that photo.");
      }
      return;
    }
    if (!picked.type.startsWith("text/") && !TEXT_EXT.test(picked.name)) {
      return setPhotoError("I can read photos and text files (txt, md, csv, json, code). For a PDF or Word file, paste the text you want me to see.");
    }
    if (picked.size > MAX_FILE_BYTES) return setPhotoError("That file is too big. Attach one under 400 KB, or paste the part that matters.");
    try {
      const text = await picked.text();
      setFile({ name: picked.name, text: text.slice(0, MAX_FILE_CHARS), cut: text.length > MAX_FILE_CHARS });
    } catch {
      setPhotoError("Couldn't read that file.");
    }
  };

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  React.useEffect(() => {
    if (autoFocus && window.matchMedia("(min-width: 768px)").matches) ref.current?.focus();
  }, [autoFocus]);

  const canSend = !!(value.trim() || photo || file);

  const submit = () => {
    if (!canSend || busy || disabled) return;
    let text = value.trim() || (file ? `Please read the attached file and tell me what matters in it, and what I should do.` : "What do you see in this photo, and what does it mean for my goals?");
    // The file travels inside the message, between markers the chat uses to show it as a tidy attachment.
    if (file) text += `\n\n⟦file:${file.name}⟧\n${file.text}${file.cut ? "\n…(the rest of the file was cut)" : ""}\n⟦/file⟧`;
    onSend(text, photo ?? undefined);
    setPhoto(null);
    setFile(null);
  };

  return (
    <form
      className={cn("glass focus-glow rounded-2xl p-2", className)}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {photo && (
        <div className="relative mx-2 mt-1 mb-1 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen photo */}
          <img src={photo} alt="Photo to send" className="h-20 rounded-lg border border-border object-cover" />
          <button type="button" onClick={() => setPhoto(null)} aria-label="Remove photo" className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background">
            <X className="size-3" />
          </button>
        </div>
      )}
      {file && (
        <div className="mx-2 mt-1 mb-1 inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-surface-2/70 py-1 pr-1 pl-2.5 text-[12.5px]">
          <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{file.name}</span>
          {file.cut && <span className="shrink-0 text-subtle">first {Math.round(MAX_FILE_CHARS / 1000)}k characters</span>}
          <button type="button" onClick={() => setFile(null)} aria-label="Remove file" className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-3 hover:text-foreground">
            <X className="size-3" />
          </button>
        </div>
      )}
      {photoError && <p className="px-2.5 text-[12px] text-destructive">{photoError}</p>}
      <label htmlFor="composer" className="sr-only">
        Message your future self
      </label>
      <textarea
        id="composer"
        ref={ref}
        rows={1}
        value={value}
        maxLength={4000}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        className="block max-h-[200px] w-full resize-none bg-transparent px-2.5 pt-2 pb-1 text-[14.5px] leading-relaxed outline-none placeholder:text-subtle disabled:opacity-50"
      />
      <div className="flex items-center gap-2 px-1 pt-1">
        <input ref={fileRef} type="file" accept={allowPhotos ? `image/*,${FILE_ACCEPT}` : FILE_ACCEPT} className="hidden" onChange={(e) => void pick(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
        <Button type="button" size="icon-sm" variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy || disabled} aria-label="Attach a photo or file" title={allowPhotos ? "Attach a photo or a text file: Nemotron reads it" : "Attach a text file: Nemotron reads it"}>
          <Paperclip />
        </Button>
        {onVoice && (
          <Button type="button" size="icon-sm" variant="ghost" onClick={onVoice} disabled={busy || disabled} aria-label="Talk with your voice" title="Voice mode: talk to your future self in your own cloned voice">
            <AudioLines />
          </Button>
        )}
        <p className="hidden items-center gap-1 t-meta sm:flex">
          <Kbd>↵</Kbd> send <span className="mx-1">·</span> <Kbd>⇧</Kbd>
          <Kbd>↵</Kbd> new line
        </p>
        {busy ? (
          <Button type="button" size="icon-sm" variant="secondary" className="ml-auto" onClick={onStop} aria-label="Stop">
            <Square className="!size-3 fill-current" />
          </Button>
        ) : (
          <Button type="submit" size="icon-sm" variant="primary" className="ml-auto" disabled={!canSend || disabled} aria-label="Send">
            <ArrowUp />
          </Button>
        )}
      </div>
    </form>
  );
}
