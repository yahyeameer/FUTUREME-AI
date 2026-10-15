import { z } from "zod";
import type { Db } from "./db";
import { getProvider, type ChatMessage, type LlmProvider, type ToolDefinition } from "./llm";
import { STORY_MARKER } from "./mock-llm";
import { searchNotes, writeNote } from "./vault";

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
  folder: z.enum(["Profile", "Goals", "Reflections"]).default("Reflections"),
  tags: z.array(z.string()).optional(),
});
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

export const TOOLS: ToolDefinition[] = [
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
];

export interface ToolResult {
  output: string;
  citations: string[];
  approvalId?: number;
}

// Every tool call is logged, so the app can show what the agent did even when Docker Agent ran the loop.
export function runTool(db: Db, name: string, rawArgs: string): ToolResult {
  const result = executeTool(db, name, rawArgs);
  db.prepare("INSERT INTO tool_events (tool, arguments, output, citations, approval_id) VALUES (?, ?, ?, ?, ?)").run(
    name,
    rawArgs || "{}",
    result.output,
    JSON.stringify(result.citations),
    result.approvalId ?? null,
  );
  return result;
}

export function toolEventsSince(db: Db, afterId: number): { id: number; tool: string; citations: string[]; approval_id: number | null }[] {
  const rows = db.prepare("SELECT id, tool, citations, approval_id FROM tool_events WHERE id > ? ORDER BY id").all(afterId) as {
    id: number;
    tool: string;
    citations: string | null;
    approval_id: number | null;
  }[];
  return rows.map((r) => ({ ...r, citations: r.citations ? JSON.parse(r.citations) : [] }));
}

export function lastToolEventId(db: Db): number {
  return (db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM tool_events").get() as { id: number }).id;
}

function executeTool(db: Db, name: string, rawArgs: string): ToolResult {
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
      const id = createApproval(db, "memory", args.data);
      return { output: `Memory proposal #${id} is waiting for the user's approval.`, citations: [], approvalId: id };
    }
    case "propose_plan": {
      const args = PlanArgs.safeParse(json);
      if (!args.success) return invalid(args.error);
      const id = createApproval(db, "plan", args.data);
      return { output: `Plan proposal #${id} is waiting for the user's approval on the Plan page.`, citations: [], approvalId: id };
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

function systemPrompt(profile: Profile): string {
  return [
    `You are ${profile.name}'s future self, ten years from now, having reached this dream: ${profile.dream}`,
    `Speak in the first person as them, from experience. ${STYLE_GUIDE[profile.style]}`,
    "Always call search_memory before answering so you use what they've told you, and mention what you remembered.",
    "When they commit to something or describe a goal, call propose_plan with small, concrete tasks.",
    "When they share an important new fact about themselves, call propose_memory.",
    "Never claim something was saved or created; proposals wait for their approval.",
    "Keep replies under 150 words and end with one reflective question.",
  ].join("\n");
}

export interface ChatTurn {
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

export function inProcessBackend(provider: LlmProvider = getProvider()): AgentBackend {
  return {
    name: `in-process:${provider.name}`,
    async run(db, initial, onDelta) {
      const messages = [...initial];
      for (let step = 0; step < MAX_STEPS; step++) {
        const res = await provider.complete(messages, TOOLS);
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
          messages.push({ role: "tool", tool_call_id: c.id, content: runTool(db, c.name, c.arguments).output });
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
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt(profile) }, ...history, { role: "user", content: text }];
  db.prepare("INSERT INTO messages (role, content) VALUES ('user', ?)").run(text);

  const before = lastToolEventId(db);
  const reply = (await backend.run(db, messages, onDelta)) || "I lost my train of thought there. Could you say that again?";
  const events = toolEventsSince(db, before);
  const citations = [...new Set(events.flatMap((e) => e.citations))];
  const approvals = events.flatMap((e) => (e.approval_id ? [e.approval_id] : []));

  db.prepare("INSERT INTO messages (role, content, citations) VALUES ('assistant', ?, ?)").run(reply, JSON.stringify(citations));
  return { reply, citations, approvals, tools: events.map((e) => e.tool), backend: backend.name };
}

// ---------- Approvals, goals and tasks ----------

export interface Approval {
  id: number;
  kind: "memory" | "plan";
  payload: MemoryProposal | PlanProposal;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

function createApproval(db: Db, kind: Approval["kind"], payload: unknown): number {
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
      writeNote({ folder: m.folder, title: m.title, body: m.body, tags: m.tags, evidence: "user-stated" });
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
