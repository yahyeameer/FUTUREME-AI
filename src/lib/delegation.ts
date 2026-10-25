import { parseJsonReply, runAgent, type AgentName } from "./agents";
import { SCHEMAS } from "./nemotron";
import { profileContext, runCouncil } from "./council";
import { withChosenRoad } from "./chosen-road";
import type { Db } from "./db";
import { getProfile, type DelegateRequest, type SpawnRequest } from "./futureme";
import { RESEARCH_MARKER, SUBTASK_MARKER } from "./mock-llm";
import { supervise, verdictOf, type Issue, type Supervision } from "./supervisor";
import { searchProvider } from "./web";

// Handoffs: the future self (or a mission lead) gives one task to another agent and gets the result back.
// - delegate: a teammate defined in agents/futureme.yaml (the researcher, or the whole council).
// - spawn: a temporary helper created on the spot with a role and read-only tools chosen by the agent that asked.
// Every run is recorded in agent_runs and reviewed by the supervisor before its result is passed back.

export type HelperTool = "search_memory" | "web_search" | "fetch_url";
const WEB_TOOLS: HelperTool[] = ["web_search", "fetch_url"];

export type SubTask = ({ kind: "delegate" } & DelegateRequest) | ({ kind: "spawn" } & SpawnRequest);

export type RunKind = "delegate" | "spawn" | "mission_task" | "mission_lead";
export type RunStatus = "running" | "done" | "blocked" | "failed";

export interface RunRecord {
  id: number;
  kind: RunKind;
  agent: string;
  role: string | null;
  task: string;
  tools: string[];
  status: RunStatus;
  output: string | null;
  citations: string[];
  used_tools: string[];
  supervision: Supervision | null;
  backend: string | null;
  error: string | null;
  mission_id: number | null;
  started_at: string;
  finished_at: string | null;
}

export interface HandOffResult extends RunRecord {
  /** What the asking agent receives: the result, the supervisor's flags, or why it was withheld. */
  forParent: string;
}

/** Called by the delegate_task and spawn_agent tools. */
export function handOff(db: Db, task: SubTask) {
  return runSubAgent(db, task);
}

export async function runSubAgent(db: Db, task: SubTask, opts: { missionId?: number } = {}): Promise<HandOffResult> {
  const profile = getProfile(db);
  const webOn = searchProvider() !== "off";
  const notes: Issue[] = [];

  // Resolve who does the work and with which tools.
  let agent: string;
  let tools: HelperTool[];
  if (task.kind === "delegate") {
    agent = task.agent;
    tools = task.agent === "researcher" ? WEB_TOOLS : ["search_memory"];
  } else {
    const asked = [...new Set(task.tools?.length ? task.tools : (["search_memory"] as HelperTool[]))];
    tools = webOn ? asked : asked.filter((t) => !WEB_TOOLS.includes(t));
    if (!tools.length) tools = ["search_memory"];
    if (tools.length < asked.length) notes.push({ source: "rule", severity: "flag", text: "Web tools were asked for but web access is off on this server, so it only had memory search." });
    agent = tools.some((t) => WEB_TOOLS.includes(t)) ? "helper_web" : "helper_memory";
  }
  const role = task.kind === "spawn" ? task.role.trim() : null;
  const label = task.kind === "spawn" ? `a ${role} helper` : task.agent === "council" ? "the council" : "the researcher";
  const id = Number(
    db
      .prepare("INSERT INTO agent_runs (kind, agent, role, task, tools, mission_id) VALUES (?, ?, ?, ?, ?, ?)")
      .run(opts.missionId ? "mission_task" : task.kind, agent, role, task.task.trim(), JSON.stringify(tools), opts.missionId ?? null).lastInsertRowid,
  );

  try {
    if (task.kind === "delegate" && task.agent === "researcher" && !webOn) throw new Error("web search is turned off on this server");
    let output = "";
    let citations: string[] = [];
    let usedTools: string[] = [];
    let backend = "";
    let exactEvents = false;

    if (task.kind === "delegate" && task.agent === "council") {
      const c = await runCouncil(db, task.task);
      output = [c.brief.summary, c.brief.agreements.length && `They agree: ${c.brief.agreements.join("; ")}.`, c.brief.tensions.length && `They disagree on: ${c.brief.tensions.join("; ")}.`, `Next step: ${c.brief.next_step}`]
        .filter(Boolean)
        .join("\n");
      citations = c.citations;
      usedTools = c.citations.length ? ["search_memory"] : [];
      backend = c.backend;
    } else if (task.kind === "delegate") {
      const run = await runAgent(db, "researcher", [{ role: "user", content: `${RESEARCH_MARKER} Topic: ${task.task}` }], { runId: id, schema: SCHEMAS.research });
      const opened = new Set(run.events.flatMap((e) => e.citations));
      const parsed = parseJsonReply<{ summary?: unknown; findings?: { point?: unknown; url?: unknown }[] }>(run.reply);
      const findings = (parsed?.findings ?? []).filter((f): f is { point: string; url: string } => typeof f.point === "string" && typeof f.url === "string");
      const kept = findings.filter((f) => opened.has(f.url));
      if (kept.length < findings.length) notes.push({ source: "rule", severity: "flag", text: `Removed ${findings.length - kept.length} finding(s) citing links its tools never returned.` });
      const summary = typeof parsed?.summary === "string" ? parsed.summary.trim() : run.reply.trim();
      output = [summary, ...kept.map((f) => `- ${f.point} (${f.url})`)].join("\n");
      ({ citations, usedTools, backend, exactEvents } = fromRun(run));
    } else {
      const context = [`You were created by TOMORA's main agent for one task, as: ${role}.`, profile && withChosenRoad(db, profileContext(profile))].filter(Boolean).join("\n");
      const run = await runAgent(
        db,
        agent as AgentName,
        [
          { role: "system", content: context },
          { role: "user", content: `${SUBTASK_MARKER} Role: ${role}\nTask: ${task.task}` },
        ],
        { runId: id, tools },
      );
      output = run.reply.trim();
      ({ citations, usedTools, backend, exactEvents } = fromRun(run));
    }

    const supervision = await supervise(db, { agent, role, task: task.task, allowedTools: tools, usedTools, citations, output, exactEvents });
    if (notes.length) {
      supervision.issues.unshift(...notes);
      supervision.verdict = verdictOf(supervision.issues);
    }
    const status: RunStatus = supervision.verdict === "block" ? "blocked" : "done";
    db.prepare("UPDATE agent_runs SET status = ?, output = ?, citations = ?, used_tools = ?, supervision = ?, backend = ?, finished_at = datetime('now') WHERE id = ?").run(
      status,
      output,
      JSON.stringify(citations),
      JSON.stringify(usedTools),
      JSON.stringify(supervision),
      backend,
      id,
    );
    const flags = supervision.issues.map((i) => i.text).join(" ");
    const forParent =
      status === "blocked"
        ? `The supervisor blocked ${label}'s result: ${flags} Don't use it. Tell the user that part couldn't be completed.`
        : `Result from ${label}${supervision.verdict === "flag" ? ` (the supervisor flagged: ${flags})` : ""}:\n${output}`;
    return { ...getRun(db, id)!, forParent };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    db.prepare("UPDATE agent_runs SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ?").run(message, id);
    return { ...getRun(db, id)!, forParent: `${label.charAt(0).toUpperCase()}${label.slice(1)} couldn't finish: ${message}. Tell the user that part couldn't be completed.` };
  }
}

function fromRun(run: Awaited<ReturnType<typeof runAgent>>) {
  // Docker Agent runs share one tool log, so parallel runs can see each other's calls: keep which tools, not how often.
  const tools = run.events.map((e) => e.tool);
  return {
    citations: [...new Set(run.events.flatMap((e) => e.citations))],
    usedTools: run.exactEvents ? tools : [...new Set(tools)],
    backend: run.backend,
    exactEvents: run.exactEvents,
  };
}

interface RawRun extends Omit<RunRecord, "tools" | "citations" | "used_tools" | "supervision"> {
  tools: string;
  citations: string | null;
  used_tools: string | null;
  supervision: string | null;
}

const toRecord = (r: RawRun): RunRecord => ({
  ...r,
  tools: JSON.parse(r.tools),
  citations: r.citations ? JSON.parse(r.citations) : [],
  used_tools: r.used_tools ? JSON.parse(r.used_tools) : [],
  supervision: r.supervision ? JSON.parse(r.supervision) : null,
});

export function getRun(db: Db, id: number): RunRecord | null {
  const r = db.prepare("SELECT * FROM agent_runs WHERE id = ?").get(id) as RawRun | undefined;
  return r ? toRecord(r) : null;
}

export function listRuns(db: Db, limit = 40): RunRecord[] {
  return (db.prepare("SELECT * FROM agent_runs ORDER BY id DESC LIMIT ?").all(limit) as RawRun[]).map(toRecord);
}

export function runsForMission(db: Db, missionId: number): RunRecord[] {
  return (db.prepare("SELECT * FROM agent_runs WHERE mission_id = ? ORDER BY id").all(missionId) as RawRun[]).map(toRecord);
}
