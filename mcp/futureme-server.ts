// MCP server giving FutureMe's Docker Agent team its tools: memory search, memory and plan proposals, and web research.
// Proposals land in SQLite as pending approvals; nothing is written to the vault until the user approves in the app.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { openDb } from "../src/lib/db";
import { runTool } from "../src/lib/futureme";

const db = openDb();
const server = new McpServer({ name: "futureme", version: "0.3.0" });

const text = (output: string) => ({ content: [{ type: "text" as const, text: output }] });
const readOnly = { readOnlyHint: true, openWorldHint: false };

server.registerTool(
  "search_memory",
  {
    description: "Search the user's memory vault (profile, dream, values, goals, reflections, tasks) by keyword.",
    inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(10).optional() },
    annotations: readOnly,
  },
  async (args) => text((await runTool(db, "search_memory", JSON.stringify(args))).output),
);

server.registerTool(
  "propose_memory",
  {
    description: "Propose saving a new fact, commitment or reflection the user shared. The user must approve it in the app.",
    inputSchema: {
      title: z.string().min(1).max(120),
      body: z.string().min(1),
      folder: z.enum(["Profile", "Goals", "Reflections"]).optional(),
      tags: z.array(z.string()).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async (args) => text((await runTool(db, "propose_memory", JSON.stringify(args))).output),
);

server.registerTool(
  "propose_plan",
  {
    description: "Propose a goal with 1-10 concrete tasks. Nothing is created until the user approves it in the app.",
    inputSchema: {
      goal: z.string().min(1).max(160),
      why: z.string().max(1000).optional(),
      tasks: z
        .array(z.object({ title: z.string().min(1).max(200), due_in_days: z.number().int().min(0).max(365).optional() }))
        .min(1)
        .max(10),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async (args) => text((await runTool(db, "propose_plan", JSON.stringify(args))).output),
);

server.registerTool(
  "web_search",
  {
    description: "Search the public web. Returns titles, links and snippets. Cite only links it returns.",
    inputSchema: { query: z.string().min(2).max(300), limit: z.number().int().min(1).max(8).optional() },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => text((await runTool(db, "web_search", JSON.stringify(args))).output),
);

server.registerTool(
  "fetch_url",
  {
    description: "Read a public web page as plain text. Use it on links from web_search to check what a source says.",
    inputSchema: { url: z.string().url().max(2000) },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => text((await runTool(db, "fetch_url", JSON.stringify(args))).output),
);

// ---------- Voice twin (propose-only) ----------
// These never call, email or promise anything themselves: each creates a pending approval in the app.
const proposes = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

server.registerTool(
  "propose_call",
  {
    description:
      "Propose a phone call by the user's AI twin to one of their saved contacts. The user must approve it; no call is made until then. The call always opens by saying it is the user's AI twin.",
    inputSchema: {
      contact: z.string().min(1).max(80).describe("The contact's name as saved, or their id"),
      purpose: z.string().min(1).max(300),
      talking_points: z.array(z.string().min(1).max(200)).max(5).optional(),
    },
    annotations: proposes,
  },
  async (args) => text((await runTool(db, "propose_call", JSON.stringify(args))).output),
);

server.registerTool(
  "propose_email",
  {
    description:
      "Draft an email from the user's AI twin to one of their saved contacts. The user must approve it; nothing is sent until then. An AI disclosure line and signature are added automatically.",
    inputSchema: {
      contact: z.string().min(1).max(80).describe("The contact's name as saved, or their id"),
      subject: z.string().min(1).max(150),
      body: z.string().min(1).max(4000),
    },
    annotations: proposes,
  },
  async (args) => text((await runTool(db, "propose_email", JSON.stringify(args))).output),
);

server.registerTool(
  "propose_commitment",
  {
    description:
      "Record something someone wants the user to agree to (a meeting, a favour, a deadline). The twin never agrees itself; the user decides in the app.",
    inputSchema: {
      what: z.string().min(1).max(300),
      contact: z.string().min(1).max(80).optional(),
      when: z.string().max(80).optional(),
      context: z.string().max(1000).optional(),
    },
    annotations: proposes,
  },
  async (args) => text((await runTool(db, "propose_commitment", JSON.stringify(args))).output),
);

// Promise Keeper: only works during a live Promise Keeper call, and only on that call's own task.
server.registerTool(
  "confirm_task_done",
  {
    description:
      "On a Promise Keeper call only: mark the task the call is about as done, after the user clearly says they did it. Pass the call_ref from your instructions.",
    inputSchema: { call_ref: z.string().min(1).max(100) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async (args) => text((await runTool(db, "confirm_task_done", JSON.stringify(args))).output),
);

// On a call with someone else: they asked not to be recorded, so nothing of the call is kept.
server.registerTool(
  "stop_recording",
  {
    description:
      "On a call with someone other than the user, when they don't want to be recorded or transcribed: turn recording off so nothing of the call is kept. Pass the call_ref from your instructions.",
    inputSchema: { call_ref: z.string().min(1).max(100) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async (args) => text((await runTool(db, "stop_recording", JSON.stringify(args))).output),
);

server.connect(new StdioServerTransport()).catch((err) => {
  console.error(err);
  process.exit(1);
});
