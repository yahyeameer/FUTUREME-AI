import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";
import type { Db } from "./db";
import { getProvider, type ChatMessage, type LlmProvider, type ToolDefinition } from "./llm";
import { STORY_MARKER } from "./mock-llm";
import { activePack } from "./packs";
import { searchNotes, writeNote } from "./vault";
import { fetchPage, webSearch } from "./web";

// Core FutureMe workflow: profile -> future story -> chat with memory -> approval-gated plans -> tasks.

export const ProfileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  dream: z.string().trim().min(1).max(2000),
  current: z.string().trim().max(2000).default(""),
  resources: z.string().trim().max(1000).default(""),
  challenges: z.string().trim().max(1000).default(""),
  values: z.string().trim().max(500).default(""),
  style: z.enum(["gentle", "direct", "strategic"]).default("direct"),
});
export type Profile = z.infer<typeof ProfileSchema>;

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
        "You are the user's future self, ten years from now. Write a vivid, grounded first-person letter (250-400 words) " +
        "describing one plausible future in which they reached their dream. Reference their real situation, resources, " +
        "challenges and values. Be honest that it took work. End with one concrete thing to start this week. No headings.",
    },
    { role: "user", content: `${STORY_MARKER} ${JSON.stringify(profile)}` },
  ]);
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
      description: "Search the user's memory vault (profile, dream, values, goals, reflections) by keyword.",
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
];

export const toolDefs = (names: readonly string[]) => ALL_TOOLS.filter((t) => names.includes(t.function.name));

/** The future self's own tools. Other agents get narrower sets (see agents.ts). */
export const TOOLS = toolDefs(["search_memory", "propose_memory", "propose_plan", "delegate_task", "spawn_agent"]);

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
      let hits = searchNotes(args.data.query, args.data.limit ?? 4);
      // Nothing matched: fall back to the core profile notes so the future self is always grounded.
      if (!hits.length) hits = searchNotes("profile dream values", 3);
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
    default:
      return { output: `Error: unknown tool ${name}.`, citations: [] };
  }
}

// ---------- Chat with Your Future ----------

const STYLE_GUIDE: Record<Profile["style"], string> = {
  gentle: "Be warm and encouraging; challenge softly.",
  direct: "Be warm but direct; name avoidance plainly and ask for commitments.",
  strategic: "Be analytical; focus on leverage, trade-offs and sequencing.",
};

function systemPrompt(profile: Profile, persona?: string): string {
  return [
    `You are ${profile.name}'s future self, ten years from now, having reached this dream: ${profile.dream}`,
    persona && `Persona pack: ${persona}`,
    `Speak in the first person as them, from experience. ${STYLE_GUIDE[profile.style]}`,
    "Always call search_memory before answering so you use what they've told you, and mention what you remembered.",
    "When they commit to something or describe a goal, call propose_plan with small, concrete tasks.",
    "When they share an important new fact about themselves, call propose_memory.",
    "Never claim something was saved or created; proposals wait for their approval.",
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

const MAX_STEPS = 6;

// The agent loop runs in Docker Agent when DOCKER_AGENT_URL points at `docker agent serve chat`.
// Without it, the same loop runs in-process (used by tests and when Docker Agent isn't running).
export type OnDelta = (text: string) => void;

export interface AgentBackend {
  name: string;
  // Returns the final reply; calls onDelta with text as it arrives when the backend can stream.
  run(db: Db, messages: ChatMessage[], onDelta?: OnDelta): Promise<string>;
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
  opts: { tools?: ToolDefinition[]; instruction?: string } = {},
): AgentBackend {
  const tools = opts.tools ?? TOOLS;
  return {
    name: `in-process:${provider.name}`,
    async run(db, initial, onDelta) {
      // The agent's own instruction comes first, as Docker Agent does with the YAML instruction.
      const messages: ChatMessage[] = opts.instruction ? [{ role: "system", content: opts.instruction }, ...initial] : [...initial];
      for (let step = 0; step < MAX_STEPS; step++) {
        const res = await provider.complete(messages, tools.length ? tools : undefined);
        if (!res.toolCalls.length) {
          const reply = (res.content ?? "").trim();
          if (reply) onDelta?.(reply);
          return reply;
        }
        messages.push({
          role: "assistant",
          content: res.content,
          tool_calls: res.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } })),
        });
        for (const c of res.toolCalls) {
          // A model can name any tool; only the ones this agent was given run.
          const allowed = tools.some((t) => t.function.name === c.name);
          const content = allowed ? (await runTool(db, c.name, c.arguments)).output : `Error: the tool ${c.name} isn't available to you.`;
          messages.push({ role: "tool", tool_call_id: c.id, content });
        }
      }
      return "";
    },
  };
}

export function getAgentBackend(): AgentBackend {
  const url = process.env.DOCKER_AGENT_URL;
  return url ? dockerAgentBackend(url) : inProcessBackend();
}

export async function chat(db: Db, userText: string, backend: AgentBackend = getAgentBackend(), onDelta?: OnDelta): Promise<ChatTurn> {
  const profile = getProfile(db);
  if (!profile) throw new Error("Complete onboarding first.");
  const text = userText.trim();
  if (!text) throw new Error("Say something to your future self.");

  const history = chatHistory(db, 12).map((m): ChatMessage => ({ role: m.role, content: m.content }));
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt(profile, activePack(db)?.persona) }, ...history, { role: "user", content: text }];
  db.prepare("INSERT INTO messages (role, content) VALUES ('user', ?)").run(text);

  const before = lastToolEventId(db);
  const reply = (await backend.run(db, messages, onDelta)) || "I lost my train of thought there. Could you say that again?";
  const events = toolEventsSince(db, before);
  const citations = [...new Set(events.flatMap((e) => e.citations))];
  const approvals = events.flatMap((e) => (e.approval_id ? [e.approval_id] : []));

  const tools = events.map((e) => e.tool);
  const info = db.prepare("INSERT INTO messages (role, content, citations, tools) VALUES ('assistant', ?, ?, ?)").run(reply, JSON.stringify(citations), JSON.stringify(tools));
  return { id: Number(info.lastInsertRowid), reply, citations, approvals, tools, backend: backend.name };
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
  const rows = db.prepare("SELECT * FROM approvals WHERE status = 'pending' ORDER BY id").all() as (Omit<Approval, "payload"> & {
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
  if (!row) throw new Error(`No pending approval #${id}.`);

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
