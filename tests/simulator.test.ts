import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, CompleteOptions, LlmProvider } from "../src/lib/llm";
import type { Situation } from "../src/types";

vi.mock("server-only", () => ({}));

const { openDb } = await import("../src/lib/db");
const { saveProfile } = await import("../src/lib/futureme");
const { mockProvider } = await import("../src/lib/mock-llm");
const { listSimulations, saveSimulation, simulatePaths } = await import("../src/lib/simulator");
const { SIMULATION_FRAMING, SIMULATION_SCHEMA, assessPath, formatCost, formatSpan, normalizeSimulation, normalizeSituation, rankPaths, standInSimulation, toPaths } = await import("../src/lib/simulator-paths");
const { parseExport } = await import("../src/lib/social/parse");
const { SAMPLE_FILES } = await import("../src/lib/social/sample");
const { importSocial } = await import("../src/lib/social/store");
const { writeNote } = await import("../src/lib/vault");
const { buildWorkspace } = await import("../src/lib/workspace-server");

type Db = ReturnType<typeof openDb>;
let dir: string;
let db: Db;

/** The stand-in model, recording what the simulator sent it. */
function recording() {
  const calls: { messages: ChatMessage[]; opts?: CompleteOptions }[] = [];
  const provider: LlmProvider = {
    name: "recording",
    complete: (messages, tools, opts) => {
      calls.push({ messages, opts });
      return mockProvider.complete(messages, tools, opts);
    },
  };
  return { provider, calls };
}

const reply = (content: unknown): LlmProvider => ({ name: "fixed", complete: async () => ({ content: typeof content === "string" ? content : JSON.stringify(content), toolCalls: [] }) });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "futureme-sim-"));
  process.env.VAULT_DIR = path.join(dir, "vault");
  process.env.LLM_PROVIDER = "mock";
  db = openDb(":memory:");
  saveProfile(db, {
    name: "Amina",
    dream: "Become an AI engineer building tools for farmers",
    current: "Junior web developer",
    resources: "A laptop and evenings free",
    challenges: "Limited savings, unreliable power",
    values: "family, craft",
    style: "direct",
  });
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("the Future Simulator", () => {
  it("asks Nemotron for three paths with reasoning on, a JSON schema and the conditional framing", async () => {
    const { provider, calls } = recording();
    await simulatePaths(db, "Become an AI engineer", null, provider);
    expect(calls).toHaveLength(1);
    const { messages, opts } = calls[0];
    expect(opts).toMatchObject({ reasoning: "on", schema: SIMULATION_SCHEMA });
    const system = String(messages[0].content);
    expect(system).toContain(SIMULATION_FRAMING);
    expect(system).toMatch(/never promise a job/i);
    expect(system).toMatch(/always include a self-study route, a formal education route and a route that combines paid work with study/);
    expect(system).toMatch(/between 6 and 12 plausible, clearly different routes/);
    // Grounded in the profile.
    expect(system).toContain("Junior web developer");
    expect(system).toContain("Limited savings");
  });

  it("looks wide: many clearly different, conditional routes, and keeps them", async () => {
    const sim = await simulatePaths(db, "Become an AI engineer", null, mockProvider);
    const kinds = new Set(sim.result.paths.map((p) => p.kind));
    expect(sim.result.paths.length).toBeGreaterThanOrEqual(6);
    for (const k of ["self_study", "formal_education", "work_and_study", "bootcamp", "apprenticeship"]) expect(kinds).toContain(k);
    expect(new Set(sim.result.paths.map((p) => p.place))).toEqual(new Set(["local", "remote", "relocate"]));
    expect(new Set(sim.result.paths.map((p) => p.funding)).size).toBeGreaterThanOrEqual(4);
    for (const p of sim.result.paths) {
      expect(p.months_min).toBeLessThanOrEqual(p.months_max);
      expect(p.cost_min).toBeLessThanOrEqual(p.cost_max);
      expect(p.assumptions.length).toBeGreaterThan(0);
      expect(p.prerequisites.length).toBeGreaterThan(0);
      expect(p.risks.length).toBeGreaterThan(0);
    }
    // The challenge the user named shows up as a risk.
    expect(sim.result.paths[0].risks.some((r) => r.risk.includes("Limited savings"))).toBe(true);
    expect(listSimulations(db).map((s) => s.id)).toEqual([sim.id]);
    expect(sim.backend).toBe("mock");
  });

  it("reads matching notes and the imported persona, and records what it read", async () => {
    writeNote({ folder: "Goals", title: "Learn machine learning", tags: ["goal"], body: "Finish an AI engineer course and ship a crop model." });
    for (const imp of parseExport(SAMPLE_FILES)) await importSocial(db, imp, { method: "sample", consent: true, provider: mockProvider });
    const { provider, calls } = recording();
    const sim = await simulatePaths(db, "Become an AI engineer", null, provider);
    const system = String(calls[0].messages[0].content);
    expect(system).toContain('"Learn machine learning"');
    expect(system).toMatch(/From their imported .* accounts/);
    expect(sim.grounding.notes).toContain("Goals/learn-machine-learning.md");
    expect(sim.grounding.social.length).toBeGreaterThan(0);
  });

  it("refuses a reply with fewer than three usable paths", async () => {
    const two = standInSimulation({ goal: "Become an AI engineer" });
    two.paths = two.paths.slice(0, 2);
    await expect(simulatePaths(db, "Become an AI engineer", null, reply(two))).rejects.toThrow(/at least three usable routes/);
    await expect(simulatePaths(db, "Become an AI engineer", null, reply("I think you should study."))).rejects.toThrow(/at least three usable routes/);
    expect(listSimulations(db)).toHaveLength(0);
  });

  it("rejects goals that are empty or too long", async () => {
    await expect(simulatePaths(db, "  hi ", null, mockProvider)).rejects.toThrow(/few words/);
    await expect(simulatePaths(db, "x".repeat(301), null, mockProvider)).rejects.toThrow(/under 300/);
  });

  it("saves the comparison to the vault as an imagined AI interpretation, once", async () => {
    const sim = await simulatePaths(db, "Become an AI engineer", null, mockProvider);
    const notePath = saveSimulation(db, sim.id);
    expect(saveSimulation(db, sim.id)).toBe(notePath);
    const note = fs.readFileSync(path.join(process.env.VAULT_DIR!, notePath), "utf8");
    expect(note).toContain("evidence: ai-inferred");
    expect(note).toContain(SIMULATION_FRAMING);
    expect(note).toContain("**Holds only if**");
    expect(note).toMatch(/## \d+\. Self-study route/);
  });

  it("puts the starting point in the prompt, prices in its currency, and keeps it with the run", async () => {
    const { provider, calls } = recording();
    const sim = await simulatePaths(db, "Become an AI engineer", { location: "Hargeisa, Somaliland", currency: "usd", monthlyIncome: 400, savings: 1200, hoursPerWeek: 10, dependents: 2, risk: "low" }, provider);
    const system = String(calls[0].messages[0].content);
    expect(system).toContain("- Lives in: Hargeisa, Somaliland");
    expect(system).toContain("- Savings: USD 1.2k");
    expect(system).toContain("- People who rely on their income: 2");
    expect(system).toMatch(/Be realistic about where they live/);
    expect(sim.situation).toMatchObject({ currency: "USD", savings: 1200, risk: "low" });
    expect(sim.result.paths.every((p) => p.currency === "USD")).toBe(true);
    const [view] = buildWorkspace(db).simulations!;
    expect(view.situation?.location).toBe("Hargeisa, Somaliland");

    // The vault note ranks the roads for that starting point and says what gets in the way.
    const note = fs.readFileSync(path.join(process.env.VAULT_DIR!, saveSimulation(db, sim.id)), "utf8");
    expect(note).toContain("## Starting point");
    expect(note).toMatch(/\(fit \d+\/100\)/);
    expect(note).toContain("**What gets in the way**");
  });

  it("prices template roads in the person's currency", () => {
    const sim = standInSimulation({ goal: "Become a nurse", situation: normalizeSituation({ currency: "KES" }) });
    expect(sim.paths.every((p) => p.currency === "KES")).toBe(true);
    expect(sim.paths.find((p) => p.kind === "formal_education")!.cost_max).toBeGreaterThan(1_000_000);
  });

  it("shows up in the workspace with its grounding", async () => {
    const sim = await simulatePaths(db, "Become an AI engineer", null, mockProvider);
    const [view] = buildWorkspace(db).simulations!;
    expect(view).toMatchObject({ id: String(sim.id), goal: "Become an AI engineer", simulated: true, grounding: { profile: true } });
    expect(view.paths.length).toBe(sim.result.paths.length);
    expect(view.situation).toBeNull();
    expect(view.paths[0]).toMatchObject({ kind: "self_study", months: { min: 12, max: 24 }, cost: { currency: "USD" } });
    expect(view.grounding.notes.map((n) => n.title)).toContain("10-Year Dream");
  });
});

describe("normalizing a model's simulation", () => {
  const path = (name: string, extra: Record<string, unknown> = {}) => ({ name, kind: "self_study", summary: `Route ${name}`, months_min: 6, months_max: 12, cost_min: 0, cost_max: 100, currency: "usd", cost_note: "", hours_per_week: 10, prerequisites: [], risks: [], assumptions: ["x"], first_steps: [], fit: "", ...extra });

  it("drops duplicates and blanks, swaps inverted ranges and names at least one assumption", () => {
    const out = normalizeSimulation(
      { goal: "", paths: [path("A", { months_min: 24, months_max: 6, cost_min: 900, cost_max: 100 }), path("a"), path(""), path("B", { kind: "astral", assumptions: [] }), path("C"), path("D")], shared_unknowns: "nope", how_to_choose: 3 },
      "Fallback goal",
    )!;
    expect(out.goal).toBe("Fallback goal");
    expect(out.paths.map((p) => p.name)).toEqual(["A", "B", "C", "D"]);
    // Fields an older or sloppier reply leaves out get safe defaults.
    expect(out.paths[0]).toMatchObject({ funding: "savings", place: "local", keeps_income: true, risk_level: "medium", fit_score: 50 });
    expect(out.paths[0]).toMatchObject({ months_min: 6, months_max: 24, cost_min: 100, cost_max: 900, currency: "USD" });
    expect(out.paths[1].kind).toBe("other");
    expect(out.paths[1].assumptions.length).toBe(1);
    expect(out.shared_unknowns).toEqual([]);
    expect(out.how_to_choose).toBe("");
  });

  it("keeps at most twelve routes", () => {
    const many = Array.from({ length: 15 }, (_, i) => path(`R${i}`));
    expect(normalizeSimulation({ paths: many }, "g")!.paths).toHaveLength(12);
  });

  it("returns null without three paths", () => {
    expect(normalizeSimulation({ paths: [path("A"), path("B")] }, "g")).toBeNull();
    expect(normalizeSimulation(null, "g")).toBeNull();
  });

  it("formats ranges for the comparison", () => {
    expect(formatSpan({ min: 6, max: 12 })).toBe("6–12 months");
    expect(formatSpan({ min: 24, max: 48 })).toBe("2–4 years");
    expect(formatSpan({ min: 12, max: 12 })).toBe("12 months");
    expect(formatCost({ min: 0, max: 0, currency: "USD" })).toBe("Free");
    expect(formatCost({ min: 5000, max: 60000, currency: "USD" })).toBe("USD 5k–60k");
    expect(formatCost({ min: 0, max: 1500, currency: "EUR" })).toBe("EUR 0–1.5k");
  });
});

describe("rating roads against a starting point", () => {
  const roads = toPaths(standInSimulation({ goal: "Become an AI engineer" }).paths);
  const byName = (name: string) => roads.find((p) => p.name === name)!;
  const tight: Situation = { location: "Hargeisa", currency: "USD", monthlyIncome: 300, savings: 500, hoursPerWeek: 8, dependents: 2, risk: "low" };
  const roomy: Situation = { location: "Nairobi", currency: "USD", monthlyIncome: 3000, savings: 80000, hoursPerWeek: 45, dependents: 0, risk: "high" };

  it("ranks cheap, part-time roads first for a tight budget, and full-time ones up when money and time allow", () => {
    const tightTop = rankPaths(roads, tight).slice(0, 3).map((r) => roads[r.index].name);
    expect(tightTop).toContain("Work and study route");
    expect(tightTop).not.toContain("University-focused route");
    expect(tightTop).not.toContain("Intensive bootcamp");

    const uni = (s: Situation) => rankPaths(roads, s).findIndex((r) => roads[r.index].name === "University-focused route");
    expect(uni(roomy)).toBeLessThan(uni(tight));
  });

  it("explains why a road ranks lower", () => {
    const a = assessPath(byName("University-focused route"), tight);
    expect(a.budget.ok).toBe(false);
    expect(a.budget.shortfall).toBeGreaterThan(0);
    expect(a.hours).toEqual({ ok: false, gap: 27 });
    expect(a.concerns.join(" ")).toMatch(/more than your savings/);
    expect(a.concerns.join(" ")).toMatch(/27 more hours a week/);
    expect(a.concerns.join(" ")).toMatch(/2 people rely on your income/);
    expect(assessPath(byName("Work and study route"), roomy).concerns).toEqual([]);
  });

  it("counts spare income only on roads where you keep earning", () => {
    const s = { ...tight, savings: 0, monthlyIncome: 1000 };
    expect(assessPath(byName("Work and study route"), s).budget.available).toBe(Math.round(1000 * 0.25 * 27));
    expect(assessPath(byName("Intensive bootcamp"), s).budget.available).toBe(0);
  });

  it("doesn't compare money across currencies", () => {
    const a = assessPath(byName("Intensive bootcamp"), { ...tight, currency: "EUR" });
    expect(a.budget).toMatchObject({ comparable: false, ok: true });
    expect(a.concerns.join(" ")).toMatch(/Costs are in USD/);
  });

  it("falls back to how realistic a road looks without a starting point", () => {
    expect(rankPaths(roads, null).map((r) => r.assessment.score)).toEqual([...roads.map((p) => p.fitScore)].sort((a, b) => b - a));
  });

  it("tidies a starting point from a form", () => {
    expect(normalizeSituation({ location: "  Hargeisa ", currency: "kes!", monthlyIncome: "1,200", savings: -5, hoursPerWeek: 200, dependents: "x", risk: "wild" })).toEqual({
      location: "Hargeisa",
      currency: "KES",
      monthlyIncome: 1200,
      savings: 0,
      hoursPerWeek: 80,
      dependents: 0,
      risk: "medium",
    });
    expect(normalizeSituation(null)).toBeNull();
  });
});
