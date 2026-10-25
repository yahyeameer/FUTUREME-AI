import "server-only";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { generateDaily, type DailyIssue, type DailyItem as IssueItem } from "./daily";
import type { Db } from "./db";
import {
  completeTask,
  decideApproval,
  generateStory,
  getProfile,
  latestReflection,
  saveProfile,
  type MemoryProposal as BackendMemoryProposal,
  type PlanProposal as BackendPlanProposal,
  type Profile as BackendProfile,
} from "./futureme";
import { agentFilePath, agentTeam } from "./agents";
import { listCouncils } from "./council";
import { dockerMcpState } from "./docker-mcp";
import { listDockerRequests } from "./docker-tools";
import { listRuns, type RunRecord } from "./delegation";
import { listMissions } from "./missions";
import { getProvider, LOCAL_LLM_URL } from "./llm";
import { listNightShifts, nextRunAt, nightShiftSchedule } from "./night-shift";
import { activePack, listPacks } from "./packs";
import { listResearch } from "./research";
import { getChosenRoad } from "./chosen-road";
import { jevStatus } from "./decision/jev";
import { listDecisions } from "./decision/store";
import { listSimulations } from "./simulator";
import { toPaths } from "./simulator-paths";
import { skillsFor } from "./skills";
import { TEAM } from "./team-info";
import { toolLabel } from "./tool-labels";
import { yearsInWords } from "./utils";
import { searchProvider } from "./web";
import { listNotes, readNote, resolveInVault, slugify, VAULT_FOLDERS, writeNote, type Note, type VaultFolder } from "./vault";
import type {
  AgentRunInfo,
  ActivityItem,
  AgentInfo,
  AgentPlatform,
  Approval,
  CoachingStyle,
  DailyEdition,
  DailyItem,
  Memory,
  MemoryDraft,
  MemoryKind,
  Message,
  Milestone,
  PlanProposal,
  Profile,
  Provenance,
  Reflection,
  Task,
  Workspace,
} from "@/types";

// Maps TOMORA's backend (SQLite + Markdown vault) onto the frontend's typed Workspace.
// It only reads through the backend's own functions or plain SQL, and writes through them where they exist.

// ---------- Coaching style ----------

const TO_BACKEND: Record<CoachingStyle, BackendProfile["style"]> = {
  reflective: "gentle",
  encouraging: "gentle",
  strategic: "direct",
  analytical: "strategic",
};
const FROM_BACKEND: Record<BackendProfile["style"], CoachingStyle> = { gentle: "reflective", direct: "strategic", strategic: "analytical" };

// ---------- Memory mapping ----------

const KIND_BY_FOLDER: Record<string, MemoryKind> = {
  Profile: "profile",
  Goals: "goal",
  Reflections: "reflection",
  Plans: "goal",
  Tasks: "task",
  Daily: "daily",
  Research: "note",
  Social: "experience",
};

const FOLDER_BY_KIND: Record<MemoryKind, VaultFolder> = {
  profile: "Profile",
  goal: "Goals",
  milestone: "Goals",
  reflection: "Reflections",
  experience: "Reflections",
  note: "Reflections",
  task: "Tasks",
  daily: "Daily",
};

function provenanceOf(note: Note): Provenance {
  const e = note.data.evidence;
  return e === "ai-inferred" || e === "verified" ? e : "user-stated";
}

function sourceOf(note: Note, provenance: Provenance): string {
  switch (note.folder) {
    case "Profile":
      return "Onboarding";
    case "Goals":
      return "Approved plan";
    case "Tasks":
      return provenance === "verified" ? "Completed task" : "Task from an approved plan";
    case "Daily":
      return "TOMORA Daily";
    case "Research":
      return "Web research summary";
    case "Social": {
      const from = { linkedin: "LinkedIn", x: "X", facebook: "Facebook" }[String(note.data.source)];
      return from ? `Imported from your ${from} data` : "Built from your imported accounts";
    }
    case "Reflections":
      return provenance === "ai-inferred" ? "Generated reflection" : "Approved from a conversation";
    default:
      return "Vault note";
  }
}

// The vault writes "# Title" and a "Related: [[...]]" line into each note; the UI shows both separately.
function splitBody(body: string) {
  const lines = body.replace(/^\s*# .*\n+/, "").trimEnd().split("\n");
  const relatedIdx = lines.findLastIndex((l) => l.startsWith("Related: "));
  const related = relatedIdx >= 0 ? [...lines[relatedIdx].matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim()) : [];
  if (relatedIdx >= 0) lines.splice(relatedIdx, 1);
  return { body: lines.join("\n").trim(), related };
}

function readMemories(goalIdByNote: Map<string, string>, goalIdByTitle: Map<string, string>): Memory[] {
  const notes: Note[] = [];
  for (const rel of listNotes()) {
    try {
      notes.push(readNote(rel));
    } catch {
      // Skip unreadable notes rather than failing the whole workspace.
    }
  }
  const byTitle = new Map(notes.map((n) => [n.title.toLowerCase(), n.path]));
  const memories = notes.map((note): Memory => {
    const provenance = provenanceOf(note);
    const { body } = splitBody(note.body);
    const updated = typeof note.data.updated === "string" ? note.data.updated : new Date(0).toISOString();
    const links = note.links.map((l) => byTitle.get(l.toLowerCase())).filter((p): p is string => !!p && p !== note.path);
    const milestoneIds = new Set<string>();
    const own = goalIdByNote.get(note.path);
    if (own) milestoneIds.add(own);
    for (const l of note.links) {
      const g = goalIdByTitle.get(l.toLowerCase());
      if (g) milestoneIds.add(g);
    }
    return {
      id: note.path,
      title: note.title,
      kind: KIND_BY_FOLDER[note.folder] ?? "note",
      body,
      tags: note.tags,
      provenance,
      source: sourceOf(note, provenance),
      createdAt: updated,
      updatedAt: updated,
      archived: false,
      retrievable: true,
      relatedMemoryIds: [...new Set(links)],
      relatedMilestoneIds: [...milestoneIds],
      path: note.path,
    };
  });
  // Backlinks: a note that links here is related too.
  const byId = new Map(memories.map((m) => [m.id, m]));
  for (const m of memories)
    for (const r of m.relatedMemoryIds) {
      const target = byId.get(r);
      if (target && !target.relatedMemoryIds.includes(m.id)) target.relatedMemoryIds.push(m.id);
    }
  return memories.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// ---------- Snapshot ----------

const sqlTime = (t: string | null | undefined) => (t ? (t.includes("T") ? t : `${t.replace(" ", "T")}Z`) : undefined);

// Photos go to the model only when it can see them: Nemotron's VL models on Nebius, in the app's own agent loop.
function visionCapable(): boolean {
  if (process.env.DOCKER_AGENT_URL) return false;
  try {
    return /nebius:.*-VL/i.test(getProvider().name);
  } catch {
    return false;
  }
}

function runtime(): Workspace["runtime"] {
  let model = "unknown";
  try {
    model = getProvider().name;
  } catch (err) {
    model = err instanceof Error ? `not configured (${err.message})` : "not configured";
  }
  const standIn = model === "mock";
  const local = model.startsWith("local:");
  return {
    mode: "live",
    agent: process.env.DOCKER_AGENT_URL
      ? `Docker Agent team (agents/futureme.yaml, ${agentTeam().length} agents) with TOMORA's MCP tools${dockerMcpState().status === "connected" ? " and the Docker MCP Gateway" : ""}`
      : "TOMORA's agent team, running in the app server",
    model: standIn
      ? "Built-in stand-in model (no Nebius key configured)"
      : local
        ? `${model.slice(6)} on Docker Model Runner, on this machine`
        : model.replace(/^nebius:/, "Nemotron on Nebius Token Factory: "),
    simulated: standIn,
    storage: "SQLite and an Obsidian-compatible Markdown vault on the TOMORA server",
    inference: standIn
      ? "None. The stand-in model runs inside the app server."
      : local
        ? `Local. Every agent runs on Docker Model Runner at ${LOCAL_LLM_URL()}; nothing is sent to a cloud model.`
        : "Remote. Each conversation turn, with relevant memories, is sent to Nebius Token Factory for inference.",
  };
}

export function buildWorkspace(db: Db): Workspace {
  const p = getProfile(db);
  const profileRow = db.prepare("SELECT updated_at FROM profile WHERE id = 1").get() as { updated_at: string } | undefined;
  const profile: Profile | null = p
    ? {
        name: p.name,
        dream: p.dream,
        horizonYear: p.horizonYear ?? new Date(sqlTime(profileRow?.updated_at) ?? Date.now()).getFullYear() + 10,
        current: p.current,
        resources: p.resources,
        challenges: p.challenges,
        values: p.values
          .split(/[,;]/)
          .map((v) => v.trim())
          .filter(Boolean),
        style: FROM_BACKEND[p.style],
      }
    : null;

  const goals = db.prepare("SELECT id, title, why, target_date, note_path, created_at FROM goals ORDER BY id").all() as {
    id: number;
    title: string;
    why: string | null;
    target_date: string | null;
    note_path: string | null;
    created_at: string;
  }[];
  const goalIdByNote = new Map(goals.filter((g) => g.note_path).map((g) => [g.note_path!, `goal-${g.id}`]));
  const goalIdByTitle = new Map(goals.map((g) => [g.title.toLowerCase(), `goal-${g.id}`]));
  const memories = readMemories(goalIdByNote, goalIdByTitle);
  const titleOf = new Map(memories.map((m) => [m.id, m.title]));

  const milestones: Milestone[] = goals.map((g, i) => ({
    id: `goal-${g.id}`,
    title: g.title,
    why: g.why ?? undefined,
    targetDate: g.target_date ?? undefined,
    createdAt: sqlTime(g.created_at)!,
    order: i,
    memoryIds: memories.filter((m) => m.relatedMilestoneIds.includes(`goal-${g.id}`) && m.kind !== "task").map((m) => m.id),
  }));

  const tasks: Task[] = (
    db.prepare("SELECT id, goal_id, title, due_date, status, completed_at, created_at FROM tasks ORDER BY id").all() as {
      id: number;
      goal_id: number;
      title: string;
      due_date: string | null;
      status: string;
      completed_at: string | null;
      created_at: string;
    }[]
  ).map((t) => ({
    id: `task-${t.id}`,
    milestoneId: `goal-${t.goal_id}`,
    title: t.title,
    status: t.status === "done" ? "done" : "todo",
    dueDate: t.due_date ?? undefined,
    completedAt: sqlTime(t.completed_at),
    createdAt: sqlTime(t.created_at)!,
  }));

  const approvals: Approval[] = (
    db.prepare("SELECT id, kind, payload, status, created_at, decided_at FROM approvals WHERE kind IN ('plan', 'memory') ORDER BY id DESC LIMIT 100").all() as {
      id: number;
      kind: "plan" | "memory";
      payload: string;
      status: Approval["status"];
      created_at: string;
      decided_at: string | null;
    }[]
  )
    .reverse()
    .map((a): Approval => {
      const base = { id: String(a.id), status: a.status, createdAt: sqlTime(a.created_at)!, decidedAt: sqlTime(a.decided_at) };
      if (a.kind === "plan") {
        const plan = JSON.parse(a.payload) as BackendPlanProposal;
        return { ...base, kind: "plan", plan: { goal: plan.goal, why: plan.why, tasks: plan.tasks.map((t) => ({ title: t.title, dueInDays: t.due_in_days })) } };
      }
      const mem = JSON.parse(a.payload) as BackendMemoryProposal;
      return { ...base, kind: "memory", memory: { title: mem.title, body: mem.body, kind: KIND_BY_FOLDER[mem.folder] ?? "note", tags: mem.tags ?? [] } };
    });

  const r = latestReflection(db);
  const reflection: Reflection | null =
    r && profile
      ? {
          id: `reflection-${r.id}`,
          createdAt: sqlTime(r.created_at)!,
          aspiration: profile.dream,
          horizonYear: profile.horizonYear,
          title: `A letter from ${yearsInWords(Math.max(1, profile.horizonYear - new Date(sqlTime(r.created_at)!).getFullYear()))} ahead`,
          narrative: r.content.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean),
          moments: [],
          shifts: [],
          challenges: profile.challenges
            .split(/(?:[.;]|,\s*and\s|,)\s*/)
            .map((c) => c.trim())
            .filter((c) => c.length > 2)
            .slice(0, 4)
            .map((c) => ({ title: c.charAt(0).toUpperCase() + c.slice(1), body: "You named this during onboarding.", provenance: "user-stated" as const })),
          path: r.note_path ?? undefined,
        }
      : null;

  // The approval ids each reply recorded (null for replies saved before replies kept them).
  const proposedBy = new Map<string, string[] | null>();
  const conversation: Message[] = (
    db.prepare("SELECT id, role, content, citations, tools, approvals, verification, reasoning, image, created_at FROM messages ORDER BY id DESC LIMIT 60").all() as {
      id: number;
      role: "user" | "assistant";
      content: string;
      citations: string | null;
      tools: string | null;
      approvals: string | null;
      verification: string | null;
      reasoning: string | null;
      image: string | null;
      created_at: string;
    }[]
  )
    .reverse()
    .map((m): Message => {
      proposedBy.set(`msg-${m.id}`, m.approvals ? (JSON.parse(m.approvals) as number[]).map(String) : null);
      const citations = m.citations ? (JSON.parse(m.citations) as string[]) : [];
      const tools = m.tools ? (JSON.parse(m.tools) as string[]) : [];
      const counts = new Map<string, number>();
      for (const t of tools) counts.set(t, (counts.get(t) ?? 0) + 1);
      return {
        id: `msg-${m.id}`,
        role: m.role,
        content: m.content,
        createdAt: sqlTime(m.created_at)!,
        citations: citations.map((p) => ({ memoryId: p, title: titleOf.get(p) ?? p })),
        tools: tools.length
          ? [...counts].map(([name, n]) => ({
              name,
              label: toolLabel(name),
              status: "done" as const,
              detail: name === "search_memory" ? `${citations.length} ${citations.length === 1 ? "note" : "notes"} retrieved` : n > 1 ? `${n} times` : undefined,
            }))
          : undefined,
        verification: m.verification ? JSON.parse(m.verification) : undefined,
        reasoning: m.reasoning ?? undefined,
        image: m.image ? `/api/photo?path=${encodeURIComponent(m.image)}` : undefined,
      };
    });

  // Handoffs belong to the reply that was being written when they ran.
  const runs = listRuns(db, 60);
  conversation.forEach((m, i) => {
    if (m.role !== "assistant" || !m.tools?.some((t) => t.name === "delegate_task" || t.name === "spawn_agent")) return;
    const from = conversation[i - 1]?.createdAt ?? "";
    const mine = runs.filter((r) => (r.kind === "delegate" || r.kind === "spawn") && sqlTime(r.started_at)! >= from && sqlTime(r.started_at)! <= m.createdAt).reverse();
    m.runIds = mine.map((r) => String(r.id));
    for (const t of m.tools) {
      const kind = t.name === "delegate_task" ? "delegate" : t.name === "spawn_agent" ? "spawn" : null;
      if (!kind) continue;
      const who = mine.filter((r) => r.kind === kind).map((r) => runLabel(r));
      if (who.length) t.detail = who.join(", ");
    }
  });

  const researchRuns = listResearch(db);
  const nightShifts = listNightShifts(db);
  const missions = listMissions(db);
  // Proposals from research, the night shift and missions belong to those runs, not to a conversation reply.
  const ownedElsewhere = new Set([
    ...researchRuns.flatMap((r) => (r.approval_id ? [String(r.approval_id)] : [])),
    ...nightShifts.flatMap((n) => n.approvals.map(String)),
    ...missions.flatMap((m) => (m.approval_id ? [String(m.approval_id)] : [])),
  ]);

  // Each reply records the approvals it proposed. Older replies didn't, so their proposals go to the first such reply
  // saved at or after them (timestamps are only to the second, so this can pick the wrong one of two quick turns).
  for (const a of approvals) {
    if (ownedElsewhere.has(a.id)) continue;
    const reply =
      conversation.find((m) => proposedBy.get(m.id)?.includes(a.id)) ??
      conversation.find((m) => m.role === "assistant" && proposedBy.get(m.id) === null && m.createdAt >= a.createdAt);
    if (reply) (reply.approvalIds ??= []).push(a.id);
  }

  const issues = (db.prepare("SELECT date, content, note_path FROM daily_issues ORDER BY date").all() as { date: string; content: string; note_path: string | null }[]).map(
    (row, i) => toEdition(JSON.parse(row.content) as DailyIssue, i + 1, row.note_path),
  );

  return {
    runtime: runtime(),
    capabilities: {
      taskStatuses: ["todo", "done"],
      editTasks: false,
      archiveMemories: false,
      memoryRetrievalControl: false,
      editPlansBeforeApproval: true,
      streaming: true,
      council: true,
      verify: true,
      research: searchProvider() !== "off",
      nightShift: true,
      packs: true,
      delegation: true,
      missions: true,
      vision: visionCapable(),
    },
    profile,
    milestones,
    tasks,
    approvals,
    memories,
    reflection,
    conversation,
    editions: issues.reverse(),
    activity: activity(db, goals),
    skills: skillsFor("live", { research: searchProvider() !== "off" }),
    skillRuns: [],
    platform: platform(db),
    councils: listCouncils(db).map((c) => ({
      id: String(c.id),
      question: c.question,
      createdAt: sqlTime(c.created_at)!,
      voices: c.voices,
      brief: { summary: c.brief.summary, agreements: c.brief.agreements, tensions: c.brief.tensions, nextStep: c.brief.next_step },
      citations: c.citations.map((p) => ({ memoryId: p, title: titleOf.get(p) ?? p })),
      memoryId: c.note_path ?? undefined,
      simulated: false,
    })),
    simulations: listSimulations(db).map((s) => ({
      id: String(s.id),
      goal: s.goal,
      createdAt: sqlTime(s.created_at)!,
      paths: toPaths(s.result.paths),
      situation: s.situation,
      sharedUnknowns: s.result.shared_unknowns,
      howToChoose: s.result.how_to_choose,
      grounding: { profile: s.grounding.profile, notes: s.grounding.notes.map((p) => ({ memoryId: p, title: titleOf.get(p) ?? p })), social: s.grounding.social },
      memoryId: s.note_path ?? undefined,
      simulated: s.backend === "mock",
      decisions: listDecisions(db, s.id).map((d) => ({ id: d.id, kind: d.kind, parentId: d.parentId, createdAt: sqlTime(d.createdAt)!, request: d.request, result: d.result, choice: d.choice ? { ...d.choice, at: sqlTime(d.choice.at)! } : null, outcome: d.outcome ? { ...d.outcome, at: sqlTime(d.outcome.at)! } : null })),
    })),
    chosenRoad: chosenRoadView(db),
    nightShifts: nightShifts.map((n) => ({
      id: String(n.id),
      trigger: n.trigger,
      status: n.status,
      startedAt: sqlTime(n.started_at)!,
      finishedAt: sqlTime(n.finished_at),
      brief: n.brief ?? undefined,
      focus: n.focus.map((f) => ({ taskId: `task-${f.id}`, title: f.title })),
      watchOut: n.watch_out ?? undefined,
      dailyDate: n.daily_date ?? undefined,
      approvalIds: n.approvals.map(String),
      error: n.error ?? undefined,
      simulated: false,
    })),
    research: researchRuns.map((r) => ({
      id: String(r.id),
      topic: r.topic,
      status: r.status,
      startedAt: sqlTime(r.started_at)!,
      finishedAt: sqlTime(r.finished_at),
      summary: r.summary ?? undefined,
      sources: r.sources,
      approvalId: r.approval_id ? String(r.approval_id) : undefined,
      error: r.error ?? undefined,
    })),
    dockerMcp: dockerMcp(db),
    missions: missions.map((m) => ({
      id: String(m.id),
      goal: m.goal,
      status: m.status,
      plan: m.plan.map((t) => ({ title: t.title, agent: t.agent, role: t.role ?? undefined, tools: t.tools })),
      runs: m.runs.map(toRunInfo),
      lead: m.lead ? toRunInfo(m.lead) : undefined,
      report: m.report ?? undefined,
      nextStep: m.next_step ?? undefined,
      approvalId: m.approval_id ? String(m.approval_id) : undefined,
      error: m.error ?? undefined,
      createdAt: sqlTime(m.created_at)!,
      finishedAt: sqlTime(m.finished_at),
      simulated: false,
    })),
    runs: runs.map(toRunInfo),
  };
}

function runLabel(r: RunRecord) {
  return r.role ? `${r.role} helper` : (TEAM.find((t) => t.name === r.agent)?.label ?? r.agent);
}

function toRunInfo(r: RunRecord): AgentRunInfo {
  return {
    id: String(r.id),
    kind: r.kind,
    agent: r.agent,
    agentLabel: runLabel(r),
    role: r.role ?? undefined,
    task: r.task,
    tools: r.tools,
    usedTools: r.used_tools,
    status: r.status,
    output: r.output ?? undefined,
    sources: r.citations.filter((c) => /^https?:\/\//.test(c)),
    supervision: r.supervision
      ? { verdict: r.supervision.verdict, issues: r.supervision.issues, summary: r.supervision.summary, byAgent: !!r.supervision.backend, checkedAt: r.supervision.checkedAt }
      : undefined,
    error: r.error ?? undefined,
    missionId: r.mission_id ? String(r.mission_id) : undefined,
    startedAt: sqlTime(r.started_at)!,
    finishedAt: sqlTime(r.finished_at),
    simulated: false,
  };
}

function dockerMcp(db: Db): Workspace["dockerMcp"] {
  const state = dockerMcpState();
  return {
    status: state.status,
    via: state.via,
    detail: state.detail,
    tools: state.tools.map((t) => ({ name: t.name, title: t.title, description: t.description, gate: t.gate })),
    requests: listDockerRequests(db).map((r) => ({
      id: String(r.id),
      tool: r.tool,
      title: r.title,
      arguments: r.arguments,
      status: r.status,
      createdAt: sqlTime(r.created_at)!,
      decidedAt: sqlTime(r.decided_at),
      result: r.result,
      isError: r.isError,
    })),
  };
}

function platform(db: Db): AgentPlatform {
  // The YAML is the truth for what each agent can do; TEAM only supplies labels and roles.
  const team: AgentInfo[] = agentTeam().map((a) => {
    const known = TEAM.find((t) => t.name === a.name);
    return { name: a.name, label: known?.label ?? a.name, description: a.description, role: known?.role ?? "chat", tools: a.tools, subAgents: a.subAgents };
  });
  // Only report a schedule when the scheduler is actually running (the container's entrypoint starts it).
  const at = process.env.NIGHT_SHIFT_SCHEDULER === "on" ? nightShiftSchedule() : null;
  let local = false;
  try {
    local = getProvider().name.startsWith("local:");
  } catch {
    // Provider misconfigured; the runtime block already reports it.
  }
  return {
    team,
    backend: process.env.DOCKER_AGENT_URL ? "docker-agent" : "in-process",
    agentFile: path.relative(process.cwd(), agentFilePath()),
    webSearch: searchProvider(),
    local,
    nightShiftAt: at,
    nextNightShift: at ? nextRunAt(at).toISOString() : undefined,
    packs: listPacks(),
    activePack: activePack(db)?.id ?? null,
    decisionModel: jevStatus(db),
  };
}

function sourceRef(item: IssueItem): DailyItem["source"] {
  const task = item.source.match(/^task #(\d+)/);
  if (task) return { kind: "task", id: `task-${task[1]}`, label: "Completed task" };
  const goal = item.source.match(/^goal #(\d+)/);
  if (goal) return { kind: "milestone", id: `goal-${goal[1]}`, label: "Goal" };
  return { kind: "memory", id: item.source, label: "Vault note" };
}

function toEdition(issue: DailyIssue, issueNumber: number, notePath: string | null): DailyEdition {
  const toItem = (i: IssueItem): DailyItem => ({ title: i.title, detail: i.detail, source: sourceRef(i) });
  const progress = [...issue.wins, ...issue.milestones].map(toItem);
  const open = issue.open.map(toItem);
  return {
    id: `edition-${issue.date}`,
    date: issue.date,
    issueNumber,
    lead: {
      id: `${issue.date}-lead`,
      section: "progress",
      kicker: "The Journey",
      headline: issue.headline,
      body: [issue.lead],
      sources: progress.map((p) => p.source),
    },
    progress,
    unfinished: open.length
      ? {
          id: `${issue.date}-unfinished`,
          section: "progress",
          kicker: "The Unfinished Chapter",
          headline: open.length === 1 ? `One step is still open` : `${open.length} steps are still open`,
          body: ["Unfinished isn't failure. It's the part of the story that's still being written."],
          sources: open.map((o) => o.source),
        }
      : null,
    openItems: open,
    lessons: issue.reflection
      ? {
          id: `${issue.date}-lessons`,
          section: "reflection",
          kicker: "From Your Future Self",
          headline: "A line from your future reflection",
          dek: "Imagined, not a record of events.",
          body: [issue.reflection.title],
          sources: [{ kind: "reflection", id: issue.reflection.source, label: "Future Reflection" }],
          simulated: false,
        }
      : null,
    people: null,
    trends: [],
    nextEdition: issue.editorNote || null,
    path: notePath ?? issue.notePath,
  };
}

function activity(db: Db, goals: { id: number; title: string; created_at: string }[]): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const g of goals) items.push({ id: `goal-${g.id}`, kind: "goal_created", title: `Goal created: ${g.title}`, at: sqlTime(g.created_at)!, href: `/roadmap?milestone=goal-${g.id}` });
  const done = db.prepare("SELECT id, goal_id, title, completed_at FROM tasks WHERE status = 'done' AND completed_at IS NOT NULL").all() as {
    id: number;
    goal_id: number;
    title: string;
    completed_at: string;
  }[];
  for (const t of done) items.push({ id: `task-${t.id}`, kind: "task_completed", title: t.title, at: sqlTime(t.completed_at)!, href: `/roadmap?milestone=goal-${t.goal_id}` });
  const reflections = db.prepare("SELECT id, created_at FROM reflections").all() as { id: number; created_at: string }[];
  for (const r of reflections) items.push({ id: `refl-${r.id}`, kind: "reflection_saved", title: "Future Reflection saved to your vault", at: sqlTime(r.created_at)!, href: "/reflection" });
  const decided = db.prepare("SELECT id, kind, payload, status, decided_at FROM approvals WHERE decided_at IS NOT NULL").all() as {
    id: number;
    kind: string;
    payload: string;
    status: string;
    decided_at: string;
  }[];
  for (const a of decided) {
    const payload = JSON.parse(a.payload) as { goal?: string; title?: string };
    if (a.kind === "memory" && a.status === "approved") items.push({ id: `ap-${a.id}`, kind: "memory_saved", title: `Memory saved: ${payload.title}`, at: sqlTime(a.decided_at)!, href: "/memory" });
    if (a.kind === "plan" && a.status === "rejected") items.push({ id: `ap-${a.id}`, kind: "plan_rejected", title: `Plan declined: ${payload.goal}`, at: sqlTime(a.decided_at)! });
  }
  const daily = db.prepare("SELECT date, created_at FROM daily_issues").all() as { date: string; created_at: string }[];
  for (const d of daily) items.push({ id: `daily-${d.date}`, kind: "daily_published", title: `TOMORA Daily for ${d.date} went to press`, at: sqlTime(d.created_at)!, href: "/daily" });
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
}

// ---------- Mutations ----------

const ProfileInput = z.object({
  name: z.string().trim().min(1).max(80),
  dream: z.string().trim().min(1).max(2000),
  current: z.string().max(2000).default(""),
  resources: z.string().max(1000).default(""),
  challenges: z.string().max(1000).default(""),
  values: z.array(z.string()).max(20).default([]),
  style: z.enum(["reflective", "strategic", "encouraging", "analytical"]),
  horizonYear: z.number().int().min(2000).max(2200).optional(),
});

export function saveProfileFromUi(db: Db, input: unknown) {
  const p = ProfileInput.parse(input);
  saveProfile(db, { ...p, values: p.values.join(", "), style: TO_BACKEND[p.style] });
}

export function setStyle(db: Db, style: unknown) {
  const s = z.enum(["reflective", "strategic", "encouraging", "analytical"]).parse(style);
  const p = getProfile(db);
  if (!p) throw new Error("Complete onboarding first.");
  saveProfile(db, { ...p, style: TO_BACKEND[s] });
}

const PlanInput = z.object({
  goal: z.string().trim().min(1).max(160),
  why: z.string().max(1000).optional(),
  tasks: z
    .array(z.object({ title: z.string().trim().min(1).max(200), dueInDays: z.number().int().min(0).max(365).optional() }))
    .min(1)
    .max(10),
});

export function decide(db: Db, id: number, decision: "approve" | "reject", editedPlan?: unknown) {
  if (editedPlan && decision === "approve") {
    const plan: PlanProposal = PlanInput.parse(editedPlan);
    const row = db.prepare("SELECT kind FROM approvals WHERE id = ? AND status = 'pending'").get(id) as { kind: string } | undefined;
    if (row?.kind !== "plan") throw new Error("Only a pending plan can be edited.");
    const payload: BackendPlanProposal = { goal: plan.goal, why: plan.why, tasks: plan.tasks.map((t) => ({ title: t.title, due_in_days: t.dueInDays })) };
    db.prepare("UPDATE approvals SET payload = ? WHERE id = ?").run(JSON.stringify(payload), id);
  }
  decideApproval(db, id, decision === "approve");
}

export function markTaskDone(db: Db, id: number) {
  completeTask(db, id);
}

const MemoryInput = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(20000),
  kind: z.enum(["profile", "goal", "reflection", "milestone", "experience", "task", "daily", "note"]),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  imagined: z.boolean().optional(),
});

function existingNotePath(id: string) {
  if (!id.endsWith(".md")) throw new Error("Not a vault note.");
  const full = resolveInVault(id);
  if (!fs.existsSync(full)) throw new Error("That memory no longer exists.");
  return full;
}

export function createMemory(input: unknown) {
  const draft: MemoryDraft = MemoryInput.parse(input);
  const folder = FOLDER_BY_KIND[draft.kind];
  const target = resolveInVault(path.join(folder, `${slugify(draft.title)}.md`));
  if (fs.existsSync(target)) throw new Error("A memory with this title already exists. Choose another title or edit that one.");
  writeNote({ folder, title: draft.title, body: draft.body, tags: draft.tags, evidence: draft.imagined ? "ai-inferred" : "user-stated" });
}

export function updateMemory(id: string, input: unknown) {
  const full = existingNotePath(id);
  const note = readNote(id);
  if (!VAULT_FOLDERS.includes(note.folder as VaultFolder)) throw new Error("This note is outside TOMORA's folders. Edit it in Obsidian.");
  const patch = MemoryInput.partial().parse(input);
  const current = splitBody(note.body);
  const title = patch.title ?? note.title;
  const written = writeNote({
    folder: note.folder as VaultFolder,
    title,
    body: patch.body ?? current.body,
    tags: patch.tags ?? note.tags,
    links: current.related,
    // Editing a note makes it the user's own statement, including a corrected AI summary.
    evidence: "user-stated",
  });
  if (written.path !== note.path) fs.unlinkSync(full);
}

export function deleteMemories(ids: unknown) {
  const list = z.array(z.string()).min(1).max(200).parse(ids);
  for (const id of list) fs.unlinkSync(existingNotePath(id));
}

function chosenRoadView(db: Db): Workspace["chosenRoad"] {
  const r = getChosenRoad(db);
  if (!r) return null;
  return { simulationId: String(r.simulationId), index: r.index, goal: r.goal, path: toPaths([r.path])[0], chosenAt: r.chosenAt, memoryId: r.notePath ?? undefined };
}

export async function generateReflection(db: Db) {
  await generateStory(db);
}

export async function publishEdition(db: Db) {
  await generateDaily(db);
}
