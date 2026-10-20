"use client";

import { ArrowLeftRight, AtSign, Check, FileArchive, KeyRound, Loader2, Lock, RefreshCw, ShieldCheck, Sparkles, Trash2, Unplug, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { PageFrame, RailSection } from "@/components/layout/page-frame";
import { PageHeader, SectionHeading } from "@/components/layout/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ConnectionsState } from "@/app/api/connections/state";
import { readExports } from "@/lib/social/extract";
import { PLATFORM_NAMES, PLATFORMS, type Platform, type SocialImport } from "@/lib/social/parse";
import { past } from "@/lib/social/persona";
import { browserInflate, fileSource } from "@/lib/social/zip";
import { cn, formatDate, pluralize } from "@/lib/utils";
import { useWorkspaceContext } from "@/lib/workspace-store";

type State = ConnectionsState & { comparison?: Comparison; url?: string };
interface Comparison {
  question: string;
  without: string;
  with: string;
  backend: string;
}

async function post(body: object): Promise<State> {
  const res = await fetch("/api/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "That didn't work.");
  return json;
}

const MARK: Record<Platform, { label: string; className: string }> = {
  linkedin: { label: "in", className: "bg-[#0a66c2] text-white" },
  x: { label: "𝕏", className: "bg-foreground text-background" },
  facebook: { label: "f", className: "bg-[#1877f2] text-white" },
};

const HOW_TO: Record<Platform, { steps: string; link: string; wait: string }> = {
  linkedin: {
    steps: "Settings → Data privacy → Get a copy of your data. Pick “Download larger data archive”, or at least Profile, Positions, Education, Skills and Shares.",
    link: "https://www.linkedin.com/mypreferences/d/download-my-data",
    wait: "The first files arrive in about 10 minutes, the full archive within a day.",
  },
  x: {
    steps: "Settings → Your account → Download an archive of your data. Confirm your password, then download the .zip when X emails you.",
    link: "https://x.com/settings/download_your_data",
    wait: "Usually ready within 24 hours. Big archives are fine: only three small files are read.",
  },
  facebook: {
    steps: "Accounts Center → Your information and permissions → Download your information. Choose Posts and Personal information, format JSON.",
    link: "https://accountscenter.facebook.com/info_and_permissions/dyi",
    wait: "Usually ready within a few hours. JSON format matters; HTML can't be read.",
  },
};

function PlatformMark({ platform, className }: { platform: Platform; className?: string }) {
  return (
    <span aria-hidden className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl text-[15px] font-bold", MARK[platform].className, className)}>
      {MARK[platform].label}
    </span>
  );
}

export function Connections() {
  const { service } = useWorkspaceContext();
  const [state, setState] = React.useState<State | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [importOpen, setImportOpen] = React.useState(false);
  const [importRound, setImportRound] = React.useState(0);
  const openImport = (open: boolean) => {
    if (open) setImportRound((n) => n + 1);
    setImportOpen(open);
  };
  const [connectFor, setConnectFor] = React.useState<Platform | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<Platform | "all" | null>(null);
  const search = useSearchParams();
  const router = useRouter();

  const fetchState = React.useCallback(
    () =>
      fetch("/api/connections", { cache: "no-store" })
        .then((res) => {
          if (!res.ok) throw new Error();
          return res.json() as Promise<State>;
        })
        .then(setState, () => setError("The FutureMe server didn't answer.")),
    [],
  );
  const load = () => {
    setError(null);
    void fetchState();
  };

  React.useEffect(() => {
    if (service?.mode === "live") void fetchState();
  }, [service?.mode, fetchState]);

  // Back from a platform's sign-in screen.
  React.useEffect(() => {
    const connected = search.get("connected");
    const failed = search.get("error");
    if (!connected && !failed) return;
    if (connected) toast.success(`${PLATFORM_NAMES[connected as Platform] ?? "Account"} connected. ${search.get("posts") ?? 0} posts imported.`);
    if (failed) toast.error(failed);
    router.replace("/connections");
  }, [search, router]);

  const act = React.useCallback(async (fn: () => Promise<State>, success?: string) => {
    try {
      const next = await fn();
      setState(next);
      if (success) toast.success(success);
      return next;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That didn't work.");
      return null;
    }
  }, []);

  if (service?.mode !== "live") {
    return (
      <PageFrame>
        <Header />
        <EmptyState icon={AtSign} title="Your accounts are imported on the FutureMe server" className="mt-8">
          What you import lives in your own vault on the server, never in demo data. Switch the data mode to Server in{" "}
          <Link href="/settings#data" className="text-accent-ink underline underline-offset-2">
            Settings
          </Link>
          .
        </EmptyState>
      </PageFrame>
    );
  }
  if (error) {
    return (
      <PageFrame>
        <Header />
        <div className="mt-8">
          <ErrorState title="Couldn't load your accounts" message={error} onRetry={load} />
        </div>
      </PageFrame>
    );
  }
  if (!state) return null;

  const bySource = new Map(state.sources.map((s) => [s.platform, s]));
  return (
    <PageFrame rail={<Rules state={state} />} railTitle="Your data rules">
      <Header
        actions={
          <>
            {!state.sources.length && (
              <Button variant="ghost" size="sm" onClick={() => act(() => post({ action: "sample", consent: true }), "Sample data imported. It describes a made-up person; delete it any time.")}>
                <Sparkles /> Try sample data
              </Button>
            )}
            <Button variant="primary" onClick={() => openImport(true)}>
              <Upload /> Import your data
            </Button>
          </>
        }
      />
      <div className="mt-8 space-y-12">
        <section aria-labelledby="accounts-h">
          <SectionHeading id="accounts-h">Your accounts</SectionHeading>
          <div className="grid gap-3 md:grid-cols-3">
            {PLATFORMS.map((p) => (
              <PlatformCard
                key={p}
                platform={p}
                state={state}
                source={bySource.get(p)}
                onImport={() => openImport(true)}
                onConnect={() => setConnectFor(p)}
                onSync={() => act(() => post({ action: "sync", platform: p }), `${PLATFORM_NAMES[p]} synced.`)}
                onDisconnect={() => act(() => post({ action: "disconnect", platform: p }), `${PLATFORM_NAMES[p]} disconnected. Imported data stays until you delete it.`)}
                onDelete={() => setConfirmDelete(p)}
              />
            ))}
          </div>
        </section>

        {state.persona ? (
          <>
            <PersonaSection state={state} />
            <CompareSection state={state} onState={setState} />
            <NotesSection state={state} onDeleteAll={() => setConfirmDelete("all")} />
          </>
        ) : (
          <EmptyState icon={FileArchive} title="Your future self only knows what you typed in onboarding">
            Import your LinkedIn, X or Facebook data and it learns your career, what you care about and how you write, from your own words. You choose what goes in, see everything it learned, and can delete it any time.
          </EmptyState>
        )}
      </div>

      <ImportDialog key={`import-${importRound}`} open={importOpen} onOpenChange={openImport} onImported={(next) => setState(next)} />
      <ConnectDialog key={connectFor ?? "none"} platform={connectFor} state={state} onClose={() => setConnectFor(null)} act={act} />
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDelete === "all" ? "Delete everything you imported?" : `Delete your ${confirmDelete ? PLATFORM_NAMES[confirmDelete] : ""} data?`}</DialogTitle>
            <DialogDescription>
              This deletes the imported notes from your vault, the persona built from them, and any saved sign-in (revoked at the platform too). Nothing on your accounts themselves changes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const target = confirmDelete;
                const body = target === "all" ? { action: "deleteAll", confirm: "DELETE" } : { action: "delete", platform: target };
                if (await act(() => post(body), "Deleted.")) setConfirmDelete(null);
              }}
            >
              <Trash2 /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}

function Header({ actions }: { actions?: React.ReactNode }) {
  return (
    <PageHeader
      eyebrow="Connected accounts"
      title="Let your future self know you"
      description="Bring in what you've already written on LinkedIn, X and Facebook, so your future self gets your story right and sounds like you. Only your profile and your own posts are read."
      actions={actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    />
  );
}

type Source = ConnectionsState["sources"][number];

function PlatformCard(props: {
  platform: Platform;
  state: State;
  source?: Source;
  onImport: () => void;
  onConnect: () => void;
  onSync: () => void;
  onDisconnect: () => void;
  onDelete: () => void;
}) {
  const { platform, state, source } = props;
  const oauth = state.oauth[platform];
  const [busy, setBusy] = React.useState(false);
  const run = (fn: () => void | Promise<unknown>) => async () => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  return (
    <article className="flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-card" aria-label={PLATFORM_NAMES[platform]}>
      <div className="flex items-center gap-3">
        <PlatformMark platform={platform} />
        <div className="min-w-0">
          <h3 className="text-[14px] font-medium">{PLATFORM_NAMES[platform]}</h3>
          <p className="truncate text-[12px] text-muted-foreground">{source ? (source.account ?? "Imported") : "Not imported"}</p>
        </div>
        {source && (
          <Badge tone={source.method === "sample" ? "warning" : "success"} className="ml-auto">
            {source.method === "sample" ? "Sample" : source.method === "oauth" ? "Connected" : "Imported"}
          </Badge>
        )}
      </div>
      {source ? (
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat n={source.counts.posts} label="posts" />
          <Stat n={source.counts.roles} label="roles" />
          <Stat n={source.counts.skills} label="skills" />
        </dl>
      ) : (
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">{HOW_TO[platform].steps}</p>
      )}
      {source && (
        <p className="mt-3 text-[12px] text-muted-foreground">
          {source.range ? `Posts from ${formatDate(source.range.from, { month: "short", year: "numeric" })} to ${formatDate(source.range.to, { month: "short", year: "numeric" })}. ` : ""}
          Imported {formatDate(source.importedAt.replace(" ", "T") + "Z", { day: "numeric", month: "short" })}
          {source.counts.skippedFiles ? `; ${pluralize(source.counts.skippedFiles, "other file")} left unread.` : "."}
        </p>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {!source && (
          <Button size="sm" variant="secondary" asChild>
            <a href={HOW_TO[platform].link} target="_blank" rel="noreferrer">
              Get my export
            </a>
          </Button>
        )}
        {oauth.connected ? (
          <>
            <Button size="sm" variant="secondary" disabled={busy} onClick={run(props.onSync)}>
              {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sync
            </Button>
            <Button size="sm" variant="ghost" onClick={props.onDisconnect}>
              <Unplug /> Disconnect
            </Button>
          </>
        ) : (
          oauth.configured && (
            <Button size="sm" variant="secondary" onClick={props.onConnect}>
              <KeyRound /> Sign in
            </Button>
          )
        )}
        {source && (
          <Button size="sm" variant="ghost" onClick={props.onDelete} aria-label={`Delete ${PLATFORM_NAMES[platform]} data`}>
            <Trash2 /> Delete
          </Button>
        )}
      </div>
    </article>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2 py-2">
      <dt className="sr-only">{label}</dt>
      <dd className="font-display text-[1.35rem] leading-none">{n}</dd>
      <p aria-hidden className="mt-1 text-[11px] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

// ---------- Import: consent, read in the browser, preview, then send ----------

// Keyed by its parent on each opening, so every import starts from a fresh consent.
function ImportDialog({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (o: boolean) => void; onImported: (s: State) => void }) {
  const [agreed, setAgreed] = React.useState(false);
  const [reading, setReading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [parsed, setParsed] = React.useState<SocialImport[] | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const input = React.useRef<HTMLInputElement>(null);


  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setReading(true);
    setProblem(null);
    try {
      setParsed(await readExports([...files].map((f) => ({ name: f.name, source: fileSource(f) })), browserInflate));
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't read those files.");
    }
    setReading(false);
    if (input.current) input.current.value = "";
  };

  const send = async () => {
    if (!parsed) return;
    setSending(true);
    try {
      const next = await post({ action: "import", consent: true, imports: parsed });
      onImported(next);
      toast.success(`Imported ${parsed.map((p) => PLATFORM_NAMES[p.platform]).join(" and ")}. Your future self knows you better now.`);
      onOpenChange(false);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "The import didn't work.");
    }
    setSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{parsed ? "Here's what will be imported" : "Import your data export"}</DialogTitle>
          <DialogDescription>
            {parsed ? "Nothing has been sent yet. Check it, then import." : "Pick the .zip you downloaded from LinkedIn, X or Facebook (or files from inside it). It's read here in your browser first."}
          </DialogDescription>
        </DialogHeader>

        {!parsed ? (
          <div className="space-y-4 text-[13px]">
            <ul className="space-y-2">
              <Rule ok>Read: your profile, career, education, skills, and posts you wrote yourself.</Rule>
              <Rule ok={false}>Never read: messages, connections and contacts, other people&apos;s posts, photos, ads or location history. Those files stay on your device.</Rule>
              <Rule ok>Stored in your own vault on this FutureMe server, as notes you can read and edit. Passages are sent to the AI model only when they help answer you.</Rule>
              <Rule ok>Delete any of it, any time, from this page.</Rule>
            </ul>
            <label className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
              <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" aria-label="I agree" />
              <span>These are my own accounts, and I want my future self to learn from them.</span>
            </label>
            <input ref={input} type="file" multiple accept=".zip,.csv,.js,.json" className="hidden" onChange={(e) => pick(e.target.files)} data-testid="export-input" />
            {problem && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive-wash px-3 py-2 text-[12.5px]">{problem}</p>}
          </div>
        ) : (
          <div className="space-y-3 text-[13px]">
            {parsed.map((p) => (
              <div key={p.platform} className="flex gap-3 rounded-xl border border-border bg-surface-2 p-3">
                <PlatformMark platform={p.platform} className="size-8 text-[13px]" />
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">
                    {PLATFORM_NAMES[p.platform]}
                    {(p.account.handle ?? p.account.name) && <span className="font-normal text-muted-foreground"> · {p.account.handle ?? p.account.name}</span>}
                  </p>
                  <p className="text-muted-foreground">
                    {[
                      pluralize(p.posts.length, "post"),
                      p.positions.length && pluralize(p.positions.length, "role"),
                      p.education.length && pluralize(p.education.length, "school"),
                      p.skills.length && pluralize(p.skills.length, "skill"),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {p.posts[0] && <p className="line-clamp-2 text-[12.5px] italic text-muted-foreground">“{p.posts[0].text}”</p>}
                </div>
              </div>
            ))}
            <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <Lock className="size-3.5" /> {pluralize(parsed[0]?.skipped ?? 0, "other file")} in your archive stayed on this device.
            </p>
            {problem && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive-wash px-3 py-2 text-[12.5px]">{problem}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => (parsed ? setParsed(null) : onOpenChange(false))}>
            {parsed ? "Back" : "Cancel"}
          </Button>
          {parsed ? (
            <Button variant="primary" onClick={send} disabled={sending}>
              {sending ? <Loader2 className="animate-spin" /> : <Check />} Import
            </Button>
          ) : (
            <Button variant="primary" disabled={!agreed || reading} onClick={() => input.current?.click()}>
              {reading ? <Loader2 className="animate-spin" /> : <FileArchive />} {reading ? "Reading…" : "Choose files"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px]", ok ? "bg-success-wash text-success" : "bg-destructive-wash text-destructive")}>
        {ok ? "✓" : "✕"}
      </span>
      <span>{children}</span>
    </li>
  );
}

function ConnectDialog({ platform, state, onClose, act }: { platform: Platform | null; state: State; onClose: () => void; act: (fn: () => Promise<State>) => Promise<State | null> }) {
  const [agreed, setAgreed] = React.useState(false);
  if (!platform) return null;
  const oauth = state.oauth[platform];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign in with {PLATFORM_NAMES[platform]}</DialogTitle>
          <DialogDescription>{oauth.reads}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-[13px]">
          <Rule ok>Permissions asked for: {oauth.scopes.join(", ")}. Read-only; FutureMe can never post for you.</Rule>
          <Rule ok>The sign-in token is encrypted on this server, and revoked at {PLATFORM_NAMES[platform]} when you disconnect.</Rule>
        </ul>
        <label className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px]">
          <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" aria-label="I agree" />
          <span>This is my own account, and I want my future self to learn from it.</span>
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!agreed}
            onClick={async () => {
              const next = await act(() => post({ action: "connect", platform, consent: true }));
              if (next?.url) window.location.href = next.url;
            }}
          >
            <KeyRound /> Continue to {PLATFORM_NAMES[platform]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- What it learned ----------

function PersonaSection({ state }: { state: State }) {
  const p = state.persona!;
  const [showPrompt, setShowPrompt] = React.useState(false);
  return (
    <section aria-labelledby="persona-h">
      <SectionHeading
        id="persona-h"
        action={
          <Button size="sm" variant="ghost" onClick={() => setShowPrompt((v) => !v)} aria-expanded={showPrompt}>
            {showPrompt ? "Hide" : "Show"} exactly what it&apos;s told
          </Button>
        }
      >
        What your future self learned
      </SectionHeading>
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3 text-[13px]">
            {p.headline && <Fact label="Headline">{p.headline}</Fact>}
            {p.now && <Fact label="Now">{p.now}</Fact>}
            {past(p).length > 0 && <Fact label="Before">{past(p).slice(0, 3).join(" · ")}</Fact>}
            {p.education.length > 0 && <Fact label="Studied">{p.education.join(" · ")}</Fact>}
            {p.skills.length > 0 && <Fact label="Skills">{p.skills.slice(0, 12).join(", ")}</Fact>}
          </div>
          <div className="space-y-3 text-[13px]">
            {p.topics.length > 0 && (
              <Fact label="Posts most about">
                <span className="flex flex-wrap gap-1.5 pt-0.5">
                  {p.topics.slice(0, 10).map((t) => (
                    <Badge key={t.term} tone="accent">
                      {t.term} <span className="opacity-60">{t.count}</span>
                    </Badge>
                  ))}
                </span>
              </Fact>
            )}
            {p.voice.posts > 0 && <Fact label="How you write">{p.summary ?? p.voice.traits.join("; ")}</Fact>}
          </div>
        </div>
        {p.examples.length > 0 && (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {p.examples.slice(0, 4).map((e, i) => (
              <blockquote key={i} className="rounded-xl border-l-2 border-accent bg-accent-wash px-4 py-3 text-[13px] leading-relaxed">
                {e.text}
                <footer className="mt-1.5 text-[11.5px] text-muted-foreground">
                  {PLATFORM_NAMES[e.platform]}
                  {e.date ? ` · ${e.date}` : ""}
                </footer>
              </blockquote>
            ))}
          </div>
        )}
        {showPrompt && state.prompt && (
          <pre className="mt-5 overflow-x-auto rounded-xl border border-border bg-surface-2 p-4 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap">{state.prompt}</pre>
        )}
      </div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="t-label mb-0.5">{label}</p>
      <div>{children}</div>
    </div>
  );
}

const QUESTIONS = ["What should I focus on this year?", "Who am I, really?", "What would you post about today?"];

function CompareSection({ state, onState }: { state: State; onState: (s: State) => void }) {
  const [question, setQuestion] = React.useState(QUESTIONS[0]);
  const [busy, setBusy] = React.useState(false);
  const c = state.comparison;
  const run = async () => {
    setBusy(true);
    try {
      onState(await post({ action: "compare", question }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The comparison didn't work.");
    }
    setBusy(false);
  };
  return (
    <section aria-labelledby="compare-h">
      <SectionHeading id="compare-h">Before and after</SectionHeading>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <Input value={question} onChange={(e) => setQuestion(e.target.value)} aria-label="Question for your future self" maxLength={300} />
        <Button type="submit" variant="primary" disabled={busy || !state.onboarded || question.trim().length < 3}>
          {busy ? <Loader2 className="animate-spin" /> : <ArrowLeftRight />} Ask both
        </Button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUESTIONS.map((q) => (
          <button key={q} type="button" onClick={() => setQuestion(q)} className="rounded-full border border-border px-2.5 py-1 text-[12px] text-muted-foreground hover:bg-surface-2">
            {q}
          </button>
        ))}
      </div>
      {!state.onboarded && <p className="mt-2 text-[12.5px] text-muted-foreground">Finish onboarding first: both answers start from your profile.</p>}
      {c && (
        <div className="mt-4 grid gap-3 md:grid-cols-2" aria-live="polite">
          <Answer title="Before: only your onboarding answers" text={c.without} />
          <Answer title="After: with your imported accounts" text={c.with} highlight />
          <p className="text-[11.5px] text-muted-foreground md:col-span-2">
            Same question, same model ({c.backend}), tools off on both sides; the only difference is the persona from your accounts. Not saved to your conversation.
          </p>
        </div>
      )}
    </section>
  );
}

function Answer({ title, text, highlight }: { title: string; text: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-4 shadow-card", highlight ? "border-accent/40 bg-accent-wash" : "border-border bg-surface")}>
      <p className="t-label mb-2">{title}</p>
      <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function NotesSection({ state, onDeleteAll }: { state: State; onDeleteAll: () => void }) {
  const notes = [...state.sources.flatMap((s) => s.notes), "Social/persona-from-your-accounts.md"];
  return (
    <section aria-labelledby="notes-h">
      <SectionHeading
        id="notes-h"
        action={
          <Button size="sm" variant="ghost" onClick={onDeleteAll}>
            <Trash2 /> Delete everything imported
          </Button>
        }
      >
        In your vault · {notes.length}
      </SectionHeading>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {notes.map((n) => (
          <li key={n}>
            <Link href={`/memory/${encodeURIComponent(n)}`} className="block truncate rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[12px] hover:border-border-strong">
              {n}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Rules({ state }: { state: State }) {
  return (
    <>
      <RailSection title="What's read">
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">Your profile, career, education, skills and the posts you wrote. Reposts of other people are skipped.</p>
      </RailSection>
      <RailSection title="What's never read">
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">Messages, connections, contacts, photos, ads and location history. Archives are opened in your browser, so those files never reach the server.</p>
      </RailSection>
      <RailSection title="Where it lives">
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          Notes in your vault&apos;s Social folder, readable in Obsidian. Your future self searches them with its search_social tool and quotes them with dates.
        </p>
      </RailSection>
      <RailSection title="Sign-in tokens">
        <p className="flex gap-2 text-[12.5px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
          Encrypted with AES-256-GCM. The key {state.encryption === "env" ? "comes from FUTUREME_SECRET_KEY" : "is a file next to the database"} and never enters the database or its cloud copy.
        </p>
      </RailSection>
    </>
  );
}
