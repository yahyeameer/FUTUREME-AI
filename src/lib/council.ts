import { parseJsonReply, runAgent, type AgentName } from "./agents";
import { withChosenRoad } from "./chosen-road";
import type { Db } from "./db";
import { getProfile, type Profile } from "./futureme";
import { CHAIR_MARKER, COUNCIL_MARKER } from "./mock-llm";
import { SCHEMAS } from "./nemotron";
import { writeNote } from "./vault";

// The council: one question goes to several future selves at once (each its own Docker Agent agent), and a chair agent
// merges their answers into a decision brief. Nothing here writes to the roadmap; the user can save the brief as a note.

export const VOICES: { name: AgentName; label: string }[] = [
  { name: "voice_horizon", label: "You at your horizon" },
  { name: "voice_next_year", label: "You, one year from now" },
  { name: "voice_skeptic", label: "The skeptic" },
  { name: "voice_mentor", label: "The mentor" },
];

export interface CouncilVoice {
  name: string;
  label: string;
  reply: string;
  error?: string;
}

export interface CouncilBrief {
  summary: string;
  agreements: string[];
  tensions: string[];
  next_step: string;
}

export interface CouncilRecord {
  id: number;
  question: string;
  voices: CouncilVoice[];
  brief: CouncilBrief;
  citations: string[];
  backend: string;
  note_path: string | null;
  created_at: string;
}

export function profileContext(p: Profile): string {
  return [
    `The user is ${p.name}. Their dream: ${p.dream}`,
    p.current && `Where they are now: ${p.current}`,
    p.resources && `What they have: ${p.resources}`,
    p.challenges && `What stands in the way: ${p.challenges}`,
    p.values && `Their values: ${p.values}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function runCouncil(db: Db, rawQuestion: string): Promise<CouncilRecord> {
  const profile = getProfile(db);
  if (!profile) throw new Error("Complete onboarding first.");
  const question = rawQuestion.trim();
  if (question.length < 3) throw new Error("Ask the council a question.");
  if (question.length > 600) throw new Error("Keep the question under 600 characters.");
  const context = { role: "system" as const, content: withChosenRoad(db, profileContext(profile)) };

  // The voices run in parallel; one failing doesn't sink the others.
  const settled = await Promise.allSettled(
    VOICES.map((v) => runAgent(db, v.name, [context, { role: "user", content: `${COUNCIL_MARKER(v.name)} ${question}` }])),
  );
  const voices: CouncilVoice[] = settled.map((r, i) =>
    r.status === "fulfilled" && r.value.reply
      ? { name: VOICES[i].name, label: VOICES[i].label, reply: r.value.reply }
      : { name: VOICES[i].name, label: VOICES[i].label, reply: "", error: r.status === "rejected" ? errorText(r.reason) : "No answer." },
  );
  const answered = voices.filter((v) => v.reply);
  if (!answered.length) throw new Error(`The council couldn't answer: ${voices[0]?.error ?? "no voice replied"}.`);
  const citations = [...new Set(settled.flatMap((r) => (r.status === "fulfilled" ? r.value.events.flatMap((e) => e.citations) : [])))];

  const chair = await runAgent(db, "council_chair", [
    context,
    { role: "user", content: `${CHAIR_MARKER} Question: ${question}\n\n${answered.map((v) => `## ${v.label}\n${v.reply}`).join("\n\n")}` },
  ], { schema: SCHEMAS.councilBrief });
  const parsed = parseJsonReply<Partial<CouncilBrief>>(chair.reply);
  const brief: CouncilBrief = {
    summary: str(parsed?.summary) || chair.reply.slice(0, 600) || "The council answered; see each voice below.",
    agreements: strList(parsed?.agreements),
    tensions: strList(parsed?.tensions),
    next_step: str(parsed?.next_step),
  };

  const info = db
    .prepare("INSERT INTO councils (question, voices, brief, backend) VALUES (?, ?, ?, ?)")
    .run(question, JSON.stringify({ voices, citations }), JSON.stringify(brief), chair.backend);
  return getCouncil(db, Number(info.lastInsertRowid))!;
}

export function getCouncil(db: Db, id: number): CouncilRecord | null {
  const row = db.prepare("SELECT * FROM councils WHERE id = ?").get(id) as RawCouncil | undefined;
  return row ? toRecord(row) : null;
}

export function listCouncils(db: Db, limit = 20): CouncilRecord[] {
  return (db.prepare("SELECT * FROM councils ORDER BY id DESC LIMIT ?").all(limit) as RawCouncil[]).map(toRecord);
}

/** Saves a council's brief to the vault, labelled as an AI interpretation. */
export function saveCouncilBrief(db: Db, id: number): string {
  const c = getCouncil(db, id);
  if (!c) throw new Error(`No council #${id}.`);
  if (c.note_path) return c.note_path;
  const body = [
    `**Question:** ${c.question}`,
    c.brief.summary,
    c.brief.agreements.length && `## Where they agree\n\n${c.brief.agreements.map((a) => `- ${a}`).join("\n")}`,
    c.brief.tensions.length && `## Where they differ\n\n${c.brief.tensions.map((a) => `- ${a}`).join("\n")}`,
    c.brief.next_step && `## Next step\n\n${c.brief.next_step}`,
    `## Voices\n\n${c.voices.filter((v) => v.reply).map((v) => `**${v.label}:** ${v.reply}`).join("\n\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const note = writeNote({ folder: "Reflections", title: `Council: ${c.question.slice(0, 80)}`, tags: ["council"], evidence: "ai-inferred", body });
  db.prepare("UPDATE councils SET note_path = ? WHERE id = ?").run(note.path, id);
  return note.path;
}

interface RawCouncil {
  id: number;
  question: string;
  voices: string;
  brief: string;
  backend: string;
  note_path: string | null;
  created_at: string;
}

function toRecord(r: RawCouncil): CouncilRecord {
  const v = JSON.parse(r.voices) as { voices: CouncilVoice[]; citations: string[] };
  return { id: r.id, question: r.question, voices: v.voices, citations: v.citations, brief: JSON.parse(r.brief), backend: r.backend, note_path: r.note_path, created_at: r.created_at };
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 5) : []);
const errorText = (e: unknown) => (e instanceof Error ? e.message : "Unknown error");
