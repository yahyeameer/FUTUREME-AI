// Stands in for `docker mcp gateway run` in tests: a stdio MCP server with one read-only tool and one that writes.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "fake-docker-gateway", version: "0.0.0" });
server.registerTool(
  "search",
  { title: "Web search", description: "Searches the web.", inputSchema: { query: z.string() }, annotations: { readOnlyHint: true } },
  async ({ query }) => ({ content: [{ type: "text", text: `Results for ${query}` }] }),
);
server.registerTool(
  "create-issue",
  { description: "Opens an issue.", inputSchema: { title: z.string() } },
  async ({ title }) => ({ content: [{ type: "text", text: `Opened issue "${title}"` }] }),
);
void server.connect(new StdioServerTransport());
