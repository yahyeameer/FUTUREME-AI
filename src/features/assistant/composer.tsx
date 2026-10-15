"use client";

import { ArrowUp, Square } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

/** Floating glass composer. Enter sends, Shift+Enter adds a line. */
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
}: {
  onSend: (text: string) => void;
  onStop?: () => void;
  busy: boolean;
  disabled?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

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
    onSend(text);
  };

  return (
    <form
      className={cn("glass rounded-2xl p-2 transition-shadow focus-within:shadow-[var(--shadow-lift)]", className)}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
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
