import { parseJsonReply, runAgent } from "./agents";
import { profileContext } from "./council";
import { generateDaily } from "./daily";
import type { Db } from "./db";
import { getProfile } from "./futureme";
import { NIGHT_MARKER } from "./mock-llm";

// The night shift runs while the user sleeps (scripts/night-shift.ts, or "Run now" in the app): it publishes the day's
// FutureMe Daily, then the night_shift agent writes a morning brief and picks tomorrow's focus from real open tasks.
// Any plan it proposes waits for approval like every other proposal.

export interface NightShiftRecord {
  id: number;
  trigger: "schedule" | "manual";
  status: "running" | "completed" | "failed";
  brief: string | null;
  focus: { id: number; title: string }[];
  watch_out: string | null;
  daily_date: string | null;
  approvals: number[];
  error: string | null;
  backend: string | null;
  started_at: string;
  finished_at: string | null;
}

export async function runNightShift(db: Db, trigger: NightShiftRecord["trigger"] = "manual"): Promise<NightShiftRecord> {
  const profile = getProfile(db);
  if (!profile) throw new Error("Complete onboarding first.");
  const running = db.prepare("SELECT id FROM night_shifts WHERE status = 'running' AND started_at > datetime('now', '-10 minutes')").get();
  if (running) throw new Error("The night shift is already running.");
  const id = Number(db.prepare("INSERT INTO night_shifts (trigger) VALUES (?)").run(trigger).lastInsertRowid);

  try {
    const issue = await generateDaily(db);
    const open = db
      .prepare("SELECT t.id, t.title, t.due_date AS due, g.title AS goal FROM tasks t JOIN goals g ON g.id = t.goal_id WHERE t.status != 'done' ORDER BY t.id")
      .all() as { id: number; title: string; due: string | null; goal: string }[];
    const done = db.prepare("SELECT title FROM tasks WHERE status = 'done' AND completed_at > datetime('now', '-1 day')").all() as { title: string }[];
    const idleGoals = (
      db
        .prepare("SELECT g.title FROM goals g WHERE EXISTS (SELECT 1 FROM tasks t WHERE t.goal_id = g.id) AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.goal_id = g.id AND t.status != 'done')")
        .all() as { title: string }[]
    ).map((g) => g.title);

    const facts = { name: profile.name, today: new Date().toISOString().slice(0, 10), open, done, idleGoals };
    const run = await runAgent(db, "night_shift", [
      { role: "system", content: profileContext(profile) },
      { role: "user", content: `${NIGHT_MARKER} ${JSON.stringify(facts)}` },
    ]);
    const parsed = parseJsonReply<{ brief?: unknown; focus?: unknown; watch_out?: unknown }>(run.reply);
    const byId = new Map(open.map((t) => [t.id, t]));
    // Only real, open tasks can be tomorrow's focus.
    const focus = (Array.isArray(parsed?.focus) ? parsed.focus : [])
      .map(Number)
      .filter((n, i, arr) => byId.has(n) && arr.indexOf(n) === i)
      .slice(0, 3)
      .map((n) => ({ id: n, title: byId.get(n)!.title }));
    const brief = typeof parsed?.brief === "string" && parsed.brief.trim() ? parsed.brief.trim() : run.reply.trim().slice(0, 600) || null;
    const approvals = run.events.flatMap((e) => (e.approval_id ? [e.approval_id] : []));

    db.prepare(
      "UPDATE night_shifts SET status = 'completed', brief = ?, focus = ?, daily_date = ?, approvals = ?, error = ?, backend = ?, finished_at = datetime('now') WHERE id = ?",
    ).run(brief, JSON.stringify({ focus, watch_out: typeof parsed?.watch_out === "string" ? parsed.watch_out : null }), issue.date, JSON.stringify(approvals), null, run.backend, id);
  } catch (err) {
    db.prepare("UPDATE night_shifts SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ?").run(err instanceof Error ? err.message : "The night shift failed.", id);
  }
  return getNightShift(db, id)!;
}

interface RawShift {
  id: number;
  trigger: NightShiftRecord["trigger"];
  status: NightShiftRecord["status"];
  brief: string | null;
  focus: string | null;
  daily_date: string | null;
  approvals: string | null;
  error: string | null;
  backend: string | null;
  started_at: string;
  finished_at: string | null;
}

export function getNightShift(db: Db, id: number): NightShiftRecord | null {
  const r = db.prepare("SELECT * FROM night_shifts WHERE id = ?").get(id) as RawShift | undefined;
  return r ? toRecord(r) : null;
}

export function listNightShifts(db: Db, limit = 14): NightShiftRecord[] {
  return (db.prepare("SELECT * FROM night_shifts ORDER BY id DESC LIMIT ?").all(limit) as RawShift[]).map(toRecord);
}

function toRecord(r: RawShift): NightShiftRecord {
  const f = r.focus ? (JSON.parse(r.focus) as { focus: NightShiftRecord["focus"]; watch_out: string | null }) : { focus: [], watch_out: null };
  return { ...r, focus: f.focus, watch_out: f.watch_out, approvals: r.approvals ? JSON.parse(r.approvals) : [] };
}

/** "HH:MM" in the server's local time; NIGHT_SHIFT_AT=off disables the schedule. */
export function nightShiftSchedule(): string | null {
  const at = process.env.NIGHT_SHIFT_AT ?? "05:30";
  return /^\d{1,2}:\d{2}$/.test(at) ? at : null;
}

export function nextRunAt(at: string, now = new Date()): Date {
  const [h, m] = at.split(":").map(Number);
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}
