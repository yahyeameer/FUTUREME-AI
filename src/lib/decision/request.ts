import type { SimulatedPath, Situation } from "@/types";
import { emptyMeta, type DecisionRequest, type DecisionResult, type MemoryReference, type MissingInfo } from "./contract";
import { HARD_CONSTRAINTS, RANK_CRITERIA, checkAll, combine, situationFacts, toCandidate, type DecisionExtras, type OptionCheck } from "./rules";

// Builds the provider-independent decision request from a simulation and a starting point. Pure, so demo mode (which
// has no Jev) can show the rules' half of a decision in the browser too.

export interface RouteDecisionInput {
  simulationId: number;
  goal: string;
  paths: SimulatedPath[];
  /** The starting point the decision is made for (the what-if values, if the person moved them). */
  situation: Situation;
  /** The starting point the simulation was made with, to mark what-if values as estimates. */
  original: Situation | null;
  extras: DecisionExtras;
  profile: { dream: string; values: string; challenges: string };
  memory: MemoryReference[];
}

export function buildRouteRequest(input: RouteDecisionInput, version: string, now = new Date()): { request: DecisionRequest; checks: ReturnType<typeof checkAll> } {
  const checks = checkAll(input.paths, input.situation, input.extras, now);
  const missing = new Map<string, MissingInfo>();
  for (const c of checks)
    for (const m of c.missing) {
      const prev = missing.get(m.key);
      missing.set(m.key, prev ? { ...prev, blocks: [...new Set([...prev.blocks, ...m.blocks])] } : m);
    }
  if (!input.profile.values.trim()) missing.set("profile.values", { key: "profile.values", label: "What matters to you (your values, in Settings)", blocks: [] });
  if (!input.situation.location) missing.set("situation.location", { key: "situation.location", label: "Where you live", blocks: [] });
  for (const m of input.memory.filter((x) => x.stale)) missing.set(`memory.${m.path}`, { key: `memory.${m.path}`, label: `"${m.title}" may be out of date`, blocks: [] });
  const highImpact = [...new Set(checks.flatMap((c) => c.highImpact))];
  const request: DecisionRequest = {
    decisionId: crypto.randomUUID(),
    scopeId: "local",
    scenarioId: `simulation-${input.simulationId}`,
    scenarioVersion: version,
    decisionType: "rank_paths",
    candidateOptions: input.paths.map((p, i) => toCandidate(p, i, input.extras, now)),
    decisionCriteria: RANK_CRITERIA,
    verifiedFacts: situationFacts(input.situation, input.original, input.extras, now),
    relevantMemoryReferences: input.memory,
    hardConstraints: HARD_CONSTRAINTS,
    missingInformation: [...missing.values()],
    requestedOutputSchema: "typesafe.systemone/v1: score per criterion per route + choice over routes (forward, reverse)",
    highImpact,
  };
  return { request, checks };
}

/** Route names by option id, for reasons the person reads. */
export const labelsOf = (request: DecisionRequest) => Object.fromEntries(request.candidateOptions.map((o) => [o.id, o.label]));

/** The parts of a result that only depend on the request. */
export function evidenceOf(request: DecisionRequest) {
  return {
    decisionId: request.decisionId,
    decisionType: "rank_paths" as const,
    evidence: { facts: request.verifiedFacts.map((f) => f.key), criteria: RANK_CRITERIA.map((c) => c.id), memory: request.relevantMemoryReferences.map((m) => m.path) },
  };
}

/** The rules' half on its own: an order, never a selection. Used when Jev isn't configured, is down or failed. */
export function rulesOnlyResult(request: DecisionRequest, checks: OptionCheck[], error?: string): DecisionResult {
  const r = combine({ decisionId: request.decisionId, checks, criteria: RANK_CRITERIA, jev: null, pick: null, missingBlocking: request.missingInformation.filter((m) => m.blocks.length), labels: labelsOf(request) });
  return { ...evidenceOf(request), ...r, reasons: error ? [...r.reasons, error] : r.reasons, validation: { ok: !error, errors: error ? [error] : [] }, meta: emptyMeta(error) };
}
