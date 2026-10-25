import { z } from "zod";
import type { Db } from "./db";
import { getProfile } from "./futureme";
import { getProvider, type LlmProvider } from "./llm";
import { SCHEMAS } from "./nemotron";
import { DAILY_MARKER } from "./mock-llm";
import { writeNote } from "./vault";

// TOMORA Daily: an editorial issue about the user's own journey.
// Every item comes from a verified record (a completed task, a goal's progress, a saved reflection).
// The model only writes the headline, lead and editor's note, from those facts.

export interface DailyItem {
  title: string;
  detail?: string;
  source: string;
}

export interface DailyIssue {
  date: string;
  headline: string;
  lead: string;
  editorNote: string;
  wins: DailyItem[];
  milestones: DailyItem[];
  open: DailyItem[];
  reflection: DailyItem | null;
  notePath?: string;
}

const WINDOW_DAYS = 7;

const Editorial = z.object({
  headline: z.string().min(1).max(140),
  lead: z.string().min(1).max(1200),
  editor_note: z.string().max(600).default(""),
});

export function collectFacts(db: Db, date: string) {
  const since = new Date(`${date}T23:59:59Z`);
  since.setUTCDate(since.getUTCDate() - WINDOW_DAYS);

  const wins = (
    db
      .prepare(
        `SELECT t.id, t.title, t.completed_at, g.title AS goal FROM tasks t JOIN goals g ON g.id = t.goal_id
         WHERE t.status = 'done' AND t.completed_at >= ? AND substr(t.completed_at, 1, 10) <= ? ORDER BY t.completed_at DESC`,
      )
      .all(since.toISOString(), date) as { id: number; title: string; completed_at: string; goal: string }[]
  ).map((t) => ({ title: t.title, detail: `Toward "${t.goal}" · completed ${t.completed_at.slice(0, 10)}`, source: `task #${t.id}` }));

  const goals = db
    .prepare(
      `SELECT g.id, g.title, COUNT(t.id) AS total, SUM(t.status = 'done') AS done FROM goals g
       LEFT JOIN tasks t ON t.goal_id = g.id WHERE g.status = 'active' GROUP BY g.id ORDER BY g.id`,
    )
    .all() as { id: number; title: string; total: number; done: number }[];
  const milestones = goals
    .filter((g) => g.done > 0)
    .map((g) => ({
      title: g.done === g.total ? `Completed: ${g.title}` : g.title,
      detail: `${g.done} of ${g.total} steps done`,
      source: `goal #${g.id}`,
    }));

  const open = (
    db
      .prepare(
        `SELECT t.id, t.title, t.due_date, g.title AS goal FROM tasks t JOIN goals g ON g.id = t.goal_id
         WHERE t.status = 'todo' ORDER BY t.due_date IS NULL, t.due_date, t.id LIMIT 5`,
      )
      .all() as { id: number; title: string; due_date: string | null; goal: string }[]
  ).map((t) => ({
    title: t.title,
    detail: t.due_date ? `${t.due_date < date ? "Overdue since" : "Due"} ${t.due_date} · ${t.goal}` : t.goal,
    source: `task #${t.id}`,
  }));

  const r = db.prepare("SELECT content, note_path FROM reflections ORDER BY id DESC LIMIT 1").get() as
    | { content: string; note_path: string | null }
    | undefined;
  const reflection = r ? { title: r.content.split(/\n{2,}/)[0], source: r.note_path ?? "reflection" } : null;

  return { wins, milestones, open, reflection };
}

export async function generateDaily(db: Db, provider: LlmProvider = getProvider(), date = new Date().toISOString().slice(0, 10)): Promise<DailyIssue> {
  const profile = getProfile(db);
  if (!profile) throw new Error("Complete onboarding first.");
  const facts = collectFacts(db, date);

  const res = await provider.complete([
    {
      role: "system",
      content:
        "You are the editor of TOMORA Daily, a private newspaper about one person's journey toward their dream. " +
        "Using ONLY the facts provided, write JSON with keys headline (max 10 words), lead (2-3 sentences, third person, " +
        "warm and specific) and editor_note (1-2 sentences from their future self about what to do next). " +
        "Never invent achievements, numbers, people or events. If there are no wins yet, say the story is just beginning. Output JSON only.",
    },
    { role: "user", content: `${DAILY_MARKER} ${JSON.stringify({ date, name: profile.name, dream: profile.dream, ...facts })}` },
  ], undefined, { reasoning: "off", schema: SCHEMAS.dailyEditorial });
  const editorial = parseEditorial(res.content, profile.name, facts.wins.length);

  const issue: DailyIssue = { date, headline: editorial.headline, lead: editorial.lead, editorNote: editorial.editor_note, ...facts };
  const note = writeNote({
    folder: "Daily",
    title: `TOMORA Daily ${date}`,
    tags: ["daily"],
    evidence: "verified",
    links: ["10-Year Dream"],
    body: renderMarkdown(issue),
  });
  issue.notePath = note.path;
  db.prepare(
    "INSERT INTO daily_issues (date, content, note_path) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET content = excluded.content, note_path = excluded.note_path, created_at = datetime('now')",
  ).run(date, JSON.stringify(issue), note.path);
  return issue;
}

function parseEditorial(content: string | null, name: string, wins: number) {
  const text = (content ?? "").trim();
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    return Editorial.parse(JSON.parse(json));
  } catch {
    // The model didn't return usable JSON: fall back to a plain, fact-only front page.
    return {
      headline: wins ? `${name} made progress this week` : `${name}'s story begins`,
      lead: wins ? `${name} completed ${wins} step${wins > 1 ? "s" : ""} this week.` : "No steps are completed yet. Today is a good day to start one.",
      editor_note: "",
    };
  }
}

function renderMarkdown(issue: DailyIssue): string {
  const list = (items: DailyItem[]) =>
    items.length ? items.map((i) => `- ${i.title}${i.detail ? ` (${i.detail})` : ""} · source: ${i.source}`).join("\n") : "- Nothing yet";
  return [
    `## ${issue.headline}`,
    issue.lead,
    `## Wins this week\n\n${list(issue.wins)}`,
    `## Milestones\n\n${list(issue.milestones)}`,
    `## Still open\n\n${list(issue.open)}`,
    issue.reflection ? `## From your future self\n\n> ${issue.reflection.title}` : "",
    issue.editorNote ? `## Editor's note\n\n${issue.editorNote}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function latestDaily(db: Db): DailyIssue | null {
  const row = db.prepare("SELECT content FROM daily_issues ORDER BY date DESC LIMIT 1").get() as { content: string } | undefined;
  return row ? (JSON.parse(row.content) as DailyIssue) : null;
}
