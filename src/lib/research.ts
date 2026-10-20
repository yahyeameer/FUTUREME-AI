import { parseJsonReply, runAgent } from "./agents";
import { SCHEMAS } from "./nemotron";
import type { Db } from "./db";
import { createApproval } from "./futureme";
import { RESEARCH_MARKER } from "./mock-llm";
import { searchProvider } from "./web";

// Web research: the researcher agent searches and reads pages with real tools. The app keeps only findings whose link
// came back from those tools in this run, then proposes the summary as a memory the user approves or rejects.

export interface ResearchRecord {
  id: number;
  topic: string;
  status: "running" | "awaiting_approval" | "completed" | "failed";
  summary: string | null;
  sources: { point: string; url: string }[];
  approval_id: number | null;
  error: string | null;
  backend: string | null;
  started_at: string;
  finished_at: string | null;
}

export async function runResearch(db: Db, rawTopic: string): Promise<ResearchRecord> {
  const topic = rawTopic.trim();
  if (topic.length < 3) throw new Error("Give the researcher a topic.");
  if (topic.length > 300) throw new Error("Keep the topic under 300 characters.");
  if (searchProvider() === "off") throw new Error("Web search is turned off on this server.");
  const id = Number(db.prepare("INSERT INTO research_runs (topic) VALUES (?)").run(topic).lastInsertRowid);

  try {
    const run = await runAgent(db, "researcher", [{ role: "user", content: `${RESEARCH_MARKER} Topic: ${topic}` }], { schema: SCHEMAS.research });
    const seen = new Set(run.events.filter((e) => e.tool === "web_search" || e.tool === "fetch_url").flatMap((e) => e.citations));
    const parsed = parseJsonReply<{ summary?: unknown; findings?: { point?: unknown; url?: unknown }[] }>(run.reply);
    const summary = typeof parsed?.summary === "string" ? parsed.summary.trim() : "";
    const sources = (parsed?.findings ?? [])
      .filter((f): f is { point: string; url: string } => typeof f.point === "string" && typeof f.url === "string" && seen.has(f.url))
      .slice(0, 6)
      .map((f) => ({ point: f.point.trim(), url: f.url }));

    if (!sources.length) {
      const reason = summary || "The researcher returned no sources it had actually read.";
      db.prepare("UPDATE research_runs SET status = 'failed', summary = ?, error = ?, backend = ?, finished_at = datetime('now') WHERE id = ?").run(
        summary || null,
        reason,
        run.backend,
        id,
      );
      return getResearch(db, id)!;
    }

    const body = [summary, "## Findings", ...sources.map((s) => `- ${s.point} ([source](${s.url}))`), "## Sources", ...sources.map((s) => `- ${s.url}`)].join("\n\n");
    const approvalId = createApproval(db, "memory", { title: `Research: ${topic}`.slice(0, 120), body, folder: "Research", tags: ["research"], evidence: "ai-inferred" });
    db.prepare(
      "UPDATE research_runs SET status = 'awaiting_approval', summary = ?, sources = ?, approval_id = ?, backend = ?, finished_at = datetime('now') WHERE id = ?",
    ).run(summary, JSON.stringify(sources), approvalId, run.backend, id);
  } catch (err) {
    db.prepare("UPDATE research_runs SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ?").run(err instanceof Error ? err.message : "Research failed.", id);
  }
  return getResearch(db, id)!;
}

export function getResearch(db: Db, id: number): ResearchRecord | null {
  const r = db.prepare("SELECT * FROM research_runs WHERE id = ?").get(id) as (Omit<ResearchRecord, "sources"> & { sources: string | null }) | undefined;
  return r ? { ...r, sources: r.sources ? JSON.parse(r.sources) : [] } : null;
}

export function listResearch(db: Db, limit = 20): ResearchRecord[] {
  return (db.prepare("SELECT id FROM research_runs ORDER BY id DESC LIMIT ?").all(limit) as { id: number }[]).map((r) => getResearch(db, r.id)!);
}
