import fs from "node:fs";
import path from "node:path";
import { baseDataDir, dataDir } from "./tenant";
import { multiUser } from "./workspace-id";

// Spending limits for a shared server: every real model call is counted per workspace and for the whole server, per
// UTC day, and refused once a limit is reached, so a public link can't run through the model credits. On by default in
// multi-user mode; elsewhere only when a limit is set. 0 turns a limit off.
//   FUTUREME_DAILY_CALLS         model calls per workspace per day      (multi-user default 120)
//   FUTUREME_DAILY_TOKENS        tokens per workspace per day           (multi-user default 250,000)
//   FUTUREME_SERVER_DAILY_TOKENS tokens for all workspaces per day      (multi-user default 3,000,000)
// The stand-in model is free and never counted. Counts live in usage.json next to each workspace's database.

export interface Usage {
  day: string;
  calls: number;
  tokens: number;
  /** Voice calls started today (browser or phone). */
  voiceCalls: number;
  /** Voice chat turns today: each one speaks a reply in the person's cloned voice. */
  voiceTurns: number;
}

export interface Limits {
  calls: number;
  tokens: number;
  serverTokens: number;
}

export class BudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetError";
  }
}

const DEFAULTS: Limits = { calls: 120, tokens: 250_000, serverTokens: 3_000_000 };

function limit(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw === "") return multiUser() ? fallback : 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function limits(): Limits {
  return { calls: limit("FUTUREME_DAILY_CALLS", DEFAULTS.calls), tokens: limit("FUTUREME_DAILY_TOKENS", DEFAULTS.tokens), serverTokens: limit("FUTUREME_SERVER_DAILY_TOKENS", DEFAULTS.serverTokens) };
}

const today = () => new Date().toISOString().slice(0, 10);

// Kept in memory and written through, so parallel calls in one process (a council's four voices) count correctly.
const g = globalThis as unknown as { __futuremeUsage?: Map<string, Usage> };
const cache = (g.__futuremeUsage ??= new Map());

function read(file: string): Usage {
  const day = today();
  let u = cache.get(file);
  if (!u) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Usage>;
      u = { day: String(parsed.day ?? ""), calls: Number(parsed.calls) || 0, tokens: Number(parsed.tokens) || 0, voiceCalls: Number(parsed.voiceCalls) || 0, voiceTurns: Number(parsed.voiceTurns) || 0 };
    } catch {
      u = { day, calls: 0, tokens: 0, voiceCalls: 0, voiceTurns: 0 };
    }
    cache.set(file, u);
  }
  if (u.day !== day) Object.assign(u, { day, calls: 0, tokens: 0, voiceCalls: 0, voiceTurns: 0 });
  return u;
}

function write(file: string, u: Usage) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(u));
  } catch {
    // Counting must never break a reply; the in-memory count still applies.
  }
}

const workspaceFile = () => path.join(dataDir(), "usage.json");
const serverFile = () => path.join(baseDataDir(), "usage-server.json");

/** Today's usage for the current workspace, and the limits that apply. */
export function usageToday(): { usage: Usage; limits: Limits } {
  return { usage: { ...read(workspaceFile()) }, limits: limits() };
}

/** Before a model call: refuses it when today's limits are used up, and counts it. */
export function chargeCall() {
  const l = limits();
  if (!l.calls && !l.tokens && !l.serverTokens) return;
  const mine = read(workspaceFile());
  const all = read(serverFile());
  const reset = "It resets at midnight UTC.";
  if (l.serverTokens && all.tokens >= l.serverTokens) throw new BudgetError(`This demo server has used its model budget for today. ${reset}`);
  if (l.calls && mine.calls >= l.calls) throw new BudgetError(`You've reached today's limit of ${l.calls} model calls for this workspace. ${reset}`);
  if (l.tokens && mine.tokens >= l.tokens) throw new BudgetError(`You've reached today's model budget for this workspace. ${reset}`);
  mine.calls += 1;
  all.calls += 1;
  write(workspaceFile(), mine);
  write(serverFile(), all);
}

/** After a model call: adds the tokens it used. */
export function chargeTokens(tokens: number) {
  const l = limits();
  if (!l.calls && !l.tokens && !l.serverTokens) return;
  if (!Number.isFinite(tokens) || tokens <= 0) return;
  const mine = read(workspaceFile());
  const all = read(serverFile());
  mine.tokens += tokens;
  all.tokens += tokens;
  write(workspaceFile(), mine);
  write(serverFile(), all);
}

// Voice calls cost ElevenLabs minutes on whoever's key places them, so a shared demo server caps them per day too.
//   TWIN_DAILY_VOICE_CALLS         per workspace (multi-user default 3)
//   TWIN_SERVER_DAILY_VOICE_CALLS  for the whole server (multi-user default 30)
export function voiceLimits() {
  return { perWorkspace: limit("TWIN_DAILY_VOICE_CALLS", 3), server: limit("TWIN_SERVER_DAILY_VOICE_CALLS", 30) };
}

/** Before a voice call starts: refuses it past today's limits, and counts it. */
export function chargeVoiceCall() {
  const l = voiceLimits();
  if (!l.perWorkspace && !l.server) return;
  const mine = read(workspaceFile());
  const all = read(serverFile());
  if (l.server && all.voiceCalls >= l.server) throw new BudgetError("This demo server has used today's voice calls. Try again tomorrow (it resets at midnight UTC).");
  if (l.perWorkspace && mine.voiceCalls >= l.perWorkspace) throw new BudgetError(`You've had today's ${l.perWorkspace} voice calls on this demo server. It resets at midnight UTC.`);
  mine.voiceCalls += 1;
  all.voiceCalls += 1;
  write(workspaceFile(), mine);
  write(serverFile(), all);
}

// Voice chat turns spend ElevenLabs credits (characters spoken) on whoever's key speaks them, and a plan's monthly pool
// is small, so they are capped harder than calls.
//   TWIN_DAILY_VOICE_TURNS         per workspace (multi-user default 10)
//   TWIN_SERVER_DAILY_VOICE_TURNS  for the whole server (multi-user default 60)
export function voiceTurnLimits() {
  return { perWorkspace: limit("TWIN_DAILY_VOICE_TURNS", 10), server: limit("TWIN_SERVER_DAILY_VOICE_TURNS", 60) };
}

/** Before a voice chat turn: refuses it past today's limits, and counts it. */
export function chargeVoiceTurn() {
  const l = voiceTurnLimits();
  if (!l.perWorkspace && !l.server) return;
  const mine = read(workspaceFile());
  const all = read(serverFile());
  if (l.server && all.voiceTurns >= l.server) throw new BudgetError("This demo server has used today's voice replies. Try again tomorrow (it resets at midnight UTC).");
  if (l.perWorkspace && mine.voiceTurns >= l.perWorkspace) throw new BudgetError(`You've had today's ${l.perWorkspace} spoken replies on this demo server. It resets at midnight UTC.`);
  mine.voiceTurns += 1;
  all.voiceTurns += 1;
  write(workspaceFile(), mine);
  write(serverFile(), all);
}

/** For tests: forget the in-memory counts. */
export function resetUsageCache() {
  cache.clear();
}
