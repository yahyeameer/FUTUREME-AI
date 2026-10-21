import { z } from "zod";
import { getSetting, setSetting, type Db } from "../db";
import { seal, unseal } from "../secret-box";

// The typed adapter for Jev, TypeSafe's "System One" decision model. Jev is not a chat model: it takes a `state` and
// named, typed questions and returns typed answers with probabilities. Verified against TypeSafe's OpenAPI spec
// (https://api.typesafe.ai/openapi.json, v0.2.0) and docs (https://docs.typesafe.ai):
//
//   POST {base}/v1/systemone   Authorization: Bearer <key>
//   { model, state, questions: { <name>: noul | choice | score } }
//   → { model: "<versioned id>", answers: { <name>: answer }, usage: { input_tokens, output_tokens } }
//
// Nothing outside src/lib/decision imports this file. Every response is validated against the exact questions asked;
// anything malformed, missing or extra is rejected as a whole, never patched into a confident answer.

export const TYPESAFE_BASE_URL = () => (process.env.TYPESAFE_BASE_URL?.trim() || "https://api.typesafe.ai").replace(/\/+$/, "");
/**
 * Pinned to a versioned id rather than the moving `jev-latest` alias, because the thresholds in rules.ts were set
 * against it (TypeSafe recommends this). TYPESAFE_MODEL overrides it, e.g. "jev-1.14.0" or "jev-preview".
 */
export const DEFAULT_JEV_MODEL = "jev-1.13.0";
/** TypeSafe's published price: $0.042 per million input tokens; output tokens are free (docs.typesafe.ai/models). */
export const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;

export type JevQuestion =
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };

export type JevAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: "score"; score: number; confidence: number; legend: Record<string, unknown>; probabilities: Record<string, number> };

export interface JevResponse {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
  attempts: number;
}

export type JevErrorKind = "not_configured" | "timeout" | "unavailable" | "rate_limited" | "auth" | "bad_request" | "invalid_response";

export class JevError extends Error {
  constructor(
    readonly kind: JevErrorKind,
    message: string,
    readonly status?: number,
    readonly attempts = 1,
  ) {
    super(message);
    this.name = "JevError";
  }
}

export interface JevConfig {
  apiKey: string | null;
  keySource: "env" | "app" | null;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxAttempts: number;
}

const KEY_SETTING = "typesafe_key";

/** The key comes from TYPESAFE_API_KEY (wins) or the one saved in the app, encrypted like the voice engines' keys. */
export function jevConfig(db?: Db): JevConfig {
  const env = process.env.TYPESAFE_API_KEY?.trim();
  const sealed = db ? getSetting(db, KEY_SETTING) : null;
  const app = sealed ? unseal(sealed) : null;
  return {
    apiKey: env || app || null,
    keySource: env ? "env" : app ? "app" : null,
    baseUrl: TYPESAFE_BASE_URL(),
    model: process.env.TYPESAFE_MODEL?.trim() || DEFAULT_JEV_MODEL,
    timeoutMs: clampInt(process.env.JEV_TIMEOUT_MS, 1000, 60_000, 8000),
    maxAttempts: clampInt(process.env.JEV_MAX_ATTEMPTS, 1, 5, 3),
  };
}

/** What the settings page shows: never the key, only whether one is set and its last four characters. */
export function jevStatus(db: Db) {
  const c = jevConfig(db);
  return { configured: !!c.apiKey, keySource: c.keySource, keyHint: c.apiKey ? c.apiKey.slice(-4) : null, model: c.model };
}

export function saveJevKey(db: Db, key: string | null) {
  const k = key?.trim() ?? "";
  if (!k) return setSetting(db, KEY_SETTING, null);
  if (/\s/.test(k) || k.length > 500) throw new Error("That key doesn't look right. Paste it again.");
  setSetting(db, KEY_SETTING, seal(k));
}

const clampInt = (v: string | undefined, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const prob = z.number().finite().min(0).max(1);
const ResponseSchema = z.object({
  model: z.string().min(1).max(80),
  answers: z.record(z.string(), z.object({ type: z.string() }).passthrough()),
  usage: z.object({ input_tokens: z.number().int().min(0), output_tokens: z.number().int().min(0) }),
});

/** Sum of probabilities may drift from 1 by rounding; more than this is not a distribution. */
const SUM_TOLERANCE = 0.05;

/**
 * Checks a raw response against the questions that were asked. Returns the typed answers, or the reasons it was
 * rejected. Missing answers, extra answers, wrong types, unknown choices and out-of-range numbers all reject it.
 */
export function validateJevResponse(questions: Record<string, JevQuestion>, raw: unknown): { ok: true; model: string; answers: Record<string, JevAnswer>; usage: JevResponse["usage"] } | { ok: false; errors: string[] } {
  const parsed = ResponseSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "response"}: ${i.message}`) };
  const errors: string[] = [];
  const answers: Record<string, JevAnswer> = {};
  const r = parsed.data;
  for (const name of Object.keys(r.answers)) if (!(name in questions)) errors.push(`${name}: answer to a question that wasn't asked`);
  for (const [name, q] of Object.entries(questions)) {
    const a = r.answers[name] as Record<string, unknown> | undefined;
    if (!a) {
      errors.push(`${name}: missing answer`);
      continue;
    }
    if (a.type !== q.type) {
      errors.push(`${name}: expected a ${q.type} answer, got ${String(a.type)}`);
      continue;
    }
    if (q.type === "noul") {
      const p = prob.safeParse(a.noul);
      if (!p.success) errors.push(`${name}: noul must be a number from 0 to 1`);
      else answers[name] = { type: "noul", noul: p.data };
      continue;
    }
    const keys = q.type === "choice" ? Object.keys(q.criteria) : q.criteria.map((_, i) => String(i));
    const conf = prob.safeParse(a.confidence);
    const dist = z.record(z.string(), prob).safeParse(a.probabilities);
    if (!conf.success) errors.push(`${name}: confidence must be a number from 0 to 1`);
    if (!dist.success) {
      errors.push(`${name}: probabilities must be numbers from 0 to 1`);
      continue;
    }
    const got = Object.keys(dist.data);
    if (got.length !== keys.length || !keys.every((k) => k in dist.data)) errors.push(`${name}: probabilities don't match the options asked`);
    const sum = Object.values(dist.data).reduce((s, x) => s + x, 0);
    if (Math.abs(sum - 1) > SUM_TOLERANCE) errors.push(`${name}: probabilities sum to ${sum.toFixed(3)}, not 1`);
    if (q.type === "choice") {
      if (typeof a.choice !== "string" || !keys.includes(a.choice)) errors.push(`${name}: choice "${String(a.choice)}" isn't one of the options`);
      else if (conf.success) answers[name] = { type: "choice", choice: a.choice, confidence: conf.data, probabilities: dist.data };
    } else {
      const score = z.number().finite().min(0).max(keys.length - 1).safeParse(a.score);
      if (!score.success) errors.push(`${name}: score must be between 0 and ${keys.length - 1}`);
      else if (conf.success) answers[name] = { type: "score", score: score.data, confidence: conf.data, legend: (a.legend as Record<string, unknown>) ?? {}, probabilities: dist.data };
    }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, model: r.model, answers, usage: { inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens } };
}

export interface AskOptions {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Called once per finished request, for latency and cost instrumentation. Never receives state or the key. */
  onCall?: (event: { model: string | null; latencyMs: number; attempts: number; inputTokens: number; ok: boolean; error?: JevErrorKind; questions: number }) => void;
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504, 529]);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One System One request: state plus named questions. Times out, retries transient failures a bounded number of times. */
export async function askJev(cfg: JevConfig, state: unknown, questions: Record<string, JevQuestion>, opts: AskOptions = {}): Promise<JevResponse> {
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? wait;
  const n = Object.keys(questions).length;
  const report = (e: Parameters<NonNullable<AskOptions["onCall"]>>[0]) => {
    opts.onCall?.(e);
    // One line per call, with no state, questions or key in it.
    if (process.env.JEV_LOG !== "off") console.info(JSON.stringify({ event: "jev.call", ...e }));
  };
  if (!cfg.apiKey) throw new JevError("not_configured", "Jev isn't set up: add a TypeSafe API key (TYPESAFE_API_KEY, or in Settings).", undefined, 0);
  if (!n) throw new JevError("bad_request", "Ask Jev at least one question.", undefined, 0);

  const started = Date.now();
  let last: JevError | null = null;
  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
    let res: Response;
    try {
      res = await doFetch(`${cfg.baseUrl}/v1/systemone`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: cfg.model, state, questions }),
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      last = ctrl.signal.aborted ? new JevError("timeout", `Jev didn't answer within ${cfg.timeoutMs} ms.`, undefined, attempt) : new JevError("unavailable", `Couldn't reach Jev (${(err as Error).message}).`, undefined, attempt);
      if (attempt < cfg.maxAttempts) await sleep(backoff(attempt));
      continue;
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) {
      const v = validateJevResponse(questions, body);
      const latencyMs = Date.now() - started;
      if (!v.ok) {
        report({ model: null, latencyMs, attempts: attempt, inputTokens: 0, ok: false, error: "invalid_response", questions: n });
        // A malformed answer isn't transient, so it isn't retried.
        throw new JevError("invalid_response", `Jev's answer didn't match the questions: ${v.errors.slice(0, 3).join("; ")}`, res.status, attempt);
      }
      report({ model: v.model, latencyMs, attempts: attempt, inputTokens: v.usage.inputTokens, ok: true, questions: n });
      return { model: v.model, answers: v.answers, usage: v.usage, latencyMs, attempts: attempt };
    }
    const detail = errorDetail(body);
    if (res.status === 401 || res.status === 403) last = new JevError("auth", "Jev rejected the API key.", res.status, attempt);
    else if (res.status === 429) last = new JevError("rate_limited", "Jev's rate limit was reached.", res.status, attempt);
    else if (RETRYABLE.has(res.status)) last = new JevError("unavailable", `Jev is unavailable right now (${res.status}).`, res.status, attempt);
    else last = new JevError("bad_request", `Jev refused the request (${res.status}${detail ? `: ${detail}` : ""}).`, res.status, attempt);
    if (!RETRYABLE.has(res.status) || attempt === cfg.maxAttempts) break;
    await sleep(retryAfter(res) ?? backoff(attempt));
  }
  report({ model: null, latencyMs: Date.now() - started, attempts: last?.attempts ?? cfg.maxAttempts, inputTokens: 0, ok: false, error: last?.kind, questions: n });
  throw last ?? new JevError("unavailable", "Jev is unavailable right now.");
}

const backoff = (attempt: number) => Math.min(4000, 300 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 100);

function retryAfter(res: Response): number | null {
  const v = Number(res.headers.get("retry-after"));
  return Number.isFinite(v) && v >= 0 ? Math.min(5000, v * 1000) : null;
}

function errorDetail(body: unknown): string {
  const d = (body as { detail?: unknown } | null)?.detail;
  if (typeof d === "string") return d.slice(0, 160);
  if (d && typeof d === "object" && "message" in d) return String((d as { message: unknown }).message).slice(0, 160);
  if (Array.isArray(d)) return d.map((x) => (x as { msg?: string }).msg).filter(Boolean).join("; ").slice(0, 160);
  return "";
}

/** Score answers as 0–1, higher is better (levels are always given worst first). */
export const scoreValue = (a: Extract<JevAnswer, { type: "score" }>, levels: number) => (levels > 1 ? a.score / (levels - 1) : 0);
