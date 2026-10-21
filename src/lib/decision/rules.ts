import { assessPath, money } from "@/lib/simulator-paths";
import type { SimulatedPath, Situation } from "@/types";
import type {
  CandidateOption,
  ConstraintCheck,
  CriterionScore,
  DecisionCriterion,
  DecisionResult,
  DecisionStatus,
  Fact,
  HardConstraint,
  MissingInfo,
  RankedOption,
} from "./contract";

// The deterministic half of the decision layer. Every number, every budget and every hard constraint is computed here,
// in plain code, and nothing a model says can override it. Pure and shared with the browser, so the "what if" sliders
// re-check every route instantly without calling Jev.

/** What the person adds on top of the simulator's starting point, only for decisions. */
export interface DecisionExtras {
  /** Monthly living costs. Needed to check routes that stop your income; unknown blocks those routes. */
  monthlyCosts: number | null;
  /** Taking on debt is never assumed. A route funded by a loan fails until the person says yes. */
  allowDebt: boolean;
  /** Prices the person looked up, with where and when. They replace the model's estimate for that route. */
  verifiedPrices: VerifiedPrice[];
}

export interface VerifiedPrice {
  optionId: string;
  amount: number;
  currency: string;
  sourceUrl: string;
  /** ISO date the price was read. */
  retrievedAt: string;
}

export const NO_EXTRAS: DecisionExtras = { monthlyCosts: null, allowDebt: false, verifiedPrices: [] };

/** A looked-up price older than this is treated as unknown, so the estimate is used and the person is told. */
export const STALE_AFTER_DAYS = 90;
/** Notes older than this are still read as context, but flagged as possibly outdated. */
export const NOTE_STALE_AFTER_DAYS = 365;

// Thresholds for a "decided" result. Conservative starting points from TypeSafe's confidence guidance; not tuned on
// real outcomes yet (see docs/decision-layer.md).
export const THRESHOLDS = {
  /** Mean Jev confidence over the selected route's criteria. */
  criterionConfidence: 0.4,
  /** The selected route must beat the runner-up's composite by this much. */
  margin: 0.04,
};

export const optionId = (index: number) => `r${index}`;
export const optionIndex = (id: string) => Number(id.slice(1));

export const HARD_CONSTRAINTS: HardConstraint[] = [
  { id: "budget", label: "Fits your savings and spare income", dependsOn: ["situation.savings", "situation.monthlyIncome", "situation.currency", "cost"] },
  { id: "hours", label: "Fits the hours you have", dependsOn: ["situation.hoursPerWeek"] },
  { id: "risk", label: "Within the risk you can take", dependsOn: ["situation.risk"] },
  { id: "debt", label: "No debt unless you agreed to it", dependsOn: ["extras.allowDebt"] },
  { id: "runway", label: "Savings cover living costs while income stops", dependsOn: ["situation.savings", "extras.monthlyCosts", "cost"] },
];

/** The criteria every route ranking uses. Jev's are asked as Score questions, worst level first. */
export const RANK_CRITERIA: DecisionCriterion[] = [
  {
    id: "situation_fit",
    label: "Fit with your money, time and risk (calculated)",
    by: "rules",
    weight: 0.4,
    dependsOn: ["situation.savings", "situation.monthlyIncome", "situation.hoursPerWeek", "situation.dependents", "situation.risk", "cost"],
  },
  {
    id: "values_fit",
    label: "Matches what you said matters to you",
    by: "jev",
    weight: 0.2,
    instructions: "How well does `route` match what `person.values` and `person.dream` say matters to this person?",
    levels: ["Works against what they value", "Unrelated to what they value", "Matches part of what they value", "Matches what they value closely"],
    dependsOn: ["profile.values", "profile.dream"],
  },
  {
    id: "challenge_fit",
    label: "Works around the challenges you named",
    by: "jev",
    weight: 0.2,
    instructions: "Does `route` work around the challenges listed in `person.challenges`, or would those challenges get in its way?",
    levels: ["The challenges would likely stop this route", "The challenges would get in the way", "The route mostly works around the challenges", "The route works around the challenges"],
    dependsOn: ["profile.challenges", "situation.location"],
  },
  {
    id: "risk_handling",
    label: "Risks have realistic mitigations",
    by: "jev",
    weight: 0.2,
    instructions: "Do the risks in `route.risks` each have a concrete mitigation this person could act on?",
    levels: ["Risks have no real mitigation", "Some risks are mitigated", "Most risks have concrete mitigations", "Every risk has a concrete mitigation"],
    dependsOn: [],
  },
];

const days = (iso: string, now: Date) => (now.getTime() - new Date(iso).getTime()) / 86_400_000;

/** The price the rules use for a route: a fresh verified price beats the model's estimate. */
export function effectiveCost(p: SimulatedPath, id: string, extras: DecisionExtras, now = new Date()) {
  const v = extras.verifiedPrices.find((x) => x.optionId === id);
  const notes: string[] = [];
  if (v) {
    const valid = Number.isFinite(v.amount) && v.amount >= 0 && !Number.isNaN(new Date(v.retrievedAt).getTime());
    const stale = valid && days(v.retrievedAt, now) > STALE_AFTER_DAYS;
    if (valid && !stale) {
      if (v.currency === p.cost.currency && (v.amount < p.cost.min || v.amount > p.cost.max)) {
        notes.push(`The price you found (${money(v.amount, v.currency)}) is outside the simulator's estimate (${money(p.cost.min, p.cost.currency)}–${money(p.cost.max, p.cost.currency)}). Using yours.`);
      }
      return { min: v.amount, max: v.amount, currency: v.currency, note: p.cost.note, provenance: "verified" as const, notes };
    }
    notes.push(stale ? `The price you found was read over ${STALE_AFTER_DAYS} days ago, so the estimate is used until you check it again.` : "The price you found couldn't be read, so the estimate is used.");
  }
  return { ...p.cost, provenance: "estimate" as const, notes };
}

export interface OptionCheck {
  optionId: string;
  eligible: boolean;
  checks: ConstraintCheck[];
  highImpact: string[];
  missing: MissingInfo[];
  /** Calculated values, shown to the person and stored with the decision. */
  calc: { need: number; available: number; shortfall: number; hoursGap: number; runwayMonths: number | null; costProvenance: "verified" | "estimate"; notes: string[] };
  /** The rules' situation fit, 0–1. */
  fit: number;
}

/** Runs every hard constraint on one route. A check that can't be run is null, and the route is not eligible. */
export function checkOption(p: SimulatedPath, index: number, s: Situation, extras: DecisionExtras, now = new Date()): OptionCheck {
  const id = optionId(index);
  const cost = effectiveCost(p, id, extras, now);
  const priced: SimulatedPath = { ...p, cost: { min: cost.min, max: cost.max, currency: cost.currency, note: cost.note } };
  const a = assessPath(priced, s);
  const need = Math.round((cost.min + cost.max) / 2);
  const checks: ConstraintCheck[] = [];
  const missing: MissingInfo[] = [];

  if (!a.budget.comparable && cost.max > 0) {
    checks.push({ constraintId: "budget", ok: null, detail: `Priced in ${cost.currency}, so it can't be checked against your ${s.currency} savings.` });
    missing.push({ key: `cost.${id}`, label: `The price of "${p.name}" in ${s.currency}`, blocks: [id] });
  } else {
    checks.push({
      constraintId: "budget",
      ok: a.budget.ok,
      detail: a.budget.ok ? `About ${money(need, s.currency)} needed; about ${money(a.budget.available, s.currency)} available.` : `About ${money(a.budget.shortfall, s.currency)} short.`,
    });
  }

  checks.push({ constraintId: "hours", ok: a.hours.ok, detail: a.hours.ok ? `${p.hoursPerWeek} of your ${s.hoursPerWeek} hours a week.` : `Needs ${a.hours.gap} more hours a week than you have.` });
  checks.push({ constraintId: "risk", ok: a.risk.ok, detail: a.risk.ok ? `${p.riskLevel} risk; you said you can take ${s.risk}.` : `${p.riskLevel} risk; you said you can take ${s.risk}.` });
  checks.push({
    constraintId: "debt",
    ok: p.funding !== "loan" || extras.allowDebt,
    detail: p.funding !== "loan" ? "No loan needed." : extras.allowDebt ? "Needs a loan; you said you'd consider one." : "Needs a loan, and you haven't said you'd take on debt.",
  });

  let runwayMonths: number | null = null;
  if (p.keepsIncome) checks.push({ constraintId: "runway", ok: true, detail: "You keep earning on this route." });
  else if (extras.monthlyCosts === null) {
    checks.push({ constraintId: "runway", ok: null, detail: "Your income stops on this route, and your monthly living costs aren't known." });
    missing.push({ key: "extras.monthlyCosts", label: "Your monthly living costs", blocks: [id] });
  } else {
    const left = s.savings - (a.budget.comparable ? need : 0);
    runwayMonths = extras.monthlyCosts <= 0 ? Infinity : Math.max(0, left) / extras.monthlyCosts;
    const ok = runwayMonths >= p.months.min;
    checks.push({
      constraintId: "runway",
      ok,
      detail: ok
        ? `After costs, savings cover about ${Number.isFinite(runwayMonths) ? Math.floor(runwayMonths) : "unlimited"} months of living costs; the route takes ${p.months.min}+.`
        : `After costs, savings cover about ${Math.floor(runwayMonths)} months of living costs, but the route takes at least ${p.months.min}.`,
    });
  }

  const highImpact = [
    p.funding === "loan" && "debt",
    p.place === "relocate" && "migration",
    s.dependents > 0 && !p.keepsIncome && "dependants",
  ].filter((x): x is string => !!x);

  return {
    optionId: id,
    eligible: checks.every((c) => c.ok === true),
    checks,
    highImpact,
    missing,
    calc: { need, available: a.budget.available, shortfall: a.budget.shortfall, hoursGap: a.hours.gap, runwayMonths: runwayMonths === Infinity ? null : runwayMonths, costProvenance: cost.provenance, notes: cost.notes },
    fit: a.score / 100,
  };
}

export function checkAll(paths: SimulatedPath[], s: Situation, extras: DecisionExtras, now = new Date()) {
  return paths.map((p, i) => checkOption(p, i, s, extras, now));
}

/** What the route looks like to the decision layer. Money is shown as the effective price, with its provenance. */
export function toCandidate(p: SimulatedPath, index: number, extras: DecisionExtras, now = new Date()): CandidateOption {
  const cost = effectiveCost(p, optionId(index), extras, now);
  return {
    id: optionId(index),
    label: p.name,
    summary: p.summary,
    attributes: {
      kind: p.kind,
      funding: p.funding,
      place: p.place,
      months_min: p.months.min,
      months_max: p.months.max,
      cost_min: cost.min,
      cost_max: cost.max,
      currency: cost.currency,
      cost_provenance: cost.provenance,
      hours_per_week: p.hoursPerWeek,
      keeps_income: p.keepsIncome,
      risk_level: p.riskLevel,
    },
    assumptions: p.assumptions,
    risks: p.risks.map((r) => (r.mitigation ? `${r.risk}. Mitigation: ${r.mitigation}` : r.risk)),
  };
}

/** The starting point as facts with provenance. Values the person moved with "what if" are marked as estimates. */
export function situationFacts(s: Situation, original: Situation | null, extras: DecisionExtras, now = new Date()): Fact[] {
  const prov = (k: keyof Situation) => (original && original[k] !== s[k] ? "estimate" : "user") as Fact["provenance"];
  const facts: Fact[] = [
    { key: "situation.location", label: "Where you live", value: s.location || null, provenance: s.location ? prov("location") : "unknown" },
    { key: "situation.currency", label: "Currency", value: s.currency, provenance: prov("currency") },
    { key: "situation.monthlyIncome", label: "Monthly income", value: s.monthlyIncome, unit: s.currency, provenance: prov("monthlyIncome") },
    { key: "situation.savings", label: "Savings", value: s.savings, unit: s.currency, provenance: prov("savings") },
    { key: "situation.hoursPerWeek", label: "Hours a week", value: s.hoursPerWeek, unit: "h", provenance: prov("hoursPerWeek") },
    { key: "situation.dependents", label: "People relying on your income", value: s.dependents, provenance: prov("dependents") },
    { key: "situation.risk", label: "Risk you can take", value: s.risk, provenance: prov("risk") },
    { key: "extras.monthlyCosts", label: "Monthly living costs", value: extras.monthlyCosts, unit: s.currency, provenance: extras.monthlyCosts === null ? "unknown" : "user" },
    { key: "extras.allowDebt", label: "Open to taking on debt", value: extras.allowDebt, provenance: "user" },
  ];
  for (const v of extras.verifiedPrices) {
    const stale = days(v.retrievedAt, now) > STALE_AFTER_DAYS;
    facts.push({ key: `cost.${v.optionId}`, label: `Price you found for route ${v.optionId}`, value: v.amount, unit: v.currency, provenance: "verified", sourceUrl: v.sourceUrl, retrievedAt: v.retrievedAt, stale });
  }
  return facts;
}

/** Jev's validated answers for one route: criterion id → { value 0–1, confidence }. */
export type JevScores = Record<string, Record<string, { value: number; confidence: number }>>;

export interface JevPick {
  /** The route Jev chose with the options in their given order, and in reverse. */
  forward: string;
  reverse: string;
  confidence: number;
}

/**
 * Combines the rules and Jev's answers into a ranking and a status. Pure: the browser calls it again after a what-if
 * change, reusing Jev's stored answers, as long as none of the facts those answers read has changed.
 */
export function combine(input: {
  decisionId: string;
  checks: OptionCheck[];
  criteria: DecisionCriterion[];
  jev: JevScores | null;
  pick: JevPick | null;
  missingBlocking: MissingInfo[];
  /** Route names for the reasons shown to the person; ids are used when missing. */
  labels?: Record<string, string>;
}): Pick<DecisionResult, "status" | "producer" | "selectedOptionId" | "ranking" | "confidence" | "orderConsistent" | "reasons"> {
  const { checks, criteria, jev, pick } = input;
  const name = (id: string) => input.labels?.[id] ?? id;
  const ranking: RankedOption[] = checks.map((c) => {
    const scores: CriterionScore[] = [];
    for (const cr of criteria) {
      if (cr.by === "rules") scores.push({ criterionId: cr.id, by: "rules", value: c.fit, confidence: null });
      else {
        const a = jev?.[c.optionId]?.[cr.id];
        if (a) scores.push({ criterionId: cr.id, by: "jev", value: a.value, confidence: a.confidence });
      }
    }
    const complete = scores.length === criteria.length;
    const composite = c.eligible && complete ? round(criteria.reduce((sum, cr) => sum + cr.weight * scores.find((s) => s.criterionId === cr.id)!.value, 0)) : null;
    return { optionId: c.optionId, eligible: c.eligible, checks: c.checks, composite, scores };
  });
  // Eligible routes first, best composite first; routes Jev didn't rate keep the rules' order behind them.
  ranking.sort((a, b) => Number(b.eligible) - Number(a.eligible) || (b.composite ?? -1) - (a.composite ?? -1) || fitOf(checks, b) - fitOf(checks, a));

  const eligible = ranking.filter((r) => r.eligible);
  const reasons: string[] = [];
  if (!eligible.length) {
    const blocked = input.missingBlocking.length > 0;
    reasons.push(blocked ? "No route can be checked fully until the missing information below is added." : "No route passes every hard constraint for this starting point.");
    return { status: "abstained", producer: "rules", selectedOptionId: null, ranking, confidence: null, orderConsistent: null, reasons };
  }
  if (!jev) {
    reasons.push("Jev wasn't asked, so this is only the rules' order. Nothing is recommended yet.");
    return { status: "pending", producer: "rules", selectedOptionId: null, ranking, confidence: null, orderConsistent: null, reasons };
  }
  const rated = eligible.filter((r) => r.composite !== null);
  if (!rated.length) {
    reasons.push("Jev's answers didn't cover the routes that passed the rules.");
    return { status: "pending", producer: "rules", selectedOptionId: null, ranking, confidence: null, orderConsistent: null, reasons };
  }

  const top = rated[0];
  const second = rated[1];
  const jevScores = top.scores.filter((s) => s.by === "jev");
  const meanConfidence = jevScores.length ? round(jevScores.reduce((s, x) => s + (x.confidence ?? 0), 0) / jevScores.length) : 0;
  const orderConsistent = pick ? pick.forward === pick.reverse : null;
  let status: DecisionStatus = "decided";
  const review = (why: string) => {
    status = "needs_review";
    reasons.push(why);
  };
  if (rated.length < eligible.length) review("Some routes that passed the rules weren't rated by Jev.");
  if (meanConfidence < THRESHOLDS.criterionConfidence) review(`Jev wasn't sure about this route's criteria (confidence ${meanConfidence.toFixed(2)}).`);
  if (second && top.composite! - second.composite! < THRESHOLDS.margin) review(`It's close: "${name(top.optionId)}" and "${name(second.optionId)}" score within ${THRESHOLDS.margin} of each other.`);
  if (pick && !orderConsistent) review("Jev picked a different route when the options were listed in reverse, so its pick isn't stable.");
  if (pick && orderConsistent && pick.forward !== top.optionId) review("Jev's direct pick differs from the route its criterion scores favour.");
  const impact = checks.find((c) => c.optionId === top.optionId)?.highImpact ?? [];
  if (impact.length) review(`This route involves ${impact.join(", ")}, so it needs your decision, not the app's.`);
  if (status === "decided") reasons.push("Passed every hard constraint, and Jev's answers were confident and consistent.");
  return { status, producer: "jev", selectedOptionId: top.optionId, ranking, confidence: meanConfidence, orderConsistent, reasons };
}

const fitOf = (checks: OptionCheck[], r: RankedOption) => checks.find((c) => c.optionId === r.optionId)?.fit ?? 0;
const round = (n: number) => Math.round(n * 1000) / 1000;

/** Which facts differ between two starting points, as fact keys. */
export function changedFacts(a: Situation, b: Situation, ea: DecisionExtras, eb: DecisionExtras): string[] {
  const keys = (Object.keys(a) as (keyof Situation)[]).filter((k) => a[k] !== b[k]).map((k) => `situation.${k}`);
  if (ea.monthlyCosts !== eb.monthlyCosts) keys.push("extras.monthlyCosts");
  if (ea.allowDebt !== eb.allowDebt) keys.push("extras.allowDebt");
  if (JSON.stringify(ea.verifiedPrices) !== JSON.stringify(eb.verifiedPrices)) keys.push("cost");
  return keys;
}

/**
 * After a change: which Jev criteria have to be asked again. Rules criteria and constraints are always recomputed in
 * code; Jev is only needed when a fact one of its criteria reads changed, or a route became eligible that it never rated.
 */
export function needsJevAgain(changed: string[], criteria: DecisionCriterion[], ratedIds: Set<string>, nowEligible: string[]): { criteria: string[]; routes: string[] } {
  const touched = criteria.filter((c) => c.by === "jev" && c.dependsOn.some((d) => changed.some((k) => k === d || k.startsWith(`${d}.`) || d.startsWith(`${k}.`)))).map((c) => c.id);
  return { criteria: touched, routes: nowEligible.filter((id) => !ratedIds.has(id)) };
}

