import { parseJsonReply } from "./agents";
import { profileContext } from "./council";
import type { Db } from "./db";
import { getProfile } from "./futureme";
import { getProvider, type LlmProvider } from "./llm";
import { searchMemory } from "./memory";
import { SIMULATE_MARKER } from "./mock-llm";
import { SIMULATION_FRAMING, SIMULATION_SCHEMA, normalizeSimulation, type RawSimulation, type SimulationInput } from "./simulator-paths";
import { past } from "./social/persona";
import { PLATFORM_NAMES } from "./social/parse";
import { getPersona } from "./social/store";
import { writeNote } from "./vault";

// The Future Simulator: one goal, three clearly different routes, compared side by side. Nemotron plans it with
// reasoning on and a JSON schema, grounded in the profile, the notes that match the goal and the imported persona.
// Each route is a conditional scenario, never a forecast of the person's life. Nothing is saved to the vault unless the
// user asks.

export interface SimulationGrounding {
  profile: boolean;
  /** Vault paths of the notes the simulator read. */
  notes: string[];
  /** Platforms the persona came from. */
  social: string[];
}

export interface SimulationRecord {
  id: number;
  goal: string;
  result: RawSimulation;
  grounding: SimulationGrounding;
  backend: string;
  note_path: string | null;
  created_at: string;
}

export const SIMULATOR_INSTRUCTION = [
  "You are FutureMe's Future Simulator. The user names a goal; you lay out exactly three plausible, clearly different routes to it, so they can compare them side by side.",
  `Framing, which is not optional: ${SIMULATION_FRAMING}`,
  "So: write every route as a conditional (\"if you take this route and these assumptions hold\"). Never say what will happen to the user, never promise a job, income, admission or success, and give time and cost as honest ranges rather than single numbers.",
  "Make the three routes differ in approach, not just in pace. For a career or skill goal, use a self-study route, a formal education route (university or an accredited program) and a route that combines paid work with study, unless the goal clearly calls for other routes.",
  "For each route give: time in months (min and max), cost as a range in the currency that fits where the user lives (USD if unknown) with a short note on what drives it, weekly hours, prerequisites, up to four risks each with a mitigation, the assumptions the scenario depends on, up to three first steps for this month, and a short fit note on how it matches or strains what the user shared.",
  "Ground the routes in the user's profile, notes and accounts below. Quote a note's title when you lean on it. Don't invent facts about the user; when something important is missing, say in the assumptions what you assumed.",
  "End with what all three routes share as unknowns, and one or two sentences on how to choose between them by testing assumptions, not by trusting the forecast.",
].join("\n");

/** What the simulator knows about the user for this goal. */
export function simulationContext(db: Db, goal: string) {
  const profile = getProfile(db);
  if (!profile) throw new Error("Complete onboarding first.");
  const hits = searchMemory(db, `${goal} ${profile.dream}`, 5).filter((h) => h.note.folder !== "Conversations");
  const persona = getPersona(db);
  const lines = [profileContext(profile)];
  if (hits.length) lines.push("Notes from their vault:", ...hits.map((h) => `- "${h.note.title}" (${h.note.path}): ${h.note.body.replace(/\s+/g, " ").slice(0, 280)}`));
  if (persona) {
    lines.push(
      `From their imported ${persona.sources.map((s) => PLATFORM_NAMES[s]).join(", ")} accounts:`,
      ...[
        persona.headline && `- Headline: ${persona.headline}`,
        persona.now && `- Now: ${persona.now}`,
        past(persona).length > 0 && `- Before: ${past(persona).slice(0, 4).join("; ")}`,
        persona.education.length > 0 && `- Studied: ${persona.education.join("; ")}`,
        persona.skills.length > 0 && `- Skills: ${persona.skills.slice(0, 12).join(", ")}`,
        persona.location && `- Based in: ${persona.location}`,
      ].filter((l): l is string => !!l),
    );
  }
  const input: SimulationInput = {
    goal,
    name: profile.name,
    current: profile.current,
    resources: profile.resources,
    challenges: profile.challenges,
    notes: hits.map((h) => h.note.title),
    role: persona?.now ?? null,
  };
  const grounding: SimulationGrounding = { profile: true, notes: hits.map((h) => h.note.path), social: persona ? persona.sources.map((s) => PLATFORM_NAMES[s]) : [] };
  return { context: lines.join("\n"), input, grounding };
}

export async function simulatePaths(db: Db, rawGoal: string, provider: LlmProvider = getProvider()): Promise<SimulationRecord> {
  const goal = rawGoal.trim();
  if (goal.length < 5) throw new Error("Describe the goal in a few words.");
  if (goal.length > 300) throw new Error("Keep the goal under 300 characters.");
  const { context, input, grounding } = simulationContext(db, goal);

  const res = await provider.complete(
    [
      { role: "system", content: `${SIMULATOR_INSTRUCTION}\n\n${context}` },
      { role: "user", content: `${SIMULATE_MARKER} ${JSON.stringify(input)}` },
    ],
    undefined,
    { reasoning: "on", schema: SIMULATION_SCHEMA },
  );
  const result = normalizeSimulation(parseJsonReply(res.content ?? ""), goal);
  if (!result) throw new Error("The simulator didn't return three usable paths. Try again.");

  const info = db
    .prepare("INSERT INTO simulations (goal, result, grounding, backend) VALUES (?, ?, ?, ?)")
    .run(goal, JSON.stringify(result), JSON.stringify(grounding), provider.name);
  return getSimulation(db, Number(info.lastInsertRowid))!;
}

export function getSimulation(db: Db, id: number): SimulationRecord | null {
  const row = db.prepare("SELECT * FROM simulations WHERE id = ?").get(id) as RawRow | undefined;
  return row ? toRecord(row) : null;
}

export function listSimulations(db: Db, limit = 20): SimulationRecord[] {
  return (db.prepare("SELECT * FROM simulations ORDER BY id DESC LIMIT ?").all(limit) as RawRow[]).map(toRecord);
}

/** Saves the comparison to the vault, labelled as an AI interpretation and an imagined scenario. */
export function saveSimulation(db: Db, id: number): string {
  const s = getSimulation(db, id);
  if (!s) throw new Error(`No simulation #${id}.`);
  if (s.note_path) return s.note_path;
  const r = s.result;
  const body = [
    `**Goal:** ${r.goal}`,
    `> ${SIMULATION_FRAMING}`,
    ...r.paths.map((p) =>
      [
        `## ${p.name}`,
        p.summary,
        `- **Time:** ${p.months_min}–${p.months_max} months, about ${p.hours_per_week} hours a week`,
        `- **Cost:** ${p.currency} ${p.cost_min}–${p.cost_max}${p.cost_note ? ` (${p.cost_note})` : ""}`,
        p.prerequisites.length && `**Prerequisites**\n\n${p.prerequisites.map((x) => `- ${x}`).join("\n")}`,
        p.risks.length && `**Risks**\n\n${p.risks.map((x) => `- ${x.risk}${x.mitigation ? `: ${x.mitigation}` : ""}`).join("\n")}`,
        `**Holds only if**\n\n${p.assumptions.map((x) => `- ${x}`).join("\n")}`,
        p.first_steps.length && `**First steps**\n\n${p.first_steps.map((x) => `- ${x}`).join("\n")}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    ),
    r.shared_unknowns.length && `## Unknowns on every route\n\n${r.shared_unknowns.map((x) => `- ${x}`).join("\n")}`,
    r.how_to_choose && `## How to choose\n\n${r.how_to_choose}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const note = writeNote({ folder: "Reflections", title: `Simulation: ${r.goal.slice(0, 80)}`, tags: ["simulation", "imagined"], links: ["10-Year Dream"], evidence: "ai-inferred", body });
  db.prepare("UPDATE simulations SET note_path = ? WHERE id = ?").run(note.path, id);
  return note.path;
}

interface RawRow {
  id: number;
  goal: string;
  result: string;
  grounding: string;
  backend: string;
  note_path: string | null;
  created_at: string;
}

function toRecord(r: RawRow): SimulationRecord {
  return { id: r.id, goal: r.goal, result: JSON.parse(r.result), grounding: JSON.parse(r.grounding), backend: r.backend, note_path: r.note_path, created_at: r.created_at };
}
