// MCP bridge that gives Docker Agent the tools of the Docker MCP Gateway (Docker's MCP Toolkit), FutureMe's way:
// each tool is offered as docker_<tool>, and every call goes through runTool, so it is logged and anything that can
// change something waits for the user's approval in the app instead of running. agents/futureme.yaml adds it to the
// future self. When the gateway isn't configured or isn't running, this server simply lists no tools.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { openDb } from "../src/lib/db";
import { closeDockerMcp, ensureDockerMcp } from "../src/lib/docker-mcp";
import { isDockerTool } from "../src/lib/docker-tools";
import { runTool } from "../src/lib/futureme";

const db = openDb();
const server = new Server({ name: "futureme-docker-tools", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const state = await ensureDockerMcp();
  return {
    tools: state.tools.map((t) => ({
      name: t.name,
      title: t.title,
      description: `${t.description || t.title}${t.gate === "approval" ? " (Waits for the user's approval in FutureMe; it does not run straight away.)" : ""}`,
      inputSchema: { type: "object" as const, ...t.inputSchema },
      annotations: { readOnlyHint: t.gate === "auto", openWorldHint: true },
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  if (!isDockerTool(name)) return { content: [{ type: "text", text: `Unknown tool ${name}.` }], isError: true };
  const result = await runTool(db, name, JSON.stringify(args ?? {}));
  return { content: [{ type: "text", text: result.output }], isError: result.output.startsWith("Error") };
});

const shutdown = () => void closeDockerMcp().finally(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.connect(new StdioServerTransport()).catch((err) => {
  console.error(err);
  process.exit(1);
});
