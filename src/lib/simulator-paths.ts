import type { SimulatedPath } from "@/types";

// The Future Simulator's shape, shared by the server, the stand-in model and demo mode (no server imports here).
// Three routes to one goal, each a conditional scenario: "if you take this route and these assumptions hold".
// Nothing here predicts what will happen to the person.

/** Shown in the UI and sent in every prompt, so the framing can't drift between the two. */
export const SIMULATION_FRAMING =
  "These are conditional scenarios, not predictions. Each one says: if you take this route, and these assumptions hold, this is roughly how it could go. Nobody, including this app, can know which future you will have.";

/** What the model returns (snake_case, as the JSON schema asks). */
export interface RawPath {
  name: string;
  kind: string;
  summary: string;
  months_min: number;
  months_max: number;
  cost_min: number;
  cost_max: number;
  currency: string;
  cost_note: string;
  hours_per_week: number;
  prerequisites: string[];
  risks: { risk: string; mitigation: string }[];
  assumptions: string[];
  first_steps: string[];
  fit: string;
}

export interface RawSimulation {
  goal: string;
  paths: RawPath[];
  shared_unknowns: string[];
  how_to_choose: string;
}

export interface SimulationInput {
  goal: string;
  name?: string;
  current?: string;
  resources?: string;
  challenges?: string;
  /** Titles of notes the simulator read for this goal. */
  notes?: string[];
  /** The user's current role, from imported accounts. */
  role?: string | null;
}

const str = { type: "string" };
const strList = (max: number) => ({ type: "array", items: str, maxItems: max });
const int = (min: number, max: number) => ({ type: "integer", minimum: min, maximum: max });
const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });

export const SIMULATION_SCHEMA = {
  name: "future_simulation",
  schema: obj({
    goal: str,
    paths: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: obj({
        name: str,
        kind: { type: "string", enum: ["self_study", "formal_education", "work_and_study", "other"] },
        summary: str,
        months_min: int(1, 240),
        months_max: int(1, 240),
        cost_min: int(0, 10_000_000),
        cost_max: int(0, 10_000_000),
        currency: str,
        cost_note: str,
        hours_per_week: int(1, 80),
        prerequisites: strList(5),
        risks: { type: "array", maxItems: 4, items: obj({ risk: str, mitigation: str }) },
        assumptions: strList(5),
        first_steps: strList(3),
        fit: str,
      }),
    },
    shared_unknowns: strList(4),
    how_to_choose: str,
  }),
};

const text = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, max: number) => (Array.isArray(v) ? v.map((x) => text(x, 300)).filter(Boolean).slice(0, max) : []);
const num = (v: unknown, min: number, max: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : NaN;
  return Number.isFinite(n) ? Math.round(Math.min(max, Math.max(min, n))) : null;
};
const KINDS = new Set(["self_study", "formal_education", "work_and_study", "other"]);

/**
 * Checks and tidies a model reply. Returns null unless there are three distinct, usable paths, because a comparison
 * with fewer isn't the comparison the user asked for.
 */
export function normalizeSimulation(raw: unknown, goal: string): RawSimulation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Record<keyof RawSimulation, unknown>>;
  if (!Array.isArray(r.paths)) return null;
  const seen = new Set<string>();
  const paths: RawPath[] = [];
  for (const p of r.paths as Partial<Record<keyof RawPath, unknown>>[]) {
    if (!p || typeof p !== "object") continue;
    const name = text(p.name, 80);
    const summary = text(p.summary);
    const lo = num(p.months_min, 1, 240);
    const hi = num(p.months_max, 1, 240);
    if (!name || !summary || lo === null || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const cLo = num(p.cost_min, 0, 10_000_000) ?? 0;
    const cHi = num(p.cost_max, 0, 10_000_000) ?? cLo;
    const assumptions = list(p.assumptions, 5);
    paths.push({
      name,
      kind: KINDS.has(text(p.kind)) ? text(p.kind) : "other",
      summary,
      months_min: Math.min(lo, hi ?? lo),
      months_max: Math.max(lo, hi ?? lo),
      cost_min: Math.min(cLo, cHi),
      cost_max: Math.max(cLo, cHi),
      currency: text(p.currency, 8).toUpperCase() || "USD",
      cost_note: text(p.cost_note, 300),
      hours_per_week: num(p.hours_per_week, 1, 80) ?? 10,
      prerequisites: list(p.prerequisites, 5),
      risks: (Array.isArray(p.risks) ? p.risks : [])
        .map((x: unknown) => (x && typeof x === "object" ? { risk: text((x as { risk?: unknown }).risk, 300), mitigation: text((x as { mitigation?: unknown }).mitigation, 300) } : { risk: text(x, 300), mitigation: "" }))
        .filter((x) => x.risk)
        .slice(0, 4),
      // A scenario with no stated assumptions would read as a prediction, so it always names at least one.
      assumptions: assumptions.length ? assumptions : ["Your circumstances stay roughly as they are today."],
      first_steps: list(p.first_steps, 3),
      fit: text(p.fit),
    });
  }
  if (paths.length < 3) return null;
  return { goal: text(r.goal, 300) || goal, paths: paths.slice(0, 3), shared_unknowns: list(r.shared_unknowns, 4), how_to_choose: text(r.how_to_choose) };
}

export function toPaths(raw: RawPath[]): SimulatedPath[] {
  return raw.map((p) => ({
    name: p.name,
    kind: p.kind as SimulatedPath["kind"],
    summary: p.summary,
    months: { min: p.months_min, max: p.months_max },
    cost: { min: p.cost_min, max: p.cost_max, currency: p.currency, note: p.cost_note },
    hoursPerWeek: p.hours_per_week,
    prerequisites: p.prerequisites,
    risks: p.risks,
    assumptions: p.assumptions,
    firstSteps: p.first_steps,
    fit: p.fit,
  }));
}

/** "6–12 months", "2–3 years". */
export function formatSpan(m: { min: number; max: number }) {
  const unit = m.max >= 24 ? 12 : 1;
  const lo = Math.round((m.min / unit) * 10) / 10;
  const hi = Math.round((m.max / unit) * 10) / 10;
  const word = unit === 12 ? (hi === 1 ? "year" : "years") : hi === 1 ? "month" : "months";
  return lo === hi ? `${hi} ${word}` : `${lo}–${hi} ${word}`;
}

/** "Free", "USD 0–500", "USD 12k–40k". */
export function formatCost(c: { min: number; max: number; currency: string }) {
  if (c.max === 0) return "Free";
  const k = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));
  return c.min === c.max ? `${c.currency} ${k(c.max)}` : `${c.currency} ${k(c.min)}–${k(c.max)}`;
}

/**
 * A deterministic simulation for the stand-in model and demo mode: the same three archetypes for any goal, adjusted
 * with what the user shared. It is labelled as a template in the UI.
 */
export function standInSimulation(input: SimulationInput): RawSimulation {
  const goal = input.goal.trim().replace(/[.!?]+$/, "");
  const lower = goal.charAt(0).toLowerCase() + goal.slice(1);
  const challenge = input.challenges?.split(/[.;,]/)[0]?.trim();
  const note = input.notes?.[0];
  const grounded = (s: string) => [s, note ? `It builds on your note "${note}".` : "", input.role ? `It starts from where you are now (${input.role}).` : ""].filter(Boolean).join(" ");
  const challengeRisk = challenge ? [{ risk: `${challenge.charAt(0).toUpperCase()}${challenge.slice(1)} gets in the way, as you said it might`, mitigation: "Plan around it from week one instead of hoping it eases." }] : [];

  return {
    goal,
    paths: [
      {
        name: "Self-study route",
        kind: "self_study",
        summary: `Teach yourself the skills to ${lower} with free and low-cost courses, and prove them with public projects.`,
        months_min: 12,
        months_max: 24,
        cost_min: 0,
        cost_max: 1500,
        currency: "USD",
        cost_note: "Courses, books and some cloud credits; mostly your time.",
        hours_per_week: 12,
        prerequisites: ["A reliable computer and internet connection", "Comfort learning alone from documentation", input.current ? `Time alongside: ${input.current.slice(0, 80)}` : "Ten or more free hours a week"].filter(Boolean),
        risks: [{ risk: "No credential, so some employers screen you out", mitigation: "Let a portfolio of finished projects do the talking, and get referrals." }, { risk: "Losing momentum without deadlines", mitigation: "Join a study group and publish progress every two weeks." }, ...challengeRisk].slice(0, 4),
        assumptions: ["You can keep a steady 10–15 hours a week for at least a year", "Employers you target hire on demonstrated skill, not only degrees", "Free learning material stays available"],
        first_steps: ["Pick one structured free course and finish its first module", "Start a public project log", "Find one person already doing the work to ask for feedback"],
        fit: grounded(input.resources ? `Cheapest route, and it uses what you already have: ${input.resources.slice(0, 100)}.` : "The cheapest and most flexible route, if you are good at holding your own deadlines."),
      },
      {
        name: "University-focused route",
        kind: "formal_education",
        summary: `Enroll in a degree or accredited program that leads toward the goal to ${lower}, with structure, mentors and a credential.`,
        months_min: 24,
        months_max: 48,
        cost_min: 5000,
        cost_max: 60000,
        currency: "USD",
        cost_note: "Tuition varies widely by country and school; scholarships can bring it close to zero.",
        hours_per_week: 35,
        prerequisites: ["Meeting the program's entry requirements", "Funding: savings, a scholarship or a loan", "Being able to study close to full time"],
        risks: [{ risk: "Cost and debt if you don't finish", mitigation: "Apply for scholarships first and check the program's completion and placement rates." }, { risk: "Curriculum lags behind the field", mitigation: "Add one current side project each term." }, ...challengeRisk].slice(0, 4),
        assumptions: ["You are admitted to a program that teaches what the goal needs", "You can fund two to four years of study", "The credential is valued where you want to work"],
        first_steps: ["List three programs and their entry requirements", "Check scholarship deadlines for the next intake", "Ask a current student what the program is really like"],
        fit: grounded("The most structured route, with a credential at the end. It costs the most time and money up front."),
      },
      {
        name: "Work and study route",
        kind: "work_and_study",
        summary: `Take a paid role next to the field and study part time, moving step by step toward the goal to ${lower}.`,
        months_min: 18,
        months_max: 36,
        cost_min: 0,
        cost_max: 8000,
        currency: "USD",
        cost_note: "Part-time courses or certificates; an employer may pay for some of it, and you earn while you learn.",
        hours_per_week: 8,
        prerequisites: ["Finding a job in or near the field", "Energy for study after work", "An employer open to an internal move later"],
        risks: [{ risk: "Work crowds out study", mitigation: "Protect two fixed study slots a week and review them monthly." }, { risk: "Staying in the adjacent role longer than planned", mitigation: "Agree a timeline for the move with your manager." }, ...challengeRisk].slice(0, 4),
        assumptions: ["You can find a paid role close to the field", "You keep 6–10 hours a week for study on top of work", "Your employer, or the next one, values what you learn"],
        first_steps: ["List roles one step away from the goal that you could apply for now", "Ask whether your current or next employer funds courses", "Choose one part-time certificate to start"],
        fit: grounded("Lower financial risk because you keep an income. Slower, and it takes stamina."),
      },
    ],
    shared_unknowns: ["How the job market for this goal changes over the next few years", "How much time you can really give each week once life happens"],
    how_to_choose: "Compare which assumptions you're most confident hold for you. The route whose assumptions you can test cheapest this month is a good one to try first.",
  };
}
