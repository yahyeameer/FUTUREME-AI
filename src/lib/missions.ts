import { z } from "zod";
import { parseJsonReply, runAgent } from "./agents";
import { profileContext } from "./council";
import type { Db } from "./db";
import { getRun, runsForMission, runSubAgent, type HelperTool, type RunRecord, type SubTask } from "./delegation";
import { createApproval, getProfile } from "./futureme";
import { MISSION_PLAN_MARKER, MISSION_REPORT_MARKER } from "./mock-llm";
import { SCHEMAS } from "./nemotron";
import { supervise } from "./supervisor";
import { searchProvider } from "./web";

// Missions: one bigger goal, worked on by a team.
// 1. The mission lead splits the goal into 2-4 tasks, each for the researcher or a helper it defines (role + read-only tools).
// 2. The tasks run in parallel as sub-agents. The supervisor reviews each; blocked results are left out of the report.
// 3. The lead writes the report from what came back and may suggest a plan, which waits for the user's approval.

export type MissionStatus = "planning" | "running" | "reporting" | "done" | "failed";

export interface PlannedTask {
  title: string;
  agent: "researcher" | "helper";
  role: string | null;
  tools: HelperTool[];
  task: string;
}

export interface MissionRecord {
  id: number;
  goal: string;
  status: MissionStatus;
  plan: PlannedTask[];
  report: string | null;
  next_step: string | null;
  approval_id: number | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
  runs: RunRecord[];
  lead: RunRecord | null;
}

const TaskSchema = z.object({
  title: z.string().min(2).max(100),
  agent: z.enum(["researcher", "helper"]),
  role: z.string().min(2).max(60).optional(),
  tools: z.array(z.enum(["search_memory", "web_search", "fetch_url"])).max(3).optional(),
  task: z.string().min(5).max(600),
});

const ReportPlan = z.object({
  goal: z.string().min(1).max(160),
  why: z.string().max(1000).optional(),
  tasks: z.array(z.object({ title: z.string().min(1).max(200), due_in_days: z.number().int().min(0).max(365).optional() })).min(1).max(6),
});

/** Records the mission and returns at once; the work continues in `done`. The app polls while it runs. */
export function startMission(db: Db, rawGoal: string): { id: number; done: Promise<MissionRecord> } {
  const profile = getProfile(db);
  if (!profile) throw new Error("Complete onboarding first.");
  const goal = rawGoal.trim();
  if (goal.length < 5) throw new Error("Describe the mission in a few words.");
  if (goal.length > 400) throw new Error("Keep the mission under 400 characters.");
  if (db.prepare("SELECT id FROM missions WHERE status IN ('planning','running','reporting') AND created_at > datetime('now', '-15 minutes')").get()) {
    throw new Error("A mission is already running. Wait for it to finish.");
  }
  const id = Number(db.prepare("INSERT INTO missions (goal) VALUES (?)").run(goal).lastInsertRowid);
  return { id, done: work(db, id, goal) };
}

async function work(db: Db, id: number, goal: string): Promise<MissionRecord> {
  const profile = getProfile(db)!;
  const context = { role: "system" as const, content: profileContext(profile) };
  const webOn = searchProvider() !== "off";
  try {
    // 1. Plan.
    const planning = await runAgent(db, "mission_lead", [context, { role: "user", content: `${MISSION_PLAN_MARKER} ${JSON.stringify({ goal, web_search: webOn })}` }], { schema: SCHEMAS.missionPlan });
    const raw = parseJsonReply<{ tasks?: unknown[] }>(planning.reply)?.tasks ?? [];
    const plan: PlannedTask[] = raw
      .map((t) => TaskSchema.safeParse(t))
      .flatMap((r) => (r.success ? [r.data] : []))
      // Without web access the researcher can't work, so its task goes to a helper with memory search instead.
      .map((t) => (t.agent === "researcher" && !webOn ? { ...t, agent: "helper" as const, role: t.role ?? "Researcher (notes only)", tools: ["search_memory"] as HelperTool[] } : t))
      .slice(0, 4)
      .map((t) => ({ title: t.title, agent: t.agent, role: t.agent === "helper" ? (t.role ?? "Helper") : null, tools: t.agent === "researcher" ? ["web_search", "fetch_url"] : (t.tools ?? ["search_memory"]), task: t.task }));
    if (!plan.length) throw new Error("The mission lead didn't produce a usable plan.");
    db.prepare("UPDATE missions SET status = 'running', plan = ? WHERE id = ?").run(JSON.stringify(plan), id);

    // 2. Run every task in parallel.
    const results = await Promise.all(
      plan.map((t) => {
        const sub: SubTask = t.agent === "researcher" ? { kind: "delegate", agent: "researcher", task: t.task } : { kind: "spawn", role: t.role!, task: t.task, tools: t.tools };
        return runSubAgent(db, sub, { missionId: id });
      }),
    );
    db.prepare("UPDATE missions SET status = 'reporting' WHERE id = ?").run(id);
    const usable = results.filter((r) => r.status === "done");
    if (!usable.length) throw new Error("No task produced a result the supervisor accepted.");

    // 3. Report. The lead only sees results the supervisor let through.
    const leadId = Number(db.prepare("INSERT INTO agent_runs (kind, agent, task, tools, mission_id) VALUES ('mission_lead', 'mission_lead', ?, '[]', ?)").run(`Write the report for: ${goal}`, id).lastInsertRowid);
    db.prepare("UPDATE missions SET lead_run_id = ? WHERE id = ?").run(leadId, id);
    const payload = {
      goal,
      results: plan.map((t, i) => ({
        title: t.title,
        by: t.agent === "researcher" ? "researcher" : t.role,
        status: results[i].status,
        output: results[i].status === "done" ? results[i].output : null,
        supervisor: results[i].supervision?.verdict ?? null,
      })),
    };
    const lead = await runAgent(db, "mission_lead", [context, { role: "user", content: `${MISSION_REPORT_MARKER} ${JSON.stringify(payload)}` }], { schema: SCHEMAS.missionReport });
    const parsed = parseJsonReply<{ report?: unknown; next_step?: unknown; plan?: unknown }>(lead.reply);
    const report = typeof parsed?.report === "string" && parsed.report.trim() ? parsed.report.trim() : lead.reply.trim();
    const nextStep = typeof parsed?.next_step === "string" ? parsed.next_step.trim() || null : null;
    // The report may only cite links the team's tools returned.
    const citations = [...new Set(usable.flatMap((r) => r.citations))];
    const supervision = await supervise(db, { agent: "mission_lead", role: null, task: goal, allowedTools: [], usedTools: [], citations, output: report, exactEvents: false }, { agentReview: false });
    db.prepare("UPDATE agent_runs SET status = ?, output = ?, citations = ?, used_tools = '[]', supervision = ?, backend = ?, finished_at = datetime('now') WHERE id = ?").run(
      supervision.verdict === "block" ? "blocked" : "done",
      report,
      JSON.stringify(citations),
      JSON.stringify(supervision),
      lead.backend,
      leadId,
    );
    if (supervision.verdict === "block") throw new Error(`The supervisor blocked the report: ${supervision.summary}`);

    const proposal = ReportPlan.safeParse(parsed?.plan);
    const approvalId = proposal.success ? createApproval(db, "plan", proposal.data) : null;
    db.prepare("UPDATE missions SET status = 'done', report = ?, next_step = ?, approval_id = ?, finished_at = datetime('now') WHERE id = ?").run(report, nextStep, approvalId, id);
  } catch (err) {
    db.prepare("UPDATE missions SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ?").run(err instanceof Error ? err.message : "The mission failed.", id);
  }
  return getMission(db, id)!;
}

interface RawMission extends Omit<MissionRecord, "plan" | "runs" | "lead"> {
  plan: string | null;
  lead_run_id: number | null;
}

export function getMission(db: Db, id: number): MissionRecord | null {
  const m = db.prepare("SELECT * FROM missions WHERE id = ?").get(id) as RawMission | undefined;
  if (!m) return null;
  // A mission stuck mid-way (the server restarted) is reported as failed rather than running forever.
  const stale = ["planning", "running", "reporting"].includes(m.status) && Date.now() - new Date(`${m.created_at.replace(" ", "T")}Z`).getTime() > 15 * 60_000;
  const runs = runsForMission(db, id);
  const { lead_run_id, ...rest } = m;
  return {
    ...rest,
    status: stale ? "failed" : m.status,
    error: stale ? (m.error ?? "The mission stopped before it finished.") : m.error,
    plan: m.plan ? JSON.parse(m.plan) : [],
    runs: runs.filter((r) => r.kind === "mission_task"),
    lead: lead_run_id ? getRun(db, lead_run_id) : null,
  };
}

export function listMissions(db: Db, limit = 12): MissionRecord[] {
  return (db.prepare("SELECT id FROM missions ORDER BY id DESC LIMIT ?").all(limit) as { id: number }[]).map((r) => getMission(db, r.id)!);
}
