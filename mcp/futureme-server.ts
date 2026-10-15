// MCP server giving FutureMe's Docker Agent team its tools: memory search, memory and plan proposals, and web research.
// Proposals land in SQLite as pending approvals; nothing is written to the vault until the user approves in the app.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { openDb } from "../src/lib/db";
import { runTool } from "../src/lib/futureme";

const db = openDb();
const server = new McpServer({ name: "futureme", version: "0.4.0" });

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

// Handoffs run the sub-agent through Docker Agent when DOCKER_AGENT_URL reaches this process, otherwise in-process with
// the same instructions. Either way the supervisor reviews the result before it is returned here.
server.registerTool(
  "delegate_task",
  {
    description:
      "Hand one task to a teammate and get their answer back: 'researcher' searches the web and returns sources; 'council' asks four future selves and returns a decision brief. A supervisor reviews the result first.",
    inputSchema: { agent: z.enum(["researcher", "council"]), task: z.string().min(5).max(600) },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => text((await runTool(db, "delegate_task", JSON.stringify(args))).output),
);

server.registerTool(
  "spawn_agent",
  {
    description:
      "Create a temporary helper agent for one task, with a role you choose and read-only tools. It returns text only and can't save anything. A supervisor reviews its result first.",
    inputSchema: {
      role: z.string().min(2).max(60),
      task: z.string().min(5).max(600),
      tools: z.array(z.enum(["search_memory", "web_search", "fetch_url"])).max(3).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => text((await runTool(db, "spawn_agent", JSON.stringify(args))).output),
);

server.connect(new StdioServerTransport()).catch((err) => {
  console.error(err);
  process.exit(1);
});
