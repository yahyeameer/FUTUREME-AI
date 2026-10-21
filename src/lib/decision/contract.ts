import { z } from "zod";

// FutureMe's decision contract: what any decision component is asked, and what the app accepts back. It doesn't depend
// on Jev's wire format (that mapping lives in jev.ts), so the rest of the app never sees TypeSafe's types.
// Shared by the server and the browser: no server imports here.
//
// Who does what:
//   Nemotron  proposes the routes and explains them (simulator.ts). It never decides here.
//   Rules     do every calculation and enforce hard constraints (rules.ts). They are authoritative.
//   Jev       answers narrow, typed questions about routes that already passed the rules (evaluate.ts).

/** Where a value came from. Memory is context, not proof, so a note is never "verified" just because it's stored. */
export const PROVENANCE = ["user", "verified", "calculated", "estimate", "unknown"] as const;
export type Provenance = (typeof PROVENANCE)[number];

export const FactSchema = z.object({
  key: z.string().min(1).max(80),
  label: z.string().min(1).max(160),
  value: z.union([z.string().max(600), z.number().finite(), z.boolean(), z.null()]),
  unit: z.string().max(16).optional(),
  provenance: z.enum(PROVENANCE),
  /** Required for "verified": where it came from and when it was read. */
  sourceUrl: z.string().url().max(500).optional(),
  retrievedAt: z.string().max(40).optional(),
  /** True once the fact is older than the rules allow (see rules.ts STALE_AFTER_DAYS). */
  stale: z.boolean().optional(),
});
export type Fact = z.infer<typeof FactSchema>;

export interface CandidateOption {
  /** Stable within a scenario version: the route's index in the simulation, as "r<index>". */
  id: string;
  label: string;
  summary: string;
  /** What the rules and Jev may look at. Numbers here are the model's estimates unless a verified fact replaces them. */
  attributes: Record<string, string | number | boolean>;
  assumptions: string[];
  risks: string[];
}

/** One explicit criterion. "rules" criteria are computed in code; "jev" criteria are asked as Score questions. */
export interface DecisionCriterion {
  id: string;
  label: string;
  by: "rules" | "jev";
  weight: number;
  /** For Jev criteria: the instruction and the ordered levels, worst first. */
  instructions?: string;
  levels?: string[];
  /** Facts this criterion reads, so a change re-evaluates only what depends on it. */
  dependsOn: string[];
}

export interface HardConstraint {
  id: string;
  label: string;
  dependsOn: string[];
}

export interface MemoryReference {
  path: string;
  title: string;
  evidence: string | null;
  updatedAt: string | null;
  stale: boolean;
}

export type DecisionType = "rank_paths" | "branch_condition";

export interface DecisionRequest {
  decisionId: string;
  /** Local single-user install: the workspace, never an email or a name. */
  scopeId: string;
  scenarioId: string;
  /** Hash of everything the decision reads, so an unchanged scenario is never evaluated twice. */
  scenarioVersion: string;
  decisionType: DecisionType;
  candidateOptions: CandidateOption[];
  decisionCriteria: DecisionCriterion[];
  verifiedFacts: Fact[];
  relevantMemoryReferences: MemoryReference[];
  hardConstraints: HardConstraint[];
  missingInformation: MissingInfo[];
  /** The Jev question set this request maps to (see jev.ts). */
  requestedOutputSchema: string;
  /** Debt, migration, dependants, health or safety: a recommendation is never final without the person. */
  highImpact: string[];
}

export interface MissingInfo {
  key: string;
  label: string;
  /** Option ids whose hard constraints can't be checked without it. Empty when it only weakens the decision. */
  blocks: string[];
}

export interface ConstraintCheck {
  constraintId: string;
  /** null: couldn't be checked, because a fact is missing or stale. */
  ok: boolean | null;
  detail: string;
}

export interface CriterionScore {
  criterionId: string;
  by: "rules" | "jev";
  /** 0–1, higher is better. For Jev: the expected level divided by the top level. */
  value: number;
  /** Jev's own confidence (0–1); null for rules. */
  confidence: number | null;
}

export interface RankedOption {
  optionId: string;
  eligible: boolean;
  checks: ConstraintCheck[];
  /** Weighted sum of the criterion scores, 0–1; null when it wasn't evaluated. */
  composite: number | null;
  scores: CriterionScore[];
}

/**
 * decided      the selected route passed every rule and Jev was confident and consistent
 * needs_review there is a recommendation, but the person must confirm it (uncertain, inconsistent or high impact)
 * abstained    no safe recommendation: nothing passed the rules, or information that blocks the decision is missing
 * pending      Jev wasn't available or isn't configured; only the rules' order is shown, with no selection
 */
export const DECISION_STATUS = ["decided", "needs_review", "abstained", "pending"] as const;
export type DecisionStatus = (typeof DECISION_STATUS)[number];

export interface DecisionMeta {
  /** Versioned id that answered, e.g. "jev-1.13.0"; null when Jev wasn't called. */
  model: string | null;
  latencyMs: number;
  calls: number;
  attempts: number;
  inputTokens: number;
  outputTokens: number;
  /** From TypeSafe's published price (input tokens only). */
  costUsd: number;
  evaluatedAt: string;
  error?: string;
}

export interface DecisionResult {
  decisionId: string;
  decisionType: DecisionType;
  status: DecisionStatus;
  /** "jev" only when a validated Jev answer shaped the result. Never Nemotron. */
  producer: "jev" | "rules";
  selectedOptionId: string | null;
  ranking: RankedOption[];
  /** Jev's confidence in the selection, after the order cross-check; null when there is no selection. */
  confidence: number | null;
  /** Whether Jev picked the same route with the options in both orders (its documented first-option bias). */
  orderConsistent: boolean | null;
  /** Jev's direct pick in each order, kept so a what-if change can be re-combined without asking again. */
  pick?: { forward: string; reverse: string; confidence: number } | null;
  /** Plain reasons for the status, shown to the person. */
  reasons: string[];
  evidence: { facts: string[]; criteria: string[]; memory: string[] };
  validation: { ok: boolean; errors: string[] };
  meta: DecisionMeta;
}

/** Result of checking one route assumption ("Holds only if…") against evidence the person supplied. */
export interface BranchResult {
  decisionId: string;
  optionId: string;
  assumption: string;
  /** holds / fails: Jev was clear; unclear: needs the person; no_evidence: Jev wasn't asked. */
  outcome: "holds" | "fails" | "unclear" | "no_evidence";
  producer: "jev" | "rules";
  probability: number | null;
  relevance: number | null;
  /** When the assumption fails: the next eligible route that doesn't rest on it. */
  switchTo: string | null;
  reasons: string[];
  meta: DecisionMeta;
}

export const emptyMeta = (error?: string): DecisionMeta => ({
  model: null,
  latencyMs: 0,
  calls: 0,
  attempts: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  evaluatedAt: new Date().toISOString(),
  ...(error ? { error } : {}),
});
