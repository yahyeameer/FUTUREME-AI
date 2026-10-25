import type { SimulatedPath, Situation } from "@/types";
import type { DecisionRequest, DecisionResult, Fact } from "./contract";
import { labelsOf } from "./request";
import { RANK_CRITERIA, changedFacts, checkAll, combine, needsJevAgain, optionIndex, type DecisionExtras, type JevScores, type OptionCheck } from "./rules";

// Helpers for showing a stored decision against the current "what if" values, in the browser. Nothing here calls a
// model: the rules re-run instantly, and Jev's stored answers are reused unless a fact they read has changed.

const factValue = (facts: Fact[], key: string) => facts.find((f) => f.key === key)?.value;

/** The starting point a decision was made for, read back from its facts. */
export function situationOf(req: DecisionRequest): Situation {
  const f = req.verifiedFacts;
  return {
    location: String(factValue(f, "situation.location") ?? ""),
    currency: String(factValue(f, "situation.currency") ?? "USD"),
    monthlyIncome: Number(factValue(f, "situation.monthlyIncome") ?? 0),
    savings: Number(factValue(f, "situation.savings") ?? 0),
    hoursPerWeek: Number(factValue(f, "situation.hoursPerWeek") ?? 10),
    dependents: Number(factValue(f, "situation.dependents") ?? 0),
    risk: (factValue(f, "situation.risk") as Situation["risk"]) ?? "medium",
  };
}

export function extrasOf(req: DecisionRequest): DecisionExtras {
  const f = req.verifiedFacts;
  const costs = factValue(f, "extras.monthlyCosts");
  return {
    monthlyCosts: typeof costs === "number" ? costs : null,
    allowDebt: factValue(f, "extras.allowDebt") === true,
    verifiedPrices: f
      .filter((x) => x.key.startsWith("cost.") && typeof x.value === "number")
      .map((x) => ({ optionId: x.key.slice(5), amount: x.value as number, currency: x.unit ?? "", sourceUrl: x.sourceUrl ?? "", retrievedAt: x.retrievedAt ?? "" })),
  };
}

export function storedJevScores(result: DecisionResult): JevScores | null {
  if (result.producer !== "jev") return null;
  const out: JevScores = {};
  for (const r of result.ranking)
    for (const s of r.scores)
      if (s.by === "jev") (out[r.optionId] ??= {})[s.criterionId] = { value: s.value, confidence: s.confidence ?? 0 };
  return out;
}

export interface Rejudged {
  /** Fact keys that differ from what the decision was made with. */
  changed: string[];
  checks: OptionCheck[];
  result: ReturnType<typeof combine>;
  /** Jev criteria or routes that would need Jev again to be trusted; empty when the rules' re-check is enough. */
  jevNeeded: { criteria: string[]; routes: string[] };
}

/** The decision re-run for new values: the rules in full, Jev's answers reused where they still apply. */
export function rejudge(req: DecisionRequest, result: DecisionResult, paths: SimulatedPath[], now: Situation, extras: DecisionExtras): Rejudged {
  const then = situationOf(req);
  const changed = changedFacts(then, now, extrasOf(req), extras);
  const checks = checkAll(paths, now, extras);
  const jev = storedJevScores(result);
  const rated = new Set(Object.keys(jev ?? {}));
  const jevNeeded = jev ? needsJevAgain(changed, RANK_CRITERIA, rated, checks.filter((c) => c.eligible).map((c) => c.optionId)) : { criteria: [], routes: [] };
  // Answers to a criterion whose inputs changed are dropped, not reused.
  const usable = jev && Object.fromEntries(Object.entries(jev).map(([id, byCrit]) => [id, Object.fromEntries(Object.entries(byCrit).filter(([c]) => !jevNeeded.criteria.includes(c)))]));
  const combined = combine({ decisionId: req.decisionId, checks, criteria: RANK_CRITERIA, jev: usable, pick: result.pick ?? null, missingBlocking: checks.flatMap((c) => c.missing), labels: labelsOf(req) });
  return { changed, checks, result: combined, jevNeeded };
}

/** What would change the outcome for a route: the thresholds at which its hard constraints flip, from the rules. */
export function triggersFor(p: SimulatedPath, check: OptionCheck, s: Situation, extras: DecisionExtras): string[] {
  const out: string[] = [];
  if (check.calc.need > 0 && p.cost.currency === s.currency) {
    const fromIncome = check.calc.available - s.savings;
    const floor = Math.max(0, check.calc.need - fromIncome);
    out.push(floor > 0 ? `Your savings fall below ${s.currency} ${floor.toLocaleString()}` : "The price turns out higher than your savings and spare income");
  }
  out.push(`You have fewer than ${p.hoursPerWeek} hours a week`);
  if (!p.keepsIncome && extras.monthlyCosts !== null && p.months.min > 0) {
    const max = Math.floor(Math.max(0, s.savings - check.calc.need) / p.months.min);
    out.push(`Your living costs rise above ${s.currency} ${max.toLocaleString()} a month`);
  }
  if (p.funding === "loan") out.push("You decide not to take on debt");
  return out;
}

export const routeOf = (paths: SimulatedPath[], id: string | null) => (id ? paths[optionIndex(id)] ?? null : null);
