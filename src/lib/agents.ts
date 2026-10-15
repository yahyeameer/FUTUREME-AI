import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { Db } from "./db";
import { dockerAgentBackend, inProcessBackend, lastToolEventId, toolDefs, toolEventsSince, type OnDelta } from "./futureme";
import { getProvider, type ChatMessage, type LlmProvider } from "./llm";

// FutureMe's agent team. agents/futureme.yaml is the single source of truth: with DOCKER_AGENT_URL set, each agent runs in
// Docker Agent (`serve chat`), called by name. Without it, the app reads the same instructions and tool lists and runs the
// agent loop in-process, so every feature works either way.

export type AgentName =
  | "root"
  | "voice_horizon"
  | "voice_next_year"
  | "voice_skeptic"
  | "voice_mentor"
  | "council_chair"
  | "verifier"
  | "researcher"
  | "night_shift"
  | "twin_voice";

export interface AgentSpec {
  name: string;
  description: string;
  instruction: string;
  tools: string[];
  subAgents: string[];
}

interface AgentFile {
  agents: Record<string, { description?: string; instruction?: string; sub_agents?: string[]; toolsets?: { type: string; tools?: string[] }[] }>;
}

export function agentFilePath() {
  return path.join(process.cwd(), "agents", "futureme.yaml");
}

let cache: { mtime: number; specs: AgentSpec[] } | null = null;

export function agentTeam(file = agentFilePath()): AgentSpec[] {
  const mtime = fs.statSync(/*turbopackIgnore: true*/ file).mtimeMs;
  if (cache?.mtime === mtime) return cache.specs;
  const doc = yaml.load(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as AgentFile;
  const specs = Object.entries(doc.agents).map(([name, a]) => ({
    name,
    description: a.description ?? "",
    instruction: (a.instruction ?? "").trim(),
    tools: (a.toolsets ?? []).flatMap((t) => (t.type === "mcp" ? (t.tools ?? []) : [t.type])),
    subAgents: a.sub_agents ?? [],
  }));
  cache = { mtime, specs };
  return specs;
}

export function agentSpec(name: AgentName): AgentSpec {
  const spec = agentTeam().find((a) => a.name === name);
  if (!spec) throw new Error(`Agent "${name}" is not defined in agents/futureme.yaml.`);
  return spec;
}

export interface AgentRun {
  reply: string;
  backend: string;
  /** Tool calls logged while the agent ran (by the MCP server for Docker Agent, or in-process). */
  events: ReturnType<typeof toolEventsSince>;
}

/** Runs one agent from the team on a conversation and returns its final text. */
export async function runAgent(
  db: Db,
  name: AgentName,
  messages: ChatMessage[],
  opts: { onDelta?: OnDelta; provider?: LlmProvider } = {},
): Promise<AgentRun> {
  const spec = agentSpec(name);
  const url = process.env.DOCKER_AGENT_URL;
  const backend = url
    ? dockerAgentBackend(url, name)
    : inProcessBackend(opts.provider ?? getProvider(), { tools: toolDefs(spec.tools), instruction: spec.instruction });
  const before = lastToolEventId(db);
  const reply = await backend.run(db, messages, opts.onDelta);
  return { reply, backend: backend.name, events: toolEventsSince(db, before) };
}

/** Pulls the first JSON object out of a model reply, which may wrap it in prose or a code fence. */
export function parseJsonReply<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
