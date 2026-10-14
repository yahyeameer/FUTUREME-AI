// MCP server exposing the FutureMe memory vault to Docker Agent over stdio.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { VAULT_FOLDERS, searchNotes, writeNote } from "../src/lib/vault";

const server = new McpServer({ name: "futureme-vault", version: "0.1.0" });

server.registerTool(
  "write_note",
  {
    description: "Write a Markdown note to the user's FutureMe memory vault. Use only for facts the user stated or approved.",
    inputSchema: {
      folder: z.enum(VAULT_FOLDERS),
      title: z.string().min(1).max(120),
      body: z.string().min(1),
      tags: z.array(z.string()).optional(),
      links: z.array(z.string()).optional().describe("Titles of related notes, rendered as [[wiki-links]]"),
    },
  },
  async (args) => {
    const note = writeNote(args);
    return { content: [{ type: "text", text: `Saved ${note.path}` }] };
  },
);

server.registerTool(
  "search_memory",
  {
    description: "Search the user's memory vault by keyword. Returns the best matching notes.",
    inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(10).optional() },
  },
  async ({ query, limit }) => {
    const hits = searchNotes(query, limit ?? 5);
    const text = hits.length
      ? hits.map((h) => `## ${h.note.title} (${h.note.path})\n${h.note.body.trim()}`).join("\n\n")
      : "No matching notes.";
    return { content: [{ type: "text", text }] };
  },
);

server.connect(new StdioServerTransport()).catch((err) => {
  console.error(err);
  process.exit(1);
});
