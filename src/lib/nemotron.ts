import type { JsonSchemaSpec, ReasoningMode } from "./llm";
import { SIMULATION_SCHEMA } from "./simulator-paths";

// How FutureMe uses NVIDIA Nemotron on Nebius Token Factory beyond plain chat:
// - Reasoning per agent: the agents that plan, judge or merge think first; quick voices and live calls answer straight away.
// - Structured outputs: every agent that must return JSON is constrained to a JSON schema, so the app never has to guess.
// Both apply when the app runs the team itself (no DOCKER_AGENT_URL); the agents in agents/futureme.yaml are the same.

export const AGENT_REASONING: Record<string, ReasoningMode> = {
  root: "on",
  council_chair: "on",
  mission_lead: "on",
  supervisor: "on",
  night_shift: "on",
  twin: "on",
  verifier: "off",
  researcher: "off",
  helper_memory: "off",
  helper_web: "off",
  voice_horizon: "off",
  voice_next_year: "off",
  voice_skeptic: "off",
  voice_mentor: "off",
  // On a live phone call every second counts.
  twin_voice: "off",
  twin_proxy: "off",
};

const str = { type: "string" };
const strList = { type: "array", items: str };
const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
const TOOLS = { type: "array", items: { type: "string", enum: ["search_memory", "web_search", "fetch_url"] }, maxItems: 3 };
const PLAN = obj(
  { goal: str, why: str, tasks: { type: "array", minItems: 1, maxItems: 6, items: obj({ title: str, due_in_days: { type: "integer", minimum: 0, maximum: 365 } }, ["title"]) } },
  ["goal", "tasks"],
);

export const SCHEMAS = {
  councilBrief: { name: "council_brief", schema: obj({ summary: str, agreements: strList, tensions: strList, next_step: str }) },
  verification: {
    name: "verification",
    schema: obj({ claims: { type: "array", maxItems: 12, items: obj({ text: str, status: { type: "string", enum: ["supported", "unverified", "opinion"] }, source: { type: ["string", "null"] } }) } }),
  },
  supervision: { name: "supervision", schema: obj({ verdict: { type: "string", enum: ["ok", "flag", "block"] }, issues: { ...strList, maxItems: 4 }, summary: str }) },
  missionPlan: {
    name: "mission_plan",
    schema: obj({
      tasks: { type: "array", minItems: 1, maxItems: 4, items: obj({ title: str, agent: { type: "string", enum: ["researcher", "helper"] }, role: str, tools: TOOLS, task: str }, ["title", "agent", "task"]) },
    }),
  },
  missionReport: { name: "mission_report", schema: obj({ report: str, next_step: str, plan: PLAN }, ["report", "next_step"]) },
  nightShift: { name: "morning_brief", schema: obj({ brief: str, focus: { type: "array", maxItems: 3, items: { type: "integer" } }, watch_out: { type: ["string", "null"] } }) },
  research: { name: "research", schema: obj({ summary: str, findings: { type: "array", maxItems: 8, items: obj({ point: str, url: str }) } }) },
  // The Future Simulator plans with reasoning on (see simulator.ts); its schema lives with the rest of its shape.
  simulation: SIMULATION_SCHEMA,
  dailyEditorial: { name: "daily_editorial", schema: obj({ headline: str, lead: str, editor_note: str }) },
} satisfies Record<string, JsonSchemaSpec>;
