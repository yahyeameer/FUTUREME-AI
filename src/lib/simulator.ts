import { parseJsonReply } from "./agents";
import { profileContext } from "./council";
import { getChosenRoad, setChosenRoad, withChosenRoad, type ChosenRoadRecord } from "./chosen-road";
import type { Db } from "./db";
import { getProfile } from "./futureme";
import { getProvider, type LlmProvider } from "./llm";
import { searchMemory } from "./memory";
import { SIMULATE_MARKER } from "./mock-llm";
import {
  FUNDING_LABEL,
  KIND_LABEL,
  MAX_PATHS,
  PLACE_LABEL,
  SIMULATION_FRAMING,
  SIMULATION_SCHEMA,
  formatCost,
  formatSpan,
  money,
  normalizeSimulation,
  normalizeSituation,
  rankPaths,
  toPaths,
  type RawSimulation,
  type SimulationInput,
} from "./simulator-paths";
import { past } from "./social/persona";
import { PLATFORM_NAMES } from "./social/parse";
import { getPersona } from "./social/store";
import { writeNote } from "./vault";
import type { Situation } from "@/types";

// The Future Simulator: one goal, many clearly different routes, rated against the person's real starting point
// (where they live, income, savings, free hours, dependants, risk) so the best fits can be compared side by side.
// Nemotron looks wide with reasoning on and a JSON schema, grounded in the profile, the notes that match the goal and
// the imported persona; the rating itself is deterministic (simulator-paths.ts), so the page can re-rate as the user
// changes their situation. Each route is a conditional scenario, never a forecast of the person's life. Nothing is
// saved to the vault unless the user asks.

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
  situation: Situation | null;
  grounding: SimulationGrounding;
  backend: string;
  note_path: string | null;
  created_at: string;
}

export const SIMULATOR_INSTRUCTION = [
  `You are FutureMe's Future Simulator. The user names a goal; you look wide and lay out between 6 and ${MAX_PATHS} plausible, clearly different routes to it. The app rates every route against the user's starting point and shows the best fits side by side, with the rest listed.`,
  `Framing, which is not optional: ${SIMULATION_FRAMING}`,
  "So: write every route as a conditional (\"if you take this route and these assumptions hold\"). Never say what will happen to the user, never promise a job, income, admission or success, and give time and cost as honest ranges rather than single numbers.",
  "Cover the space of routes, not three variations of one. Mix how they learn (self-study, formal education such as university or an accredited program, bootcamp, apprenticeship, paid work combined with study, other), how it is paid for (savings, income, employer, scholarship, loan, free) and where (where they live, remote, moving away). For a career or skill goal always include a self-study route, a formal education route and a route that combines paid work with study. Include routes that fit a tight budget or little time, not only ideal ones.",
  "Be realistic about where they live: what programs, employers, remote work, payments and visas are actually open to someone there. Price every route in the user's currency when one is given (USD otherwise), as honest ranges, with a short note on what drives the cost.",
  "For each route give: time in months (min and max), cost range, weekly hours, whether they can keep earning on it (keeps_income), its risk level, fit_score (0-100, how realistic this route is for this person where they live, before money and time, which the app checks itself), prerequisites, up to four risks each with a mitigation, the assumptions the scenario depends on, up to three first steps for this month, and a short fit note on how it matches or strains what the user shared.",
  "Ground the routes in the user's profile, notes and accounts below. Quote a note's title when you lean on it. Don't invent facts about the user; when something important is missing, say in the assumptions what you assumed.",
  "End with what all the routes share as unknowns, and one or two sentences on how to choose between them by testing assumptions, not by trusting the forecast.",
].join("\n");

/** What the simulator knows about the user for this goal. */
export function simulationContext(db: Db, goal: string, situation: Situation | null = null) {
  const profile = getProfile(db);
  if (!profile) throw new Error("Complete onboarding first.");
  const hits = searchMemory(db, `${goal} ${profile.dream}`, 5).filter((h) => h.note.folder !== "Conversations");
  const persona = getPersona(db);
  const lines = [withChosenRoad(db, profileContext(profile))];
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
  if (situation) {
    lines.push(
      "Their starting point, as they gave it:",
      ...[
        situation.location && `- Lives in: ${situation.location}`,
        `- Currency: ${situation.currency}`,
        `- Monthly income: ${money(situation.monthlyIncome, situation.currency)}`,
        `- Savings: ${money(situation.savings, situation.currency)}`,
        `- Hours a week for this goal: ${situation.hoursPerWeek}`,
        `- People who rely on their income: ${situation.dependents}`,
        `- Risk they can take: ${situation.risk}`,
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
    situation,
  };
  const grounding: SimulationGrounding = { profile: true, notes: hits.map((h) => h.note.path), social: persona ? persona.sources.map((s) => PLATFORM_NAMES[s]) : [] };
  return { context: lines.join("\n"), input, grounding };
}

export async function simulatePaths(db: Db, rawGoal: string, rawSituation: unknown = null, provider: LlmProvider = getProvider()): Promise<SimulationRecord> {
  const goal = rawGoal.trim();
  if (goal.length < 5) throw new Error("Describe the goal in a few words.");
  if (goal.length > 300) throw new Error("Keep the goal under 300 characters.");
  const situation = normalizeSituation(rawSituation);
  const { context, input, grounding } = simulationContext(db, goal, situation);

  const res = await provider.complete(
    [
      { role: "system", content: `${SIMULATOR_INSTRUCTION}\n\n${context}` },
      { role: "user", content: `${SIMULATE_MARKER} ${JSON.stringify(input)}` },
    ],
    undefined,
    { reasoning: "on", schema: SIMULATION_SCHEMA },
  );
  const result = normalizeSimulation(parseJsonReply(res.content ?? ""), goal);
  if (!result) throw new Error("The simulator didn't return at least three usable routes. Try again.");

  const info = db
    .prepare("INSERT INTO simulations (goal, result, situation, grounding, backend) VALUES (?, ?, ?, ?, ?)")
    .run(goal, JSON.stringify(result), situation ? JSON.stringify(situation) : null, JSON.stringify(grounding), provider.name);
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
  const sit = s.situation;
  const paths = toPaths(r.paths);
  const body = [
    `**Goal:** ${r.goal}`,
    `> ${SIMULATION_FRAMING}`,
    sit &&
      `## Starting point\n\n${[sit.location && `- Lives in ${sit.location}`, `- Income ${money(sit.monthlyIncome, sit.currency)} a month, savings ${money(sit.savings, sit.currency)}`, `- ${sit.hoursPerWeek} hours a week, ${sit.dependents} relying on the income, ${sit.risk} risk`].filter(Boolean).join("\n")}`,
    ...rankPaths(paths, sit).map(({ index, assessment: a }, rank) => {
      const p = paths[index];
      return [
        `## ${rank + 1}. ${p.name}${sit ? ` (fit ${a.score}/100)` : ""}`,
        `*${KIND_LABEL[p.kind]} · ${FUNDING_LABEL[p.funding]} · ${PLACE_LABEL[p.place]}*`,
        p.summary,
        `- **Time:** ${formatSpan(p.months)}, about ${p.hoursPerWeek} hours a week`,
        `- **Cost:** ${formatCost(p.cost)}${p.cost.note ? ` (${p.cost.note})` : ""}`,
        a.concerns.length && `**What gets in the way**\n\n${a.concerns.map((x) => `- ${x}`).join("\n")}`,
        p.prerequisites.length && `**Prerequisites**\n\n${p.prerequisites.map((x) => `- ${x}`).join("\n")}`,
        p.risks.length && `**Risks**\n\n${p.risks.map((x) => `- ${x.risk}${x.mitigation ? `: ${x.mitigation}` : ""}`).join("\n")}`,
        `**Holds only if**\n\n${p.assumptions.map((x) => `- ${x}`).join("\n")}`,
        p.firstSteps.length && `**First steps**\n\n${p.firstSteps.map((x) => `- ${x}`).join("\n")}`,
      ]
        .filter(Boolean)
        .join("\n\n");
    }),
    r.shared_unknowns.length && `## Unknowns on every route\n\n${r.shared_unknowns.map((x) => `- ${x}`).join("\n")}`,
    r.how_to_choose && `## How to choose\n\n${r.how_to_choose}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const note = writeNote({ folder: "Reflections", title: `Simulation: ${r.goal.slice(0, 80)}`, tags: ["simulation", "imagined"], links: ["10-Year Dream"], evidence: "ai-inferred", body });
  db.prepare("UPDATE simulations SET note_path = ? WHERE id = ?").run(note.path, id);
  return note.path;
}

/**
 * Records the road the user picked (by its index in the simulation's model order) so every agent reasons with it, and
 * writes it to the vault as one "Chosen road" note in Goals. Choosing again replaces it.
 */
export function chooseRoad(db: Db, simulationId: number, index: number): ChosenRoadRecord {
  const s = getSimulation(db, simulationId);
  if (!s) throw new Error(`No simulation #${simulationId}.`);
  const path = s.result.paths[index];
  if (!Number.isInteger(index) || !path) throw new Error("That road isn't in this simulation.");
  const [p] = toPaths([path]);
  const note = writeNote({
    folder: "Goals",
    title: "Chosen road",
    tags: ["chosen-road", "simulation"],
    links: ["10-Year Dream"],
    evidence: "user-stated",
    body: [
      `I chose this road in the Future Simulator for **${s.goal}**: **${p.name}**.`,
      `> ${SIMULATION_FRAMING}`,
      p.summary,
      `- **Time:** ${formatSpan(p.months)}, about ${p.hoursPerWeek} hours a week`,
      `- **Cost:** ${formatCost(p.cost)}`,
      `## Holds only if\n\n${p.assumptions.map((x) => `- ${x}`).join("\n")}`,
      p.firstSteps.length && `## First steps\n\n${p.firstSteps.map((x) => `- ${x}`).join("\n")}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  const record: ChosenRoadRecord = { simulationId, index, goal: s.goal, path, situation: s.situation, notePath: note.path, chosenAt: new Date().toISOString() };
  setChosenRoad(db, record);
  return record;
}

/** Forgets the chosen road. The vault note stays, so the user decides whether to delete it. */
export function clearRoad(db: Db) {
  if (getChosenRoad(db)) setChosenRoad(db, null);
}

interface RawRow {
  id: number;
  goal: string;
  result: string;
  situation: string | null;
  grounding: string;
  backend: string;
  note_path: string | null;
  created_at: string;
}

function toRecord(r: RawRow): SimulationRecord {
  return { id: r.id, goal: r.goal, result: JSON.parse(r.result), situation: r.situation ? JSON.parse(r.situation) : null, grounding: JSON.parse(r.grounding), backend: r.backend, note_path: r.note_path, created_at: r.created_at };
}
