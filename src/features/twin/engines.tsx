"use client";

import { Check, ExternalLink, KeyRound, Loader2, Play, Save, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { SectionHeading } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { TwinState } from "@/app/api/twin/state";
import { post, type Act } from "./api";

// Voice engines: the user adds a key for ElevenLabs, OpenRouter, Qwen or a self-hosted model, tests it (it speaks a
// line), and picks which one clones and speaks their voice. A saved key never comes back to the page, only its last
// four characters.

type Engine = TwinState["voice"]["engines"]["engines"][number];
type Field = "model" | "voice" | "baseUrl";

const FIELD_LABEL: Record<Field, string> = { model: "Model", voice: "Voice", baseUrl: "Base URL" };

export function EngineSection({ state, act }: { state: TwinState; act: Act }) {
  const { chosen, engines } = state.voice.engines;
  const [open, setOpen] = React.useState(chosen);
  const holder = state.voice.active?.provider ?? null;
  const engine = engines.find((e) => e.id === open) ?? engines[0];

  return (
    <section aria-labelledby="engine-h" id="voice-engine" className="scroll-mt-24">
      <SectionHeading id="engine-h">Voice engine</SectionHeading>
      <p className="-mt-1 mb-3 max-w-2xl text-[12.5px] text-muted-foreground">
        Pick who clones and speaks your voice. Keys are encrypted on this server and never shown again. Phone and browser calls run on ElevenLabs.
      </p>
      <div role="radiogroup" aria-label="Voice engines" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {engines.map((e) => (
          <button
            key={e.id}
            type="button"
            role="radio"
            aria-checked={open === e.id}
            onClick={() => setOpen(e.id)}
            className={cn(
              "card flex min-w-0 flex-col items-start gap-1.5 p-3.5 text-left transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-ring",
              open === e.id ? "ring-2 ring-accent/60" : "hover:shadow-[var(--shadow-lift)]",
            )}
          >
            <span className="flex w-full items-center gap-2">
              <span className="text-[13.5px] font-medium">{e.label}</span>
              {chosen === e.id && e.ready && <Badge tone="accent">In use</Badge>}
            </span>
            <span className="text-[12px] text-muted-foreground">{e.blurb}</span>
            <span className="mt-auto flex flex-wrap gap-1 pt-1">
              {e.clones && <Badge tone="neutral">Clones your voice</Badge>}
              {e.calls && <Badge tone="neutral">Calls</Badge>}
              <KeyBadge engine={e} />
            </span>
          </button>
        ))}
      </div>
      <EngineForm key={engine.id} engine={engine} chosen={chosen === engine.id} holder={holder} act={act} />
    </section>
  );
}

function KeyBadge({ engine: e }: { engine: Engine }) {
  if (e.keyLost) return <Badge tone="warning">Key unreadable</Badge>;
  if (e.keySource === "env") return <Badge tone="success">Key on server</Badge>;
  if (e.keySource === "app") return <Badge tone="success">Key …{e.keyHint}</Badge>;
  if (!e.keyRequired && e.ready) return <Badge tone="success">Set up</Badge>;
  return <Badge tone="neutral">No key</Badge>;
}

function EngineForm({ engine: e, chosen, holder, act }: { engine: Engine; chosen: boolean; holder: string | null; act: Act }) {
  const [key, setKey] = React.useState("");
  const [values, setValues] = React.useState<Record<Field, string>>({ model: e.model, voice: e.voice, baseUrl: e.baseUrl });
  const [testing, setTesting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [sample, setSample] = React.useState<{ url: string; own: boolean } | null>(null);
  const id = (f: string) => `engine-${e.id}-${f}`;
  const body = () => ({ engine: e.id, key: key.trim() || undefined, ...Object.fromEntries(e.fields.map((f) => [f, values[f]])) });
  const locked = holder !== null && holder !== e.id;

  const test = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/twin/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body()) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "The test didn't work.");
      if (sample) URL.revokeObjectURL(sample.url);
      setSample({ url: URL.createObjectURL(await res.blob()), own: res.headers.get("X-Own-Voice") === "1" });
      toast.success(`${e.label} works.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The test didn't work.");
    } finally {
      setTesting(false);
    }
  };

  const save = async (andUse: boolean) => {
    setSaving(true);
    const saved = await act(() => post({ action: "saveEngine", ...body() }), andUse ? undefined : `${e.label} saved.`);
    if (saved && andUse) await act(() => post({ action: "chooseEngine", engine: e.id }), `Your voice will use ${e.label}.`);
    if (saved) setKey("");
    setSaving(false);
  };

  return (
    <div className="card mt-3 space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[14px] font-medium">{e.label}</h3>
        {e.keyUrl && (
          <a href={e.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-accent-ink underline underline-offset-2">
            Get a key <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
      </div>
      {e.keyLost && <p className="rounded-lg border border-warning/30 bg-warning-wash px-3 py-2 text-[12.5px]">The saved key can&apos;t be read because the server&apos;s secret changed. Paste it again.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={id("key")}>API key{e.keyRequired ? "" : " (if your server needs one)"}</Label>
          <Input
            id={id("key")}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(ev) => setKey(ev.target.value)}
            disabled={e.keySource === "env"}
            placeholder={e.keySource === "env" ? `Set on the server (${e.env})` : e.keyHint ? `Saved, ends in ${e.keyHint}. Paste to replace.` : "Paste your key"}
          />
        </div>
        {e.fields.map((f) => (
          <div key={f} className={cn("space-y-1.5", f === "baseUrl" && "sm:col-span-2")}>
            <Label htmlFor={id(f)}>{FIELD_LABEL[f]}</Label>
            <Input id={id(f)} value={values[f]} onChange={(ev) => setValues((v) => ({ ...v, [f]: ev.target.value }))} spellCheck={false} placeholder={e.defaults[f] || undefined} />
            {e.hints[f] && <p className="text-[12px] text-subtle">{e.hints[f]}</p>}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={test} disabled={testing || saving}>
          {testing ? <Loader2 className="animate-spin" /> : <Play />} Test
        </Button>
        <Button variant="secondary" onClick={() => save(false)} disabled={testing || saving}>
          <Save /> Save
        </Button>
        {!chosen && (
          <Button variant="primary" onClick={() => save(true)} disabled={testing || saving || locked}>
            <Check /> Save and use for my voice
          </Button>
        )}
        {e.keySource === "app" && (
          <Button variant="ghost" onClick={() => act(() => post({ action: "forgetEngineKey", engine: e.id }), "Key removed.")} disabled={saving}>
            <Trash2 /> Remove key
          </Button>
        )}
      </div>
      {locked && <p className="text-[12.5px] text-muted-foreground">Your voice is cloned with another engine. Delete your voice to clone it here instead.</p>}
      {!e.clones && <p className="text-[12.5px] text-muted-foreground">Self-hosted models speak with their own preset voices here; they can&apos;t clone yours.</p>}
      {e.id === "qwen" && <p className="text-[12.5px] text-muted-foreground">Qwen can&apos;t check your consent phrase, so an ElevenLabs or OpenRouter key is needed for that step too.</p>}
      {sample && (
        <div className="space-y-1">
          <audio controls autoPlay src={sample.url} className="h-9 w-full" />
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <KeyRound className="size-3" aria-hidden /> {sample.own ? "That was your cloned voice." : "That was a preset voice. Your own voice plays here once it's cloned with this engine."}
          </p>
        </div>
      )}
    </div>
  );
}
