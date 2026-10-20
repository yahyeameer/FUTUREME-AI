import { skillDef } from "@/lib/skills";
import { toolLabel } from "@/lib/tool-labels";
import type { CoachingStyle, Message, SkillRun, ToolCall, TurnEvent, Workspace } from "@/types";
import type { FutureMeService } from "./types";

// Live implementation: talks to the FutureMe app server, which owns SQLite, the vault and the agent.
// The browser never sees API keys; it only calls this app's own routes.

const TONE_KEY = "futureme.live.tone";
const RUNS_KEY = "futureme.live.skillRuns";


function stored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Non-essential preference; ignore storage failures.
  }
}

const BACKEND_STYLE: Record<CoachingStyle, string> = { reflective: "gentle", encouraging: "gentle", strategic: "direct", analytical: "strategic" };

// The backend stores three styles; the UI offers four tones. Keep the user's exact choice when it maps to what's stored.
function withLocalPrefs(ws: Workspace): Workspace {
  const tone = stored<CoachingStyle | null>(TONE_KEY, null);
  if (ws.profile && tone && BACKEND_STYLE[tone] === BACKEND_STYLE[ws.profile.style]) ws.profile = { ...ws.profile, style: tone };
  return { ...ws, skillRuns: stored<SkillRun[]>(RUNS_KEY, []) };
}

async function request(body?: object): Promise<Workspace> {
  const res = await fetch("/api/workspace", {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `The FutureMe server returned ${res.status}.`);
  return withLocalPrefs(json as Workspace);
}

/** True when the FutureMe app server answers. Used to choose between live and demo mode. */
// Generous on purpose: in `next dev` the first request compiles the route, and on Windows that alone can take
// several seconds. Timing out early silently drops people into demo mode while their server is fine.
export async function probeLive(timeoutMs = 20_000): Promise<boolean> {
  try {
    const res = await fetch("/api/workspace", { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

export function createLiveService(): FutureMeService {
  async function* sendMessage(text: string, { signal, image }: { style: CoachingStyle; signal?: AbortSignal; image?: string }): AsyncIterable<TurnEvent> {
    const working: ToolCall = { name: "agent", label: "Searching your memory and thinking", status: "running" };
    yield { type: "tool", tool: working };

    let res: Response;
    try {
      res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, image }), signal });
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      yield { type: "error", error: "Couldn't reach the FutureMe server. Check your connection and try again." };
      return;
    }
    if (!res.ok || !res.body) {
      const json = await res.json().catch(() => null);
      yield { type: "error", error: json?.error ?? "Your future self couldn't answer just now." };
      return;
    }

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let first = true;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        const event = JSON.parse(line) as
          | { type: "delta"; text: string }
          | { type: "reasoning"; text: string }
          | { type: "reset" }
          | { type: "tool"; name: string; status: ToolCall["status"] }
          | { type: "error"; error: string }
          | { type: "done"; id: number; reply: string; citations: string[]; approvals: number[]; tools: string[]; backend: string; reasoning: string | null };
        if (event.type === "reasoning" || event.type === "reset") {
          yield event;
        } else if (event.type === "tool") {
          yield { type: "tool", tool: { name: event.name, label: toolLabel(event.name), status: event.status } };
        } else if (event.type === "delta") {
          if (first) {
            yield { type: "tool", tool: { ...working, label: "Thought it through", status: "done" } };
            first = false;
          }
          yield { type: "delta", text: event.text };
        } else if (event.type === "error") {
          yield { type: "error", error: event.error };
          return;
        } else {
          const workspace = await request();
          const titleOf = new Map(workspace.memories.map((m) => [m.id, m.title]));
          const counts = new Map<string, number>();
          for (const t of event.tools) counts.set(t, (counts.get(t) ?? 0) + 1);
          const message: Message = {
            id: `msg-${event.id}`,
            role: "assistant",
            content: event.reply,
            createdAt: new Date().toISOString(),
            citations: event.citations.map((p) => ({ memoryId: p, title: titleOf.get(p) ?? p })),
            approvalIds: event.approvals.map(String),
            reasoning: event.reasoning ?? undefined,
            tools: [...counts].map(([name, n]) => ({
              name,
              label: toolLabel(name),
              status: "done" as const,
              detail: name === "search_memory" ? `${event.citations.length} ${event.citations.length === 1 ? "note" : "notes"} retrieved` : n > 1 ? `${n} times` : undefined,
            })),
          };
          yield { type: "done", message, workspace };
        }
      }
    }
  }

  async function runResearch(topic: string) {
    const workspace = await request({ action: "runResearch", topic });
    const run = workspace.research.find((r) => r.topic === topic.trim());
    if (!run) throw new Error("The research run wasn't saved.");
    return { workspace, run };
  }

  return {
    mode: "live",
    load: () => request(),
    saveProfile: (profile) => request({ action: "saveProfile", profile }),
    async setStyle(style) {
      store(TONE_KEY, style);
      return request({ action: "setStyle", style });
    },
    sendMessage,
    decide: (id, decision, plan) => request({ action: "decide", id, decision, plan }),
    async updateTask(taskId, patch) {
      if (patch.status !== "done" || Object.keys(patch).length > 1) throw new Error("The live backend can only mark tasks as done for now.");
      return request({ action: "completeTask", id: taskId });
    },
    createMemory: (memory) => request({ action: "createMemory", memory }),
    async updateMemory(id, patch) {
      const { archived, retrievable, ...draft } = patch;
      if (archived !== undefined || retrievable !== undefined) throw new Error("Archiving and retrieval controls aren't supported by the live backend yet.");
      return request({ action: "updateMemory", id, patch: draft });
    },
    deleteMemories: (ids) => request({ action: "deleteMemories", ids }),
    generateReflection: () => request({ action: "generateReflection" }),
    async publishEdition() {
      const workspace = await request({ action: "publishEdition" });
      if (!workspace.editions[0]) throw new Error("The edition wasn't saved.");
      return { workspace, edition: workspace.editions[0] };
    },
    async askCouncil(question) {
      const workspace = await request({ action: "askCouncil", question });
      const session = workspace.councils.find((c) => c.question === question.trim());
      if (!session) throw new Error("The council's answer wasn't saved.");
      return { workspace, session };
    },
    saveCouncil: (id) => request({ action: "saveCouncil", id }),
    verifyMessage: (id) => request({ action: "verifyMessage", id }),
    runResearch,
    async runNightShift() {
      const workspace = await request({ action: "runNightShift" });
      const shift = workspace.nightShifts[0];
      if (!shift) throw new Error("The night shift didn't record a run.");
      return { workspace, shift };
    },
    setPack: (id) => request({ action: "setPack", id }),
    decideDockerTool: (id, decision) => request({ action: "decideDockerTool", id, decision }),
    async startMission(goal) {
      const workspace = await request({ action: "startMission", goal });
      const mission = workspace.missions.find((m) => m.goal === goal.trim());
      if (!mission) throw new Error("The mission wasn't recorded.");
      return { workspace, mission };
    },
    async runSkill(skillId, inputs, onUpdate) {
      const def = skillDef(skillId);
      if (skillId === "research") {
        const run: SkillRun = { id: `run-${Date.now()}`, skillId, status: "running", startedAt: new Date().toISOString(), summary: "Searching the web and reading sources…", output: [], approvalIds: [], simulated: false };
        onUpdate({ ...run });
        try {
          const { workspace, run: r } = await runResearch(inputs.topic ?? "");
          run.status = r.status === "awaiting_approval" ? "awaiting_approval" : r.status === "failed" ? "failed" : "completed";
          run.summary = r.status === "failed" ? (r.error ?? "Research failed.") : `Read ${r.sources.length} ${r.sources.length === 1 ? "source" : "sources"}. Review the summary before it's saved.`;
          run.output = [r.summary, ...r.sources.map((s) => `${s.point} (${s.url})`)].filter((x): x is string => !!x);
          run.approvalIds = r.approvalId ? [r.approvalId] : [];
          run.finishedAt = new Date().toISOString();
          store(RUNS_KEY, [run, ...stored<SkillRun[]>(RUNS_KEY, [])].slice(0, 30));
          onUpdate({ ...run });
          return { workspace: withLocalPrefs(workspace), run };
        } catch (err) {
          run.status = "failed";
          run.summary = err instanceof Error ? err.message : "Research failed.";
          run.finishedAt = new Date().toISOString();
          onUpdate({ ...run });
          return { workspace: await request(), run };
        }
      }
      if (!def?.livePrompt) throw new Error(def?.liveUnavailableReason ?? "This skill isn't available.");
      const run: SkillRun = { id: `run-${Date.now()}`, skillId, status: "running", startedAt: new Date().toISOString(), summary: "Asking your future self…", output: [], approvalIds: [], simulated: false };
      onUpdate({ ...run });
      let workspace: Workspace | null = null;
      for await (const ev of sendMessage(def.livePrompt(inputs), { style: "strategic" })) {
        if (ev.type === "error") {
          run.status = "failed";
          run.summary = ev.error;
        }
        if (ev.type === "done") {
          workspace = ev.workspace;
          run.approvalIds = ev.message.approvalIds ?? [];
          run.status = run.approvalIds.length ? "awaiting_approval" : "completed";
          run.summary = run.approvalIds.length ? "Proposed a plan. Review it before anything is created." : "Completed.";
          run.output = ev.message.content.split(/\n+/).filter(Boolean);
        }
      }
      run.finishedAt = new Date().toISOString();
      store(RUNS_KEY, [run, ...stored<SkillRun[]>(RUNS_KEY, [])].slice(0, 30));
      onUpdate({ ...run });
      return { workspace: workspace ? withLocalPrefs(workspace) : await request(), run };
    },
  };
}
