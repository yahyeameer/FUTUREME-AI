"use client";

import { ArrowLeft, ArrowUpRight, BookmarkPlus, Check, ChevronLeft, ChevronRight, Newspaper, Printer, Sparkles, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Seal } from "@/components/brand/seal";
import { PageFrame } from "@/components/layout/page-frame";
import { Ticker } from "@/components/motion/ticker";
import { EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Tooltip } from "@/components/ui/tooltip";
import { useNow } from "@/lib/use-now";
import { cn, formatDate } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-store";
import type { ArticleSection, DailyArticle, DailyEdition, DailyItem, SourceRef, TrendItem } from "@/types";
import { SOURCE_LABEL, sourceHref } from "./sources";

type Filter = "all" | ArticleSection;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "progress", label: "Progress" },
  { value: "reflection", label: "Reflection" },
  { value: "research", label: "Research" },
  { value: "learning", label: "Learning" },
];

const USEFUL_KEY = "futureme.daily.useful";

function useUseful() {
  const [ids, setIds] = React.useState<Set<string>>(new Set());
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(USEFUL_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setIds(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* storage unavailable: marks last for this visit only */
    }
  }, []);
  const toggle = React.useCallback((id: string) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(USEFUL_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  return { ids, toggle };
}

export function Daily() {
  const { workspace, service, apply } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [printing, setPrinting] = React.useState(false);
  const useful = useUseful();

  const editions = workspace.editions;
  const requested = params.get("edition");
  const edition = editions.find((e) => e.date === requested) ?? editions[0];
  const index = edition ? editions.indexOf(edition) : -1;
  const reading = params.get("read");
  const article = edition && reading ? articlesOf(edition).find((a) => a.id === reading) : undefined;
  const today = new Date().toISOString().slice(0, 10);
  const hasToday = editions.some((e) => e.date === today);

  const go = (next: { edition?: string; read?: string | null }) => {
    const q = new URLSearchParams(params.toString());
    if (next.edition !== undefined) q.set("edition", next.edition);
    if (next.read === null) q.delete("read");
    else if (next.read) q.set("read", next.read);
    router.push(`${pathname}?${q.toString()}`, { scroll: true });
  };

  const publish = async () => {
    setPrinting(true);
    try {
      const { workspace: ws, edition: fresh } = await service.publishEdition();
      if (!ws.editions.some((e) => e.id === fresh.id)) throw new Error("The edition wasn't saved. Try again.");
      apply(ws);
      toast.success(`Issue ${fresh.issueNumber} is out`);
      go({ edition: fresh.date, read: null });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't publish the edition.");
    } finally {
      setPrinting(false);
    }
  };

  const toolbar = (
    <>
      {edition && (
        <div className="flex min-w-0 items-center gap-1">
          <Tooltip content="Older edition">
            <Button variant="ghost" size="icon-sm" aria-label="Older edition" disabled={index >= editions.length - 1} onClick={() => go({ edition: editions[index + 1].date, read: null })}>
              <ChevronLeft />
            </Button>
          </Tooltip>
          <Select
            aria-label="Choose an edition"
            className="h-8 w-auto min-w-0 max-w-[13rem] text-[12.5px]"
            value={edition.date}
            onValueChange={(d) => go({ edition: d, read: null })}
            options={editions.map((e) => ({ value: e.date, label: `No. ${e.issueNumber} · ${formatDate(e.date, { day: "numeric", month: "short" })}` }))}
          />
          <Tooltip content="Newer edition">
            <Button variant="ghost" size="icon-sm" aria-label="Newer edition" disabled={index <= 0} onClick={() => go({ edition: editions[index - 1].date, read: null })}>
              <ChevronRight />
            </Button>
          </Tooltip>
        </div>
      )}
      <Button size="sm" variant={hasToday ? "ghost" : "secondary"} className="ml-auto" onClick={publish} disabled={printing || !workspace.profile}>
        <Printer /> {printing ? "Going to press…" : hasToday ? "Reprint today" : "Publish today's edition"}
      </Button>
    </>
  );

  if (article && edition)
    return (
      <PageFrame toolbar={toolbar}>
        <ArticleReader article={article} edition={edition} onBack={() => go({ read: null })} useful={useful} />
      </PageFrame>
    );

  return (
    <PageFrame toolbar={toolbar} width="wide">
      <Masthead edition={edition} />

      {!edition ? (
        <EmptyState
          icon={Newspaper}
          title="No editions yet"
          className="mt-8"
          action={
            <Button variant="primary" size="sm" onClick={publish} disabled={printing || !workspace.profile}>
              <Printer /> {printing ? "Going to press…" : "Publish the first edition"}
            </Button>
          }
        >
          TOMORA Daily is written only from your own records: completed tasks, open steps and the notes in your vault. Publish one whenever you want a look at the week.
        </EmptyState>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <Segmented label="Filter sections" size="sm" value={filter} onValueChange={setFilter} options={FILTERS} />
            {workspace.runtime.simulated && <span className="t-meta">Written from your demo records</span>}
          </div>
          <EditionBody edition={edition} filter={filter} onRead={(id) => go({ read: id })} useful={useful} />
        </>
      )}
    </PageFrame>
  );
}

function articlesOf(e: DailyEdition): DailyArticle[] {
  return [e.lead, e.unfinished, e.lessons, e.people].filter((a): a is DailyArticle => !!a);
}

function Masthead({ edition }: { edition?: DailyEdition }) {
  const { workspace } = useWorkspace();
  const profile = workspace.profile;
  const now = useNow();
  const horizon = profile?.horizonYear;
  const daysLeft = now && horizon ? Math.max(0, Math.ceil((new Date(horizon, 0, 1).getTime() - now.getTime()) / 86_400_000)) : null;
  const done = workspace.tasks.filter((t) => t.status === "done").length;
  const waiting = workspace.approvals.filter((a) => a.status === "pending").length;
  const stats = [
    now ? `${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} local` : "Live",
    daysLeft !== null ? `${daysLeft.toLocaleString("en-GB")} days to ${horizon}` : null,
    `${done} of ${workspace.tasks.length} steps done`,
    `${workspace.milestones.length} milestones on the road`,
    `${workspace.memories.length} notes in the vault`,
    waiting ? `${waiting} waiting for your OK` : "Nothing waiting for your OK",
    `${workspace.editions.length} editions published`,
  ].filter((x): x is string => !!x);

  return (
    <header className="border-b-[3px] border-double border-foreground/80 pb-3 text-center">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-2 t-meta">
        <span>{edition ? `No. ${edition.issueNumber}` : "No. —"}</span>
        <span className="hidden sm:inline">Toward {horizon ?? "your future"}</span>
        <span>{edition ? formatDate(edition.date, { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : "Not yet published"}</span>
      </div>
      <div className="mt-3 flex items-center justify-center gap-4 sm:justify-between">
        <Seal text="EST. FROM YOUR OWN RECORDS ✦ NOTHING INVENTED ✦ " className="hidden text-muted-foreground sm:flex">
          <span className="font-display text-[22px] leading-none text-foreground italic">{edition ? `№${edition.issueNumber}` : "№—"}</span>
          <span className="mt-0.5 font-mono text-[8px] tracking-[0.18em]">ISSUE</span>
        </Seal>
        <h1 aria-label="TOMORA Daily" className="group/title cursor-default font-display text-[clamp(2.9rem,1.8rem+5vw,6.25rem)] leading-[0.9] tracking-[-0.02em]">
          {Array.from("TOMORA Daily").map((ch, i) => (
            <span
              key={i}
              aria-hidden
              className={cn(
                "inline-block animate-[title-in_0.7s_cubic-bezier(0.2,0.7,0.2,1)_both] transition-[transform,color] duration-300 hover:-translate-y-2 hover:text-copper hover:[text-shadow:0_0_24px_var(--accent)]",
                i > 8 && "italic",
                ch === " " && "w-[0.25em]",
              )}
              style={{ animationDelay: `${i * 0.035}s` }}
            >
              {ch === " " ? "\u00a0" : ch}
            </span>
          ))}
        </h1>
        <Seal text={`TOWARD ${horizon ?? "THE FUTURE"} ✦ COUNTING DOWN ✦ `} className="hidden text-muted-foreground sm:flex">
          <span className="font-display text-[22px] leading-none text-foreground tabular-nums">{daysLeft !== null ? daysLeft.toLocaleString("en-GB") : "—"}</span>
          <span className="mt-0.5 font-mono text-[8px] tracking-[0.18em]">DAYS LEFT</span>
        </Seal>
      </div>
      <p className="mt-2 font-serif text-[13px] text-muted-foreground italic">
        {profile ? `The record of ${profile.name}'s road to ${horizon}. Only what your records show.` : "Only what your records show."}
      </p>
      <Ticker label="Today in numbers" items={stats.map((s) => <span key={s} className="t-meta">{s}</span>)} className="mt-3 border-t border-border pt-2" />
    </header>
  );
}

function matches(filter: Filter, section: ArticleSection) {
  return filter === "all" || filter === section;
}

function EditionBody({ edition, filter, onRead, useful }: { edition: DailyEdition; filter: Filter; onRead: (id: string) => void; useful: ReturnType<typeof useUseful> }) {
  const showLead = matches(filter, edition.lead.section);
  const showProgress = matches(filter, "progress");
  const secondary = [edition.unfinished, edition.lessons, edition.people].filter((a): a is DailyArticle => !!a && matches(filter, a.section));
  const showTrends = matches(filter, "research");
  const nothing = !showLead && !showProgress && secondary.length === 0 && !(showTrends && edition.trends.length);

  if (nothing)
    return (
      <EmptyState title={`No ${filter} stories in this edition`} className="mt-8">
        {filter === "research"
          ? "Research needs a connected search tool. Nothing is invented to fill the space."
          : filter === "learning"
            ? "This section only reports conversations you recorded yourself in the vault."
            : "This edition had nothing for this section."}
      </EmptyState>
    );

  return (
    <div className="mt-6">
      {(showLead || showProgress) && (
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-0">
          {showLead && (
            <article className={cn("min-w-0", showProgress ? "lg:col-span-8 lg:pr-8" : "lg:col-span-12")}>
              <p className="t-label !text-copper">{edition.lead.kicker}</p>
              <h2 className="mt-2 font-display text-[clamp(2rem,1.4rem+2.6vw,3.5rem)] leading-[1] text-balance">
                <button type="button" onClick={() => onRead(edition.lead.id)} className="text-left hover:underline hover:decoration-1 hover:underline-offset-4">
                  {edition.lead.headline}
                </button>
              </h2>
              {edition.lead.dek && <p className="mt-3 font-serif text-[17px] text-muted-foreground italic">{edition.lead.dek}</p>}
              <div className="mt-5 max-w-[40rem] space-y-4 t-reading">
                {edition.lead.body.map((p, i) => (
                  <p key={i} className={cn(i === 0 && "drop-cap")}>
                    {p}
                  </p>
                ))}
              </div>
              <ArticleFooter article={edition.lead} edition={edition} useful={useful} onRead={onRead} />
            </article>
          )}
          {showProgress && (
            <aside className={cn("min-w-0", showLead ? "lg:col-span-4 lg:border-l lg:border-border lg:pl-8" : "lg:col-span-12")}>
              <ItemList title="Progress this week" items={edition.progress} empty="No steps were completed in the seven days before this edition." />
              <div className="mt-7">
                <ItemList title="Still open" items={edition.openItems} empty="Nothing open." />
              </div>
              {edition.nextEdition && (
                <div className="mt-7 border-t-2 border-foreground/80 pt-3">
                  <p className="t-label">In the next edition</p>
                  <p className="mt-1.5 font-serif text-[15px] leading-snug">{edition.nextEdition}</p>
                </div>
              )}
            </aside>
          )}
        </div>
      )}

      {secondary.length > 0 && (
        <div className="mt-10 grid border-t border-foreground/80 md:grid-cols-3">
          {secondary.map((a, i) => (
            <article key={a.id} className={cn("min-w-0 py-5 md:px-6", i === 0 && "md:pl-0", i > 0 && "border-t border-border md:border-t-0 md:border-l")}>
              <p className="t-label">{a.kicker}</p>
              <h3 className="mt-2 font-display text-[1.6rem] leading-[1.08] text-balance">
                <button type="button" onClick={() => onRead(a.id)} className="text-left hover:underline hover:decoration-1 hover:underline-offset-4">
                  {a.headline}
                </button>
              </h3>
              {a.dek && <p className="mt-2 font-serif text-[14px] text-muted-foreground italic">{a.dek}</p>}
              <p className="mt-3 line-clamp-4 font-serif text-[15px] leading-relaxed text-foreground/90">{a.body[0]}</p>
              <Button variant="link" size="sm" className="mt-2 h-auto px-0" onClick={() => onRead(a.id)}>
                Read <ArrowUpRight />
              </Button>
            </article>
          ))}
        </div>
      )}

      {showTrends && (
        <section className="mt-10 border-t border-foreground/80 pt-4" aria-labelledby="signals">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="signals" className="t-label">
              Signals from the field
            </h2>
            {edition.trends.some((t) => t.simulated) && <Badge tone="copper">Illustrative, not real sources</Badge>}
          </div>
          {edition.trends.length ? (
            <ul className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {edition.trends.map((t) => (
                <TrendRow key={t.id} trend={t} />
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] text-muted-foreground">No research tool is connected, so this edition has no outside signals. Nothing is invented to fill the space.</p>
          )}
        </section>
      )}
    </div>
  );
}

function ItemList({ title, items, empty }: { title: string; items: DailyItem[]; empty: string }) {
  const { workspace } = useWorkspace();
  return (
    <section>
      <h2 className="border-b border-border pb-1.5 t-label">{title}</h2>
      {items.length ? (
        <ul className="divide-y divide-border">
          {items.map((it, i) => {
            const href = sourceHref(it.source, workspace);
            return (
              <li key={`${it.source.id}-${i}`} className="py-2.5">
                {href ? (
                  <Link href={href} className="text-[13.5px] leading-snug hover:underline">
                    {it.title}
                  </Link>
                ) : (
                  <p className="text-[13.5px] leading-snug">{it.title}</p>
                )}
                {it.detail && <p className="mt-0.5 t-meta">{it.detail}</p>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-2.5 text-[12.5px] text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

function TrendRow({ trend }: { trend: TrendItem }) {
  return (
    <li className="min-w-0">
      <p className="font-serif text-[16px] leading-snug">
        {trend.url ? (
          <a href={trend.url} target="_blank" rel="noreferrer" className="hover:underline">
            {trend.title}
          </a>
        ) : (
          trend.title
        )}
      </p>
      <p className="mt-1 text-[12.5px] text-muted-foreground">{trend.summary}</p>
      <p className="mt-1 t-meta">
        {trend.sourceName}
        {trend.date ? ` · ${formatDate(trend.date)}` : ""}
      </p>
    </li>
  );
}

function SourceList({ sources }: { sources: SourceRef[] }) {
  const { workspace } = useWorkspace();
  if (!sources.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="t-label">Sources</span>
      {sources.map((s, i) => {
        const href = sourceHref(s, workspace);
        const label = `${SOURCE_LABEL[s.kind]}: ${s.label}`;
        return href ? (
          <Link key={`${s.id}-${i}`} href={href} className="max-w-[18rem] truncate text-[12px] text-muted-foreground underline decoration-border-strong underline-offset-2 hover:text-foreground">
            {label}
          </Link>
        ) : (
          <span key={`${s.id}-${i}`} className="max-w-[18rem] truncate text-[12px] text-subtle line-through" title="This record no longer exists">
            {label}
          </span>
        );
      })}
    </div>
  );
}

function ArticleActions({ article, edition, useful }: { article: DailyArticle; edition: DailyEdition; useful: ReturnType<typeof useUseful> }) {
  const { workspace, run } = useWorkspace();
  const [saving, setSaving] = React.useState(false);
  const saved = workspace.memories.some((m) => m.title === article.headline && m.tags.includes("daily"));
  const isUseful = useful.ids.has(article.id);
  const prompt = `From TOMORA Daily (${formatDate(edition.date, { day: "numeric", month: "long" })}): “${article.headline}”. Help me turn this into one concrete next action.`;

  const save = async () => {
    setSaving(true);
    const draft = {
      title: article.headline,
      body: `${article.body.join("\n\n")}\n\nSaved from TOMORA Daily, issue ${edition.issueNumber} (${edition.date}).`,
      kind: "note" as const,
      tags: ["daily"],
      // The paper is TOMORA's summary of your records, so it's stored as an AI interpretation.
      imagined: true,
    };
    await run(async (s) => {
      const ws = await s.createMemory(draft);
      if (!ws.memories.some((m) => m.title === draft.title)) throw new Error("The insight wasn't saved. Try again.");
      return ws;
    }, "Insight saved to your vault");
    setSaving(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button variant={isUseful ? "secondary" : "ghost"} size="sm" aria-pressed={isUseful} onClick={() => useful.toggle(article.id)}>
        <ThumbsUp /> {isUseful ? "Useful" : "Mark useful"}
      </Button>
      {!article.simulated && (
        <Button variant="ghost" size="sm" onClick={save} disabled={saving || saved}>
          {saved ? <Check /> : <BookmarkPlus />} {saved ? "Saved to memory" : saving ? "Saving…" : "Save insight"}
        </Button>
      )}
      <Button asChild variant="ghost" size="sm">
        <Link href={`/future-self?prompt=${encodeURIComponent(prompt)}`}>
          <Sparkles /> Turn into an action
        </Link>
      </Button>
    </div>
  );
}

function ArticleFooter({ article, edition, useful, onRead }: { article: DailyArticle; edition: DailyEdition; useful: ReturnType<typeof useUseful>; onRead: (id: string) => void }) {
  return (
    <div className="mt-6 space-y-3 border-t border-border pt-3">
      <SourceList sources={article.sources} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ArticleActions article={article} edition={edition} useful={useful} />
        <Button variant="link" size="sm" className="px-0" onClick={() => onRead(article.id)}>
          Reading view <ArrowUpRight />
        </Button>
      </div>
    </div>
  );
}

function ArticleReader({ article, edition, onBack, useful }: { article: DailyArticle; edition: DailyEdition; onBack: () => void; useful: ReturnType<typeof useUseful> }) {
  return (
    <article className="mx-auto max-w-[42rem]">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
        <ArrowLeft /> TOMORA Daily · No. {edition.issueNumber}
      </Button>
      <p className="mt-8 t-label !text-copper">{article.kicker}</p>
      <h1 className="mt-3 font-display text-[clamp(2.2rem,1.6rem+2.6vw,3.6rem)] leading-[1.02] text-balance">{article.headline}</h1>
      {article.dek && <p className="mt-4 font-serif text-[19px] leading-snug text-muted-foreground italic">{article.dek}</p>}
      <p className="mt-5 border-y border-border py-2 t-meta">{formatDate(edition.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · Written from your records</p>
      {article.simulated && (
        <p className="mt-5 rounded-md border border-copper/30 bg-copper-wash px-4 py-3 text-[13px]">This piece is illustrative and doesn&apos;t come from a real source.</p>
      )}
      <div className="mt-7 space-y-5 t-reading">
        {article.body.map((p, i) => (
          <p key={i} className={cn(i === 0 && "drop-cap")}>
            {p}
          </p>
        ))}
      </div>
      <div className="mt-10 space-y-4 border-t-2 border-foreground/80 pt-4">
        <SourceList sources={article.sources} />
        <ArticleActions article={article} edition={edition} useful={useful} />
      </div>
    </article>
  );
}
