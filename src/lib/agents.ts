import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { Db } from "./db";
import { DOCKER_TOOLSET, dockerToolDefs } from "./docker-mcp";
import { dockerAgentBackend, inProcessBackend, lastToolEventId, runContext, toolDefs, toolEventsForRun, toolEventsSince, type OnDelta, type ToolEvent } from "./futureme";
import { getProvider, type ChatMessage, type JsonSchemaSpec, type LlmProvider, type ReasoningMode } from "./llm";
import { AGENT_REASONING } from "./nemotron";

// TOMORA's agent team. agents/futureme.yaml is the single source of truth: with DOCKER_AGENT_URL set, each agent runs in
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
  | "helper_memory"
  | "helper_web"
  | "supervisor"
  | "mission_lead"
  | "twin"
  | "twin_voice"
  | "twin_proxy";

export interface AgentSpec {
  name: string;
  description: string;
  instruction: string;
  tools: string[];
  subAgents: string[];
}

interface AgentFile {
  agents: Record<string, { description?: string; instruction?: string; sub_agents?: string[]; toolsets?: { type: string; tools?: string[]; args?: string[] }[] }>;
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
    tools: (a.toolsets ?? []).flatMap((t) => (t.type === "mcp" ? (t.tools ?? (isDockerToolset(t) ? [DOCKER_TOOLSET] : [])) : [t.type])),
    subAgents: a.sub_agents ?? [],
  }));
  cache = { mtime, specs };
  return specs;
}

// The bridge to the Docker MCP Gateway has no fixed tool list: it offers whatever servers the user enabled in Docker.
const isDockerToolset = (t: { args?: string[] }) => (t.args ?? []).some((a) => a.endsWith("docker-tools-server.ts"));

export function agentSpec(name: AgentName): AgentSpec {
  const spec = agentTeam().find((a) => a.name === name);
  if (!spec) throw new Error(`Agent "${name}" is not defined in agents/futureme.yaml.`);
  return spec;
}

export interface AgentRun {
  reply: string;
  backend: string;
  /** Tool calls logged while the agent ran (by the MCP server for Docker Agent, or in-process). */
  events: ToolEvent[];
  /** True when events belong to this run alone. Docker Agent runs share one tool log, so parallel runs can overlap. */
  exactEvents: boolean;
}

/** Runs one agent from the team on a conversation and returns its final text. */
export async function runAgent(
  db: Db,
  name: AgentName,
  messages: ChatMessage[],
  opts: {
    onDelta?: OnDelta;
    provider?: LlmProvider;
    /** In-process only: a narrower tool list than the agent's own (Docker Agent enforces the YAML's list). */
    tools?: string[];
    /** Tags this run's in-process tool calls so they can be told apart from parallel runs. */
    runId?: number;
    /** In-process only: the JSON schema the reply must follow (Nemotron structured output). */
    schema?: JsonSchemaSpec;
    /** In-process only: overrides the agent's reasoning mode from nemotron.ts. */
    reasoning?: ReasoningMode;
    /** In-process only: replaces the agent's instruction for this run (a spoken chat wants different pacing than a call). */
    instruction?: string;
  } = {},
): Promise<AgentRun> {
  const spec = agentSpec(name);
  const url = process.env.DOCKER_AGENT_URL;
  const tools = opts.tools ? spec.tools.filter((t) => opts.tools!.includes(t)) : spec.tools;
  const backend = url
    ? dockerAgentBackend(url, name)
    : inProcessBackend(opts.provider ?? getProvider(), {
        tools: toolDefs(tools),
        instruction: opts.instruction ?? spec.instruction,
        extraTools: tools.includes(DOCKER_TOOLSET) ? dockerToolDefs : undefined,
        reasoning: opts.reasoning ?? AGENT_REASONING[name],
        schema: opts.schema,
      });
  const before = lastToolEventId(db);
  const go = () => backend.run(db, messages, opts.onDelta);
  const reply = opts.runId && !url ? await runContext.run({ runId: opts.runId }, go) : await go();
  const exactEvents = !!opts.runId && !url;
  return { reply, backend: backend.name, events: exactEvents ? toolEventsForRun(db, opts.runId!) : toolEventsSince(db, before), exactEvents };
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
