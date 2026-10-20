"use client";

import { ArrowUp, ImagePlus, Square, X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

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
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = React.useState<string | null>(null);
  const [photoError, setPhotoError] = React.useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    setPhotoError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) return setPhotoError("That isn't a photo.");
    try {
      setPhoto(await toDataUrl(file));
    } catch {
      setPhotoError("Couldn't read that photo.");
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

  const submit = () => {
    const text = value.trim();
    if (!text || busy || disabled) return;
    onSend(text, photo ?? undefined);
    setPhoto(null);
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
        {allowPhotos && (
          <>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy || disabled} aria-label="Attach a photo" title="Attach a photo: Nemotron sees it">
              <ImagePlus />
            </Button>
          </>
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
          <Button type="submit" size="icon-sm" variant="primary" className="ml-auto" disabled={!value.trim() || disabled} aria-label="Send">
            <ArrowUp />
          </Button>
        )}
      </div>
    </form>
  );
}
