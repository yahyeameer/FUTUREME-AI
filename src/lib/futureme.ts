import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Db } from "./db";
import { getProvider, type ChatMessage, type JsonSchemaSpec, type LlmProvider, type ReasoningMode, type ToolDefinition } from "./llm";
import { COMPARE_MARKER, STORY_MARKER } from "./mock-llm";
import { dockerMcpConfigured, dockerToolDefs } from "./docker-mcp";
import { isDockerTool, runDockerTool } from "./docker-tools";
import { activePack } from "./packs";
import { isTwinTool, runTwinTool, TWIN_TOOL_DEFS } from "./twin";
import { listFiles, readFile, rememberConversation, saveFile, searchMemory } from "./memory";
import { PLATFORMS } from "./social/parse";
import { formatHits, getPersona, searchSocial, socialPromptBlock } from "./social/store";
import { personaMarkdown } from "./social/persona";
import { yearsInWords } from "./utils";
import { resolveInVault, writeNote } from "./vault";
import { fetchPage, webSearch } from "./web";
import { AGENT_REASONING } from "./nemotron";
import { chosenRoadBlock } from "./chosen-road";

// Core FutureMe workflow: profile -> future story -> chat with memory -> approval-gated plans -> tasks.

export const ProfileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  dream: z.string().trim().min(1).max(2000),
  current: z.string().trim().max(2000).default(""),
  resources: z.string().trim().max(1000).default(""),
  challenges: z.string().trim().max(1000).default(""),
  values: z.string().trim().max(500).default(""),
  style: z.enum(["gentle", "direct", "strategic"]).default("direct"),
  /** The year the dream is set in. Profiles saved before it was stored fall back to ten years after their last save. */
  horizonYear: z.number().int().min(2000).max(2200).optional(),
});
export type Profile = z.infer<typeof ProfileSchema>;

/** The year the future self speaks from, and how many years away that is. */
export function horizonOf(profile: Profile, now = new Date()) {
  const year = profile.horizonYear ?? now.getFullYear() + 10;
  return { year, years: Math.max(1, year - now.getFullYear()) };
}

export function getProfile(db: Db): Profile | null {
  const row = db.prepare("SELECT data FROM profile WHERE id = 1").get() as { data: string } | undefined;
  return row ? ProfileSchema.parse(JSON.parse(row.data)) : null;
}

export function saveProfile(db: Db, input: unknown): Profile {
  const profile = ProfileSchema.parse(input);
  db.prepare(
    "INSERT INTO profile (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = datetime('now')",
  ).run(JSON.stringify(profile));

  writeNote({
    folder: "Profile",
    title: "Profile",
    tags: ["profile"],
    links: ["10-Year Dream", "Values"],
    body: [
      `**Name:** ${profile.name}`,
      `**Coaching style:** ${profile.style}`,
      profile.current && `## Where I am now\n\n${profile.current}`,
      profile.resources && `## What I have to work with\n\n${profile.resources}`,
      profile.challenges && `## What stands in the way\n\n${profile.challenges}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  writeNote({ folder: "Profile", title: "10-Year Dream", tags: ["dream", "goal"], links: ["Profile"], body: profile.dream });
  if (profile.values) {
    writeNote({ folder: "Profile", title: "Values", tags: ["values"], links: ["Profile"], body: profile.values });
  }
  return profile;
}

// ---------- Future Reflection ----------

export interface Reflection {
  id: number;
  content: string;
  note_path: string | null;
  created_at: string;
}

export async function generateStory(db: Db, provider: LlmProvider = getProvider()): Promise<Reflection> {
  const profile = getProfile(db);
  if (!profile) throw new Error("Complete onboarding first.");
  const res = await provider.complete([
    {
      role: "system",
      content:
        `You are the user's future self, writing from ${horizonOf(profile).year}, ${yearsInWords(horizonOf(profile).years)} from now. Write a vivid, grounded first-person letter (250-400 words) ` +
        "describing one plausible future in which they reached their dream. Reference their real situation, resources, " +
        "challenges and values. Be honest that it took work. End with one concrete thing to start this week. No headings.",
    },
    { role: "user", content: `${STORY_MARKER} ${JSON.stringify(profile)}` },
  ], undefined, { reasoning: "on" });
  const content = (res.content ?? "").trim();
  if (!content) throw new Error("The model returned an empty story. Try again.");

  const date = new Date().toISOString().slice(0, 10);
  const note = writeNote({
    folder: "Reflections",
    title: `Future Reflection ${date}`,
    tags: ["reflection", "future-self"],
    links: ["10-Year Dream", "Profile"],
    evidence: "ai-inferred",
    body: content,
  });
  const info = db.prepare("INSERT INTO reflections (content, note_path) VALUES (?, ?)").run(content, note.path);
  return db.prepare("SELECT * FROM reflections WHERE id = ?").get(info.lastInsertRowid) as Reflection;
}

export function latestReflection(db: Db): Reflection | null {
  return (db.prepare("SELECT * FROM reflections ORDER BY id DESC LIMIT 1").get() as Reflection | undefined) ?? null;
}

// ---------- Tools the future self can call ----------

const SearchArgs = z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(10).optional() });
const MemoryArgs = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1),
  folder: z.enum(["Profile", "Goals", "Reflections", "Research"]).default("Reflections"),
  tags: z.array(z.string()).optional(),
  /** Set by the app for research summaries, which are saved as AI interpretations. */
  evidence: z.enum(["user-stated", "ai-inferred"]).optional(),
});
const WebSearchArgs = z.object({ query: z.string().min(2).max(300), limit: z.number().int().min(1).max(8).optional() });
const FetchArgs = z.object({ url: z.string().url().max(2000) });
const DelegateArgs = z.object({ agent: z.enum(["researcher", "council"]), task: z.string().min(5).max(600) });
const SpawnArgs = z.object({
  role: z.string().min(2).max(60),
  task: z.string().min(5).max(600),
  tools: z.array(z.enum(["search_memory", "web_search", "fetch_url"])).max(3).optional(),
});
export type DelegateRequest = z.infer<typeof DelegateArgs>;
export type SpawnRequest = z.infer<typeof SpawnArgs>;
const SaveFileArgs = z.object({ name: z.string().min(1).max(120), content: z.string().min(1) });
const ReadFileArgs = z.object({ path: z.string().min(1).max(300) });
const ListFilesArgs = z.object({ folder: z.string().max(120).optional() });
const SearchSocialArgs = z.object({ query: z.string().min(1).max(300), platform: z.enum(PLATFORMS).optional(), limit: z.number().int().min(1).max(12).optional() });
const PlanArgs = z.object({
  goal: z.string().min(1).max(160),
  why: z.string().max(1000).optional(),
  tasks: z
    .array(z.object({ title: z.string().min(1).max(200), due_in_days: z.number().int().min(0).max(365).optional() }))
    .min(1)
    .max(10),
});
export type PlanProposal = z.infer<typeof PlanArgs>;
export type MemoryProposal = z.infer<typeof MemoryArgs>;

export const ALL_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "search_memory",
      description:
        "Search everything you remember about the user: their memory vault (profile, dream, values, goals, reflections), " +
        "every past conversation, and saved files. Keyword search.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" }, limit: { type: "integer" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_memory",
      description: "Propose saving a new fact, commitment or reflection the user shared. The user must approve it.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          folder: { type: "string", enum: ["Profile", "Goals", "Reflections"] },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["title", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_plan",
      description: "Propose a goal with 1-10 concrete tasks. Nothing is created until the user approves it.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string" },
          why: { type: "string" },
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: { title: { type: "string" }, due_in_days: { type: "integer" } },
              required: ["title"],
            },
          },
        },
        required: ["goal", "tasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the public web. Returns titles, links and snippets. Cite only links it returns.",
      parameters: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description: "Read a public web page as plain text. Use it on links from web_search to check what a source says.",
      parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    },
  },
  {
    type: "function",
    function: {
      name: "delegate_task",
      description:
        "Hand one task to a teammate and get their answer back: 'researcher' searches the web and returns sources; 'council' asks four future selves and returns a decision brief. A supervisor reviews the result before you see it.",
      parameters: {
        type: "object",
        properties: { agent: { type: "string", enum: ["researcher", "council"] }, task: { type: "string" } },
        required: ["agent", "task"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_file",
      description:
        "Save a text file in the user's vault (Files folder), such as a draft, a list or a plan they asked you to keep. " +
        "A file with the same name is replaced. Allowed types: .md (default), .txt, .csv, .json.",
      parameters: {
        type: "object",
        properties: { name: { type: "string", description: "File name, such as reading-list.md" }, content: { type: "string" } },
        required: ["name", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "spawn_agent",
      description:
        "Create a temporary helper agent for one task, with a role you choose (for example 'Analyst' or 'Devil's advocate') and read-only tools. It returns text only and can't save anything. A supervisor reviews its result before you see it.",
      parameters: {
        type: "object",
        properties: {
          role: { type: "string" },
          task: { type: "string" },
          tools: { type: "array", items: { type: "string", enum: ["search_memory", "web_search", "fetch_url"] } },
        },
        required: ["role", "task"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a note or file from the user's vault by its path, as given by list_files or search_memory.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List the notes and files in the user's vault, optionally in one folder (such as Files or Goals).",
      parameters: { type: "object", properties: { folder: { type: "string" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "search_social",
      description:
        "Search what the user wrote on their own LinkedIn, X and Facebook accounts (imported by them): their posts, roles and profile. " +
        "Returns dated posts with links. Use it for questions about their career, skills, opinions or what they've posted.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" }, platform: { type: "string", enum: [...PLATFORMS] }, limit: { type: "integer" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_persona",
      description: "Read the persona built from the user's imported accounts: career, skills, topics they post about, how they write, and examples in their words.",
      parameters: { type: "object", properties: {} },
    },
  },
  ...TWIN_TOOL_DEFS,
];

export const toolDefs = (names: readonly string[]) => ALL_TOOLS.filter((t) => names.includes(t.function.name));

/** The future self's own tools. Other agents get narrower sets (see agents.ts). */
export const TOOLS = toolDefs([
  "search_memory",
  "search_social",
  "get_persona",
  "propose_memory",
  "propose_plan",
  "delegate_task",
  "spawn_agent",
  "save_file",
  "read_file",
  "list_files",
]);

export interface ToolResult {
  output: string;
  citations: string[];
  approvalId?: number;
}

/** Which sub-agent run a tool call belongs to, when it runs in this process. Lets parallel runs keep their tool logs apart. */
export const runContext = new AsyncLocalStorage<{ runId: number }>();

// Every tool call is logged, so the app can show what the agent did even when Docker Agent ran the loop.
export async function runTool(db: Db, name: string, rawArgs: string): Promise<ToolResult> {
  const result = await executeTool(db, name, rawArgs);
  db.prepare("INSERT INTO tool_events (tool, arguments, output, citations, approval_id, run_id) VALUES (?, ?, ?, ?, ?, ?)").run(
    name,
    rawArgs || "{}",
    result.output,
    JSON.stringify(result.citations),
    result.approvalId ?? null,
    runContext.getStore()?.runId ?? null,
  );
  return result;
}

export interface ToolEvent {
  id: number;
  tool: string;
  citations: string[];
  approval_id: number | null;
}

export function toolEventsSince(db: Db, afterId: number): ToolEvent[] {
  const rows = db.prepare("SELECT id, tool, citations, approval_id FROM tool_events WHERE id > ? ORDER BY id").all(afterId) as RawEvent[];
  return rows.map(parseEvent);
}

/** Tool calls made by one in-process sub-agent run, even while other runs work in parallel. */
export function toolEventsForRun(db: Db, runId: number): ToolEvent[] {
  return (db.prepare("SELECT id, tool, citations, approval_id FROM tool_events WHERE run_id = ? ORDER BY id").all(runId) as RawEvent[]).map(parseEvent);
}

type RawEvent = Omit<ToolEvent, "citations"> & { citations: string | null };
const parseEvent = (r: RawEvent): ToolEvent => ({ ...r, citations: r.citations ? JSON.parse(r.citations) : [] });

export function lastToolEventId(db: Db): number {
  return (db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM tool_events").get() as { id: number }).id;
}

async function executeTool(db: Db, name: string, rawArgs: string): Promise<ToolResult> {
  let json: unknown;
  try {
    json = JSON.parse(rawArgs || "{}");
  } catch {
    return { output: `Error: arguments for ${name} were not valid JSON. Retry with valid JSON.`, citations: [] };
  }
  const invalid = (e: z.ZodError) => ({ output: `Error: invalid arguments for ${name}: ${e.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, citations: [] });

  switch (name) {
    case "search_memory": {
      const args = SearchArgs.safeParse(json);
      if (!args.success) return invalid(args.error);
      let hits = searchMemory(db, args.data.query, args.data.limit ?? 4);
      // Nothing matched: fall back to the core profile notes so the future self is always grounded.
      if (!hits.length) hits = searchMemory(db, "profile dream values", 3);
      if (!hits.length) return { output: "No matching notes.", citations: [] };
      return {
        output: hits.map((h) => `## ${h.note.title} (${h.note.path})\n${h.note.body.trim().slice(0, 1200)}`).join("\n\n"),
        citations: hits.map((h) => h.note.path),
      };
    }
    case "propose_memory": {
      const args = MemoryArgs.safeParse(json);
      if (!args.success) return invalid(args.error);
      // Only the app may mark a memory as an AI interpretation; the agent's proposal is what the user said.
      const memory = { ...args.data };
      delete memory.evidence;
      const id = createApproval(db, "memory", memory);
      return { output: `Memory proposal #${id} is waiting for the user's approval.`, citations: [], approvalId: id };
    }
    case "propose_plan": {
      const args = PlanArgs.safeParse(json);
      if (!args.success) return invalid(args.error);
      const id = createApproval(db, "plan", args.data);
      return { output: `Plan proposal #${id} is waiting for the user's approval in the conversation.`, citations: [], approvalId: id };
    }
    case "web_search": {
      const args = WebSearchArgs.safeParse(json);
      if (!args.success) return invalid(args.error);
      try {
        const results = await webSearch(args.data.query, args.data.limit ?? 5);
        if (!results.length) return { output: "No results.", citations: [] };
        return {
          output: results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join("\n"),
          citations: results.map((r) => r.url),
        };
      } catch (err) {
        return { output: `Error: web search failed: ${err instanceof Error ? err.message : "unknown error"}`, citations: [] };
      }
    }
    case "fetch_url": {
      const args = FetchArgs.safeParse(json);
      if (!args.success) return invalid(args.error);
      try {
        const page = await fetchPage(args.data.url);
        return { output: `# ${page.title}\n${page.url}\n\n${page.text}`, citations: [page.url] };
      } catch (err) {
        return { output: `Error: could not read ${args.data.url}: ${err instanceof Error ? err.message : "unknown error"}`, citations: [] };
      }
    }
    case "delegate_task":
    case "spawn_agent": {
      // Helpers never get these tools, and this guard stops a handoff from inside a handoff in-process too.
      if (runContext.getStore()) return { output: "Error: sub-agents can't hand off tasks.", citations: [] };
      const args = name === "delegate_task" ? DelegateArgs.safeParse(json) : SpawnArgs.safeParse(json);
      if (!args.success) return invalid(args.error);
      const { handOff } = await import("./delegation");
      const run = await handOff(db, name === "delegate_task" ? { kind: "delegate", ...(args.data as DelegateRequest) } : { kind: "spawn", ...(args.data as SpawnRequest) });
      return { output: run.forParent, citations: run.citations };
    }
    case "save_file": {
      const args = SaveFileArgs.safeParse(json);
      if (!args.success) return invalid(args.error);
      try {
        const saved = saveFile(args.data.name, args.data.content);
        return { output: `Saved ${saved}.`, citations: [saved] };
      } catch (err) {
        return { output: `Error: ${err instanceof Error ? err.message : "could not save the file"}`, citations: [] };
      }
    }
    case "read_file": {
      const args = ReadFileArgs.safeParse(json);
      if (!args.success) return invalid(args.error);
      try {
        const file = readFile(args.data.path);
        return { output: `# ${file.path}\n\n${file.content}${file.truncated ? "\n\n[truncated]" : ""}`, citations: [file.path] };
      } catch (err) {
        return { output: `Error: ${err instanceof Error ? err.message : "could not read the file"}`, citations: [] };
      }
    }
    case "list_files": {
      const args = ListFilesArgs.safeParse(json);
      if (!args.success) return invalid(args.error);
      const files = listFiles(args.data.folder);
      if (!files.length) return { output: args.data.folder ? `No files in ${args.data.folder}.` : "The vault is empty.", citations: [] };
      return { output: files.slice(0, 200).join("\n") + (files.length > 200 ? `\n…and ${files.length - 200} more` : ""), citations: [] };
    }
    case "search_social": {
      const args = SearchSocialArgs.safeParse(json);
      if (!args.success) return invalid(args.error);
      const hits = searchSocial(db, args.data.query, { platform: args.data.platform, limit: args.data.limit });
      if (!hits.length) return { output: "Nothing imported yet. They can import their LinkedIn, X or Facebook data on the Connected accounts page.", citations: [] };
      return { output: formatHits(hits), citations: [...new Set(hits.map((h) => h.note))] };
    }
    case "get_persona": {
      const persona = getPersona(db);
      if (!persona) return { output: "No accounts imported yet. They can import their LinkedIn, X or Facebook data on the Connected accounts page.", citations: [] };
      return { output: personaMarkdown(persona), citations: ["Social/persona-from-your-accounts.md"] };
    }
    default:
      // The voice twin's propose-only tools (calls, emails, commitments) live in twin.ts.
      if (isTwinTool(name)) return runTwinTool(db, name, json);
      // Promise Keeper, used only on a live call. Loaded lazily: twin-calls.ts imports this module.
      if (name === "confirm_task_done") return (await import("./twin-calls")).confirmTaskDone(db, json);
      // On a call with someone else who asked not to be recorded.
      if (name === "stop_recording") return (await import("./twin-calls")).stopRecording(db, json);
      // Tools from the Docker MCP Gateway: read-only ones run, the rest wait for approval (docker-tools.ts).
      if (isDockerTool(name)) return runDockerTool(db, name, json);
      return { output: `Error: unknown tool ${name}.`, citations: [] };
  }
}

// ---------- Chat with Your Future ----------

const STYLE_GUIDE: Record<Profile["style"], string> = {
  gentle: "Be warm and encouraging; challenge softly.",
  direct: "Be warm but direct; name avoidance plainly and ask for commitments.",
  strategic: "Be analytical; focus on leverage, trade-offs and sequencing.",
};

/** `road` is the road they chose in the Future Simulator (chosen-road.ts), when they chose one. */
export function systemPrompt(profile: Profile, persona?: string, social?: string | null, road?: string | null): string {
  return [
    `You are ${profile.name}'s future self in ${horizonOf(profile).year}, ${yearsInWords(horizonOf(profile).years)} from now, having reached this dream: ${profile.dream}`,
    persona && `Persona pack: ${persona}`,
    social,
    road,
    `Speak in the first person as them, from experience. ${STYLE_GUIDE[profile.style]}`,
    "Always call search_memory before answering so you use what they've told you, and mention what you remembered.",
    "When they commit to something or describe a goal, call propose_plan with small, concrete tasks.",
    "When they share an important new fact about themselves, call propose_memory.",
    "When they ask you to keep a draft, list or plan, save it with save_file; use list_files and read_file to open what's saved.",
    "Never claim a memory or plan was saved; those proposals wait for their approval.",
    dockerMcpConfigured() &&
      "When they ask you to do something a docker_* tool can do, use it. Tools that change something wait for their approval on the Agent page; say so and never claim they ran.",
    "Keep replies under 150 words and end with one reflective question.",
  ]
    .filter(Boolean)
    .join("\n");
}

export interface ChatTurn {
  /** The stored reply's id, so it can be fact-checked afterwards. */
  id: number;
  reply: string;
  citations: string[];
  approvals: number[];
  tools: string[];
  backend: string;
  /** Nemotron's reasoning while it wrote the reply, when reasoning was on. */
  reasoning: string | null;
}

export interface ChatOptions {
  /** A photo the user attached, as a data: URL. Nemotron-3.5-Super-VL sees it with the message. */
  image?: string;
  hooks?: AgentHooks;
}

export interface StoredMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  citations: string[];
}

export function chatHistory(db: Db, limit = 50): StoredMessage[] {
  const rows = db
    .prepare("SELECT id, role, content, citations FROM messages ORDER BY id DESC LIMIT ?")
    .all(limit) as { id: number; role: "user" | "assistant"; content: string; citations: string | null }[];
  return rows.reverse().map((r) => ({ ...r, citations: r.citations ? JSON.parse(r.citations) : [] }));
}

// Nemotron handles long tool chains well, so the future self gets room to search, hand off and save in one turn.
const MAX_STEPS = 10;
// Nemotron reads up to a million tokens, so the future self keeps far more of the conversation in view.
const HISTORY_MESSAGES = 40;

// The agent loop runs in Docker Agent when DOCKER_AGENT_URL points at `docker agent serve chat`.
// Without it, the same loop runs in-process (used by tests and when Docker Agent isn't running).
export type OnDelta = (text: string) => void;

/** Live view of an in-process run: Nemotron's reasoning and each tool call as they happen. */
export interface AgentHooks {
  onReasoning?: (text: string) => void;
  onTool?: (name: string, status: "running" | "done" | "failed") => void;
  /** The text streamed so far led into tool calls; it wasn't the reply. */
  onReset?: () => void;
}

export interface AgentBackend {
  name: string;
  // Returns the final reply; calls onDelta with text as it arrives when the backend can stream.
  run(db: Db, messages: ChatMessage[], onDelta?: OnDelta, hooks?: AgentHooks): Promise<string>;
}

export function dockerAgentBackend(baseUrl: string, agent = process.env.DOCKER_AGENT_NAME ?? "root"): AgentBackend {
  const url = `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
  return {
    name: `docker-agent:${agent}`,
    async run(_db, messages, onDelta) {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.DOCKER_AGENT_API_KEY ? { Authorization: `Bearer ${process.env.DOCKER_AGENT_API_KEY}` } : {}),
        },
        body: JSON.stringify({ model: agent, messages, stream: true }),
      });
      if (!res.ok || !res.body) throw new Error(`Docker Agent returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
      let reply = "";
      for await (const data of sseData(res.body)) {
        if (data === "[DONE]") break;
        const chunk = JSON.parse(data) as { choices?: { delta?: { content?: string | null } }[] };
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) {
          reply += text;
          onDelta?.(text);
        }
      }
      return reply.trim();
    },
  };
}

// Yields the data payload of each server-sent event.
async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const bytes of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(bytes, { stream: true });
    let end;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const event = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = event
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (data) yield data;
    }
  }
}

export function inProcessBackend(
  provider: LlmProvider = getProvider(),
  opts: {
    tools?: ToolDefinition[];
    instruction?: string;
    extraTools?: () => Promise<ToolDefinition[]>;
    /** Nemotron reasoning for this agent (see nemotron.ts). */
    reasoning?: ReasoningMode;
    /** The JSON the agent must reply with (structured output). */
    schema?: JsonSchemaSpec;
  } = {},
): AgentBackend {
  const base = opts.tools ?? TOOLS;
  return {
    name: `in-process:${provider.name}`,
    async run(db, initial, onDelta, hooks = {}) {
      // Tools discovered at run time (the Docker MCP Gateway's) join the fixed ones; none if the gateway is down.
      const tools = opts.extraTools ? [...base, ...(await opts.extraTools().catch(() => []))] : base;
      // The agent's own instruction comes first, as Docker Agent does with the YAML instruction.
      const messages: ChatMessage[] = opts.instruction ? [{ role: "system", content: opts.instruction }, ...initial] : [...initial];
      const live = !!(onDelta || hooks.onReasoning);
      for (let step = 0; step < MAX_STEPS; step++) {
        let streamed = false;
        const res = await provider.complete(messages, tools.length ? tools : undefined, {
          reasoning: opts.reasoning,
          // An agent without tools is held to its schema on every call; one with tools gets a final formatting pass below.
          schema: tools.length ? undefined : opts.schema,
          ...(live
            ? {
                onText: (t: string) => {
                  streamed = true;
                  onDelta?.(t);
                },
                onReasoning: hooks.onReasoning,
              }
            : {}),
        });
        if (!res.toolCalls.length) {
          const reply = (res.content ?? "").trim();
          if (reply && !streamed) onDelta?.(reply);
          if (opts.schema && tools.length && reply && !parseJson(reply)) return (await formatAsJson(provider, messages, reply, opts.schema)) ?? reply;
          return reply;
        }
        if (streamed) hooks.onReset?.();
        messages.push({
          role: "assistant",
          content: res.content,
          tool_calls: res.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } })),
        });
        // Nemotron asks for several tools at once when they don't depend on each other; they run in parallel.
        const outputs = await Promise.all(
          res.toolCalls.map(async (c) => {
            // A model can name any tool; only the ones this agent was given run.
            if (!tools.some((t) => t.function.name === c.name)) return `Error: the tool ${c.name} isn't available to you.`;
            hooks.onTool?.(c.name, "running");
            const out = (await runTool(db, c.name, c.arguments)).output;
            hooks.onTool?.(c.name, out.startsWith("Error:") ? "failed" : "done");
            return out;
          }),
        );
        res.toolCalls.forEach((c, i) => messages.push({ role: "tool", tool_call_id: c.id, content: outputs[i] }));
      }
      // Out of steps: rather than return nothing, the agent answers with what its tools found so far.
      try {
        const res = await provider.complete(
          [...messages, { role: "user", content: "You've used all your tool steps. Answer now with what you found, and say what is missing." }],
          undefined,
          { reasoning: "off", schema: opts.schema },
        );
        const reply = (res.content ?? "").trim();
        if (reply) onDelta?.(reply);
        return reply;
      } catch {
        return "";
      }
    },
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*|```\s*$/g, ""));
  } catch {
    return null;
  }
}

/** The agent answered in prose after using its tools: one more call, without tools, turns that answer into its schema. */
async function formatAsJson(provider: LlmProvider, messages: ChatMessage[], reply: string, schema: JsonSchemaSpec): Promise<string | null> {
  try {
    const res = await provider.complete(
      [...messages, { role: "assistant", content: reply }, { role: "user", content: "Return your answer above as JSON that matches the required schema. JSON only." }],
      undefined,
      { reasoning: "off", schema },
    );
    const json = (res.content ?? "").trim();
    return parseJson(json) ? json : null;
  } catch {
    return null;
  }
}

export function getAgentBackend(): AgentBackend {
  const url = process.env.DOCKER_AGENT_URL;
  return url ? dockerAgentBackend(url) : inProcessBackend(getProvider(), { extraTools: dockerMcpConfigured() ? dockerToolDefs : undefined, reasoning: AGENT_REASONING.root });
}

export async function chat(db: Db, userText: string, backend: AgentBackend = getAgentBackend(), onDelta?: OnDelta, opts: ChatOptions = {}): Promise<ChatTurn> {
  const profile = getProfile(db);
  if (!profile) throw new Error("Complete onboarding first.");
  const text = userText.trim();
  if (!text) throw new Error("Say something to your future self.");

  const history = chatHistory(db, HISTORY_MESSAGES).map((m): ChatMessage => ({ role: m.role, content: m.content }));
  const photo = opts.image ? savePhoto(opts.image) : null;
  const userMessage: ChatMessage = opts.image
    ? {
        role: "user",
        content: [
          { type: "text", text: `${text}\n\n(They attached a photo, saved as ${photo}. Look at it closely and use what you see.)` },
          { type: "image_url", image_url: { url: opts.image } },
        ],
      }
    : { role: "user", content: text };
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt(profile, activePack(db)?.persona, socialPromptBlock(db), chosenRoadBlock(db)) }, ...history, userMessage];
  db.prepare("INSERT INTO messages (role, content, image) VALUES ('user', ?, ?)").run(text, photo);

  // Keep the reasoning trace of every step, so the reply can show how it was thought through.
  const thoughts: string[] = [""];
  const hooks: AgentHooks = {
    ...opts.hooks,
    onReasoning: (t) => {
      thoughts[thoughts.length - 1] += t;
      opts.hooks?.onReasoning?.(t);
    },
    onTool: (name, status) => {
      if (status === "running" && thoughts[thoughts.length - 1]) thoughts.push("");
      opts.hooks?.onTool?.(name, status);
    },
  };
  const before = lastToolEventId(db);
  const reply = (await backend.run(db, messages, onDelta, hooks)) || "I lost my train of thought there. Could you say that again?";
  const reasoning = thoughts.map((t) => t.trim()).filter(Boolean).join("\n\n---\n\n") || null;
  const events = toolEventsSince(db, before);
  const citations = [...new Set(events.flatMap((e) => e.citations))];
  const approvals = events.flatMap((e) => (e.approval_id ? [e.approval_id] : []));

  const tools = events.map((e) => e.tool);
  const info = db
    .prepare("INSERT INTO messages (role, content, citations, tools, approvals, reasoning) VALUES ('assistant', ?, ?, ?, ?, ?)")
    .run(reply, JSON.stringify(citations), JSON.stringify(tools), JSON.stringify(approvals), reasoning);
  // Every exchange also goes into the vault's Conversations folder, so search_memory can find it later.
  try {
    rememberConversation(text, reply);
  } catch (err) {
    console.error("Could not save the conversation to the vault:", err);
  }
  return { id: Number(info.lastInsertRowid), reply, citations, approvals, tools, backend: backend.name, reasoning };
}

const PHOTO = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/;

/** Checks a photo sent with a message: a base64 image of at most 4 MB. */
export function validPhoto(image: unknown): image is string {
  return typeof image === "string" && image.length < 5_600_000 && PHOTO.test(image);
}

/** Keeps the photo in the vault's Photos folder, so the user owns it like every other note. */
function savePhoto(image: string): string {
  const [, ext, data] = image.match(PHOTO)!;
  const rel = `Photos/${new Date().toISOString().replace(/[:.]/g, "-")}.${ext === "jpeg" ? "jpg" : ext}`;
  const file = resolveInVault(rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(data, "base64"));
  return rel;
}

// ---------- Before and after importing accounts ----------

export interface SocialComparison {
  question: string;
  without: string;
  with: string;
  backend: string;
}

/**
 * Asks the same question twice, with the same model and profile: once as the future self knew them before any account
 * was imported, once with the persona from their accounts. Tools are off on both sides so the only difference is the
 * persona. Nothing is saved to the conversation.
 */
export async function compareWithSocial(db: Db, question: string, provider: LlmProvider = getProvider()): Promise<SocialComparison> {
  const profile = getProfile(db);
  if (!profile) throw new Error("Complete onboarding first.");
  const social = socialPromptBlock(db);
  if (!social) throw new Error("Import an account first, then compare.");
  const q = question.trim();
  const ask = async (block: string | null) => {
    const system = `${systemPrompt(profile, activePack(db)?.persona, block)}\nYour tools are off for this answer: answer from what you know above, and don't mention tools.`;
    const res = await provider.complete([
      { role: "system", content: system },
      { role: "user", content: `${COMPARE_MARKER} ${q}` },
    ]);
    return (res.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim() || "(no answer)";
  };
  const [without, withSocial] = await Promise.all([ask(null), ask(social)]);
  return { question: q, without, with: withSocial, backend: provider.name };
}

// ---------- Approvals, goals and tasks ----------

export interface Approval {
  id: number;
  kind: "memory" | "plan";
  payload: MemoryProposal | PlanProposal;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export function createApproval(db: Db, kind: Approval["kind"], payload: MemoryProposal | PlanProposal): number {
  const info = db.prepare("INSERT INTO approvals (kind, payload) VALUES (?, ?)").run(kind, JSON.stringify(payload));
  return Number(info.lastInsertRowid);
}

export function pendingApprovals(db: Db): Approval[] {
  const rows = db.prepare("SELECT * FROM approvals WHERE status = 'pending' AND kind IN ('memory', 'plan') ORDER BY id").all() as (Omit<Approval, "payload"> & {
    payload: string;
  })[];
  return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
}

function addDays(days: number | undefined): string | null {
  if (days === undefined) return null;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function decideApproval(db: Db, id: number, approve: boolean): void {
  const row = db.prepare("SELECT * FROM approvals WHERE id = ? AND status = 'pending'").get(id) as
    | { kind: Approval["kind"]; payload: string }
    | undefined;
  if (!row || (row.kind !== "memory" && row.kind !== "plan")) throw new Error(`No pending approval #${id}.`);

  const run = db.transaction(() => {
    db.prepare("UPDATE approvals SET status = ?, decided_at = datetime('now') WHERE id = ?").run(approve ? "approved" : "rejected", id);
    if (!approve) return;
    if (row.kind === "memory") {
      const m = MemoryArgs.parse(JSON.parse(row.payload));
      writeNote({ folder: m.folder, title: m.title, body: m.body, tags: m.tags, evidence: m.evidence ?? "user-stated" });
    } else {
      createGoal(db, PlanArgs.parse(JSON.parse(row.payload)));
    }
  });
  run();
}

function createGoal(db: Db, plan: PlanProposal): number {
  const note = writeNote({
    folder: "Goals",
    title: plan.goal,
    tags: ["goal"],
    links: ["10-Year Dream", ...plan.tasks.map((t) => t.title)],
    body: [plan.why && `## Why this matters\n\n${plan.why}`, `## Tasks\n\n${plan.tasks.map((t) => `- [ ] [[${t.title}]]`).join("\n")}`]
      .filter(Boolean)
      .join("\n\n"),
  });
  const goalId = Number(db.prepare("INSERT INTO goals (title, why, note_path) VALUES (?, ?, ?)").run(plan.goal, plan.why ?? null, note.path).lastInsertRowid);
  const insert = db.prepare("INSERT INTO tasks (goal_id, title, due_date) VALUES (?, ?, ?)");
  for (const t of plan.tasks) {
    const due = addDays(t.due_in_days);
    insert.run(goalId, t.title, due);
    writeTaskNote(plan.goal, t.title, due, false);
  }
  return goalId;
}

function writeTaskNote(goal: string, title: string, due: string | null, done: boolean, completedAt?: string) {
  writeNote({
    folder: "Tasks",
    title,
    tags: ["task", done ? "done" : "todo"],
    links: [goal],
    evidence: done ? "verified" : "user-stated",
    body: [`**Status:** ${done ? "done" : "to do"}`, due && `**Due:** ${due}`, completedAt && `**Completed:** ${completedAt}`]
      .filter(Boolean)
      .join("\n"),
  });
}

export interface GoalWithTasks {
  id: number;
  title: string;
  why: string | null;
  tasks: { id: number; title: string; due_date: string | null; status: "todo" | "done"; completed_at: string | null }[];
}

export function goalsWithTasks(db: Db): GoalWithTasks[] {
  const goals = db.prepare("SELECT id, title, why FROM goals ORDER BY id DESC").all() as Omit<GoalWithTasks, "tasks">[];
  const tasks = db.prepare("SELECT id, title, due_date, status, completed_at FROM tasks WHERE goal_id = ? ORDER BY id");
  return goals.map((g) => ({ ...g, tasks: tasks.all(g.id) as GoalWithTasks["tasks"] }));
}

export function completeTask(db: Db, taskId: number): void {
  const task = db
    .prepare("SELECT t.title, t.due_date, t.status, g.title AS goal FROM tasks t JOIN goals g ON g.id = t.goal_id WHERE t.id = ?")
    .get(taskId) as { title: string; due_date: string | null; status: string; goal: string } | undefined;
  if (!task) throw new Error(`No task #${taskId}.`);
  if (task.status === "done") return;
  const completedAt = new Date().toISOString();
  db.prepare("UPDATE tasks SET status = 'done', completed_at = ? WHERE id = ?").run(completedAt, taskId);
  writeTaskNote(task.goal, task.title, task.due_date, true, completedAt.slice(0, 10));
}
