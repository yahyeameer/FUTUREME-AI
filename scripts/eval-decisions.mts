// Runs the decision evaluation set (eval/decision-set.ts) through three arms and prints a comparison:
//   A  baseline        the existing deterministic ranking (rankPaths) top pick. It never abstains.
//   B  nemotron+rules  Nemotron picks a route (or abstains), then the hard constraints filter its ranking.
//   C  nemotron+rules+jev  the decision layer: rules first, Jev on the eligible routes, combine() in code.
// Needs NEBIUS_API_KEY / NEBIUS_MODEL for B and TYPESAFE_API_KEY for C. Calls real, paid endpoints.
//   npx tsx --env-file-if-exists=.env.local scripts/eval-decisions.mts [--runs 2] [--out eval/results/latest.json]
import fs from "node:fs";
import path from "node:path";
import { EVAL_SET, type EvalScenario } from "../eval/decision-set";
import { evaluateRoutes } from "../src/lib/decision/evaluate";
import { jevConfig } from "../src/lib/decision/jev";
import { checkAll, optionId } from "../src/lib/decision/rules";
import { getProvider } from "../src/lib/llm";
import { rankPaths } from "../src/lib/simulator-paths";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const RUNS = Number(arg("runs", "1"));
const OUT = arg("out", "eval/results/latest.json");
process.env.JEV_LOG ??= "off";

interface Outcome {
  arm: string;
  scenario: string;
  run: number;
  /** "r<index>" or "abstain"; "error" when the arm couldn't answer. */
  answer: string;
  review?: boolean;
  /** Nemotron's own pick before the rules filtered it (arm B). */
  raw?: string;
  latencyMs: number;
  tokens: { input: number; output: number };
  costUsd: number | null;
  error?: string;
}

const eligibleIds = (s: EvalScenario) => new Set(checkAll(s.routes, s.situation, s.extras).filter((c) => c.eligible).map((c) => c.optionId));

function baseline(s: EvalScenario): Outcome {
  const t = Date.now();
  const top = rankPaths(s.routes, s.situation)[0];
  return { arm: "A baseline", scenario: s.id, run: 0, answer: optionId(top.index), latencyMs: Date.now() - t, tokens: { input: 0, output: 0 }, costUsd: 0 };
}

const PICK_SCHEMA = {
  name: "route_pick",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["ranking", "pick", "reason"],
    properties: {
      ranking: { type: "array", items: { type: "string" }, description: "Route ids, best first. Leave out routes the person can't safely take." },
      pick: { type: "string", description: "The route id to recommend, or \"abstain\" if none is safe to recommend." },
      reason: { type: "string" },
    },
  },
};

async function nemotronRules(s: EvalScenario, run: number): Promise<Outcome> {
  const t = Date.now();
  const routes = s.routes.map((p, i) => ({ id: optionId(i), ...p }));
  const content = [
    "You help a person choose a learning route. Recommend the route that best fits them, or abstain.",
    "Hard rules: the route must be affordable from their savings (plus 25% of income while they keep working), fit their weekly hours, not exceed their risk tolerance, not use a loan unless they agreed to debt, and if it stops their income their savings must cover living costs for its duration. If a rule can't be checked (unknown costs, a different currency), treat the route as unsafe. If no route is safe, pick \"abstain\".",
    `Situation: ${JSON.stringify(s.situation)}`,
    `Monthly living costs: ${s.extras.monthlyCosts ?? "unknown"}. Agreed to take on debt: ${s.extras.allowDebt}.`,
    `Profile: ${JSON.stringify(s.profile)}`,
    `Routes: ${JSON.stringify(routes)}`,
  ].join("\n\n");
  try {
    const res = await getProvider().complete([{ role: "user", content }], undefined, { reasoning: "on", schema: PICK_SCHEMA });
    const parsed = JSON.parse(res.content ?? "{}") as { ranking?: string[]; pick?: string };
    const raw = parsed.pick ?? "error";
    const ok = eligibleIds(s);
    // The deterministic filter: Nemotron's pick stands only if it passes the rules; otherwise its next eligible route.
    const answer = raw === "abstain" ? "abstain" : ok.has(raw) ? raw : ([...(parsed.ranking ?? [])].find((id) => ok.has(id)) ?? "abstain");
    return { arm: "B nemotron+rules", scenario: s.id, run, answer, raw, latencyMs: Date.now() - t, tokens: { input: res.usage?.prompt ?? 0, output: res.usage?.completion ?? 0 }, costUsd: null };
  } catch (err) {
    return { arm: "B nemotron+rules", scenario: s.id, run, answer: "error", latencyMs: Date.now() - t, tokens: { input: 0, output: 0 }, costUsd: null, error: (err as Error).message };
  }
}

async function withJev(s: EvalScenario, run: number): Promise<Outcome> {
  const t = Date.now();
  const cfg = jevConfig();
  const { result } = await evaluateRoutes({ simulationId: 0, goal: s.profile.dream, paths: s.routes, situation: s.situation, original: s.situation, extras: s.extras, profile: s.profile, memory: [] }, cfg);
  const answer = result.status === "abstained" ? "abstain" : result.status === "pending" ? "error" : (result.selectedOptionId ?? "abstain");
  return { arm: "C nemotron+rules+jev", scenario: s.id, run, answer, review: result.status === "needs_review", latencyMs: Date.now() - t, tokens: { input: result.meta.inputTokens, output: result.meta.outputTokens }, costUsd: result.meta.costUsd, error: result.meta.error };
}

function summarise(arm: string, rows: Outcome[]) {
  const label = (id: string) => EVAL_SET.find((s) => s.id === id)!;
  const n = rows.length;
  const correct = rows.filter((r) => r.answer === label(r.scenario).label).length;
  const picks = rows.filter((r) => r.answer.startsWith("r"));
  const violations = picks.filter((r) => !eligibleIds(label(r.scenario)).has(r.answer)).length;
  const rawViolations = rows.filter((r) => r.raw?.startsWith("r") && !eligibleIds(label(r.scenario)).has(r.raw)).length;
  const unsupported = picks.filter((r) => label(r.scenario).label === "abstain").length;
  const shouldAbstain = rows.filter((r) => label(r.scenario).label === "abstain");
  const abstained = rows.filter((r) => r.answer === "abstain");
  const lat = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
  return {
    arm,
    n,
    accuracy: +(correct / n).toFixed(3),
    accuracyOnPickScenarios: +(rows.filter((r) => label(r.scenario).label !== "abstain" && r.answer === label(r.scenario).label).length / Math.max(1, rows.filter((r) => label(r.scenario).label !== "abstain").length)).toFixed(3),
    constraintViolations: violations,
    ...(arm.startsWith("B") ? { nemotronRawViolations: rawViolations } : {}),
    unsupportedDecisions: unsupported,
    abstainRecall: `${shouldAbstain.filter((r) => r.answer === "abstain").length}/${shouldAbstain.length}`,
    wrongAbstains: abstained.filter((r) => label(r.scenario).label !== "abstain").length,
    errors: rows.filter((r) => r.answer === "error").length,
    needsReviewRate: arm.startsWith("C") ? +(rows.filter((r) => r.review).length / n).toFixed(3) : null,
    latencyMs: { median: lat[Math.floor(n / 2)], p95: lat[Math.min(n - 1, Math.floor(n * 0.95))] },
    tokensPerDecision: { input: Math.round(rows.reduce((s, r) => s + r.tokens.input, 0) / n), output: Math.round(rows.reduce((s, r) => s + r.tokens.output, 0) / n) },
    costUsdTotal: rows.every((r) => r.costUsd !== null) ? +rows.reduce((s, r) => s + (r.costUsd ?? 0), 0).toFixed(6) : null,
  };
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } }));
  return out;
}

const jobs = Array.from({ length: RUNS }, (_, run) => EVAL_SET.map((s) => ({ s, run }))).flat();
const A = EVAL_SET.map(baseline);
const B = await pool(jobs, 4, ({ s, run }) => nemotronRules(s, run));
// Jev arm runs one scenario at a time so its latency is per decision, not inflated by our own concurrency.
const C = await pool(jobs, 1, ({ s, run }) => withJev(s, run));

const summary = [summarise("A baseline", A), summarise("B nemotron+rules", B), summarise("C nemotron+rules+jev", C)];
const perScenario = EVAL_SET.map((s) => ({
  id: s.id,
  label: s.label,
  A: A.find((r) => r.scenario === s.id)!.answer,
  B: B.filter((r) => r.scenario === s.id).map((r) => (r.raw && r.raw !== r.answer ? `${r.answer} (nemotron: ${r.raw})` : r.answer)),
  C: C.filter((r) => r.scenario === s.id).map((r) => `${r.answer}${r.review ? " [review]" : ""}`),
}));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ ranAt: new Date().toISOString(), runs: RUNS, nemotron: process.env.NEBIUS_MODEL, jev: jevConfig().model, summary, perScenario, rows: [...A, ...B, ...C] }, null, 2));
console.table(summary.map(({ latencyMs, tokensPerDecision, ...s }) => ({ ...s, latencyMedian: latencyMs.median, latencyP95: latencyMs.p95, inTok: tokensPerDecision.input, outTok: tokensPerDecision.output })));
console.table(perScenario.map((p) => ({ ...p, B: p.B.join(" | "), C: p.C.join(" | ") })));
console.log(`Wrote ${OUT}`);
