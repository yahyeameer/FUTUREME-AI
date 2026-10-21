import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { ToolDefinition } from "./llm";

// TOMORA as an MCP client of the Docker MCP Gateway (Docker Desktop's MCP Toolkit, or `docker mcp gateway run`).
// The gateway runs each MCP server from Docker's catalog in its own container; TOMORA lists their tools, offers them
// to the agent as `docker_<tool>`, and routes every call through runTool so it is logged and, when it can change
// something, waits for the user's approval (docker-tools.ts).
//
// Off unless configured, and never fatal: when Docker or the gateway isn't running the agent simply has no Docker tools.
//
//   DOCKER_MCP_GATEWAY_URL      http://localhost:8811/mcp  (`docker mcp gateway run --transport streaming --port 8811`)
//                               An address ending in /sse uses the older SSE transport.
//   DOCKER_MCP_GATEWAY_TOKEN    Bearer token, if the gateway prints one.
//   DOCKER_MCP_GATEWAY=on       Start `docker mcp gateway run` over stdio instead (one gateway per process).
//   DOCKER_MCP_GATEWAY_COMMAND  The command to start instead of `docker mcp gateway run`, as a JSON array or a plain string.
//   DOCKER_MCP_SERVERS          Catalog servers to load, e.g. duckduckgo,fetch,time (default: whatever is enabled).
//   DOCKER_MCP_AUTO_APPROVE     Tool names that may run without asking even though they don't declare themselves read-only.

export const DOCKER_PREFIX = "docker_";
/** The marker agents/futureme.yaml produces for an agent that gets the Docker MCP tools. */
export const DOCKER_TOOLSET = "docker_mcp";

export type DockerGate = "auto" | "approval";

export interface DockerTool {
  /** The name the agent calls: docker_<tool>. */
  name: string;
  /** The tool's own name on the gateway. */
  tool: string;
  title: string;
  description: string;
  gate: DockerGate;
  inputSchema: Record<string, unknown>;
}

export interface DockerMcpState {
  status: "off" | "connecting" | "connected" | "unavailable";
  /** How TOMORA reaches the gateway, in plain words. */
  via: string;
  detail?: string;
  tools: DockerTool[];
  checkedAt?: string;
}

type Config = { kind: "url"; url: string; token?: string } | { kind: "stdio"; command: string; args: string[] };

export function dockerMcpConfig(env: Record<string, string | undefined> = process.env): Config | null {
  const url = env.DOCKER_MCP_GATEWAY_URL?.trim();
  if (url) return { kind: "url", url, token: env.DOCKER_MCP_GATEWAY_TOKEN?.trim() || undefined };
  const custom = env.DOCKER_MCP_GATEWAY_COMMAND?.trim();
  if (!custom && env.DOCKER_MCP_GATEWAY?.trim().toLowerCase() !== "on") return null;
  let argv: string[];
  if (custom) argv = custom.startsWith("[") ? (JSON.parse(custom) as string[]) : custom.split(/\s+/);
  else {
    argv = ["docker", "mcp", "gateway", "run"];
    const servers = env.DOCKER_MCP_SERVERS?.trim();
    if (servers) argv.push("--servers", servers);
  }
  return { kind: "stdio", command: argv[0], args: argv.slice(1) };
}

export const dockerMcpConfigured = () => dockerMcpConfig() !== null;

function describeConfig(c: Config | null) {
  if (!c) return "Not set up";
  return c.kind === "url" ? `Docker MCP Gateway at ${c.url}` : `${[c.command, ...c.args].join(" ")} (started by TOMORA)`;
}

function transportFor(c: Config): Transport {
  if (c.kind === "stdio") return new StdioClientTransport({ command: c.command, args: c.args, stderr: "ignore" });
  const url = new URL(c.url);
  const requestInit = c.token ? { headers: { Authorization: `Bearer ${c.token}` } } : undefined;
  return url.pathname.replace(/\/+$/, "").endsWith("/sse") ? new SSEClientTransport(url, { requestInit }) : new StreamableHTTPClientTransport(url, { requestInit });
}

const CONNECT_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 120_000;
const RETRY_AFTER_MS = 30_000;
const TOOLS_TTL_MS = 60_000;

interface Conn {
  key: string;
  client: Client | null;
  connecting: Promise<void> | null;
  state: DockerMcpState;
  lastAttempt: number;
}

// One connection per server process; kept on globalThis so Next's dev reloads don't open a new gateway each time.
const g = globalThis as unknown as { __futuremeDockerMcp?: Conn };

function conn(): Conn {
  const c = dockerMcpConfig();
  const key = JSON.stringify(c);
  if (!g.__futuremeDockerMcp || g.__futuremeDockerMcp.key !== key) {
    void g.__futuremeDockerMcp?.client?.close().catch(() => undefined);
    g.__futuremeDockerMcp = { key, client: null, connecting: null, state: { status: c ? "connecting" : "off", via: describeConfig(c), tools: [] }, lastAttempt: 0 };
  }
  return g.__futuremeDockerMcp;
}

const autoApproved = () =>
  new Set(
    (process.env.DOCKER_MCP_AUTO_APPROVE ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

/** Function names allow [a-zA-Z0-9_-] up to 64 characters. */
export const dockerToolName = (tool: string) => `${DOCKER_PREFIX}${tool.replace(/[^a-zA-Z0-9_-]/g, "_")}`.slice(0, 64);

type ListedTool = Awaited<ReturnType<Client["listTools"]>>["tools"][number];

export function toDockerTool(t: ListedTool, auto = autoApproved()): DockerTool {
  const a = t.annotations ?? {};
  // Read-only tools run on their own. Anything that may change something, or doesn't say, waits for the user.
  const readOnly = a.readOnlyHint === true && a.destructiveHint !== true;
  return {
    name: dockerToolName(t.name),
    tool: t.name,
    title: t.title ?? a.title ?? t.name.replace(/[_-]+/g, " "),
    description: (t.description ?? "").trim().slice(0, 1000),
    gate: readOnly || auto.has(t.name) ? "auto" : "approval",
    inputSchema: schemaOf(t.inputSchema),
  };
}

// Function parameters are a plain JSON Schema object; drop the $schema tag some servers add.
function schemaOf(schema: ListedTool["inputSchema"] | undefined): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...(schema ?? { type: "object" }) };
  delete rest.$schema;
  return { properties: {}, ...rest };
}

async function listAll(client: Client): Promise<ListedTool[]> {
  const out: ListedTool[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined, { timeout: CONNECT_TIMEOUT_MS });
    out.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor && out.length < 500);
  return out;
}

function fail(c: Conn, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const notRunning = /ENOENT|ECONNREFUSED|fetch failed|not found|unknown command|spawn/i.test(message);
  void c.client?.close().catch(() => undefined);
  c.client = null;
  c.state = {
    ...c.state,
    status: "unavailable",
    tools: [],
    checkedAt: new Date().toISOString(),
    detail: notRunning ? `Couldn't reach the Docker MCP Gateway. Is Docker Desktop running with the MCP Toolkit? (${message.slice(0, 200)})` : message.slice(0, 300),
  };
}

async function connect(c: Conn) {
  const config = dockerMcpConfig();
  if (!config) return;
  c.lastAttempt = Date.now();
  const client = new Client({ name: "futureme", version: "0.1.0" });
  client.onclose = () => {
    if (c.client === client) {
      c.client = null;
      c.state = { ...c.state, status: "unavailable", tools: [], detail: "The Docker MCP Gateway closed the connection." };
    }
  };
  try {
    await withTimeout(client.connect(transportFor(config)), CONNECT_TIMEOUT_MS, "Connecting to the Docker MCP Gateway timed out.");
    c.client = client;
    await refreshTools(c);
  } catch (err) {
    void client.close().catch(() => undefined);
    fail(c, err);
  }
}

async function refreshTools(c: Conn) {
  if (!c.client) return;
  const auto = autoApproved();
  const tools = (await listAll(c.client)).map((t) => toDockerTool(t, auto));
  c.state = {
    ...c.state,
    status: "connected",
    tools,
    checkedAt: new Date().toISOString(),
    detail: tools.length ? undefined : "Connected, but no MCP servers are enabled. Enable some in Docker Desktop's MCP Toolkit or with `docker mcp server enable <name>`.",
  };
}

/** Connects (or reconnects after a failure) and returns the current state. Never throws. */
export async function ensureDockerMcp(): Promise<DockerMcpState> {
  const c = conn();
  if (c.state.status === "off") return c.state;
  if (c.connecting) {
    await c.connecting;
    return c.state;
  }
  const stale = Date.now() - c.lastAttempt;
  const due = c.client ? stale > TOOLS_TTL_MS : c.state.status === "connecting" || stale > RETRY_AFTER_MS;
  if (due) {
    c.connecting = (c.client ? refreshTools(c).catch((err) => fail(c, err)).then(() => void (c.lastAttempt = Date.now())) : connect(c)).finally(() => {
      c.connecting = null;
    });
    await c.connecting;
  }
  return c.state;
}

/** Like ensureDockerMcp, but gives up waiting after `ms` so a page load never hangs on Docker. */
export async function warmDockerMcp(ms = 4000): Promise<DockerMcpState> {
  const c = conn();
  if (c.state.status === "off") return c.state;
  await Promise.race([ensureDockerMcp(), new Promise((r) => setTimeout(r, ms))]);
  return c.state;
}

/** The last known state, without waiting. */
export const dockerMcpState = (): DockerMcpState => conn().state;

export async function dockerTool(name: string): Promise<DockerTool | undefined> {
  return (await ensureDockerMcp()).tools.find((t) => t.name === name);
}

/** The Docker tools as function definitions for the in-process agent loop. Empty when the gateway is off or down. */
export async function dockerToolDefs(): Promise<ToolDefinition[]> {
  const state = await ensureDockerMcp();
  return state.tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: `${t.description || t.title} (Docker MCP${t.gate === "approval" ? "; waits for the user's approval" : ""})`.slice(0, 1024),
      parameters: t.inputSchema,
    },
  }));
}

/** Calls a tool on the gateway and returns its text. Throws when the gateway can't be reached. */
export async function callDockerTool(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
  const tool = await dockerTool(name);
  const c = conn();
  if (!c.client) throw new Error(c.state.detail ?? "The Docker MCP Gateway isn't connected.");
  if (!tool) throw new Error(`The Docker MCP Gateway has no tool called ${name.slice(DOCKER_PREFIX.length)}.`);
  const res = await c.client.callTool({ name: tool.tool, arguments: args }, undefined, { timeout: CALL_TIMEOUT_MS });
  return { text: resultText(res.content), isError: res.isError === true };
}

const MAX_OUTPUT = 8000;

export function resultText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const parts = content.map((p: { type?: string; text?: string; resource?: { uri?: string; text?: string }; mimeType?: string }) => {
    if (p.type === "text") return p.text ?? "";
    if (p.type === "resource") return p.resource?.text ?? `[resource ${p.resource?.uri ?? ""}]`;
    if (p.type === "resource_link") return `[link ${(p as { uri?: string }).uri ?? ""}]`;
    return `[${p.type ?? "content"}${p.mimeType ? ` ${p.mimeType}` : ""}]`;
  });
  const text = parts.join("\n").trim();
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n… (cut at ${MAX_OUTPUT} characters)` : text;
}

/** Closes the connection (tests, and the MCP bridge on exit). */
export async function closeDockerMcp() {
  const c = g.__futuremeDockerMcp;
  g.__futuremeDockerMcp = undefined;
  await c?.client?.close().catch(() => undefined);
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}
