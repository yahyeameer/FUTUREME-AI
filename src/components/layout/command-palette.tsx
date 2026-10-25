"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { FilePlus2, Library, MessageCircle, Moon, Newspaper, Route, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { usePreferences } from "@/lib/preferences";
import { useWorkspaceContext } from "@/lib/workspace-store";
import { NAV, SECONDARY_NAV } from "./nav";

const PaletteCtx = React.createContext<{ open: () => void }>({ open: () => undefined });
export const useCommandPalette = () => React.useContext(PaletteCtx);

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const { workspace } = useWorkspaceContext();
  const { resolvedTheme, set } = usePreferences();

  React.useEffect(() => {
    let leader = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // "g" then a letter jumps between sections, as in Linear.
      if (e.key === "g") {
        leader = Date.now();
        return;
      }
      if (Date.now() - leader < 900) {
        const hit = NAV.find((n) => n.shortcut.endsWith(e.key.toUpperCase()));
        if (hit) {
          e.preventDefault();
          router.push(hit.href);
        }
        leader = 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const memories = (workspace?.memories ?? []).filter((m) => !m.archived).slice(0, 40);
  const milestones = workspace?.milestones ?? [];

  return (
    <PaletteCtx.Provider value={{ open: () => setOpen(true) }}>
      {children}
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="glass fixed top-[12dvh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2"
          >
            <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
            <Command loop>
              <CommandInput placeholder="Go to, search memories, or run an action…" />
              <CommandList>
                <CommandEmpty>No matches.</CommandEmpty>
                <CommandGroup heading="Actions">
                  <CommandItem onSelect={() => go("/future-self")}>
                    <MessageCircle /> Talk to your future self
                  </CommandItem>
                  <CommandItem onSelect={() => go("/memory?new=1")}>
                    <FilePlus2 /> Add a memory
                  </CommandItem>
                  <CommandItem onSelect={() => go("/daily")}>
                    <Newspaper /> Open TOMORA Daily
                  </CommandItem>
                  <CommandItem
                    onSelect={() => {
                      set("theme", resolvedTheme === "dark" ? "light" : "dark");
                      setOpen(false);
                    }}
                  >
                    {resolvedTheme === "dark" ? <Sun /> : <Moon />} Switch to {resolvedTheme === "dark" ? "light" : "dark"} theme
                  </CommandItem>
                </CommandGroup>
                <CommandGroup heading="Go to">
                  {[...NAV, ...SECONDARY_NAV].map((n) => (
                    <CommandItem key={n.href} onSelect={() => go(n.href)}>
                      <n.icon /> {n.label}
                      {"shortcut" in n && <span className="ml-auto t-meta">{n.shortcut}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
                {milestones.length > 0 && (
                  <CommandGroup heading="Milestones">
                    {milestones.map((m) => (
                      <CommandItem key={m.id} value={`milestone ${m.title}`} onSelect={() => go(`/roadmap?milestone=${encodeURIComponent(m.id)}`)}>
                        <Route /> {m.title}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {memories.length > 0 && (
                  <CommandGroup heading="Memories">
                    {memories.map((m) => (
                      <CommandItem key={m.id} value={`memory ${m.title} ${m.tags.join(" ")}`} onSelect={() => go(`/memory/${encodeURIComponent(m.id)}`)}>
                        <Library /> <span className="truncate">{m.title}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
              <div className="flex items-center justify-end gap-3 border-t border-glass-border px-3 py-2 t-meta">
                <span className="flex items-center gap-1">
                  <Kbd>↵</Kbd> select
                </span>
                <span className="flex items-center gap-1">
                  <Kbd>esc</Kbd> close
                </span>
              </div>
            </Command>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </PaletteCtx.Provider>
  );
}
