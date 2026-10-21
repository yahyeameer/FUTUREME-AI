import type { SimulatedPath, Situation } from "@/types";

// Deterministic "what if" arithmetic for a simulated road. The model reasons about which roads exist and what they
// depend on; this file does the sums: what happens to the timeline with fewer hours, how long a funding gap takes to
// close, when to check in, and what to watch for. Same inputs, same outputs, no model call, so the page can recalculate
// as someone drags a slider and the results are labelled "recalculated" rather than presented as new AI analysis.
// No server imports here: the browser, demo mode and the server all use it.

/** Share of monthly income a person can put toward the goal while keeping their job (same as the simulator's rating). */
export const INCOME_SHARE = 0.25;
const WEEKS_PER_MONTH = 52 / 12;
const MAX_MONTHS = 240;

export interface WhatIfInput {
  /** Hours a week the person can really give. Defaults to the road's own assumption. */
  hoursPerWeek?: number;
  /** Months the first milestone slips by. */
  slipMonths?: number;
}

export interface Recalculated {
  months: { min: number; max: number };
  /** Total effort on the road, in hours, from the road's own pace. Effort is kept constant when hours change. */
  effortHours: { min: number; max: number };
  hoursPerWeek: number;
  /** True when the timeline differs from the model's estimate. */
  changed: boolean;
  /** Money: only when costs are in the person's currency. */
  funds: { comparable: boolean; available: number; shortfall: number; monthsToClose: number | null } | null;
  /** Plain-language notes on what changed and why, for the UI. */
  notes: string[];
}

const clampMonths = (n: number) => Math.max(1, Math.min(MAX_MONTHS, Math.round(n)));

/**
 * Recalculates a road's timeline and funding for a what-if. With fewer hours a week than the road assumes, the same
 * total effort is spread thinner, so months stretch in proportion; more hours than assumed don't shorten it, because
 * most roads have fixed-length parts (terms, hiring cycles) this file can't see. A slipped milestone adds its delay to
 * both ends of the range.
 */
export function recalculate(p: SimulatedPath, s: Situation | null, w: WhatIfInput = {}): Recalculated {
  const hours = Math.max(1, Math.min(80, Math.round(w.hoursPerWeek ?? s?.hoursPerWeek ?? p.hoursPerWeek)));
  const slip = Math.max(0, Math.min(60, Math.round(w.slipMonths ?? 0)));
  const stretch = hours < p.hoursPerWeek ? p.hoursPerWeek / hours : 1;
  const months = { min: clampMonths(p.months.min * stretch + slip), max: clampMonths(p.months.max * stretch + slip) };
  const effortHours = { min: Math.round(p.months.min * WEEKS_PER_MONTH * p.hoursPerWeek), max: Math.round(p.months.max * WEEKS_PER_MONTH * p.hoursPerWeek) };
  const notes: string[] = [];
  if (stretch > 1) notes.push(`At ${hours} hours a week instead of about ${p.hoursPerWeek}, the same work takes about ${Math.round((stretch - 1) * 100)}% longer.`);
  else if (hours > p.hoursPerWeek) notes.push(`More hours than this road assumes don't shorten it here: parts of most roads run on fixed calendars.`);
  if (slip > 0) notes.push(`A ${slip}-month slip on the first milestone pushes the whole road back by about as much.`);

  let funds: Recalculated["funds"] = null;
  if (s) {
    const comparable = p.cost.currency === s.currency;
    const mid = (months.min + months.max) / 2;
    const spare = p.keepsIncome ? s.monthlyIncome * INCOME_SHARE : 0;
    const available = Math.round(s.savings + spare * mid);
    const need = (p.cost.min + p.cost.max) / 2;
    const shortfall = comparable ? Math.max(0, Math.round(need - available)) : 0;
    // Saving toward the gap uses the same share of income, whether or not the road itself keeps the income.
    const saving = s.monthlyIncome * INCOME_SHARE;
    const monthsToClose = shortfall === 0 ? 0 : saving > 0 ? Math.ceil(shortfall / saving) : null;
    funds = { comparable, available, shortfall, monthsToClose };
    if (shortfall > 0) notes.push(monthsToClose === null ? `There's a funding gap and no income to save from, so this road needs a scholarship, employer or loan.` : `Setting aside a quarter of your income would close the gap in about ${monthsToClose} month${monthsToClose === 1 ? "" : "s"}.`);
  }
  return { months, effortHours, hoursPerWeek: hours, changed: months.min !== p.months.min || months.max !== p.months.max, funds, notes };
}

export interface Checkpoint {
  label: string;
  /** Month range after starting, from the recalculated timeline. */
  months: { min: number; max: number };
  /** Calendar window for those months, from the start date. */
  window: { from: string; to: string };
  prompt: string;
}

const addMonths = (start: Date, n: number) => {
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
};
const monthLabel = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Review points along a road: the first steps, a halfway check and the target window. They come from the timeline,
 * not from the model, and each is phrased as a question to ask rather than a promise of where you'll be.
 */
export function checkpoints(months: { min: number; max: number }, start: Date = new Date()): Checkpoint[] {
  const at = (f: number) => ({ min: Math.max(1, Math.round(months.min * f)), max: Math.max(1, Math.round(months.max * f)) });
  const row = (label: string, m: { min: number; max: number }, prompt: string): Checkpoint => ({ label, months: m, window: { from: monthLabel(addMonths(start, m.min)), to: monthLabel(addMonths(start, m.max)) }, prompt });
  const first = { min: 1, max: Math.min(3, Math.max(1, Math.round(months.min * 0.15))) };
  return [
    row("First check-in", first, "Are the first steps done, and does the pace you planned hold?"),
    row("Halfway review", at(0.5), "Do the assumptions this road depends on still hold?"),
    row("Target window", months, "Have you reached the goal, or what is left and why?"),
  ];
}

/** What to watch for on a road: each assumption becomes a signal, plus the strains the numbers show. */
export function warningSignals(p: SimulatedPath, r: Recalculated): string[] {
  const signals = p.assumptions.slice(0, 3).map((a) => `This stops being true: ${a.replace(/\.$/, "")}.`);
  if (r.hoursPerWeek < p.hoursPerWeek) signals.push(`You keep giving fewer than ${p.hoursPerWeek} hours a week for a month or more.`);
  if (r.funds && r.funds.shortfall > 0) signals.push(`The funding gap isn't closing by the halfway review.`);
  return signals;
}

/** When it would make sense to switch roads: tied to the checkpoints, never to a fixed verdict. */
export function changeConditions(p: SimulatedPath, alternatives: SimulatedPath[]): string[] {
  const safer = saferAlternative(p, alternatives);
  return [
    `Two or more of the signals above show up at the halfway review.`,
    p.keepsIncome ? `Your income or the time you have changes for more than a few months.` : `Your savings would run out before the target window.`,
    safer ? `If you need less risk, "${safer.name}" is the closest lower-risk road in this comparison.` : `If you need less risk, run the simulator again with "Safe" risk selected.`,
  ];
}

const RISK_ORDER = { low: 0, medium: 1, high: 2 } as const;

/** The lowest-risk road with a lower risk than this one; ties go to the one closest in time. */
export function saferAlternative(p: SimulatedPath, all: SimulatedPath[]): SimulatedPath | null {
  const mid = (x: SimulatedPath) => (x.months.min + x.months.max) / 2;
  const options = all.filter((x) => x !== p && x.name !== p.name && RISK_ORDER[x.riskLevel] < RISK_ORDER[p.riskLevel]);
  options.sort((a, b) => RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel] || Math.abs(mid(a) - mid(p)) - Math.abs(mid(b) - mid(p)));
  return options[0] ?? null;
}
