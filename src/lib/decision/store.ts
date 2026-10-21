import type { Db } from "../db";
import { getProfile } from "../futureme";
import { chooseRoad, getSimulation } from "../simulator";
import { toPaths } from "../simulator-paths";
import type { BranchResult, DecisionRequest, DecisionResult, MemoryReference } from "./contract";
import { checkAssumption, evaluateRoutes, scenarioVersion, type RouteDecisionInput } from "./evaluate";
import { jevConfig, type AskOptions, type JevConfig } from "./jev";
import { NOTE_STALE_AFTER_DAYS, optionIndex, type DecisionExtras } from "./rules";
import type { Situation } from "@/types";

export { DECISION_SCHEMA } from "./schema";

// The decision history: one row per decision, with what it read, what Jev answered (validated), what was shown, what
// the person chose and, later, how it went. Rows hold option ids, numbers and note paths, not note text, so deleting a
// memory doesn't leave a copy of it here. Deleting a simulation's decisions removes them for good.

export type ChoiceKind = "accepted" | "override" | "rejected";

export interface DecisionRecord {
  id: string;
  simulationId: number;
  kind: "rank_paths" | "branch_condition";
  parentId: string | null;
  scenarioVersion: string;
  request: DecisionRequest | BranchRequest;
  result: DecisionResult | BranchResult;
  /** What the person was shown: the selected route (or null) and the status. */
  shown: { optionId: string | null; status: string } | null;
  choice: { optionId: string | null; kind: ChoiceKind; reason: string | null; at: string } | null;
  outcome: { text: string; at: string } | null;
  createdAt: string;
}

export interface BranchRequest {
  decisionId: string;
  optionId: string;
  assumption: string;
  /** Kept so the check can be audited; it's what the person typed, and is deleted with the decision. */
  evidence: string;
  source: string | null;
}

interface Row {
  id: string;
  simulation_id: number;
  kind: string;
  parent_id: string | null;
  scenario_version: string;
  request: string;
  result: string;
  shown: string | null;
  choice: string | null;
  choice_kind: string | null;
  choice_reason: string | null;
  chosen_at: string | null;
  outcome: string | null;
  outcome_at: string | null;
  created_at: string;
}

const toRecord = (r: Row): DecisionRecord => ({
  id: r.id,
  simulationId: r.simulation_id,
  kind: r.kind as DecisionRecord["kind"],
  parentId: r.parent_id,
  scenarioVersion: r.scenario_version,
  request: JSON.parse(r.request),
  result: JSON.parse(r.result),
  shown: r.shown ? JSON.parse(r.shown) : null,
  choice: r.choice_kind ? { optionId: r.choice, kind: r.choice_kind as ChoiceKind, reason: r.choice_reason, at: r.chosen_at! } : null,
  outcome: r.outcome ? { text: r.outcome, at: r.outcome_at! } : null,
  createdAt: r.created_at,
});

export function getDecision(db: Db, id: string): DecisionRecord | null {
  const row = db.prepare("SELECT * FROM decisions WHERE id = ?").get(id) as Row | undefined;
  return row ? toRecord(row) : null;
}

export function listDecisions(db: Db, simulationId?: number): DecisionRecord[] {
  const rows = (simulationId === undefined ? db.prepare("SELECT * FROM decisions ORDER BY created_at DESC, rowid DESC LIMIT 200").all() : db.prepare("SELECT * FROM decisions WHERE simulation_id = ? ORDER BY created_at DESC, rowid DESC").all(simulationId)) as Row[];
  return rows.map(toRecord);
}

/** Notes the simulation read, as references with their provenance and age. Their text isn't copied. */
export function memoryReferences(db: Db, paths: string[], now = new Date()): MemoryReference[] {
  if (!paths.length) return [];
  const rows = db.prepare(`SELECT path, title, evidence, updated_at FROM notes WHERE path IN (${paths.map(() => "?").join(",")})`).all(...paths) as { path: string; title: string; evidence: string | null; updated_at: string }[];
  return rows.map((r) => {
    const at = new Date(`${r.updated_at.replace(" ", "T")}Z`);
    return { path: r.path, title: r.title, evidence: r.evidence, updatedAt: r.updated_at, stale: (now.getTime() - at.getTime()) / 86_400_000 > NOTE_STALE_AFTER_DAYS };
  });
}

function routeInput(db: Db, simulationId: number, situation: Situation | null, extras: DecisionExtras): RouteDecisionInput {
  const s = getSimulation(db, simulationId);
  if (!s) throw new Error(`No simulation #${simulationId}.`);
  const sit = situation ?? s.situation;
  if (!sit) throw new Error("Add your starting point first, so the routes can be checked against it.");
  const profile = getProfile(db);
  return {
    simulationId,
    goal: s.goal,
    paths: toPaths(s.result.paths),
    situation: sit,
    original: s.situation,
    extras,
    profile: { dream: profile?.dream ?? "", values: profile?.values ?? "", challenges: profile?.challenges ?? "" },
    memory: memoryReferences(db, s.grounding.notes),
  };
}

/**
 * Ranks a simulation's routes for a starting point. Idempotent: if this exact scenario (same inputs, same model) was
 * already decided by Jev, that record is returned and Jev isn't called again. A "pending" record (Jev was down) is
 * retried.
 */
export async function decideRoutes(db: Db, simulationId: number, situation: Situation | null, extras: DecisionExtras, opts: AskOptions & { cfg?: JevConfig; now?: Date } = {}): Promise<DecisionRecord> {
  const cfg = opts.cfg ?? jevConfig(db);
  const input = routeInput(db, simulationId, situation, extras);
  const version = scenarioVersion(input, cfg.model);
  const existing = db.prepare("SELECT id FROM decisions WHERE simulation_id = ? AND kind = 'rank_paths' AND scenario_version = ? AND status != 'pending' ORDER BY created_at DESC LIMIT 1").get(simulationId, version) as { id: string } | undefined;
  if (existing) return getDecision(db, existing.id)!;

  const { request, result } = await evaluateRoutes(input, cfg, opts);
  db.prepare(
    `INSERT INTO decisions (id, simulation_id, kind, scenario_version, request, result, status, producer, model, latency_ms, input_tokens, cost_usd, shown)
     VALUES (?, ?, 'rank_paths', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    request.decisionId,
    simulationId,
    request.scenarioVersion,
    JSON.stringify(request),
    JSON.stringify(result),
    result.status,
    result.producer,
    result.meta.model,
    result.meta.latencyMs,
    result.meta.inputTokens,
    result.meta.costUsd,
    JSON.stringify({ optionId: result.selectedOptionId, status: result.status }),
  );
  return getDecision(db, request.decisionId)!;
}

/**
 * Records the person's choice and makes it their chosen road. Choosing the recommended route is "accepted"; any other
 * route is an "override", including one the rules ruled out (it's their life; the record keeps the failed checks next
 * to it). A reason is optional. "rejected" turns the recommendation down without choosing anything.
 */
export function chooseRoute(db: Db, decisionId: string, optionId: string | null, kind: ChoiceKind, reason?: string | null) {
  const d = getDecision(db, decisionId);
  if (!d || d.kind !== "rank_paths") throw new Error("That decision no longer exists.");
  const req = d.request as DecisionRequest;
  if (optionId !== null && !req.candidateOptions.some((o) => o.id === optionId)) throw new Error("That route isn't part of this decision.");
  if (kind !== "rejected" && optionId === null) throw new Error("Pick a route.");
  const selected = (d.result as DecisionResult).selectedOptionId;
  const actual: ChoiceKind = kind === "rejected" ? "rejected" : optionId === selected ? "accepted" : "override";
  db.transaction(() => {
    db.prepare("UPDATE decisions SET choice = ?, choice_kind = ?, choice_reason = ?, chosen_at = datetime('now') WHERE id = ?").run(optionId, actual, reason?.trim().slice(0, 500) || null, decisionId);
    // The simulator's chosen road is the one source of truth the other agents plan with; the decision only records it.
    if (optionId !== null) chooseRoad(db, d.simulationId, optionIndex(optionId));
  })();
  return getDecision(db, decisionId)!;
}

export function recordOutcome(db: Db, decisionId: string, text: string) {
  const t = text.trim().slice(0, 1000);
  if (!t) throw new Error("Say how it went.");
  const res = db.prepare("UPDATE decisions SET outcome = ?, outcome_at = datetime('now') WHERE id = ?").run(t, decisionId);
  if (!res.changes) throw new Error("That decision no longer exists.");
  return getDecision(db, decisionId)!;
}

/** Branch checks per route per decision. Lazy and bounded: the tree never grows without the person asking. */
export const MAX_BRANCH_CHECKS = 5;

export async function checkRouteAssumption(db: Db, decisionId: string, optionId: string, assumption: string, evidence: string, source: string | null, opts: AskOptions & { cfg?: JevConfig } = {}): Promise<DecisionRecord> {
  const parent = getDecision(db, decisionId);
  if (!parent || parent.kind !== "rank_paths") throw new Error("That decision no longer exists.");
  const req = parent.request as DecisionRequest;
  const option = req.candidateOptions.find((o) => o.id === optionId);
  if (!option) throw new Error("That route isn't part of this decision.");
  if (!option.assumptions.includes(assumption)) throw new Error("That isn't one of this route's assumptions.");
  const done = (db.prepare("SELECT COUNT(*) AS n FROM decisions WHERE parent_id = ? AND json_extract(request, '$.optionId') = ?").get(decisionId, optionId) as { n: number }).n;
  if (done >= MAX_BRANCH_CHECKS) throw new Error(`You've checked ${MAX_BRANCH_CHECKS} assumptions on this route already. Re-run the comparison to start fresh.`);

  const s = getSimulation(db, parent.simulationId);
  const paths = s ? toPaths(s.result.paths) : [];
  const ranking = (parent.result as DecisionResult).ranking;
  const result = await checkAssumption(opts.cfg ?? jevConfig(db), { decisionId, optionId, assumption, evidence, source, ranking, paths }, opts);
  const id = crypto.randomUUID();
  const request: BranchRequest = { decisionId, optionId, assumption, evidence: evidence.trim().slice(0, 2000), source: source?.trim().slice(0, 300) || null };
  db.prepare(
    `INSERT INTO decisions (id, simulation_id, kind, parent_id, scenario_version, request, result, status, producer, model, latency_ms, input_tokens, cost_usd, shown)
     VALUES (?, ?, 'branch_condition', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    parent.simulationId,
    decisionId,
    parent.scenarioVersion,
    JSON.stringify(request),
    JSON.stringify({ ...result, decisionId: id }),
    result.outcome,
    result.producer,
    result.meta.model,
    result.meta.latencyMs,
    result.meta.inputTokens,
    result.meta.costUsd,
    JSON.stringify({ optionId: result.switchTo, status: result.outcome }),
  );
  return getDecision(db, id)!;
}

export function deleteDecisions(db: Db, simulationId: number): number {
  return db.prepare("DELETE FROM decisions WHERE simulation_id = ?").run(simulationId).changes;
}

/** "r3" → the route's name in its simulation, for history and the vault. */
export function routeName(db: Db, simulationId: number, id: string | null): string | null {
  if (!id) return null;
  const s = getSimulation(db, simulationId);
  return s?.result.paths[optionIndex(id)]?.name ?? null;
}
