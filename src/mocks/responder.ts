import { activeMilestone, liveMemories, nextStep, progressOf, tasksFor } from "@/lib/derive";
import type { Citation, CoachingStyle, Memory, MemoryProposal, PlanProposal, RichBlock, ToolCall } from "@/types";
import type { DemoState } from "./seed";

// Scripted, deterministic replies for demo mode. The same message in the same state always gets the same answer.
// Retrieval is a real keyword search over the demo memories, so citations always point at notes that exist.

export interface ScriptedTurn {
  tools: ToolCall[];
  text: string;
  citations: Citation[];
  plan?: PlanProposal;
  memory?: MemoryProposal;
  blocks?: RichBlock[];
}

const OPENERS: Record<CoachingStyle, string> = {
  reflective: "",
  strategic: "Straight to it. ",
  encouraging: "",
  analytical: "Looking at what's recorded: ",
};

export function searchMemories(state: DemoState, query: string, limit = 3): Memory[] {
  const terms = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 3 && !STOP.has(t));
  if (!terms.length) return [];
  return liveMemories(state.memories)
    .filter((m) => m.retrievable)
    .map((m) => {
      const title = m.title.toLowerCase();
      const body = m.body.toLowerCase();
      const tags = m.tags.join(" ");
      let score = 0;
      for (const t of terms) {
        const stem = t.replace(/(ing|ed|s)$/, "");
        if (title.includes(stem)) score += 3;
        if (tags.includes(stem)) score += 2;
        if (body.includes(stem)) score += 1;
      }
      return { m, score };
    })
    .filter((x) => x.score > 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.m);
}

const STOP = new Set(["what", "that", "this", "with", "have", "about", "from", "your", "should", "could", "would", "there", "their", "when", "where", "which", "help", "want", "need", "like", "just", "really", "make", "into", "them", "they"]);

export function respond(state: DemoState, text: string, style: CoachingStyle): ScriptedTurn {
  const lower = text.toLowerCase();
  const hits = searchMemories(state, text);
  const citations = hits.map((m) => ({ memoryId: m.id, title: m.title }));
  const search: ToolCall = {
    name: "search_memory",
    label: "Searched your memory",
    status: "done",
    detail: hits.length ? `${hits.length} relevant ${hits.length === 1 ? "note" : "notes"}` : "Nothing directly relevant",
  };
  const opener = OPENERS[style];
  const active = activeMilestone(state);
  const next = nextStep(state);
  const remembered = hits[0] ? `You wrote about “${hits[0].title}”. ` : "";

  if (/\b(plan|break (it )?down|steps|tasks|roadmap|how do i|how can i|start)\b/.test(lower)) {
    const plan = planFor(text, state);
    return {
      tools: [search, { name: "propose_plan", label: "Drafted a plan", status: "done", detail: `${plan.tasks.length} tasks · waiting for your approval` }],
      citations,
      plan,
      text:
        style === "strategic" || style === "analytical"
          ? `${opener}${remembered}Here's a ${plan.tasks.length}-step plan sequenced by dependency: the first step unblocks the rest. Review it below; nothing is created until you approve.`
          : `${remembered}I've drafted ${plan.tasks.length} small steps for “${plan.goal}”. Each one fits in an evening. Have a look below and change anything that doesn't fit; nothing is created until you approve.\n\nWhich of these feels hardest to start?`,
    };
  }

  if (/\b(remember|save this|note that|keep in mind)\b/.test(lower)) {
    const body = text.replace(/^(please\s+)?(remember|note|save this|keep in mind)( that)?[:,]?\s*/i, "").trim() || text;
    const memory: MemoryProposal = { title: titleFrom(body), body, kind: "note", tags: ["from-conversation"] };
    return {
      tools: [search, { name: "propose_memory", label: "Proposed a memory", status: "done", detail: "Waiting for your approval" }],
      citations,
      memory,
      text: `I'd like to keep that. It's below as a proposed memory, worded the way you said it. Approve it and I'll use it in future conversations; reject it and I won't keep it.`,
    };
  }

  if (/\b(progress|review|week|how am i doing|on track)\b/.test(lower)) {
    const scope = active ? tasksFor(state.tasks, active.id) : state.tasks;
    const p = progressOf(scope);
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const recent = state.tasks.filter((t) => t.completedAt && t.completedAt >= weekAgo).length;
    const blocked = scope.filter((t) => t.status === "blocked");
    return {
      tools: [search, { name: "review_progress", label: "Reviewed your progress", status: "done", detail: `${p.done} of ${p.total} tasks` }],
      citations,
      blocks: active
        ? [{ type: "progress", title: active.title, completed: p.done, total: p.total, lines: scope.map((t) => ({ label: t.title, status: t.status })) }]
        : undefined,
      text: active
        ? `${opener}${recent === 0 ? "No tasks were completed in the last seven days." : `You completed ${recent === 1 ? "one task" : `${recent} tasks`} in the last seven days.`} “${active.title}” is at ${p.done} of ${p.total}.${blocked.length ? ` ${blocked[0].title} is blocked${blocked[0].blockedReason ? `: ${blocked[0].blockedReason.toLowerCase()}` : ""}` : ""}\n\n${next ? `The most useful next move is “${next.title}”.` : "Everything open is blocked; unblocking is the work now."}`
        : "There's no active milestone yet. Want to plan one together?",
    };
  }

  if (/\b(stuck|afraid|scared|procrastinat|putting off|avoid|why do i|overwhelm|tired|doubt)\b/.test(lower)) {
    return {
      tools: [search],
      citations,
      text:
        style === "encouraging"
          ? `${remembered}It makes sense that this feels heavy. You've done hard first steps before, and they were the ones that moved everything else.\n\nWhat's the smallest version of this you could do this week?`
          : style === "strategic"
            ? `${opener}${remembered}Avoidance usually means the next step is too big or too vague. Cut it until it fits one evening.\n\nWhat's the one-evening version?`
            : style === "analytical"
              ? `${opener}${remembered}When a step keeps slipping, either its definition of done is unclear or it depends on something unresolved.\n\nWhich is it here?`
              : `${remembered}When you put something off, it's often protecting you from something: being seen before you're ready, or finding out it doesn't work yet.\n\nWhat do you think it's protecting you from this time?`,
    };
  }

  // Default: answer from what's recorded and ask one reflective question.
  const anchor = next ? `Right now the most concrete thing on your roadmap is “${next.title}”.` : active ? `You're working on “${active.title}”.` : "You haven't set a goal yet.";
  return {
    tools: [search],
    citations,
    text:
      style === "encouraging"
        ? `${remembered}${anchor} You're further along than it might feel. What would make this week feel like a win?`
        : style === "strategic"
          ? `${opener}${remembered}${anchor} What's the decision you're avoiding?`
          : style === "analytical"
            ? `${opener}${remembered}${anchor} What would you need to know to move faster?`
            : `${remembered}${anchor} When you imagine the person you want to be in ten years, what would they want you to protect this week?`,
  };
}

function planFor(text: string, state: DemoState): PlanProposal {
  const lower = text.toLowerCase();
  if (/research|paper|write-?up|publish/.test(lower)) {
    return {
      goal: "Publish a first research write-up",
      why: "Amina's advice: a clear question and honest data are enough for a first paper.",
      tasks: [
        { title: "List three questions the Beero pilot could answer", dueInDays: 2 },
        { title: "Pick one and write it as a single sentence", dueInDays: 3 },
        { title: "Outline the write-up in five headings", dueInDays: 6 },
        { title: "Send the outline to Amina for feedback", dueInDays: 7 },
      ],
    };
  }
  if (/engineer|portfolio|skill|learn|ai engineering/.test(lower)) {
    return {
      goal: "Build an AI engineering roadmap",
      why: "Skills the lab will need that the day job doesn't teach.",
      tasks: [
        { title: "Write down the three skills the lab needs most", dueInDays: 1 },
        { title: "Choose one course or paper for each skill", dueInDays: 3 },
        { title: "Schedule two evenings a week for practice", dueInDays: 4 },
        { title: "Ship one small project using the first skill", dueInDays: 21 },
      ],
    };
  }
  const cleaned = text
    .replace(/^(can you |could you |please )?(help me )?(to )?(plan|break down|make a plan for|start)( out)?( my| the| a)?\s*/i, "")
    .replace(/[?.!]+$/, "")
    .trim();
  const goal = cleaned.length > 6 ? capitalise(cleaned).slice(0, 90) : (activeMilestone(state)?.title ?? "My next milestone");
  return {
    goal,
    why: "A first pass in small steps. Change anything that doesn't fit.",
    tasks: [
      { title: `Write one paragraph on what “done” looks like`, dueInDays: 1 },
      { title: "List what's needed and what's missing", dueInDays: 2 },
      { title: "Do the smallest piece in one evening", dueInDays: 4 },
      { title: "Share progress with one person", dueInDays: 7 },
    ],
  };
}

function titleFrom(body: string) {
  const first = body.split(/[.!?\n]/)[0].trim();
  return capitalise(first.length > 64 ? `${first.slice(0, 61)}…` : first);
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
