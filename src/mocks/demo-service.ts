import type { FutureMeService } from "@/lib/services/types";
import { skillDef, skillsFor } from "@/lib/skills";
import { activeMilestone, liveMemories, nextStep } from "@/lib/derive";
import { checkClaims, standInBrief, VOICES } from "@/lib/mock-llm";
import { SIMULATION_FRAMING, formatCost, formatSpan, normalizeSituation, rankPaths, standInSimulation, toPaths } from "@/lib/simulator-paths";
import { ruleChecks, verdictOf } from "@/lib/supervisor-rules";
import { PACKS, TEAM } from "@/lib/team-info";
import type {
  AgentRunInfo,
  Mission,
  ActivityItem,
  Approval,
  CouncilSession,
  NightShift,
  DailyEdition,
  Memory,
  MemoryDraft,
  MemoryProposal,
  Message,
  PlanProposal,
  Profile,
  Reflection,
  Simulation,
  SkillRun,
  Task,
  TurnEvent,
  Workspace,
} from "@/types";
import { buildEdition } from "./daily";
import { respond } from "./responder";
import { emptyState, seedState, type DemoMission, type DemoState } from "./seed";

// Demo implementation of the service layer: deterministic, persisted in this browser's localStorage, never calls a model.

const STORAGE_KEY = "futureme.demo.v1";

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

function readState(): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      if (parsed.version === 1) return parsed;
    }
  } catch {
    // Storage unavailable or corrupt: fall through to a fresh seed held in memory.
  }
  return seedState(Date.now());
}

export function resetDemo(kind: "seed" | "empty" = "seed") {
  const state = kind === "seed" ? seedState(Date.now()) : emptyState(Date.now());
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore: the demo still works for this session.
  }
}

export function createDemoService(): FutureMeService {
  let state = readState();

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Private mode or quota: keep working in memory.
    }
  };
  const id = (prefix: string) => `${prefix}-${++state.seq}`;
  const now = () => new Date().toISOString();
  const log = (kind: ActivityItem["kind"], title: string, href?: string) => {
    state.activity.unshift({ id: id("a"), kind, title, at: now(), href });
  };

  const editions = (): DailyEdition[] =>
    state.editionDates
      .map((date, i) => buildEdition(state, date, i + 1))
      .reverse();

  const snapshot = (): Workspace => ({
    runtime: {
      mode: "demo",
      agent: "Scripted demo responses",
      model: "None. Demo mode never calls a model.",
      simulated: true,
      storage: "This browser's local storage",
      inference: "None. Nothing leaves this browser in demo mode.",
    },
    capabilities: {
      taskStatuses: ["todo", "in_progress", "blocked", "done"],
      editTasks: true,
      archiveMemories: true,
      memoryRetrievalControl: true,
      editPlansBeforeApproval: true,
      streaming: true,
      council: true,
      verify: true,
      research: false,
      nightShift: true,
      packs: false,
      delegation: false,
      missions: true,
    },
    profile: state.profile,
    milestones: state.milestones,
    tasks: state.tasks,
    approvals: state.approvals,
    memories: state.memories,
    reflection: state.reflection,
    conversation: state.conversation,
    editions: editions(),
    activity: state.activity,
    skills: skillsFor("demo"),
    skillRuns: state.skillRuns,
    platform: {
      team: TEAM,
      backend: "demo",
      agentFile: "agents/futureme.yaml",
      webSearch: "unavailable",
      local: false,
      nightShiftAt: null,
      packs: PACKS,
      activePack: null,
    },
    councils: state.councils ?? [],
    simulations: state.simulations ?? [],
    chosenRoad: state.chosenRoad ?? null,
    nightShifts: state.nightShifts ?? [],
    research: [],
    missions: (state.missions ?? []).map((m) => replay(m, Date.now())),
    runs: (state.missions ?? []).flatMap((m) => replay(m, Date.now()).runs).reverse(),
  });

  const commit = () => {
    settleMissions();
    save();
    return structuredClone(snapshot());
  };

  function addMemory(draft: MemoryDraft, source: string, provenance: Memory["provenance"] = "user-stated"): Memory {
    const memory: Memory = {
      id: id("mem"),
      title: draft.title.trim(),
      kind: draft.kind,
      body: draft.body.trim(),
      tags: draft.tags,
      provenance,
      source,
      createdAt: now(),
      updatedAt: now(),
      archived: false,
      retrievable: true,
      relatedMemoryIds: [],
      relatedMilestoneIds: [],
      path: `${folderFor(draft.kind)}/${slug(draft.title)}.md`,
    };
    state.memories.unshift(memory);
    return memory;
  }

  function createPlan(plan: PlanProposal): string {
    const msId = id("ms");
    const order = Math.max(-1, ...state.milestones.map((m) => m.order)) + 1;
    state.milestones.push({ id: msId, title: plan.goal, why: plan.why, createdAt: now(), order, memoryIds: [] });
    for (const t of plan.tasks) {
      const due = t.dueInDays === undefined ? undefined : addDays(t.dueInDays);
      state.tasks.push({ id: id("t"), milestoneId: msId, title: t.title, status: "todo", dueDate: due, createdAt: now() });
    }
    const note = addMemory(
      { title: plan.goal, kind: "goal", tags: ["goal"], body: [plan.why && `## Why this matters\n\n${plan.why}`, `## Tasks\n\n${plan.tasks.map((t) => `- [ ] [[${t.title}]]`).join("\n")}`].filter(Boolean).join("\n\n") },
      "Approved plan",
    );
    note.relatedMilestoneIds = [msId];
    state.milestones.find((m) => m.id === msId)!.memoryIds.push(note.id);
    return msId;
  }

  // A demo mission is scripted up front and played back over a few seconds, so the page shows it working.
  // Its plan proposal is only added once the playback reaches the end.
  function settleMissions() {
    for (const m of state.missions ?? []) {
      if (m.approvalId || !m.proposal || replay(m, Date.now()).status !== "done") continue;
      m.approvalId = propose({ plan: m.proposal }).id;
    }
  }

  function propose(proposal: { plan: PlanProposal } | { memory: MemoryProposal }): Approval {
    const base = { id: id("ap"), status: "pending" as const, createdAt: now() };
    const approval: Approval = "plan" in proposal ? { ...base, kind: "plan", plan: proposal.plan } : { ...base, kind: "memory", memory: proposal.memory };
    state.approvals.push(approval);
    return approval;
  }

  return {
    mode: "demo",

    async load() {
      state = readState();
      save();
      await wait(120);
      return structuredClone(snapshot());
    },

    async saveProfile(profile: Profile) {
      const first = !state.profile;
      state.profile = profile;
      const upsert = (title: string, body: string, tags: string[]) => {
        const existing = state.memories.find((m) => m.kind === "profile" && m.title === title);
        if (existing) Object.assign(existing, { body, updatedAt: now() });
        else addMemory({ title, body, kind: "profile", tags }, first ? "Onboarding" : "Settings");
      };
      upsert("10-Year Dream", profile.dream, ["dream", "goal"]);
      if (profile.values.length) upsert("Values", profile.values.join(", "), ["values"]);
      upsert(
        "Profile",
        [profile.current && `## Where I am now\n\n${profile.current}`, profile.resources && `## What I have to work with\n\n${profile.resources}`, profile.challenges && `## What stands in the way\n\n${profile.challenges}`]
          .filter(Boolean)
          .join("\n\n") || profile.name,
        ["profile"],
      );
      await wait(300);
      return commit();
    },

    async setStyle(style) {
      if (state.profile) state.profile.style = style;
      return commit();
    },

    async *sendMessage(text, { style, signal }): AsyncIterable<TurnEvent> {
      const userMsg: Message = { id: id("msg"), role: "user", content: text, createdAt: now(), citations: [] };
      state.conversation.push(userMsg);
      save();
      const turn = respond(state, text, style);

      for (const tool of turn.tools) {
        yield { type: "tool", tool: { ...tool, status: "running" } };
        await wait(tool.name === "search_memory" ? 650 : 500, signal);
        yield { type: "tool", tool };
      }

      const approvalIds: string[] = [];
      if (turn.plan) approvalIds.push(propose({ plan: turn.plan }).id);
      if (turn.memory) approvalIds.push(propose({ memory: turn.memory }).id);

      // Stream word by word so the interface behaves like a real streaming model.
      const words = turn.text.split(/(\s+)/);
      for (let i = 0; i < words.length; i += 3) {
        await wait(28, signal);
        yield { type: "delta", text: words.slice(i, i + 3).join("") };
      }

      const message: Message = {
        id: id("msg"),
        role: "assistant",
        content: turn.text,
        createdAt: now(),
        citations: turn.citations,
        tools: turn.tools,
        approvalIds,
        blocks: turn.blocks,
        tone: style,
        simulated: true,
      };
      state.conversation.push(message);
      yield { type: "done", message, workspace: commit() };
    },

    async decide(approvalId, decision, editedPlan) {
      const approval = state.approvals.find((a) => a.id === approvalId);
      if (!approval || approval.status !== "pending") throw new Error("This proposal was already decided.");
      await wait(decision === "approve" ? 900 : 250);
      approval.status = decision === "approve" ? "approved" : "rejected";
      approval.decidedAt = now();
      if (decision === "approve") {
        if (approval.kind === "plan") {
          if (editedPlan) approval.plan = editedPlan;
          const msId = createPlan(approval.plan);
          log("plan_approved", `Plan approved: ${approval.plan.goal}`, `/roadmap?milestone=${msId}`);
        } else {
          const mem = addMemory(approval.memory, "Approved from a conversation");
          log("memory_saved", `Memory saved: ${mem.title}`, `/memory/${mem.id}`);
        }
      } else if (approval.kind === "plan") {
        log("plan_rejected", `Plan declined: ${approval.plan.goal}`);
      }
      return commit();
    },

    async updateTask(taskId, patch) {
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) throw new Error("That task no longer exists.");
      await wait(200);
      const wasDone = task.status === "done";
      if (patch.title !== undefined) task.title = patch.title.trim() || task.title;
      if (patch.notes !== undefined) task.notes = patch.notes.trim() || undefined;
      if (patch.dueDate !== undefined) task.dueDate = patch.dueDate ?? undefined;
      if (patch.status) {
        task.status = patch.status;
        task.blockedReason = patch.status === "blocked" ? (patch.blockedReason ?? task.blockedReason) : undefined;
        task.completedAt = patch.status === "done" ? (task.completedAt ?? now()) : undefined;
      }
      if (!wasDone && task.status === "done") log("task_completed", task.title, `/roadmap?milestone=${task.milestoneId}`);
      return commit();
    },

    async createMemory(draft) {
      await wait(250);
      const { imagined, ...rest } = draft;
      const mem = imagined ? addMemory(rest, "Saved from your Future Reflection", "ai-inferred") : addMemory(rest, "Added by you");
      log("memory_saved", `Memory saved: ${mem.title}`, `/memory/${mem.id}`);
      return commit();
    },

    async updateMemory(memId, patch) {
      const mem = state.memories.find((m) => m.id === memId);
      if (!mem) throw new Error("That memory no longer exists.");
      await wait(200);
      const { archived, retrievable, ...draft } = patch;
      Object.assign(mem, draft);
      if (archived !== undefined) mem.archived = archived;
      if (retrievable !== undefined) mem.retrievable = retrievable;
      // Editing an AI summary makes it yours.
      if (draft.body !== undefined || draft.title !== undefined) {
        mem.updatedAt = now();
        if (mem.provenance === "ai-inferred") {
          mem.provenance = "user-stated";
          mem.source = `${mem.source}, corrected by you`;
        }
      }
      return commit();
    },

    async deleteMemories(ids) {
      await wait(250);
      const gone = new Set(ids);
      state.memories = state.memories.filter((m) => !gone.has(m.id));
      for (const m of state.memories) m.relatedMemoryIds = m.relatedMemoryIds.filter((r) => !gone.has(r));
      for (const ms of state.milestones) ms.memoryIds = ms.memoryIds.filter((r) => !gone.has(r));
      // Conversations stop citing deleted memories too.
      for (const msg of state.conversation) msg.citations = msg.citations.filter((c) => !gone.has(c.memoryId));
      return commit();
    },

    async generateReflection() {
      if (!state.profile) throw new Error("Complete onboarding first.");
      await wait(1400);
      state.reflection = demoReflection(state.profile, state.reflection);
      const existing = state.memories.find((m) => m.kind === "reflection" && m.provenance === "ai-inferred" && m.title.startsWith("Future Reflection"));
      if (!existing) {
        const mem = addMemory({ title: `Future Reflection: ${state.reflection.title}`, kind: "reflection", tags: ["reflection", "future-self"], body: `An imagined letter from ${state.profile.horizonYear}.` }, "Generated reflection", "ai-inferred");
        mem.relatedMemoryIds = state.memories.filter((m) => m.title === "10-Year Dream").map((m) => m.id);
      }
      log("reflection_saved", "Future Reflection saved to your vault", "/reflection");
      return commit();
    },

    async publishEdition() {
      if (!state.profile) throw new Error("Complete onboarding first.");
      await wait(1100);
      const today = new Date().toISOString().slice(0, 10);
      if (!state.editionDates.includes(today)) state.editionDates.push(today);
      log("daily_published", "Today's FutureMe Daily went to press", "/daily");
      const workspace = commit();
      return { workspace, edition: workspace.editions[0] };
    },

    async askCouncil(question) {
      if (!state.profile) throw new Error("Complete onboarding first.");
      const q = question.trim();
      if (q.length < 3) throw new Error("Ask the council a question.");
      await wait(1600);
      const hits = searchDemo(state, q);
      const voices = TEAM.filter((a) => a.role === "voice").map((a, i) => ({
        name: a.name,
        label: a.label,
        reply: (VOICES[a.name] ?? VOICES.voice_mentor)(hits[i % Math.max(hits.length, 1)]?.title ?? null, q.slice(0, 120)),
      }));
      const b = standInBrief(voices.length);
      const session: CouncilSession = {
        id: id("council"),
        question: q,
        createdAt: now(),
        voices,
        brief: { summary: b.summary, agreements: b.agreements, tensions: b.tensions, nextStep: b.next_step },
        citations: hits.map((m) => ({ memoryId: m.id, title: m.title })),
        simulated: true,
      };
      (state.councils ??= []).unshift(session);
      return { workspace: commit(), session };
    },

    async simulatePaths(goal, rawSituation) {
      if (!state.profile) throw new Error("Complete onboarding first.");
      const g = goal.trim();
      if (g.length < 5) throw new Error("Describe the goal in a few words.");
      await wait(1800);
      const hits = searchDemo(state, `${g} ${state.profile.dream}`);
      const p = state.profile;
      const situation = normalizeSituation(rawSituation);
      const raw = standInSimulation({ goal: g, name: p.name, current: p.current, resources: p.resources, challenges: p.challenges, notes: hits.map((m) => m.title), situation });
      const simulation: Simulation = {
        id: id("sim"),
        goal: raw.goal,
        createdAt: now(),
        paths: toPaths(raw.paths),
        situation,
        sharedUnknowns: raw.shared_unknowns,
        howToChoose: raw.how_to_choose,
        grounding: { profile: true, notes: hits.map((m) => ({ memoryId: m.id, title: m.title })), social: [] },
        simulated: true,
      };
      (state.simulations ??= []).unshift(simulation);
      return { workspace: commit(), simulation };
    },

    async saveSimulation(simulationId) {
      const s = state.simulations?.find((x) => x.id === simulationId);
      if (!s) throw new Error("That simulation no longer exists.");
      if (!s.memoryId) {
        const body = [
          `**Goal:** ${s.goal}`,
          `> ${SIMULATION_FRAMING}`,
          ...rankPaths(s.paths, s.situation).map(({ index }) => s.paths[index]).map((x) => `## ${x.name}\n\n${x.summary}\n\n- **Time:** ${formatSpan(x.months)}\n- **Cost:** ${formatCost(x.cost)}\n\n**Holds only if**\n\n${x.assumptions.map((a) => `- ${a}`).join("\n")}`),
        ].join("\n\n");
        const mem = addMemory({ title: `Simulation: ${s.goal.slice(0, 80)}`, kind: "reflection", tags: ["simulation", "imagined"], body }, "Saved from the Future Simulator", "ai-inferred");
        s.memoryId = mem.id;
        log("memory_saved", `Memory saved: ${mem.title}`, `/memory/${mem.id}`);
      }
      return commit();
    },

    async chooseRoad(simulationId, index) {
      const s = state.simulations?.find((x) => x.id === simulationId);
      const path = s?.paths[index];
      if (!s || !path) throw new Error("That road isn't in this simulation.");
      const body = `I chose this road in the Future Simulator for **${s.goal}**: **${path.name}**.\n\n> ${SIMULATION_FRAMING}\n\n${path.summary}\n\n## Holds only if\n\n${path.assumptions.map((a) => `- ${a}`).join("\n")}`;
      const existing = state.memories.find((m) => m.tags.includes("chosen-road"));
      if (existing) Object.assign(existing, { body, updatedAt: now() });
      const mem = existing ?? addMemory({ title: "Chosen road", kind: "goal", tags: ["chosen-road", "simulation"], body }, "Chosen in the Future Simulator");
      state.chosenRoad = { simulationId, index, goal: s.goal, path, chosenAt: now(), memoryId: mem.id };
      log("goal_created", `Chose a road: ${path.name}`, "/simulator");
      return commit();
    },

    async clearRoad() {
      state.chosenRoad = null;
      return commit();
    },

    async saveCouncil(sessionId) {
      const c = state.councils?.find((x) => x.id === sessionId);
      if (!c) throw new Error("That council session no longer exists.");
      if (!c.memoryId) {
        const mem = addMemory(
          { title: `Council: ${c.question.slice(0, 80)}`, kind: "reflection", tags: ["council"], body: [`**Question:** ${c.question}`, c.brief.summary, c.brief.nextStep && `## Next step\n\n${c.brief.nextStep}`].filter(Boolean).join("\n\n") },
          "Saved from a council session",
          "ai-inferred",
        );
        c.memoryId = mem.id;
        log("memory_saved", `Memory saved: ${mem.title}`, `/memory/${mem.id}`);
      }
      return commit();
    },

    async verifyMessage(messageId) {
      const msg = state.conversation.find((m) => m.id === messageId && m.role === "assistant");
      if (!msg) throw new Error("That reply no longer exists.");
      await wait(500);
      const notes = msg.citations.flatMap((c) => {
        const m = state.memories.find((x) => x.id === c.memoryId);
        return m ? [{ path: m.id, title: m.title }] : [];
      });
      const claims = checkClaims(msg.content, notes);
      const factual = claims.filter((c) => c.status !== "opinion");
      msg.verification = {
        verdict: !factual.length ? "no_claims" : factual.every((c) => c.status === "supported") ? "grounded" : "check",
        claims,
        checkedAt: now(),
        simulated: true,
      };
      return commit();
    },

    async runResearch() {
      throw new Error("Web research needs the FutureMe server. Demo mode never goes online.");
    },

    async runNightShift() {
      if (!state.profile) throw new Error("Complete onboarding first.");
      await wait(1200);
      const today = new Date().toISOString().slice(0, 10);
      if (!state.editionDates.includes(today)) state.editionDates.push(today);
      const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
      const done = state.tasks.filter((t) => t.completedAt && t.completedAt >= dayAgo);
      const picks = rankForToday(state);
      const blocked = state.tasks.filter((t) => t.status === "blocked");
      const shift: NightShift = {
        id: id("night"),
        trigger: "manual",
        status: "completed",
        startedAt: now(),
        finishedAt: now(),
        brief: picks.length
          ? `Good morning, ${state.profile.name}. ${done.length ? `You finished ${done.length} ${done.length === 1 ? "task" : "tasks"} yesterday. ` : ""}Today, start with “${picks[0].title}”.`
          : `Good morning, ${state.profile.name}. Nothing is open on your roadmap, so today is a good day to plan the next step.`,
        focus: picks.map((t) => ({ taskId: t.id, title: t.title })),
        watchOut: blocked[0] ? `“${blocked[0].title}” is still blocked${blocked[0].blockedReason ? `: ${blocked[0].blockedReason}` : "."}` : undefined,
        dailyDate: today,
        approvalIds: [],
        simulated: true,
      };
      (state.nightShifts ??= []).unshift(shift);
      log("daily_published", "The night shift published today's FutureMe Daily", "/daily");
      return { workspace: commit(), shift };
    },

    async setPack() {
      throw new Error("Persona packs need the FutureMe server.");
    },

    async startMission(goal) {
      if (!state.profile) throw new Error("Complete onboarding first.");
      const g = goal.trim();
      if (g.length < 5) throw new Error("Describe the mission in a few words.");
      if ((state.missions ?? []).some((m) => replay(m, Date.now()).status !== "done")) throw new Error("A mission is already running. Wait for it to finish.");
      const mission = scriptMission(state, g, id("mission"), now());
      (state.missions ??= []).unshift(mission);
      const workspace = commit();
      return { workspace, mission: workspace.missions[0] };
    },

    async runSkill(skillId, inputs, onUpdate) {
      const def = skillDef(skillId);
      if (!def) throw new Error("Unknown skill.");
      const run: SkillRun = { id: id("run"), skillId, status: "running", startedAt: now(), summary: "Running…", output: [], approvalIds: [], simulated: true };
      onUpdate({ ...run });
      await wait(900);

      const open = state.tasks.filter((t) => t.status !== "done");
      switch (skillId) {
        case "plan-day": {
          const picks = rankForToday(state, inputs.focus);
          run.status = "completed";
          run.summary = picks.length ? `${picks.length} ${picks.length === 1 ? "task" : "tasks"} for today` : "Nothing open to plan.";
          run.output = picks.map((t, i) => `${["First", "Then", "If there's time"][i]}: ${t.title}`);
          break;
        }
        case "weekly-review": {
          const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
          const done = state.tasks.filter((t) => t.completedAt && t.completedAt >= weekAgo);
          const blocked = open.filter((t) => t.status === "blocked");
          const doing = open.filter((t) => t.status === "in_progress");
          run.status = "completed";
          run.summary = `${done.length} completed in the last 7 days · ${blocked.length} blocked · ${doing.length} in progress`;
          run.output = [
            ...done.map((t) => `Completed: ${t.title}`),
            ...blocked.map((t) => `Blocked: ${t.title}${t.blockedReason ? ` (${t.blockedReason})` : ""}`),
            ...doing.map((t) => `In progress: ${t.title}`),
          ];
          if (!run.output.length) run.output = ["No task activity in the last seven days."];
          break;
        }
        case "break-down":
        case "action-plan": {
          const target = inputs.goal || inputs.objective || "";
          const turn = respond(state, `plan ${target}`, state.profile?.style ?? "reflective");
          if (turn.plan) {
            const ms = state.milestones.find((m) => m.title === target);
            const plan = ms ? { ...turn.plan, goal: ms.title, why: ms.why ?? turn.plan.why } : turn.plan;
            const ap = propose({ plan });
            run.approvalIds = [ap.id];
            run.status = "awaiting_approval";
            run.summary = `Proposed ${plan.tasks.length} tasks for “${plan.goal}”. Review before anything is created.`;
            run.output = plan.tasks.map((t) => t.title);
          }
          break;
        }
        case "research": {
          run.status = "completed";
          run.summary = `Illustrative result for “${inputs.topic}”. Demo mode has no web search, so there are no real sources.`;
          run.output = [
            "Connect a research tool to see real sources with names, links and dates here.",
            "Nothing from this example was saved to your memory.",
          ];
          break;
        }
        default:
          run.status = "failed";
          run.summary = "This skill isn't available.";
      }
      run.finishedAt = now();
      state.skillRuns.unshift(run);
      log("skill_run", `${def.name} ${run.status === "awaiting_approval" ? "is waiting for your approval" : "completed"}`, "/skills");
      onUpdate({ ...run });
      return { workspace: commit(), run };
    },
  };
}

const PLAN_MS = 1400;
const TASK_MS = 1100;
const REPORT_MS = 900;

/** Builds the whole demo mission at once from the demo's notes. No model is involved. */
function scriptMission(state: DemoState, goal: string, missionId: string, at: string): DemoMission {
  const hits = searchDemo(state, goal);
  const quoted = hits.map((m) => `“${m.title}”`);
  const steps = ["Write one paragraph on what done looks like", "Ask one person who has done it for 20 minutes of advice", "Block two focused hours this week for the first piece"];
  const tasks = [
    {
      title: "What your notes already say",
      role: "Context finder",
      output: quoted.length ? `Your notes that matter here: ${quoted.join(", ")}. They point to the same thing: progress you can show someone.` : "Your notes don't mention this yet, so start by writing down why it matters to you.",
    },
    { title: "Risks to test first", role: "Skeptic", output: "The biggest risk is spending weeks before anyone sees the work. Test the riskiest assumption with one real person first, and decide in advance what would change your mind." },
    { title: "First steps", role: "Planner", output: `Three first steps that fit the time you have:\n${steps.map((x, i) => `${i + 1}. ${x}`).join("\n")}` },
  ];
  const runs: AgentRunInfo[] = tasks.map((t, i) => {
    const issues = ruleChecks({ agent: "helper_memory", role: t.role, task: `${t.title} for: ${goal}`, allowedTools: ["search_memory"], usedTools: ["search_memory"], citations: [], output: t.output, exactEvents: true }, null);
    return {
      id: `${missionId}-run-${i + 1}`,
      kind: "mission_task",
      agent: "helper_memory",
      agentLabel: `${t.role} helper`,
      role: t.role,
      task: `${t.title} for: ${goal}`,
      tools: ["search_memory"],
      usedTools: ["search_memory"],
      status: verdictOf(issues) === "block" ? "blocked" : "done",
      output: t.output,
      sources: [],
      supervision: { verdict: verdictOf(issues), issues, summary: issues[0]?.text ?? "Passed the supervisor's rule checks.", byAgent: false, checkedAt: at },
      missionId,
      startedAt: at,
      simulated: true,
    };
  });
  return {
    id: missionId,
    goal,
    status: "done",
    plan: tasks.map((t) => ({ title: t.title, agent: "helper", role: t.role, tools: ["search_memory"] })),
    runs,
    report: [`3 of 3 tasks came back for “${goal}”.`, ...tasks.map((t) => `${t.title}: ${t.output.split("\n")[0]}`)].join("\n\n"),
    nextStep: steps[0],
    createdAt: at,
    simulated: true,
    proposal: { goal: goal.slice(0, 160), why: "From the mission team's findings (demo).", tasks: steps.map((title, i) => ({ title, dueInDays: 2 + i * 3 })) },
  };
}

/** How a scripted mission looks `now`: planning, then each task finishing in turn, then the report. */
function replay(m: DemoMission, now: number): Mission {
  const { proposal: _proposal, ...mission } = m;
  void _proposal;
  const elapsed = now - new Date(m.createdAt).getTime();
  const at = (ms: number) => new Date(new Date(m.createdAt).getTime() + ms).toISOString();
  if (elapsed < PLAN_MS) return { ...mission, status: "planning", plan: [], runs: [], report: undefined, nextStep: undefined, approvalId: undefined };
  const runs = m.runs.map((r, i) => {
    const end = PLAN_MS + (i + 1) * TASK_MS;
    return elapsed < end
      ? { ...r, status: "running" as const, output: undefined, supervision: undefined, startedAt: at(PLAN_MS) }
      : { ...r, startedAt: at(PLAN_MS), finishedAt: at(end) };
  });
  const tasksDone = PLAN_MS + m.runs.length * TASK_MS;
  if (elapsed < tasksDone) return { ...mission, status: "running", runs, report: undefined, nextStep: undefined, approvalId: undefined };
  if (elapsed < tasksDone + REPORT_MS) return { ...mission, status: "reporting", runs, report: undefined, nextStep: undefined, approvalId: undefined };
  return { ...mission, runs, finishedAt: at(tasksDone + REPORT_MS) };
}

/** Keyword search over the demo's memories, standing in for the agent's search_memory tool. */
function searchDemo(state: DemoState, query: string) {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 3);
  return liveMemories(state.memories)
    .filter((m) => m.retrievable)
    .map((m) => ({ m, score: terms.reduce((n, t) => n + (m.title.toLowerCase().includes(t) ? 3 : 0) + (m.body.toLowerCase().includes(t) ? 1 : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.m);
}

function rankForToday(state: DemoState, focus?: string): Task[] {
  const first = nextStep(state);
  const active = activeMilestone(state);
  const pool = state.tasks.filter((t) => t.status === "todo" || t.status === "in_progress");
  const focusLower = focus?.toLowerCase().trim();
  const scored = pool
    .filter((t) => t.id !== first?.id)
    .map((t) => ({
      t,
      score: (t.milestoneId === active?.id ? 2 : 0) + (focusLower && t.title.toLowerCase().includes(focusLower) ? 3 : 0) + (t.dueDate ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score || (a.t.dueDate ?? "9999").localeCompare(b.t.dueDate ?? "9999"));
  return [first, ...scored.map((s) => s.t)].filter((t): t is Task => !!t).slice(0, 3);
}

function demoReflection(profile: Profile, previous: Reflection | null): Reflection {
  return {
    id: `refl-${Date.now()}`,
    createdAt: new Date().toISOString(),
    aspiration: profile.dream,
    horizonYear: profile.horizonYear,
    title: previous?.title === "The long way round" ? "The work that compounds" : "The long way round",
    narrative: [
      `It's ${profile.horizonYear}, ${profile.name}. You asked what it looked like from here, so here is one version.`,
      `${profile.dream} It didn't happen in a straight line.`,
      profile.challenges
        ? `You were right that the obstacles were real: ${profile.challenges.charAt(0).toLowerCase()}${profile.challenges.slice(1).replace(/\.$/, "")}. None of them disappeared. You built around them.`
        : "The obstacles were real. None of them disappeared. You built around them.",
      profile.resources
        ? `What carried you was what you already had: ${profile.resources.charAt(0).toLowerCase()}${profile.resources.slice(1).replace(/\.$/, "")}.`
        : "What carried you was what you already had, used on purpose.",
    ],
    moments: [
      { title: "The first small public step", body: "You shared something unfinished, and it was the thing people responded to." },
      { title: "A decision to say no", body: "You turned down a good opportunity because it didn't build toward this." },
      { title: "Someone asks you for help", body: "The first time someone treats you as the person you were becoming." },
    ],
    shifts: [
      { area: "Habits", from: "Working when there's time", to: "Protected time, a few evenings a week" },
      { area: "Priorities", from: "Everything at once", to: "One milestone at a time" },
    ],
    challenges: profile.challenges
      ? profile.challenges
          .split(/[,;.]\s*(?:and\s+)?/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 3)
          .map((c) => ({ title: c.charAt(0).toUpperCase() + c.slice(1), body: "You named this during onboarding.", provenance: "user-stated" as const }))
      : [],
    path: "Reflections/future-reflection.md",
  };
}

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function folderFor(kind: Memory["kind"]) {
  return { profile: "Profile", goal: "Goals", reflection: "Reflections", milestone: "Goals", experience: "Experiences", task: "Tasks", daily: "Daily", note: "Notes" }[kind];
}

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "untitled"
  );
}

