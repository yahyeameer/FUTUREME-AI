import crypto from "node:crypto";
import type { SimulatedPath } from "@/types";
import { emptyMeta, type BranchResult, type DecisionMeta, type DecisionRequest, type DecisionResult } from "./contract";
import { askJev, JevError, scoreValue, USD_PER_INPUT_TOKEN, type AskOptions, type JevConfig, type JevQuestion, type JevResponse } from "./jev";
import { buildRouteRequest, evidenceOf, labelsOf, rulesOnlyResult, type RouteDecisionInput } from "./request";
import { HARD_CONSTRAINTS, RANK_CRITERIA, combine, optionIndex, type JevPick, type JevScores } from "./rules";

// Runs one decision: the rules first, then Jev on the routes that passed them, then the rules again on Jev's answers.
//   1. Hard constraints and calculations on every route (rules.ts). Routes that fail are never sent to Jev.
//   2. One Jev request per eligible route, with one Score question per criterion. TypeSafe's guidance: one narrow
//      judgment per question, combined in code, and only the fields the question needs in `state` (no numbers: Jev
//      isn't a calculator, so money and time stay with the rules).
//   3. One Choice request over the eligible routes, asked in the given order and in reverse, because Jev 1.13 leans
//      toward the first option. A pick that flips with the order is not trusted.
//   4. combine(): weights from code, confidence gating, high-impact review. If Jev fails, the result is "pending" with
//      the rules' order and no selection. It is never filled in by Nemotron.

/** At most this many routes are rated per decision, so one click can't fan out without limit. */
export const MAX_RATED = 12;
const CONCURRENCY = 4;

export type { RouteDecisionInput } from "./request";

const sha = (v: unknown) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 24);

/** Everything a decision reads. The same inputs and model give the same version, so the stored decision is reused. */
export function scenarioVersion(input: RouteDecisionInput, model: string): string {
  return sha({ s: input.simulationId, p: input.paths, sit: input.situation, x: input.extras, pr: input.profile, c: RANK_CRITERIA, h: HARD_CONSTRAINTS.map((h) => h.id), m: model });
}

/** What Jev sees about the person: only the text its criteria judge. No money, no identifiers. */
const personState = (input: RouteDecisionInput) => ({
  dream: input.profile.dream.slice(0, 400),
  values: input.profile.values.slice(0, 300) || "not stated",
  challenges: input.profile.challenges.slice(0, 400) || "not stated",
  location: input.situation.location || "not stated",
});

function routeState(p: SimulatedPath) {
  return {
    name: p.name,
    summary: p.summary,
    approach: p.kind.replace(/_/g, " "),
    funding: p.funding,
    where: p.place,
    keeps_income: p.keepsIncome,
    risk_level: p.riskLevel,
    prerequisites: p.prerequisites,
    risks: p.risks.map((r) => ({ risk: r.risk, mitigation: r.mitigation || "none given" })),
    assumptions: p.assumptions,
  };
}

export function criterionQuestions(): Record<string, JevQuestion> {
  return Object.fromEntries(RANK_CRITERIA.filter((c) => c.by === "jev").map((c) => [c.id, { type: "score", instructions: c.instructions!, criteria: c.levels! }]));
}

export function pickQuestions(ids: string[], paths: SimulatedPath[]): Record<string, JevQuestion> {
  const describe = (id: string) => `${paths[optionIndex(id)].name}: ${paths[optionIndex(id)].summary}`.slice(0, 300);
  const instructions = "Which route in `routes` best fits this person, given `person.values`, `person.dream` and `person.challenges`?";
  return {
    pick_forward: { type: "choice", instructions, criteria: Object.fromEntries(ids.map((id) => [id, describe(id)])) },
    pick_reverse: { type: "choice", instructions, criteria: Object.fromEntries([...ids].reverse().map((id) => [id, describe(id)])) },
  };
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

function metaOf(responses: JevResponse[], wallMs: number, error?: string): DecisionMeta {
  const models = [...new Set(responses.map((r) => r.model))];
  const inputTokens = responses.reduce((s, r) => s + r.usage.inputTokens, 0);
  return {
    model: models.join(", ") || null,
    latencyMs: wallMs,
    calls: responses.length,
    attempts: responses.reduce((s, r) => s + r.attempts, 0),
    inputTokens,
    outputTokens: responses.reduce((s, r) => s + r.usage.outputTokens, 0),
    costUsd: Math.round(inputTokens * USD_PER_INPUT_TOKEN * 1e8) / 1e8,
    evaluatedAt: new Date().toISOString(),
    ...(error ? { error } : {}),
  };
}

export async function evaluateRoutes(input: RouteDecisionInput, cfg: JevConfig, opts: AskOptions & { now?: Date } = {}): Promise<{ request: DecisionRequest; result: DecisionResult }> {
  const now = opts.now ?? new Date();
  const { request, checks } = buildRouteRequest(input, scenarioVersion(input, cfg.model), now);
  const blocking = request.missingInformation.filter((m) => m.blocks.length);
  const eligible = checks.filter((c) => c.eligible).map((c) => c.optionId).slice(0, MAX_RATED);
  const base = evidenceOf(request);

  const rulesOnly = (error?: string) => rulesOnlyResult(request, checks, error);
  // Nothing passed the rules: there's nothing for Jev to judge.
  if (!eligible.length) return { request, result: rulesOnly() };

  const started = Date.now();
  const person = personState(input);
  const questions = criterionQuestions();
  let responses: JevResponse[] = [];
  try {
    const rated = await pool(eligible, CONCURRENCY, async (id) => ({ id, res: await askJev(cfg, { person, route: routeState(input.paths[optionIndex(id)]) }, questions, opts) }));
    responses = rated.map((r) => r.res);
    let pick: JevPick | null = null;
    if (eligible.length > 1) {
      const routes = Object.fromEntries(eligible.map((id) => [id, { name: input.paths[optionIndex(id)].name, summary: input.paths[optionIndex(id)].summary }]));
      const res = await askJev(cfg, { person, routes }, pickQuestions(eligible, input.paths), opts);
      responses.push(res);
      const f = res.answers.pick_forward as Extract<JevResponse["answers"][string], { type: "choice" }>;
      const r = res.answers.pick_reverse as typeof f;
      pick = { forward: f.choice, reverse: r.choice, confidence: Math.min(f.confidence, r.confidence) };
    }
    const models = new Set(responses.map((r) => r.model));
    if (models.size > 1) throw new JevError("invalid_response", `Jev answered with more than one model (${[...models].join(", ")}).`);

    const jev: JevScores = {};
    for (const { id, res } of rated) {
      jev[id] = {};
      for (const c of RANK_CRITERIA.filter((x) => x.by === "jev")) {
        const a = res.answers[c.id] as Extract<JevResponse["answers"][string], { type: "score" }>;
        jev[id][c.id] = { value: Math.round(scoreValue(a, c.levels!.length) * 1000) / 1000, confidence: a.confidence };
      }
    }
    const r = combine({ decisionId: request.decisionId, checks, criteria: RANK_CRITERIA, jev, pick, missingBlocking: blocking, labels: labelsOf(request) });
    if (eligible.length < checks.filter((c) => c.eligible).length) r.reasons.push(`Only the first ${MAX_RATED} eligible routes were rated.`);
    return { request, result: { ...base, ...r, pick, validation: { ok: true, errors: [] }, meta: metaOf(responses, Date.now() - started) } };
  } catch (err) {
    const message = err instanceof JevError ? err.message : `Jev failed: ${(err as Error).message}`;
    const result = rulesOnly(message);
    result.validation = { ok: !(err instanceof JevError && err.kind === "invalid_response"), errors: [message] };
    result.meta = metaOf(responses, Date.now() - started, message);
    return { request, result };
  }
}

/** Both orders must agree with at least this confidence before a branch check counts as clear. */
const BRANCH_CONFIDENCE = 0.6;
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Evidence shorter than this isn't worth asking about. */
const MIN_EVIDENCE = 12;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/**
 * Checks one of a route's "Holds only if" assumptions against evidence the person supplied. Lazy (one click, one
 * assumption, one request) and one level deep: it can suggest switching to the next route, never generates new ones.
 */
export async function checkAssumption(
  cfg: JevConfig,
  input: { decisionId: string; optionId: string; assumption: string; evidence: string; source?: string | null; ranking: { optionId: string; eligible: boolean }[]; paths: SimulatedPath[] },
  opts: AskOptions = {},
): Promise<BranchResult> {
  const { decisionId, optionId: id, assumption } = input;
  const evidence = input.evidence.trim().slice(0, 2000);
  const base = { decisionId, optionId: id, assumption, switchTo: null as string | null };
  if (evidence.length < MIN_EVIDENCE) return { ...base, outcome: "no_evidence", producer: "rules", probability: null, relevance: null, reasons: ["Add what you found (a link, a quote or a result) before it can be checked."], meta: emptyMeta() };

  // One Choice, asked in both orders. In live tests a pair of yes/no questions ("does it show the assumption is
  // false?") read too literally and missed plain contradictions; the three-way Choice didn't.
  const VERDICTS = { supports: "The evidence shows the assumption is true", contradicts: "The evidence shows the assumption is false", silent: "The evidence does not say whether the assumption is true" };
  const instructions = "What does `evidence.text` say about `assumption`?";
  const questions: Record<string, JevQuestion> = {
    verdict_forward: { type: "choice", instructions, criteria: VERDICTS },
    verdict_reverse: { type: "choice", instructions, criteria: Object.fromEntries(Object.entries(VERDICTS).reverse()) },
  };
  const started = Date.now();
  try {
    const res = await askJev(cfg, { assumption, evidence: { text: evidence, source: input.source || "the person" } }, questions, opts);
    const f = res.answers.verdict_forward as Extract<JevResponse["answers"][string], { type: "choice" }>;
    const r = res.answers.verdict_reverse as typeof f;
    const relevance = round2(1 - f.probabilities.silent);
    const supports = round2(f.probabilities.supports);
    const agreed = f.choice === r.choice;
    const confident = Math.min(f.confidence, r.confidence) >= BRANCH_CONFIDENCE;
    let outcome: BranchResult["outcome"] = "unclear";
    const reasons: string[] = [];
    if (!agreed) reasons.push("Jev's reading changed with the order of the options, so it's yours to judge.");
    else if (!confident) reasons.push("Jev's reading of the evidence isn't clear either way, so it's yours to judge.");
    else if (f.choice === "silent") reasons.push("Jev doesn't think the evidence addresses this assumption.");
    else outcome = f.choice === "supports" ? "holds" : "fails";
    let switchTo: string | null = null;
    if (outcome === "fails") {
      const same = norm(assumption);
      switchTo = input.ranking.find((r) => r.eligible && r.optionId !== id && !input.paths[optionIndex(r.optionId)]?.assumptions.some((a) => norm(a) === same))?.optionId ?? null;
      reasons.push(switchTo ? `This route no longer holds up. The next route that doesn't rest on this assumption is "${input.paths[optionIndex(switchTo)].name}".` : "This route no longer holds up, and no other eligible route avoids this assumption.");
    }
    if (outcome === "holds") reasons.push("The evidence supports this assumption.");
    return { ...base, outcome, producer: "jev", probability: supports, relevance, switchTo, reasons, meta: metaOf([res], Date.now() - started) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Jev failed.";
    return { ...base, outcome: "unclear", producer: "rules", probability: null, relevance: null, reasons: [`Not checked: ${message}`], meta: { ...emptyMeta(message), latencyMs: Date.now() - started } };
  }
}

