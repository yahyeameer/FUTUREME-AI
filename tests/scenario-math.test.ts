import { describe, expect, it } from "vitest";
import { changeConditions, checkpoints, recalculate, saferAlternative, warningSignals } from "../src/lib/scenario-math";
import { standInSimulation, toPaths } from "../src/lib/simulator-paths";
import type { SimulatedPath, Situation } from "../src/types";

const path = (over: Partial<SimulatedPath> = {}): SimulatedPath => ({
  name: "Self-study route",
  kind: "self_study",
  funding: "savings",
  place: "local",
  summary: "Teach yourself.",
  months: { min: 12, max: 24 },
  cost: { min: 0, max: 2000, currency: "USD", note: "" },
  hoursPerWeek: 10,
  keepsIncome: true,
  riskLevel: "medium",
  fitScore: 70,
  prerequisites: [],
  risks: [],
  assumptions: ["You keep ten hours a week.", "Employers hire on skill"],
  firstSteps: [],
  fit: "",
  ...over,
});
const situation = (over: Partial<Situation> = {}): Situation => ({ location: "Nairobi", currency: "USD", monthlyIncome: 400, savings: 0, hoursPerWeek: 10, dependents: 0, risk: "medium", ...over });

describe("recalculate", () => {
  it("leaves the model's timeline alone when nothing changes", () => {
    const r = recalculate(path(), situation());
    expect(r.months).toEqual({ min: 12, max: 24 });
    expect(r.changed).toBe(false);
    expect(r.notes).toEqual([]);
  });

  it("stretches the timeline in proportion when there are fewer hours a week, keeping total effort", () => {
    const r = recalculate(path(), situation(), { hoursPerWeek: 5 });
    expect(r.months).toEqual({ min: 24, max: 48 });
    expect(r.changed).toBe(true);
    expect(r.effortHours).toEqual({ min: 520, max: 1040 });
    expect(r.notes[0]).toMatch(/100% longer/);
  });

  it("doesn't shorten a road when there are more hours than it assumes", () => {
    const r = recalculate(path(), situation(), { hoursPerWeek: 40 });
    expect(r.months).toEqual({ min: 12, max: 24 });
    expect(r.notes[0]).toMatch(/don't shorten/);
  });

  it("adds a slipped milestone to both ends of the range", () => {
    expect(recalculate(path(), situation(), { slipMonths: 3 }).months).toEqual({ min: 15, max: 27 });
  });

  it("works out the funding gap and how long saving a quarter of income takes to close it", () => {
    // Midpoint cost 1000; savings 0; spare income 400 * 0.25 * 18 months = 1800, so no gap.
    expect(recalculate(path(), situation())!.funds).toMatchObject({ comparable: true, shortfall: 0, monthsToClose: 0 });
    // A road that stops the income: nothing earned on the way, 1000 short, closed at 100 a month in 10 months.
    const r = recalculate(path({ keepsIncome: false }), situation());
    expect(r.funds).toEqual({ comparable: true, available: 0, shortfall: 1000, monthsToClose: 10 });
    // No income at all: the gap can't be saved toward.
    expect(recalculate(path({ keepsIncome: false }), situation({ monthlyIncome: 0 })).funds?.monthsToClose).toBeNull();
  });

  it("doesn't compare money in different currencies", () => {
    const r = recalculate(path({ cost: { min: 5000, max: 9000, currency: "EUR", note: "" } }), situation());
    expect(r.funds).toMatchObject({ comparable: false, shortfall: 0 });
  });

  it("is deterministic and clamps silly inputs", () => {
    const a = recalculate(path(), situation(), { hoursPerWeek: 0, slipMonths: 999 });
    expect(a).toEqual(recalculate(path(), situation(), { hoursPerWeek: 0, slipMonths: 999 }));
    expect(a.hoursPerWeek).toBe(1);
    expect(a.months.max).toBe(240);
  });
});

describe("checkpoints", () => {
  it("places a first check-in, a halfway review and the target window on the calendar", () => {
    const c = checkpoints({ min: 12, max: 24 }, new Date(Date.UTC(2026, 9, 21)));
    expect(c.map((x) => x.label)).toEqual(["First check-in", "Halfway review", "Target window"]);
    expect(c[1].months).toEqual({ min: 6, max: 12 });
    expect(c[2].window).toEqual({ from: "Oct 2027", to: "Oct 2028" });
    // Phrased as questions, not promises.
    expect(c.every((x) => x.prompt.endsWith("?"))).toBe(true);
  });
});

describe("signals and alternatives", () => {
  const roads = toPaths(standInSimulation({ goal: "Become a data analyst" }).paths);

  it("turns assumptions into warning signs and adds the strains the numbers show", () => {
    const p = path({ keepsIncome: false });
    const signals = warningSignals(p, recalculate(p, situation(), { hoursPerWeek: 4 }));
    expect(signals[0]).toBe("This stops being true: You keep ten hours a week.");
    expect(signals.some((s) => s.includes("fewer than 10 hours"))).toBe(true);
    expect(signals.some((s) => s.includes("funding gap"))).toBe(true);
  });

  it("finds the closest lower-risk road, and none for a road that's already low risk", () => {
    const bootcamp = roads.find((r) => r.kind === "bootcamp")!;
    const safer = saferAlternative(bootcamp, roads)!;
    expect(safer.riskLevel).toBe("low");
    expect(saferAlternative(roads.find((r) => r.riskLevel === "low")!, roads)).toBeNull();
    expect(changeConditions(bootcamp, roads)[2]).toContain(safer.name);
  });
});
