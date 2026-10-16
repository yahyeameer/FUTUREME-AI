import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmProvider } from "../src/lib/llm";

vi.mock("server-only", () => ({}));

const { openDb } = await import("../src/lib/db");
const { closeDockerMcp, dockerMcpConfig, ensureDockerMcp, toDockerTool, dockerToolName } = await import("../src/lib/docker-mcp");
const { decideDockerRequest, listDockerRequests } = await import("../src/lib/docker-tools");
const { chat, inProcessBackend, saveProfile } = await import("../src/lib/futureme");
const { buildWorkspace } = await import("../src/lib/workspace-server");

type Db = ReturnType<typeof openDb>;
const FAKE_GATEWAY = JSON.stringify([process.execPath, "--import", "tsx", path.join(__dirname, "fixtures", "fake-docker-gateway.ts")]);
const ENV = ["DOCKER_MCP_GATEWAY_URL", "DOCKER_MCP_GATEWAY", "DOCKER_MCP_GATEWAY_COMMAND", "DOCKER_MCP_SERVERS", "DOCKER_MCP_AUTO_APPROVE"];
let dir: string;
let db: Db;

// A model that calls the given tool once, then answers.
const calls = (tool: string, args: object): LlmProvider => {
  let step = 0;
  return {
    name: "scripted",
    complete: async (_messages, tools) => {
      if (step++ === 0 && tools?.some((t) => t.function.name === tool)) return { content: null, toolCalls: [{ id: "c1", name: tool, arguments: JSON.stringify(args) }] };
      return { content: "Done.", toolCalls: [] };
    },
  };
};

beforeEach(async () => {
  await closeDockerMcp();
  for (const k of ENV) delete process.env[k];
  delete process.env.DOCKER_AGENT_URL;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "futureme-docker-"));
  process.env.VAULT_DIR = path.join(dir, "vault");
  process.env.LLM_PROVIDER = "mock";
  db = openDb(":memory:");
  saveProfile(db, { name: "Amina", dream: "Lead an AI research lab in Hargeisa", style: "direct" });
});
afterEach(async () => {
  await closeDockerMcp();
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("Docker MCP config", () => {
  it("is off unless configured, and builds the gateway command", () => {
    expect(dockerMcpConfig({})).toBeNull();
    expect(dockerMcpConfig({ DOCKER_MCP_GATEWAY: "on", DOCKER_MCP_SERVERS: "duckduckgo,fetch" })).toEqual({
      kind: "stdio",
      command: "docker",
      args: ["mcp", "gateway", "run", "--servers", "duckduckgo,fetch"],
    });
    expect(dockerMcpConfig({ DOCKER_MCP_GATEWAY_URL: "http://localhost:8811/mcp", DOCKER_MCP_GATEWAY_TOKEN: "t" })).toEqual({ kind: "url", url: "http://localhost:8811/mcp", token: "t" });
  });

  it("asks before running anything that doesn't declare itself read-only", () => {
    const base = { name: "x", inputSchema: { type: "object" as const } };
    expect(toDockerTool({ ...base, annotations: { readOnlyHint: true } }).gate).toBe("auto");
    expect(toDockerTool({ ...base, annotations: { readOnlyHint: true, destructiveHint: true } }).gate).toBe("approval");
    expect(toDockerTool(base).gate).toBe("approval");
    expect(toDockerTool(base, new Set(["x"])).gate).toBe("auto");
    expect(dockerToolName("get.page/v2")).toBe("docker_get_page_v2");
  });
});

describe("without Docker", () => {
  it("keeps chat working and reports the gateway as unreachable", async () => {
    process.env.DOCKER_MCP_GATEWAY_COMMAND = "definitely-not-docker-xyz mcp gateway run";
    const state = await ensureDockerMcp();
    expect(state.status).toBe("unavailable");
    expect(state.detail).toMatch(/Docker/);
    const turn = await chat(db, "Hello", inProcessBackend(calls("docker_search", { query: "x" }), { extraTools: async () => [] }));
    expect(turn.reply).toBe("Done.");
    expect(buildWorkspace(db).dockerMcp).toMatchObject({ status: "unavailable", tools: [], requests: [] });
  });
});

describe("with the Docker MCP Gateway", () => {
  beforeEach(() => {
    process.env.DOCKER_MCP_GATEWAY_COMMAND = FAKE_GATEWAY;
  });

  it("lists the gateway's tools and runs read-only ones straight away", async () => {
    const state = await ensureDockerMcp();
    expect(state.status).toBe("connected");
    expect(state.tools.map((t) => [t.name, t.gate])).toEqual([
      ["docker_search", "auto"],
      ["docker_create-issue", "approval"],
    ]);

    const { dockerToolDefs } = await import("../src/lib/docker-mcp");
    const turn = await chat(db, "Search for SMS farming advice", inProcessBackend(calls("docker_search", { query: "SMS farming" }), { extraTools: dockerToolDefs }));
    expect(turn.tools).toEqual(["docker_search"]);
    const event = db.prepare("SELECT output FROM tool_events WHERE tool = 'docker_search'").get() as { output: string };
    expect(event.output).toBe("Results for SMS farming");
    expect(listDockerRequests(db)).toEqual([]);
  }, 30_000);

  it("holds a write until the user approves it, then posts the result", async () => {
    const { dockerToolDefs } = await import("../src/lib/docker-mcp");
    await chat(db, "Open an issue about the demo", inProcessBackend(calls("docker_create-issue", { title: "Demo bug" }), { extraTools: dockerToolDefs }));
    const [req] = listDockerRequests(db);
    expect(req).toMatchObject({ status: "pending", tool: "docker_create-issue", arguments: { title: "Demo bug" } });
    expect(req.result).toBeUndefined();

    await decideDockerRequest(db, req.id, true);
    const [done] = listDockerRequests(db);
    expect(done).toMatchObject({ status: "approved", result: 'Opened issue "Demo bug"', isError: false });
    const last = db.prepare("SELECT content FROM messages ORDER BY id DESC LIMIT 1").get() as { content: string };
    expect(last.content).toContain('Opened issue "Demo bug"');
    await expect(decideDockerRequest(db, req.id, true)).rejects.toThrow(/No pending/);

    const ws = buildWorkspace(db);
    expect(ws.dockerMcp?.requests[0]).toMatchObject({ id: String(req.id), status: "approved" });
  }, 30_000);

  it("runs nothing when the user declines", async () => {
    const { dockerToolDefs } = await import("../src/lib/docker-mcp");
    await chat(db, "Open an issue", inProcessBackend(calls("docker_create-issue", { title: "No" }), { extraTools: dockerToolDefs }));
    const [req] = listDockerRequests(db);
    await decideDockerRequest(db, req.id, false);
    expect(listDockerRequests(db)[0]).toMatchObject({ status: "rejected" });
    expect(db.prepare("SELECT COUNT(*) AS n FROM tool_events WHERE output LIKE 'Opened issue%'").get()).toEqual({ n: 0 });
  }, 30_000);
});
