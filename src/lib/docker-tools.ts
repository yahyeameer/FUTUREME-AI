import type { Db } from "./db";
import { callDockerTool, DOCKER_PREFIX, dockerTool } from "./docker-mcp";
import type { ToolResult } from "./futureme";

// What happens when the agent calls a Docker MCP tool. Read-only tools run straight away. Anything that may change
// something becomes a pending "docker_tool" approval; it runs only when the user approves it on the Agent page, and the
// result is posted into the conversation so the agent can pick it up on the next turn.

export const isDockerTool = (name: string) => name.startsWith(DOCKER_PREFIX);

export interface DockerRequestPayload {
  tool: string;
  title: string;
  arguments: Record<string, unknown>;
  result?: string;
  isError?: boolean;
}

export interface DockerRequest extends DockerRequestPayload {
  id: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
}

export async function runDockerTool(db: Db, name: string, json: unknown): Promise<ToolResult> {
  const args = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  let tool;
  try {
    tool = await dockerTool(name);
  } catch {
    tool = undefined;
  }
  if (!tool) return { output: `Error: ${name} isn't available. The Docker MCP Gateway may be stopped; tell the user and carry on without it.`, citations: [] };

  if (tool.gate === "approval") {
    const payload: DockerRequestPayload = { tool: tool.name, title: tool.title, arguments: args };
    const id = Number(db.prepare("INSERT INTO approvals (kind, payload) VALUES ('docker_tool', ?)").run(JSON.stringify(payload)).lastInsertRowid);
    return {
      output: `Request #${id} to run ${tool.tool} is waiting for the user's approval on the Agent page. It has not run yet; don't say it did.`,
      citations: [],
      approvalId: id,
    };
  }
  try {
    const res = await callDockerTool(name, args);
    return { output: res.isError ? `Error from ${tool.tool}: ${res.text}` : res.text || "(no output)", citations: urlsIn(args) };
  } catch (err) {
    return { output: `Error: ${tool.tool} failed: ${err instanceof Error ? err.message : "unknown error"}`, citations: [] };
  }
}

const urlsIn = (args: Record<string, unknown>) => Object.values(args).filter((v): v is string => typeof v === "string" && /^https?:\/\//.test(v));

export function listDockerRequests(db: Db, limit = 30): DockerRequest[] {
  const rows = db.prepare("SELECT id, payload, status, created_at, decided_at FROM approvals WHERE kind = 'docker_tool' ORDER BY id DESC LIMIT ?").all(limit) as {
    id: number;
    payload: string;
    status: DockerRequest["status"];
    created_at: string;
    decided_at: string | null;
  }[];
  return rows.map(({ payload, ...r }) => ({ ...r, ...(JSON.parse(payload) as DockerRequestPayload) }));
}

/**
 * Approve: run the tool now, store what it returned, log it, and post it to the conversation. If the gateway can't be
 * reached the request stays pending, so the user can try again once Docker is running. Reject: nothing runs.
 */
export async function decideDockerRequest(db: Db, id: number, approve: boolean): Promise<void> {
  const row = db.prepare("SELECT payload FROM approvals WHERE id = ? AND kind = 'docker_tool' AND status = 'pending'").get(id) as { payload: string } | undefined;
  if (!row) throw new Error(`No pending tool request #${id}.`);
  const payload = JSON.parse(row.payload) as DockerRequestPayload;
  if (!approve) {
    db.prepare("UPDATE approvals SET status = 'rejected', decided_at = datetime('now') WHERE id = ?").run(id);
    return;
  }

  const res = await callDockerTool(payload.tool, payload.arguments);
  const done: DockerRequestPayload = { ...payload, result: res.text || "(no output)", isError: res.isError };
  const name = payload.tool.slice(DOCKER_PREFIX.length);
  db.transaction(() => {
    db.prepare("UPDATE approvals SET status = 'approved', payload = ?, decided_at = datetime('now') WHERE id = ? AND status = 'pending'").run(JSON.stringify(done), id);
    db.prepare("INSERT INTO tool_events (tool, arguments, output, citations, approval_id) VALUES (?, ?, ?, '[]', ?)").run(
      payload.tool,
      JSON.stringify(payload.arguments),
      done.result,
      id,
    );
    const excerpt = done.result!.length > 1500 ? `${done.result!.slice(0, 1500)}\n…` : done.result!;
    db.prepare("INSERT INTO messages (role, content, citations, tools) VALUES ('assistant', ?, '[]', ?)").run(
      `You approved **${payload.title}**${res.isError ? ", but it reported an error" : ""}. Here's what ${name} returned:\n\n${excerpt
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n")}`,
      JSON.stringify([payload.tool]),
    );
  })();
}
