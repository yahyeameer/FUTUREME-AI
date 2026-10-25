import type { SimulatedPath, Situation } from "@/types";

// The Future Simulator's shape, shared by the server, the stand-in model and demo mode (no server imports here).
// The model looks wide (many routes to one goal, mixing how you learn, how you pay and where), then every route is
// rated against the person's real starting point: where they live, income, savings, free hours, dependants and how
// much risk they can take. Each route is a conditional scenario: "if you take it and these assumptions hold".
// Nothing here predicts what will happen to the person.

/** Shown in the UI and sent in every prompt, so the framing can't drift between the two. */
export const SIMULATION_FRAMING =
  "These are conditional scenarios, not predictions. Each one says: if you take this route, and these assumptions hold, this is roughly how it could go. Nobody, including this app, can know which future you will have.";

export const MIN_PATHS = 3;
export const MAX_PATHS = 10;
/**
 * Output budget for one simulation, reasoning included. Nemotron can think for 5k+ tokens before writing ten roads,
 * and the server's default (8k) cut the JSON off mid-road.
 */
export const SIMULATION_MAX_TOKENS = 32_000;

export const KINDS = ["self_study", "formal_education", "work_and_study", "bootcamp", "apprenticeship", "other"] as const;
export const FUNDING = ["savings", "income", "employer", "scholarship", "loan", "free"] as const;
export const PLACES = ["local", "remote", "relocate"] as const;
export const RISK = ["low", "medium", "high"] as const;

/** What the model returns (snake_case, as the JSON schema asks). */
export interface RawPath {
  name: string;
  kind: string;
  funding: string;
  place: string;
  summary: string;
  months_min: number;
  months_max: number;
  cost_min: number;
  cost_max: number;
  currency: string;
  cost_note: string;
  hours_per_week: number;
  /** Whether the person can keep earning while on this route. */
  keeps_income: boolean;
  risk_level: string;
  /** The model's 0–100 view of how realistic this route is for this person where they live. */
  fit_score: number;
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
  situation?: Situation | null;
}

const str = { type: "string" };
const strList = (max: number) => ({ type: "array", items: str, maxItems: max });
const int = (min: number, max: number) => ({ type: "integer", minimum: min, maximum: max });
const oneOf = (values: readonly string[]) => ({ type: "string", enum: [...values] });
const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });

export const SIMULATION_SCHEMA = {
  name: "future_simulation",
  schema: obj({
    goal: str,
    paths: {
      type: "array",
      minItems: 6,
      maxItems: MAX_PATHS,
      items: obj({
        name: str,
        kind: oneOf(KINDS),
        funding: oneOf(FUNDING),
        place: oneOf(PLACES),
        summary: str,
        months_min: int(1, 240),
        months_max: int(1, 240),
        cost_min: int(0, 100_000_000),
        cost_max: int(0, 100_000_000),
        currency: str,
        cost_note: str,
        hours_per_week: int(1, 80),
        keeps_income: { type: "boolean" },
        risk_level: oneOf(RISK),
        fit_score: int(0, 100),
        prerequisites: strList(4),
        risks: { type: "array", maxItems: 3, items: obj({ risk: str, mitigation: str }) },
        assumptions: strList(4),
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
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(text(v) as T) ? (text(v) as T) : fallback);

/**
 * Checks and tidies a model reply. Returns null unless there are at least three distinct, usable routes, because a
 * comparison with fewer isn't the comparison the user asked for.
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
    const cLo = num(p.cost_min, 0, 100_000_000) ?? 0;
    const cHi = num(p.cost_max, 0, 100_000_000) ?? cLo;
    const kind = pick(p.kind, KINDS, "other");
    const assumptions = list(p.assumptions, 5);
    paths.push({
      name,
      kind,
      funding: pick(p.funding, FUNDING, "savings"),
      place: pick(p.place, PLACES, "local"),
      summary,
      months_min: Math.min(lo, hi ?? lo),
      months_max: Math.max(lo, hi ?? lo),
      cost_min: Math.min(cLo, cHi),
      cost_max: Math.max(cLo, cHi),
      currency: text(p.currency, 8).toUpperCase() || "USD",
      cost_note: text(p.cost_note, 300),
      hours_per_week: num(p.hours_per_week, 1, 80) ?? 10,
      keeps_income: typeof p.keeps_income === "boolean" ? p.keeps_income : kind !== "formal_education",
      risk_level: pick(p.risk_level, RISK, "medium"),
      fit_score: num(p.fit_score, 0, 100) ?? 50,
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
  if (paths.length < MIN_PATHS) return null;
  return { goal: text(r.goal, 300) || goal, paths: paths.slice(0, MAX_PATHS), shared_unknowns: list(r.shared_unknowns, 4), how_to_choose: text(r.how_to_choose) };
}

export function toPaths(raw: RawPath[]): SimulatedPath[] {
  return raw.map((p) => ({
    name: p.name,
    kind: pick(p.kind, KINDS, "other"),
    funding: pick(p.funding, FUNDING, "savings"),
    place: pick(p.place, PLACES, "local"),
    summary: p.summary,
    months: { min: p.months_min, max: p.months_max },
    cost: { min: p.cost_min, max: p.cost_max, currency: p.currency, note: p.cost_note },
    hoursPerWeek: p.hours_per_week,
    keepsIncome: p.keeps_income ?? p.kind !== "formal_education",
    riskLevel: pick(p.risk_level, RISK, "medium"),
    fitScore: p.fit_score ?? 50,
    prerequisites: p.prerequisites,
    risks: p.risks,
    assumptions: p.assumptions,
    firstSteps: p.first_steps,
    fit: p.fit,
  }));
}

/** Tidies a starting point from a form or a request; null when nothing usable was given. */
export function normalizeSituation(raw: unknown): Situation | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<Record<keyof Situation, unknown>>;
  return {
    location: text(s.location, 120),
    currency: (text(s.currency, 8).toUpperCase().replace(/[^A-Z]/g, "") || "USD").slice(0, 3),
    monthlyIncome: num(s.monthlyIncome, 0, 100_000_000) ?? 0,
    savings: num(s.savings, 0, 1_000_000_000) ?? 0,
    hoursPerWeek: num(s.hoursPerWeek, 1, 80) ?? 10,
    dependents: num(s.dependents, 0, 20) ?? 0,
    risk: pick(s.risk, RISK, "medium"),
  };
}

export interface Assessment {
  /** 0–100: how well the route fits this starting point. Recomputed whenever the starting point changes. */
  score: number;
  budget: { ok: boolean; comparable: boolean; shortfall: number; available: number };
  hours: { ok: boolean; gap: number };
  risk: { ok: boolean };
  /** Plain-language reasons the route ranks lower, empty when nothing gets in the way. */
  concerns: string[];
}

/** Share of income a person can put toward the goal while keeping their job. */
const INCOME_SHARE = 0.25;

/**
 * Rates one route against a starting point. Deterministic, so the "what if" sliders can re-rate every route in the
 * browser without asking the model again. The model's own fit score (what's realistic where they live) is one input.
 */
export function assessPath(p: SimulatedPath, s: Situation | null): Assessment {
  if (!s) return { score: p.fitScore, budget: { ok: true, comparable: false, shortfall: 0, available: 0 }, hours: { ok: true, gap: 0 }, risk: { ok: true }, concerns: [] };
  const months = (p.months.min + p.months.max) / 2;
  const need = (p.cost.min + p.cost.max) / 2;
  const comparable = p.cost.currency === s.currency;
  const available = Math.round(s.savings + (p.keepsIncome ? s.monthlyIncome * INCOME_SHARE * months : 0));
  const afford = !comparable || need <= available ? 1 : available / need;
  const hoursFit = p.hoursPerWeek <= s.hoursPerWeek ? 1 : s.hoursPerWeek / p.hoursPerWeek;
  const over = RISK.indexOf(p.riskLevel) - RISK.indexOf(s.risk);
  const riskFit = over <= 0 ? 1 : over === 1 ? 0.7 : 0.4;
  // Dropping your income is harder when other people rely on it.
  const dependants = s.dependents > 0 && !p.keepsIncome ? 0.75 : 1;
  const score = Math.round(100 * (0.35 * afford + 0.25 * hoursFit + 0.15 * riskFit + 0.25 * (p.fitScore / 100)) * dependants);

  const shortfall = comparable ? Math.max(0, Math.round(need - available)) : 0;
  const gap = Math.max(0, p.hoursPerWeek - s.hoursPerWeek);
  const concerns = [
    shortfall > 0 && `About ${money(shortfall, s.currency)} more than your savings${p.keepsIncome ? " and spare income" : ""} cover`,
    !comparable && p.cost.max > 0 && `Costs are in ${p.cost.currency}, so they aren't checked against your ${s.currency} savings`,
    gap > 0 && `Needs about ${gap} more hours a week than you have`,
    over > 0 && `Riskier than you said you can take`,
    dependants < 1 && `You'd stop earning while ${s.dependents === 1 ? "someone relies" : `${s.dependents} people rely`} on your income`,
    p.fitScore < 40 && `Hard to do from where you are, by the simulator's reading`,
  ].filter((c): c is string => !!c);
  return { score, budget: { ok: shortfall === 0, comparable, shortfall, available }, hours: { ok: gap === 0, gap }, risk: { ok: over <= 0 }, concerns };
}

/** Route indexes, best fit first. Ties keep the model's order. */
export function rankPaths(paths: SimulatedPath[], s: Situation | null): { index: number; assessment: Assessment }[] {
  return paths.map((p, index) => ({ index, assessment: assessPath(p, s) })).sort((a, b) => b.assessment.score - a.assessment.score || a.index - b.index);
}

const k = (n: number) => (n >= 1_000_000 ? `${Math.round(n / 100_000) / 10}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));
export const money = (n: number, currency: string) => `${currency} ${k(n)}`;

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
  return c.min === c.max ? money(c.max, c.currency) : `${c.currency} ${k(c.min)}–${k(c.max)}`;
}

export const KIND_LABEL: Record<SimulatedPath["kind"], string> = {
  self_study: "Self-study",
  formal_education: "Formal education",
  work_and_study: "Work and study",
  bootcamp: "Bootcamp",
  apprenticeship: "Apprenticeship",
  other: "Another route",
};
export const FUNDING_LABEL: Record<SimulatedPath["funding"], string> = {
  savings: "Paid from savings",
  income: "Paid from income",
  employer: "Employer pays",
  scholarship: "Scholarship",
  loan: "Loan",
  free: "Free",
};
export const PLACE_LABEL: Record<SimulatedPath["place"], string> = { local: "Where you live", remote: "Remote", relocate: "Move away" };

type Archetype = Omit<RawPath, "currency" | "fit"> & { fit: string };

/**
 * A deterministic simulation for the stand-in model and demo mode: the same archetypes for any goal, mixing how you
 * learn, how you pay and where, adjusted with what the user shared. It is labelled as a template in the UI.
 */
export function standInSimulation(input: SimulationInput): RawSimulation {
  const goal = input.goal.trim().replace(/[.!?]+$/, "");
  const lower = goal.charAt(0).toLowerCase() + goal.slice(1);
  const s = input.situation;
  const currency = s?.currency || "USD";
  // Template costs are in USD; a rough multiplier keeps them in the person's currency without pretending precision.
  const rate = currency === "USD" ? 1 : (RATES[currency] ?? 1);
  const challenge = input.challenges?.split(/[.;,]/)[0]?.trim();
  const note = input.notes?.[0];
  const where = s?.location ? ` in ${s.location}` : "";
  const grounded = (line: string) => [line, note ? `It builds on your note "${note}".` : "", input.role ? `It starts from where you are now (${input.role}).` : ""].filter(Boolean).join(" ");
  const challengeRisk = challenge ? [{ risk: `${challenge.charAt(0).toUpperCase()}${challenge.slice(1)} gets in the way, as you said it might`, mitigation: "Plan around it from week one instead of hoping it eases." }] : [];

  const base: Archetype[] = [
    {
      name: "Self-study route",
      kind: "self_study",
      funding: "savings",
      place: "local",
      summary: `Teach yourself the skills to ${lower} with free and low-cost courses, and prove them with public projects.`,
      months_min: 12,
      months_max: 24,
      cost_min: 0,
      cost_max: 1500,
      cost_note: "Courses, books and some cloud credits; mostly your time.",
      hours_per_week: 12,
      keeps_income: true,
      risk_level: "medium",
      fit_score: 70,
      prerequisites: ["A reliable computer and internet connection", "Comfort learning alone from documentation", input.current ? `Time alongside: ${input.current.slice(0, 80)}` : "Ten or more free hours a week"],
      risks: [{ risk: "No credential, so some employers screen you out", mitigation: "Let a portfolio of finished projects do the talking, and get referrals." }, { risk: "Losing momentum without deadlines", mitigation: "Join a study group and publish progress every two weeks." }, ...challengeRisk],
      assumptions: ["You can keep a steady 10–15 hours a week for at least a year", "Employers you target hire on demonstrated skill, not only degrees", "Free learning material stays available"],
      first_steps: ["Pick one structured free course and finish its first module", "Start a public project log", "Find one person already doing the work to ask for feedback"],
      fit: input.resources ? `Cheapest route, and it uses what you already have: ${input.resources.slice(0, 100)}.` : "The cheapest and most flexible route, if you are good at holding your own deadlines.",
    },
    {
      name: "University-focused route",
      kind: "formal_education",
      funding: "savings",
      place: "local",
      summary: `Enroll full time in a degree or accredited program${where} that leads toward the goal to ${lower}, with structure, mentors and a credential.`,
      months_min: 24,
      months_max: 48,
      cost_min: 5000,
      cost_max: 60000,
      cost_note: "Tuition varies widely by country and school; scholarships can bring it close to zero.",
      hours_per_week: 35,
      keeps_income: false,
      risk_level: "medium",
      fit_score: 60,
      prerequisites: ["Meeting the program's entry requirements", "Funding: savings, a scholarship or a loan", "Being able to study close to full time"],
      risks: [{ risk: "Cost and debt if you don't finish", mitigation: "Apply for scholarships first and check the program's completion and placement rates." }, { risk: "Curriculum lags behind the field", mitigation: "Add one current side project each term." }, ...challengeRisk],
      assumptions: ["You are admitted to a program that teaches what the goal needs", "You can fund two to four years of study", "The credential is valued where you want to work"],
      first_steps: ["List three programs and their entry requirements", "Check scholarship deadlines for the next intake", "Ask a current student what the program is really like"],
      fit: "The most structured route, with a credential at the end. It costs the most time and money up front.",
    },
    {
      name: "Work and study route",
      kind: "work_and_study",
      funding: "income",
      place: "local",
      summary: `Take a paid role next to the field and study part time, moving step by step toward the goal to ${lower}.`,
      months_min: 18,
      months_max: 36,
      cost_min: 0,
      cost_max: 8000,
      cost_note: "Part-time courses or certificates; an employer may pay for some of it, and you earn while you learn.",
      hours_per_week: 8,
      keeps_income: true,
      risk_level: "low",
      fit_score: 70,
      prerequisites: ["Finding a job in or near the field", "Energy for study after work", "An employer open to an internal move later"],
      risks: [{ risk: "Work crowds out study", mitigation: "Protect two fixed study slots a week and review them monthly." }, { risk: "Staying in the adjacent role longer than planned", mitigation: "Agree a timeline for the move with your manager." }, ...challengeRisk],
      assumptions: ["You can find a paid role close to the field", "You keep 6–10 hours a week for study on top of work", "Your employer, or the next one, values what you learn"],
      first_steps: ["List roles one step away from the goal that you could apply for now", "Ask whether your current or next employer funds courses", "Choose one part-time certificate to start"],
      fit: "Lower financial risk because you keep an income. Slower, and it takes stamina.",
    },
    {
      name: "Scholarship-funded degree",
      kind: "formal_education",
      funding: "scholarship",
      place: "relocate",
      summary: `Win a funded place abroad that covers tuition and living costs, and study toward the goal to ${lower} full time.`,
      months_min: 24,
      months_max: 42,
      cost_min: 500,
      cost_max: 5000,
      cost_note: "Application fees, tests, visas and travel; the scholarship covers the rest if you win it.",
      hours_per_week: 40,
      keeps_income: false,
      risk_level: "high",
      fit_score: 45,
      prerequisites: ["Strong grades or test scores", "A year to prepare applications", "Being free to move abroad for a few years"],
      risks: [{ risk: "Most applicants aren't selected", mitigation: "Apply to several programs and keep a second route running meanwhile." }, { risk: "Leaving family and work behind", mitigation: "Agree a plan with the people it affects before applying." }],
      assumptions: ["You win a fully funded place", "You can move abroad for two or more years", "Visa rules allow you to study and later work"],
      first_steps: ["List five fully funded programs and their deadlines", "Ask a past winner to read your draft essay", "Book the language or entry test if one is needed"],
      fit: "Low cost if it works, but the outcome depends on selection, so it pairs well with a cheaper route running alongside.",
    },
    {
      name: "Intensive bootcamp",
      kind: "bootcamp",
      funding: "savings",
      place: "remote",
      summary: `Spend three to six months in an intensive online bootcamp, then build projects and job-hunt toward the goal to ${lower}.`,
      months_min: 6,
      months_max: 12,
      cost_min: 2000,
      cost_max: 15000,
      cost_note: "Fees vary; some bootcamps offer income-share deals or partial scholarships.",
      hours_per_week: 40,
      keeps_income: false,
      risk_level: "high",
      fit_score: 50,
      prerequisites: ["Basic programming already in place", "Savings to live on for the full-time months", "A strong internet connection for live classes"],
      risks: [{ risk: "Paying for a program that doesn't lead to work", mitigation: "Ask for verified graduate outcomes before paying." }, { risk: "Burning out at full-time pace", mitigation: "Plan rest days and a buffer month." }],
      assumptions: ["You can stop working for a few months", "The bootcamp's graduates do get hired in the roles you want", "You arrive with the basics it expects"],
      first_steps: ["Finish one free intro course to check the pace suits you", "Compare three bootcamps' verified outcomes", "Work out how many months your savings cover"],
      fit: "The fastest route, and the one that leans hardest on savings and a break from work.",
    },
    {
      name: "Apprenticeship or paid traineeship",
      kind: "apprenticeship",
      funding: "employer",
      place: "local",
      summary: `Join a company that trains you on the job, earning while you learn the skills to ${lower}.`,
      months_min: 12,
      months_max: 30,
      cost_min: 0,
      cost_max: 500,
      cost_note: "Usually paid; costs are travel and equipment.",
      hours_per_week: 40,
      keeps_income: true,
      risk_level: "low",
      fit_score: 45,
      prerequisites: ["Programs like this existing where you live, or remotely", "Passing the company's selection", "Full-time availability"],
      risks: [{ risk: "Few places, many applicants", mitigation: "Apply widely and ask local tech companies directly." }, { risk: "Training narrower than the full goal", mitigation: "Add one self-study project outside work." }],
      assumptions: ["A company near you or online offers paid training in this field", "You can work full time", "The training leads to a real role at the end"],
      first_steps: ["Search for traineeships and graduate programs in your area", "Ask three local companies whether they train juniors", "Prepare a one-page portfolio to send with applications"],
      fit: "Earn from day one with structure, if such programs exist where you live.",
    },
    {
      name: "Freelance and learn by doing",
      kind: "other",
      funding: "income",
      place: "remote",
      summary: `Take small paid projects online next to the field and grow toward the goal to ${lower} through real client work.`,
      months_min: 12,
      months_max: 36,
      cost_min: 0,
      cost_max: 1000,
      cost_note: "Platform fees and tools; income can offset them early.",
      hours_per_week: 15,
      keeps_income: true,
      risk_level: "medium",
      fit_score: 55,
      prerequisites: ["One sellable skill to start with", "Being able to receive international payments", "Comfort finding clients"],
      risks: [{ risk: "Irregular income", mitigation: "Keep a base job or savings buffer for the first months." }, { risk: "Getting stuck in small, simple jobs", mitigation: "Raise the difficulty of one project each quarter." }],
      assumptions: ["You can get paid from abroad where you live", "There is demand for your starting skill online", "Client work gets steadily closer to the goal"],
      first_steps: ["Write down one service you could sell today", "Set up a payment method that works where you live", "Land one small paid project this month"],
      fit: "Builds experience and income at once; it needs a skill to sell from the start.",
    },
    {
      name: "Remote job abroad, then move up",
      kind: "work_and_study",
      funding: "income",
      place: "relocate",
      summary: `Move to a bigger job market for a role near the field, then grow into the goal to ${lower} there.`,
      months_min: 18,
      months_max: 48,
      cost_min: 2000,
      cost_max: 12000,
      cost_note: "Visa, travel and the first months of rent before your salary starts.",
      hours_per_week: 10,
      keeps_income: true,
      risk_level: "high",
      fit_score: 35,
      prerequisites: ["A job offer or visa route", "Savings to cover the move", "Being free to relocate"],
      risks: [{ risk: "Visa or job falls through", mitigation: "Don't resign until the offer and visa are confirmed." }, { risk: "Higher living costs eat the gains", mitigation: "Compare salary against rent before accepting." }],
      assumptions: ["You can get a work visa", "Employers there hire people at your level", "You and your family can move"],
      first_steps: ["List countries with visa routes for this field", "Apply to five roles that sponsor visas", "Count what the first three months would cost"],
      fit: "Opens the biggest job markets, at the highest cost to uproot.",
    },
  ];

  return {
    goal,
    paths: base.map((p) => ({
      ...p,
      cost_min: Math.round(p.cost_min * rate),
      cost_max: Math.round(p.cost_max * rate),
      currency,
      risks: p.risks.slice(0, 4),
      prerequisites: p.prerequisites.slice(0, 5),
      fit: grounded(p.fit),
    })),
    shared_unknowns: ["How the job market for this goal changes over the next few years", "How much time you can really give each week once life happens"],
    how_to_choose: "Compare which assumptions you're most confident hold for you. The route whose assumptions you can test cheapest this month is a good one to try first, and a second route can run alongside it.",
  };
}

/** Rough USD rates for the template only; the real model prices routes in the person's currency itself. */
const RATES: Record<string, number> = { EUR: 0.9, GBP: 0.8, KES: 130, ETB: 120, SOS: 570, NGN: 1500, INR: 85, PKR: 280, AED: 3.7, SAR: 3.75, TRY: 35, ZAR: 18, CAD: 1.4 };
