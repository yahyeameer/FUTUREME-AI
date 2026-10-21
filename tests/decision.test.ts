import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SimulatedPath, Situation } from "../src/types";

vi.mock("server-only", () => ({}));

const { openDb } = await import("../src/lib/db");
const { saveProfile } = await import("../src/lib/futureme");
const { mockProvider } = await import("../src/lib/mock-llm");
const { simulatePaths } = await import("../src/lib/simulator");
const { writeNote } = await import("../src/lib/vault");
const { getChosenRoad } = await import("../src/lib/chosen-road");
const { askJev, validateJevResponse, JevError, jevConfig, saveJevKey, jevStatus, DEFAULT_JEV_MODEL } = await import("../src/lib/decision/jev");
const { evaluateRoutes, checkAssumption, scenarioVersion, pickQuestions } = await import("../src/lib/decision/evaluate");
const { buildRouteRequest } = await import("../src/lib/decision/request");
const rules = await import("../src/lib/decision/rules");
const store = await import("../src/lib/decision/store");

type JevConfig = ReturnType<typeof jevConfig>;
type Question = { type: string; instructions: string; criteria?: unknown };

const cfg = (over: Partial<JevConfig> = {}): JevConfig => ({ apiKey: "test-key", keySource: "env", baseUrl: "https://jev.test", model: "jev-1.13.0", timeoutMs: 200, maxAttempts: 3, ...over });
const noSleep = async () => {};

/** A well-formed answer to every question asked, from a scorer the test controls. */
function answer(questions: Record<string, Question>, state: unknown, scorer: Scorer) {
  const answers: Record<string, unknown> = {};
  for (const [name, q] of Object.entries(questions)) {
    if (q.type === "noul") answers[name] = { type: "noul", noul: scorer.noul?.(name, state) ?? 0.5 };
    else if (q.type === "choice") {
      const keys = Object.keys(q.criteria as Record<string, string>);
      const choice = scorer.choice?.(name, keys, state) ?? keys[0];
      answers[name] = { type: "choice", choice, confidence: 0.8, probabilities: Object.fromEntries(keys.map((k) => [k, k === choice ? 0.9 : 0.1 / Math.max(1, keys.length - 1)])) };
    } else {
      const n = (q.criteria as string[]).length;
      const level = Math.min(n - 1, scorer.score?.(name, state) ?? n - 1);
      answers[name] = { type: "score", score: level, confidence: scorer.confidence ?? 0.8, legend: {}, probabilities: Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i), i === level ? 1 : 0])) };
    }
  }
  return { model: "jev-1.13.0", answers, usage: { input_tokens: 400, output_tokens: 20 } };
}

interface Scorer {
  score?: (criterion: string, state: unknown) => number;
  choice?: (name: string, keys: string[], state: unknown) => string;
  noul?: (name: string, state: unknown) => number;
  confidence?: number;
}

function fakeJev(scorer: Scorer = {}, script: (n: number) => Response | "hang" | null = () => null) {
  const calls: { url: string; body: { model: string; state: unknown; questions: Record<string, Question> }; headers: Record<string, string> }[] = [];
  const f = vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push({ url, body, headers: init.headers as Record<string, string> });
    const scripted = script(calls.length);
    if (scripted === "hang")
      return new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    if (scripted) return scripted;
    return Response.json(answer(body.questions, body.state, scorer));
  });
  return { fetch: f as unknown as typeof fetch, calls };
}

const route = (over: Partial<SimulatedPath> = {}): SimulatedPath => ({
  name: "Route",
  kind: "self_study",
  funding: "savings",
  place: "local",
  summary: "A route.",
  months: { min: 12, max: 18 },
  cost: { min: 500, max: 1500, currency: "USD", note: "" },
  hoursPerWeek: 10,
  keepsIncome: true,
  riskLevel: "low",
  fitScore: 70,
  prerequisites: [],
  risks: [{ risk: "Losing momentum", mitigation: "Study group" }],
  assumptions: ["You keep 10 hours a week"],
  firstSteps: [],
  fit: "",
  ...over,
});

const SIT: Situation = { location: "Hargeisa, Somaliland", currency: "USD", monthlyIncome: 800, savings: 2000, hoursPerWeek: 12, dependents: 0, risk: "medium" };
const EXTRAS = { monthlyCosts: 300, allowDebt: false, verifiedPrices: [] };
const PROFILE = { dream: "Build AI tools for farmers", values: "family, craft", challenges: "Unreliable power" };

const input = (paths: SimulatedPath[], over: Partial<Parameters<typeof evaluateRoutes>[0]> = {}) => ({ simulationId: 1, goal: "Become an AI engineer", paths, situation: SIT, original: SIT, extras: EXTRAS, profile: PROFILE, memory: [], ...over });

describe("the Jev adapter", () => {
  it("maps a request onto POST /v1/systemone and returns typed answers", async () => {
    const jev = fakeJev({ noul: () => 0.97 });
    const res = await askJev(cfg(), { message: "hi" }, { billing: { type: "noul", instructions: "Is this about billing?" } }, { fetch: jev.fetch });
    expect(jev.calls[0].url).toBe("https://jev.test/v1/systemone");
    expect(jev.calls[0].headers.Authorization).toBe("Bearer test-key");
    expect(jev.calls[0].body).toEqual({ model: "jev-1.13.0", state: { message: "hi" }, questions: { billing: { type: "noul", instructions: "Is this about billing?" } } });
    expect(res).toMatchObject({ model: "jev-1.13.0", answers: { billing: { type: "noul", noul: 0.97 } }, usage: { inputTokens: 400, outputTokens: 20 }, attempts: 1 });
  });

  it("pins a versioned model by default and reads the key from the environment or the app", () => {
    const env = process.env.TYPESAFE_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    delete process.env.TYPESAFE_MODEL;
    const db = openDb(":memory:");
    expect(jevConfig(db)).toMatchObject({ apiKey: null, model: DEFAULT_JEV_MODEL });
    saveJevKey(db, "ts_live_abcd1234");
    expect(jevStatus(db)).toEqual({ configured: true, keySource: "app", keyHint: "1234", model: "jev-1.13.0" });
    expect(db.prepare("SELECT value FROM settings WHERE key = 'typesafe_key'").get()).not.toMatchObject({ value: "ts_live_abcd1234" });
    process.env.TYPESAFE_API_KEY = "env-key-9999";
    expect(jevConfig(db)).toMatchObject({ apiKey: "env-key-9999", keySource: "env" });
    if (env === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = env;
    db.close();
  });

  const qs = {
    fit: { type: "score" as const, instructions: "How well?", criteria: ["bad", "ok", "good"] },
    pick: { type: "choice" as const, instructions: "Which?", criteria: { r0: "A", r1: "B" } },
    yes: { type: "noul" as const, instructions: "Yes?" },
  };
  const good = () => ({
    model: "jev-1.13.0",
    answers: {
      fit: { type: "score", score: 1.6, confidence: 0.7, legend: { 0: "bad" }, probabilities: { 0: 0.1, 1: 0.2, 2: 0.7 } },
      pick: { type: "choice", choice: "r1", confidence: 0.6, probabilities: { r0: 0.2, r1: 0.8 } },
      yes: { type: "noul", noul: 0.3 },
    },
    usage: { input_tokens: 10, output_tokens: 2 },
  });

  it("accepts a valid response", () => {
    expect(validateJevResponse(qs, good())).toMatchObject({ ok: true, model: "jev-1.13.0" });
  });

  it.each([
    ["a missing answer", (r: ReturnType<typeof good>) => delete (r.answers as Record<string, unknown>).yes, "missing answer"],
    ["an answer nobody asked for", (r: ReturnType<typeof good>) => Object.assign(r.answers, { extra: { type: "noul", noul: 1 } }), "wasn't asked"],
    ["the wrong answer type", (r: ReturnType<typeof good>) => Object.assign(r.answers, { yes: { type: "choice", choice: "x", confidence: 1, probabilities: { x: 1 } } }), "expected a noul"],
    ["a choice that wasn't offered", (r: ReturnType<typeof good>) => Object.assign(r.answers.pick, { choice: "r9" }), "isn't one of the options"],
    ["probabilities that don't sum to 1", (r: ReturnType<typeof good>) => Object.assign(r.answers.pick, { probabilities: { r0: 0.6, r1: 0.8 } }), "sum to"],
    ["probabilities for other options", (r: ReturnType<typeof good>) => Object.assign(r.answers.pick, { probabilities: { r0: 0.2, r2: 0.8 } }), "don't match"],
    ["a score out of range", (r: ReturnType<typeof good>) => Object.assign(r.answers.fit, { score: 3 }), "between 0 and 2"],
    ["a noul above 1", (r: ReturnType<typeof good>) => Object.assign(r.answers.yes, { noul: 1.2 }), "noul must be"],
    ["no usage", (r: ReturnType<typeof good>) => delete (r as Partial<ReturnType<typeof good>>).usage, "usage"],
  ])("rejects %s", (_, mutate, message) => {
    const r = good();
    mutate(r);
    const v = validateJevResponse(qs, r);
    expect(v.ok).toBe(false);
    expect(!v.ok && v.errors.join(" ")).toContain(message);
  });

  it("rejects a malformed body without retrying it", async () => {
    const jev = fakeJev({}, () => new Response("<html>oops</html>", { status: 200 }));
    await expect(askJev(cfg(), "x", { yes: qs.yes }, { fetch: jev.fetch, sleep: noSleep })).rejects.toMatchObject({ kind: "invalid_response" });
    expect(jev.calls).toHaveLength(1);
  });

  it("retries an overloaded or rate-limited Jev a bounded number of times", async () => {
    const jev = fakeJev({}, (n) => (n === 1 ? new Response("{}", { status: 529 }) : n === 2 ? new Response("{}", { status: 429, headers: { "retry-after": "0" } }) : null));
    const res = await askJev(cfg(), "x", { yes: qs.yes }, { fetch: jev.fetch, sleep: noSleep });
    expect(res.attempts).toBe(3);
    const down = fakeJev({}, () => new Response("{}", { status: 503 }));
    await expect(askJev(cfg(), "x", { yes: qs.yes }, { fetch: down.fetch, sleep: noSleep })).rejects.toMatchObject({ kind: "unavailable", attempts: 3 });
    expect(down.calls).toHaveLength(3);
  });

  it("times out, retries, then gives up", async () => {
    const jev = fakeJev({}, () => "hang");
    await expect(askJev(cfg({ timeoutMs: 20, maxAttempts: 2 }), "x", { yes: qs.yes }, { fetch: jev.fetch, sleep: noSleep })).rejects.toMatchObject({ kind: "timeout", attempts: 2 });
  });

  it("doesn't retry a bad key or a refused request", async () => {
    const auth = fakeJev({}, () => new Response("{}", { status: 401 }));
    await expect(askJev(cfg(), "x", { yes: qs.yes }, { fetch: auth.fetch, sleep: noSleep })).rejects.toMatchObject({ kind: "auth" });
    const bad = fakeJev({}, () => Response.json({ detail: { error_type: "api_usage_error", message: "Unknown model: nope" } }, { status: 400 }));
    await expect(askJev(cfg(), "x", { yes: qs.yes }, { fetch: bad.fetch, sleep: noSleep })).rejects.toThrow("Unknown model: nope");
    expect(auth.calls.length + bad.calls.length).toBe(2);
  });

  it("refuses to run without a key, before any network call", async () => {
    const jev = fakeJev();
    await expect(askJev(cfg({ apiKey: null }), "x", { yes: qs.yes }, { fetch: jev.fetch })).rejects.toBeInstanceOf(JevError);
    expect(jev.calls).toHaveLength(0);
  });
});

describe("the rules", () => {
  it("calculates budget, hours and runway in code", () => {
    const keeps = rules.checkOption(route({ cost: { min: 1000, max: 3000, currency: "USD", note: "" }, months: { min: 10, max: 14 } }), 0, SIT, EXTRAS);
    // Savings plus a quarter of income over the route's 12 months: 2000 + 0.25 × 800 × 12 = 4400.
    expect(keeps.calc).toMatchObject({ need: 2000, available: 4400, shortfall: 0 });
    expect(keeps.eligible).toBe(true);

    const stops = rules.checkOption(route({ keepsIncome: false, cost: { min: 400, max: 600, currency: "USD", note: "" }, months: { min: 6, max: 9 } }), 1, SIT, EXTRAS);
    // (2000 − 500) / 300 = 5 months of living costs, but the route takes at least 6.
    expect(stops.calc.runwayMonths).toBe(5);
    expect(stops.checks.find((c) => c.constraintId === "runway")).toMatchObject({ ok: false });
    expect(stops.eligible).toBe(false);

    const hours = rules.checkOption(route({ hoursPerWeek: 20 }), 2, SIT, EXTRAS);
    expect(hours.calc.hoursGap).toBe(8);
    expect(hours.checks.find((c) => c.constraintId === "hours")?.ok).toBe(false);
  });

  it("never assumes debt or a price in another currency", () => {
    const loan = rules.checkOption(route({ funding: "loan" }), 0, SIT, EXTRAS);
    expect(loan.checks.find((c) => c.constraintId === "debt")?.ok).toBe(false);
    expect(loan.highImpact).toContain("debt");
    expect(rules.checkOption(route({ funding: "loan" }), 0, SIT, { ...EXTRAS, allowDebt: true }).checks.find((c) => c.constraintId === "debt")?.ok).toBe(true);

    const gbp = rules.checkOption(route({ cost: { min: 100, max: 900, currency: "GBP", note: "" } }), 3, SIT, EXTRAS);
    expect(gbp.checks.find((c) => c.constraintId === "budget")?.ok).toBeNull();
    expect(gbp.eligible).toBe(false);
    expect(gbp.missing).toEqual([{ key: "cost.r3", label: expect.stringContaining("in USD"), blocks: ["r3"] }]);
  });

  it("uses a fresh verified price over the estimate, and flags a stale or conflicting one", () => {
    const now = new Date("2026-10-21T00:00:00Z");
    const p = route({ cost: { min: 500, max: 1500, currency: "USD", note: "" } });
    const fresh = { optionId: "r0", amount: 6000, currency: "USD", sourceUrl: "https://uni.example/fees", retrievedAt: "2026-10-01" };
    const c = rules.checkOption(p, 0, SIT, { ...EXTRAS, verifiedPrices: [fresh] }, now);
    expect(c.calc).toMatchObject({ need: 6000, costProvenance: "verified" });
    expect(c.calc.notes[0]).toContain("outside the simulator's estimate");
    expect(c.checks.find((x) => x.constraintId === "budget")?.ok).toBe(false);

    const stale = rules.checkOption(p, 0, SIT, { ...EXTRAS, verifiedPrices: [{ ...fresh, retrievedAt: "2026-01-01" }] }, now);
    expect(stale.calc).toMatchObject({ need: 1000, costProvenance: "estimate" });
    expect(stale.calc.notes[0]).toContain("over 90 days ago");
    const facts = rules.situationFacts(SIT, SIT, { ...EXTRAS, verifiedPrices: [{ ...fresh, retrievedAt: "2026-01-01" }] }, now);
    expect(facts.find((f) => f.key === "cost.r0")).toMatchObject({ provenance: "verified", sourceUrl: "https://uni.example/fees", stale: true });
  });

  it("marks what-if values as estimates and unknowns as unknown", () => {
    const facts = rules.situationFacts({ ...SIT, savings: 9000 }, SIT, { ...EXTRAS, monthlyCosts: null });
    expect(facts.find((f) => f.key === "situation.savings")?.provenance).toBe("estimate");
    expect(facts.find((f) => f.key === "situation.monthlyIncome")?.provenance).toBe("user");
    expect(facts.find((f) => f.key === "extras.monthlyCosts")?.provenance).toBe("unknown");
  });

  it("knows which Jev answers a change invalidates", () => {
    const changed = rules.changedFacts(SIT, { ...SIT, savings: 100 }, EXTRAS, EXTRAS);
    expect(changed).toEqual(["situation.savings"]);
    expect(rules.needsJevAgain(changed, rules.RANK_CRITERIA, new Set(["r0"]), ["r0"])).toEqual({ criteria: [], routes: [] });
    const moved = rules.changedFacts(SIT, { ...SIT, location: "Nairobi" }, EXTRAS, EXTRAS);
    expect(rules.needsJevAgain(moved, rules.RANK_CRITERIA, new Set(["r0"]), ["r0", "r2"])).toEqual({ criteria: ["challenge_fit"], routes: ["r2"] });
  });
});

describe("a route decision", () => {
  const paths = [
    route({ name: "Self-study", fitScore: 70 }),
    route({ name: "Bootcamp", kind: "bootcamp", hoursPerWeek: 40, keepsIncome: false }),
    route({ name: "Work and study", kind: "work_and_study", funding: "income", hoursPerWeek: 8, fitScore: 60 }),
  ];

  it("sends Jev only the routes that pass the rules, and no money", async () => {
    const jev = fakeJev();
    const { result } = await evaluateRoutes(input(paths), cfg(), { fetch: jev.fetch, sleep: noSleep });
    const rated = jev.calls.filter((c) => "route" in (c.body.state as object)).map((c) => (c.body.state as { route: { name: string } }).route.name);
    expect(rated.sort()).toEqual(["Self-study", "Work and study"]);
    expect(JSON.stringify(jev.calls.map((c) => c.body.state))).not.toMatch(/cost|"savings"\s*:|monthly|800|2000/);
    expect(result.ranking.find((r) => r.optionId === "r1")).toMatchObject({ eligible: false, composite: null });
  });

  it("can't be talked into a route the rules ruled out", async () => {
    // Jev rates everything it sees as perfect and always picks the first option; the bootcamp still fails on hours.
    const jev = fakeJev({ score: () => 3, choice: (_, keys) => keys[0] });
    const { result } = await evaluateRoutes(input(paths), cfg(), { fetch: jev.fetch, sleep: noSleep });
    expect(result.selectedOptionId).not.toBe("r1");
    const pick = jev.calls.find((c) => "routes" in (c.body.state as object))!;
    expect(Object.keys(pick.body.questions.pick_forward.criteria as object)).not.toContain("r1");
  });

  it("decides when Jev is confident and consistent, and says it was Jev", async () => {
    const jev = fakeJev({ score: (c, s) => ((s as { route: { name: string } }).route.name === "Self-study" ? 3 : 1), choice: () => "r0" });
    const { request, result } = await evaluateRoutes(input(paths), cfg(), { fetch: jev.fetch, sleep: noSleep });
    expect(result).toMatchObject({ status: "decided", producer: "jev", selectedOptionId: "r0", orderConsistent: true, validation: { ok: true } });
    expect(result.meta).toMatchObject({ model: "jev-1.13.0", calls: 3, inputTokens: 1200 });
    expect(result.meta.costUsd).toBeCloseTo(1200 * 0.042e-6, 10);
    // Composite: 0.4 × the rules' fit + 0.2 × each Jev criterion.
    const top = result.ranking[0];
    const fit = top.scores.find((s) => s.criterionId === "situation_fit")!.value;
    expect(top.composite).toBeCloseTo(0.4 * fit + 0.6, 3);
    expect(request).toMatchObject({ decisionType: "rank_paths", scenarioId: "simulation-1", scopeId: "local" });
    expect(request.verifiedFacts.map((f) => f.key)).toContain("situation.savings");
  });

  it("asks for review when Jev's pick flips with the option order", async () => {
    const jev = fakeJev({ score: (c, s) => ((s as { route: { name: string } }).route.name === "Self-study" ? 3 : 1), choice: (_, keys) => keys[0] });
    const { result } = await evaluateRoutes(input(paths), cfg(), { fetch: jev.fetch, sleep: noSleep });
    expect(result).toMatchObject({ status: "needs_review", orderConsistent: false, selectedOptionId: "r0" });
    expect(result.reasons.join(" ")).toContain("reverse");
  });

  it("asks for review when Jev isn't confident", async () => {
    const jev = fakeJev({ score: (c, s) => ((s as { route: { name: string } }).route.name === "Self-study" ? 3 : 1), choice: () => "r0", confidence: 0.2 });
    const { result } = await evaluateRoutes(input(paths), cfg(), { fetch: jev.fetch, sleep: noSleep });
    expect(result.status).toBe("needs_review");
    expect(result.reasons.join(" ")).toContain("wasn't sure");
  });

  it("never finalises a high-impact route on its own", async () => {
    const abroad = [route({ name: "Move abroad", place: "relocate", fitScore: 95 }), route({ name: "Stay", fitScore: 20 })];
    const jev = fakeJev({ score: (c, s) => ((s as { route: { name: string } }).route.name === "Move abroad" ? 3 : 0), choice: () => "r0" });
    const { request, result } = await evaluateRoutes(input(abroad), cfg(), { fetch: jev.fetch, sleep: noSleep });
    expect(result).toMatchObject({ status: "needs_review", selectedOptionId: "r0" });
    expect(request.highImpact).toContain("migration");
    expect(result.reasons.join(" ")).toContain("migration");
  });

  it("abstains when nothing passes, without calling Jev", async () => {
    const jev = fakeJev();
    const { result } = await evaluateRoutes(input([route({ hoursPerWeek: 30 }), route({ name: "B", hoursPerWeek: 50 })]), cfg(), { fetch: jev.fetch });
    expect(result).toMatchObject({ status: "abstained", producer: "rules", selectedOptionId: null });
    expect(jev.calls).toHaveLength(0);
  });

  it("abstains, and says what's missing, when blocking information is unknown", async () => {
    const jev = fakeJev();
    const { request, result } = await evaluateRoutes(input([route({ keepsIncome: false })], { extras: { ...EXTRAS, monthlyCosts: null } }), cfg(), { fetch: jev.fetch });
    expect(result.status).toBe("abstained");
    expect(result.reasons[0]).toContain("missing information");
    expect(request.missingInformation).toContainEqual({ key: "extras.monthlyCosts", label: "Your monthly living costs", blocks: ["r0"] });
  });

  it("flags stale memory and missing values without blocking the decision", () => {
    const { request } = buildRouteRequest(
      input(paths, { profile: { ...PROFILE, values: "" }, memory: [{ path: "Goals/old.md", title: "Old plan", evidence: "user-stated", updatedAt: "2024-01-01 00:00:00", stale: true }] }),
      "v-test",
    );
    expect(request.missingInformation).toEqual(expect.arrayContaining([expect.objectContaining({ key: "profile.values", blocks: [] }), expect.objectContaining({ label: '"Old plan" may be out of date', blocks: [] })]));
    expect(request.relevantMemoryReferences[0]).toMatchObject({ path: "Goals/old.md", stale: true });
  });

  it("falls back to an explicitly pending rules-only result when Jev is down", async () => {
    const jev = fakeJev({}, () => new Response("{}", { status: 529 }));
    const { result } = await evaluateRoutes(input(paths), cfg({ maxAttempts: 2 }), { fetch: jev.fetch, sleep: noSleep });
    expect(result).toMatchObject({ status: "pending", producer: "rules", selectedOptionId: null, confidence: null });
    expect(result.meta.error).toContain("unavailable");
    expect(result.ranking.filter((r) => r.eligible).map((r) => r.optionId)).toEqual(["r0", "r2"]);
  });

  it("treats a malformed Jev answer as a failed validation, not a decision", async () => {
    const jev = fakeJev({}, () => Response.json({ model: "jev-1.13.0", answers: { values_fit: { type: "score", score: 9 } }, usage: { input_tokens: 1, output_tokens: 1 } }));
    const { result } = await evaluateRoutes(input(paths), cfg(), { fetch: jev.fetch, sleep: noSleep });
    expect(result).toMatchObject({ status: "pending", producer: "rules", validation: { ok: false } });
  });

  it("re-ranks after a what-if change from stored Jev answers, without Jev", async () => {
    const jev = fakeJev({ score: (c, s) => ((s as { route: { name: string } }).route.name === "Self-study" ? 3 : 1), choice: () => "r0" });
    const first = await evaluateRoutes(input(paths), cfg(), { fetch: jev.fetch, sleep: noSleep });
    const stored: Record<string, Record<string, { value: number; confidence: number }>> = {};
    for (const r of first.result.ranking) for (const s of r.scores.filter((x) => x.by === "jev")) (stored[r.optionId] ??= {})[s.criterionId] = { value: s.value, confidence: s.confidence! };
    // With only 9 hours a week, self-study (10 h) fails and work-and-study (8 h) is the only route left.
    const tighter = { ...SIT, hoursPerWeek: 9 };
    const checks = rules.checkAll(paths, tighter, EXTRAS);
    const again = rules.combine({ decisionId: "x", checks, criteria: rules.RANK_CRITERIA, jev: stored, pick: null, missingBlocking: [] });
    expect(again.selectedOptionId).toBe("r2");
    expect(again.ranking.find((r) => r.optionId === "r0")?.eligible).toBe(false);
  });

  it("gives the same version, and the same Jev answers, for the same inputs and model", async () => {
    const i = input(paths);
    expect(scenarioVersion(i, "jev-1.13.0")).toBe(scenarioVersion(input(paths), "jev-1.13.0"));
    expect(scenarioVersion(i, "jev-1.14.0")).not.toBe(scenarioVersion(i, "jev-1.13.0"));
    expect(scenarioVersion({ ...i, situation: { ...SIT, savings: 1 } }, "jev-1.13.0")).not.toBe(scenarioVersion(i, "jev-1.13.0"));
    const scorer: Scorer = { score: (c, s) => ((s as { route: { name: string } }).route.name === "Self-study" ? 3 : 1), choice: () => "r0" };
    const a = await evaluateRoutes(i, cfg(), { fetch: fakeJev(scorer).fetch, sleep: noSleep });
    const b = await evaluateRoutes(i, cfg(), { fetch: fakeJev(scorer).fetch, sleep: noSleep });
    expect(b.result.ranking).toEqual(a.result.ranking);
    expect(b.result.status).toBe(a.result.status);
  });

  it("asks the pick question in both orders", () => {
    const q = pickQuestions(["r0", "r2"], paths);
    expect(Object.keys(q.pick_forward.criteria as object)).toEqual(["r0", "r2"]);
    expect(Object.keys(q.pick_reverse.criteria as object)).toEqual(["r2", "r0"]);
  });
});

describe("a branch condition", () => {
  const paths = [route({ name: "Self-study", assumptions: ["Employers hire on portfolios"] }), route({ name: "Degree", assumptions: ["You are admitted"] }), route({ name: "Also portfolio", assumptions: ["Employers hire on portfolios"] })];
  const ranking = [
    { optionId: "r0", eligible: true },
    { optionId: "r2", eligible: true },
    { optionId: "r1", eligible: true },
  ];
  const base = { decisionId: "d1", optionId: "r0", assumption: "Employers hire on portfolios", ranking, paths };

  it("doesn't ask Jev without evidence", async () => {
    const jev = fakeJev();
    const r = await checkAssumption(cfg(), { ...base, evidence: "dunno" }, { fetch: jev.fetch });
    expect(r).toMatchObject({ outcome: "no_evidence", producer: "rules" });
    expect(jev.calls).toHaveLength(0);
  });

  it("switches to the next route that doesn't rest on a failed assumption", async () => {
    const jev = fakeJev({ choice: () => "contradicts" });
    const r = await checkAssumption(cfg(), { ...base, evidence: "Every job posting in my city requires a degree." }, { fetch: jev.fetch });
    expect(r).toMatchObject({ outcome: "fails", producer: "jev", switchTo: "r1" });
  });

  it("holds, or is left to the person when unclear or off-topic", async () => {
    const holds = await checkAssumption(cfg(), { ...base, evidence: "Three local firms hired self-taught engineers this year." }, { fetch: fakeJev({ choice: () => "supports" }).fetch });
    expect(holds.outcome).toBe("holds");
    const unclear = await checkAssumption(cfg(), { ...base, evidence: "Some do, some don't, it depends." }, { fetch: fakeJev({ choice: (name) => (name === "verdict_forward" ? "supports" : "contradicts") }).fetch });
    expect(unclear.outcome).toBe("unclear");
    const off = await checkAssumption(cfg(), { ...base, evidence: "The weather is nice today." }, { fetch: fakeJev({ choice: () => "silent" }).fetch });
    expect(off.outcome).toBe("unclear");
  });

  it("reports an unavailable Jev as not checked", async () => {
    const r = await checkAssumption(cfg({ maxAttempts: 1 }), { ...base, evidence: "Three local firms hired self-taught engineers." }, { fetch: fakeJev({}, () => new Response("{}", { status: 503 })).fetch, sleep: noSleep });
    expect(r).toMatchObject({ outcome: "unclear", producer: "rules" });
  });
});

describe("the decision history", () => {
  let dir: string;
  let db: ReturnType<typeof openDb>;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "futureme-decision-"));
    process.env.VAULT_DIR = path.join(dir, "vault");
    process.env.LLM_PROVIDER = "mock";
    db = openDb(":memory:");
    saveProfile(db, { name: "Amina", dream: "Become an AI engineer building tools for farmers", current: "Junior web developer", resources: "A laptop", challenges: "Limited savings", values: "family, craft", style: "direct" });
  });
  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const scorer: Scorer = { score: (c, s) => ((s as { route: { name: string } }).route.name.startsWith("Work") ? 3 : 1), choice: (_, keys) => keys.find((k) => k === "r2") ?? keys[0] };

  it("stores a decision once per scenario version and reuses it", async () => {
    const sim = await simulatePaths(db, "Become an AI engineer", SIT, mockProvider);
    const jev = fakeJev(scorer);
    const a = await store.decideRoutes(db, sim.id, null, EXTRAS, { cfg: cfg(), fetch: jev.fetch, sleep: noSleep });
    const calls = jev.calls.length;
    expect(calls).toBeGreaterThan(0);
    const b = await store.decideRoutes(db, sim.id, null, EXTRAS, { cfg: cfg(), fetch: jev.fetch, sleep: noSleep });
    expect(b.id).toBe(a.id);
    expect(jev.calls.length).toBe(calls);
    // A different starting point is a new decision.
    const c = await store.decideRoutes(db, sim.id, { ...SIT, savings: 50 }, EXTRAS, { cfg: cfg(), fetch: jev.fetch, sleep: noSleep });
    expect(c.id).not.toBe(a.id);
    expect(store.listDecisions(db, sim.id)).toHaveLength(2);
  });

  it("retries a pending decision once Jev is back", async () => {
    const sim = await simulatePaths(db, "Become an AI engineer", SIT, mockProvider);
    const down = await store.decideRoutes(db, sim.id, null, EXTRAS, { cfg: cfg({ apiKey: null }) });
    expect(down.result).toMatchObject({ status: "pending", producer: "rules" });
    const up = await store.decideRoutes(db, sim.id, null, EXTRAS, { cfg: cfg(), fetch: fakeJev(scorer).fetch, sleep: noSleep });
    expect(up.id).not.toBe(down.id);
    expect(up.result).toMatchObject({ producer: "jev" });
  });

  it("records acceptance, overrides with a reason, rejection and outcomes", async () => {
    const sim = await simulatePaths(db, "Become an AI engineer", SIT, mockProvider);
    const d = await store.decideRoutes(db, sim.id, null, EXTRAS, { cfg: cfg(), fetch: fakeJev(scorer).fetch, sleep: noSleep });
    const selected = (d.result as { selectedOptionId: string }).selectedOptionId;
    expect(store.chooseRoute(db, d.id, selected, "accepted").choice).toMatchObject({ optionId: selected, kind: "accepted" });
    // The choice becomes the simulator's chosen road, which the other agents plan with.
    expect(getChosenRoad(db)).toMatchObject({ simulationId: sim.id, index: rules.optionIndex(selected) });
    const other = (d.request as { candidateOptions: { id: string }[] }).candidateOptions.find((o) => o.id !== selected)!.id;
    expect(store.chooseRoute(db, d.id, other, "accepted", "  I want the structure ").choice).toMatchObject({ optionId: other, kind: "override", reason: "I want the structure" });
    expect(store.chooseRoute(db, d.id, null, "rejected").choice).toMatchObject({ kind: "rejected", optionId: null });
    expect(() => store.chooseRoute(db, d.id, "r99", "accepted")).toThrow("isn't part");
    expect(store.recordOutcome(db, d.id, "Finished the first course").outcome?.text).toBe("Finished the first course");
    expect(store.getDecision(db, d.id)?.shown).toEqual({ optionId: selected, status: (d.result as { status: string }).status });
  });

  it("keeps note paths, not note text, and deletes everything for a simulation", async () => {
    writeNote({ folder: "Goals", title: "AI engineer plan", tags: [], links: [], body: "Private-note-body: become an AI engineer through evening study." });
    const sim = await simulatePaths(db, "Become an AI engineer", SIT, mockProvider);
    const d = await store.decideRoutes(db, sim.id, null, EXTRAS, { cfg: cfg(), fetch: fakeJev(scorer).fetch, sleep: noSleep });
    const row = db.prepare("SELECT request FROM decisions WHERE id = ?").get(d.id) as { request: string };
    expect(row.request).toContain("Goals/ai-engineer-plan.md");
    expect(row.request).not.toContain("Private-note-body");
    const opt = (d.request as { candidateOptions: { id: string; assumptions: string[] }[] }).candidateOptions[0];
    await store.checkRouteAssumption(db, d.id, opt.id, opt.assumptions[0], "Local employers told me they hire on portfolios.", null, { cfg: cfg(), fetch: fakeJev({ choice: () => "supports" }).fetch });
    await expect(store.checkRouteAssumption(db, d.id, opt.id, "Not an assumption", "Some evidence here, long enough.", null, { cfg: cfg() })).rejects.toThrow("isn't one of");
    expect(store.listDecisions(db, sim.id).map((x) => x.kind).sort()).toEqual(["branch_condition", "rank_paths"]);
    expect(store.deleteDecisions(db, sim.id)).toBe(2);
    expect(store.listDecisions(db, sim.id)).toHaveLength(0);
  });

  it("limits branch checks per route", async () => {
    const sim = await simulatePaths(db, "Become an AI engineer", SIT, mockProvider);
    const d = await store.decideRoutes(db, sim.id, null, EXTRAS, { cfg: cfg(), fetch: fakeJev(scorer).fetch, sleep: noSleep });
    const opt = (d.request as { candidateOptions: { id: string; assumptions: string[] }[] }).candidateOptions[0];
    const jev = fakeJev({ choice: () => "supports" });
    for (let i = 0; i < store.MAX_BRANCH_CHECKS; i++) await store.checkRouteAssumption(db, d.id, opt.id, opt.assumptions[0], `Evidence number ${i}, long enough to ask.`, null, { cfg: cfg(), fetch: jev.fetch });
    await expect(store.checkRouteAssumption(db, d.id, opt.id, opt.assumptions[0], "One more piece of evidence.", null, { cfg: cfg(), fetch: jev.fetch })).rejects.toThrow("already");
  });
});
