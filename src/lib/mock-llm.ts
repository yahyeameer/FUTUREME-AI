import type { ChatMessage, Completion, LlmProvider, ToolCall } from "./llm";

// Deterministic stand-in for the model, used in tests and when no Nebius key is configured.
// It follows the same tool-calling protocol as the real model so the agent loop is exercised end to end.

export const STORY_MARKER = "[future-story]";
export const DAILY_MARKER = "[daily-issue]";
// Markers the app puts at the start of a request to a specific agent, so the stand-in knows which role to play.
export const COUNCIL_MARKER = (voice: string) => `[council:${voice}]`;
export const CHAIR_MARKER = "[council-chair]";
export const VERIFY_MARKER = "[verify]";
export const RESEARCH_MARKER = "[research]";
export const NIGHT_MARKER = "[night-shift]";
export const SUBTASK_MARKER = "[subtask]";
export const SUPERVISE_MARKER = "[supervise]";
export const MISSION_PLAN_MARKER = "[mission-plan]";
export const MISSION_REPORT_MARKER = "[mission-report]";

let callCounter = 0;
const call = (name: string, args: unknown): ToolCall => ({
  id: `mock_${++callCounter}`,
  name,
  arguments: JSON.stringify(args),
});

function text(m: ChatMessage | undefined): string {
  if (!m || typeof m.content !== "string") return "";
  return m.content;
}

function story(profileJson: string): string {
  let p: Record<string, string> = {};
  try {
    p = JSON.parse(profileJson);
  } catch {
    // fall through with defaults
  }
  const name = p.name || "friend";
  return [
    `It's ten years from now, ${name}, and I'm writing to you from the life you were reaching for.`,
    `${p.dream ? `${p.dream}. ` : ""}It didn't happen all at once. It happened because you kept showing up.`,
    p.challenges ? `I remember when ${p.challenges.toLowerCase()} felt like a wall. It turned out to be the first step.` : "",
    p.values ? `What carried us was what you already believed in: ${p.values}.` : "",
    p.resources ? `You started with what you had, ${p.resources.toLowerCase()}, and it was enough to begin.` : "",
    "Start small this week. I'll be here when you want to talk.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function dailyEditorial(factsJson: string) {
  const f = JSON.parse(factsJson) as { name: string; wins: { title: string }[]; open: { title: string }[] };
  if (!f.wins.length) {
    return {
      headline: `${f.name}'s story begins`,
      lead: `${f.name} has a plan and ${f.open.length} step${f.open.length === 1 ? "" : "s"} waiting. The first one is the hardest and the most important.`,
      editor_note: f.open[0] ? `Start with "${f.open[0].title}" today.` : "Ask me to help you plan your first step.",
    };
  }
  return {
    headline: `${f.name} completes ${f.wins.length} step${f.wins.length > 1 ? "s" : ""} toward the dream`,
    lead: `This week ${f.name} finished "${f.wins[0].title}"${f.wins.length > 1 ? ` and ${f.wins.length - 1} more` : ""}. Small, real steps are how the future gets built.`,
    editor_note: f.open[0] ? `Next up: "${f.open[0].title}". I remember how much this one mattered.` : "Everything on your list is done. Time to plan the next chapter.",
  };
}

function planFrom(goalText: string) {
  const title = goalText.replace(/^(help me|i want to|i'd like to)?\s*(plan|start|make a plan for)?\s*/i, "").replace(/[.?!]+$/, "").slice(0, 80) || "My next goal";
  const goal = title.charAt(0).toUpperCase() + title.slice(1);
  return {
    goal,
    why: "It moves you toward the future you described.",
    tasks: [
      { title: `Write down what "${goal}" looks like when it's done`, due_in_days: 1 },
      { title: "Block two focused hours this week for it", due_in_days: 3 },
      { title: "Share the goal with one person who will check in", due_in_days: 7 },
    ],
  };
}

export const VOICES: Record<string, (remembered: string | null, q: string) => string> = {
  voice_horizon: (r, q) =>
    `From where I stand, the answer to "${q}" was yes, but smaller and sooner than you think.${r ? ` Remember "${r}"? That was the seed.` : ""} The version of you who reached the dream didn't wait to feel ready.`,
  voice_next_year: (r, q) =>
    `Looking back from one year out: "${q}" only worked when it fit into the hours you really have.${r ? ` You told me "${r}", so plan around that.` : ""} Pick the one piece you can finish in a month.`,
  voice_skeptic: (r) =>
    `The risk I see is spending months before anyone tests it.${r ? ` You've noted "${r}", which tells me you know this pattern.` : ""} Test the riskiest assumption first, cheaply, with one real person this week.`,
  voice_mentor: (r) =>
    `I've watched many people try this. The ones who made it shared their work early and asked for help sooner than felt comfortable.${r ? ` "${r}" suggests you're already close.` : ""} What would you need to see to know it's working?`,
};

function mockCouncil(voice: string, userText: string, turn: ChatMessage[], toolNames: Set<string>, used: (n: string) => boolean): Completion {
  const question = userText.replace(/^\[council:[a-z_]+\]\s*/, "").trim();
  if (toolNames.has("search_memory") && !used("search_memory")) return { content: null, toolCalls: [call("search_memory", { query: question })] };
  const memory = turn.find((m) => m.role === "tool" && text(m).startsWith("## "));
  const remembered = memory ? text(memory).split("\n")[0].replace(/^## /, "").replace(/ \(.*\)$/, "") : null;
  const voiceFn = VOICES[voice] ?? VOICES.voice_mentor;
  return { content: voiceFn(remembered, question.slice(0, 120)), toolCalls: [] };
}

export function standInBrief(voices: number) {
  return {
    summary: `${voices} future selves weighed in. They agree the first step should be small and tested with a real person.`,
    agreements: ["Start smaller than feels comfortable", "Test it with a real person early"],
    tensions: ["How bold to be this year versus what fits the time you have"],
    next_step: "Write down the riskiest assumption and test it with one person this week.",
  };
}

function mockChair(userText: string): Completion {
  const sections = [...userText.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  return { content: JSON.stringify(standInBrief(sections.length)), toolCalls: [] };
}

/** Rule-based claim check used by the stand-in model and by demo mode: a quoted note title counts as support. */
export function checkClaims(reply: string, notes: { path: string; title: string }[]) {
  const sentences = reply.match(/[^.!?]+[.!?]+/g)?.map((x) => x.trim()) ?? [];
  return sentences.map((sentence) => {
    const quoted = [...sentence.matchAll(/["“]([^"”]+)["”]/g)].map((m) => m[1].toLowerCase());
    const note = notes.find((n) => quoted.some((q) => n.title.toLowerCase().includes(q) || q.includes(n.title.toLowerCase())));
    if (note) return { text: sentence, status: "supported" as const, source: note.path };
    if (/\?$|\b(could|should|try|let's|maybe|what|would|start|pick|review|approve|drafted)\b/i.test(sentence)) return { text: sentence, status: "opinion" as const, source: null };
    return { text: sentence, status: "unverified" as const, source: null };
  });
}

function mockVerify(userText: string): Completion {
  let payload: { reply: string; notes: { path: string; title: string }[] } = { reply: "", notes: [] };
  try {
    payload = JSON.parse(userText.slice(VERIFY_MARKER.length).trim());
  } catch {
    // fall through with an empty payload
  }
  const claims = checkClaims(payload.reply, payload.notes);
  return { content: JSON.stringify({ claims }), toolCalls: [] };
}

function mockResearch(userText: string, turn: ChatMessage[], toolNames: Set<string>, used: (n: string) => boolean): Completion {
  const topic = userText.replace(/^\[research\]\s*(Topic:)?\s*/i, "").trim();
  if (toolNames.has("web_search") && !used("web_search")) return { content: null, toolCalls: [call("web_search", { query: topic, limit: 5 })] };
  const out = turn.filter((m) => m.role === "tool").map(text).join("\n");
  const results = [...out.matchAll(/^\d+\. (.+)\n\s+(https?:\/\/\S+)\n\s+(.*)$/gm)].map((m) => ({ title: m[1], url: m[2], snippet: m[3] }));
  if (!results.length) {
    const error = out.match(/^Error: (.+)$/m)?.[1];
    return { content: JSON.stringify({ summary: error ? `I couldn't search the web: ${error}` : `I found no sources on ${topic}.`, findings: [] }), toolCalls: [] };
  }
  return {
    content: JSON.stringify({
      summary: `I found ${results.length} sources on ${topic}. The most relevant are listed below with what each says, taken from the search results.`,
      findings: results.slice(0, 3).map((r) => ({ point: r.snippet || r.title, url: r.url })),
    }),
    toolCalls: [],
  };
}

function mockNightShift(userText: string, toolNames: Set<string>, used: (n: string) => boolean): Completion {
  let f: { name: string; open: { id: number; title: string; due: string | null }[]; done: { title: string }[]; idleGoals: string[] } = { name: "you", open: [], done: [], idleGoals: [] };
  try {
    f = JSON.parse(userText.slice(NIGHT_MARKER.length).trim());
  } catch {
    // fall through with no facts
  }
  if (f.idleGoals.length && toolNames.has("propose_plan") && !used("propose_plan")) {
    const goal = f.idleGoals[0];
    return {
      content: null,
      toolCalls: [
        call("propose_plan", {
          goal: `Next step for ${goal}`.slice(0, 160),
          why: `Every task in "${goal}" is done. This keeps the momentum going.`,
          tasks: [
            { title: `Write down what the next milestone after "${goal}" looks like`, due_in_days: 2 },
            { title: "Share the result with one person and ask what they'd change", due_in_days: 5 },
          ],
        }),
      ],
    };
  }
  const byDue = [...f.open].sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const focus = byDue.slice(0, 3).map((t) => t.id);
  const brief = f.open.length
    ? `Good morning, ${f.name}. ${f.done.length ? `You finished ${f.done.length} ${f.done.length === 1 ? "task" : "tasks"} yesterday. ` : ""}Today, start with "${byDue[0].title}".`
    : `Good morning, ${f.name}. There's nothing open on your roadmap, so today is a good day to plan the next step.`;
  return { content: JSON.stringify({ brief, focus, watch_out: f.open.length > 3 ? `You have ${f.open.length} open tasks; finish before starting new ones.` : null }), toolCalls: [] };
}

const firstNote = (turn: ChatMessage[]) => {
  const memory = turn.find((m) => m.role === "tool" && text(m).startsWith("## "));
  return memory ? text(memory).split("\n")[0].replace(/^## /, "").replace(/ \(.*\)$/, "") : null;
};

/** A helper created for one task: reads memory (and the web, if it has it), then answers in its role. */
function mockSubtask(userText: string, turn: ChatMessage[], toolNames: Set<string>, used: (n: string) => boolean): Completion {
  const role = userText.match(/^\[subtask\] Role: (.+)$/m)?.[1]?.trim() ?? "Helper";
  const task = userText.match(/^Task: ([\s\S]+)$/m)?.[1]?.trim() ?? "";
  if (toolNames.has("search_memory") && !used("search_memory")) return { content: null, toolCalls: [call("search_memory", { query: task })] };
  const note = firstNote(turn);
  const grounded = note ? ` Your note "${note}" is the starting point.` : "";
  if (/risk|skeptic|devil/i.test(role) || (!/plan/i.test(role) && /\brisks?\b/i.test(task))) {
    return { content: `As your ${role.toLowerCase()}: the biggest risk is spending weeks before anyone sees the work.${grounded} Test the riskiest assumption with one real person first, and decide in advance what result would change your mind.`, toolCalls: [] };
  }
  if (/plan|steps/i.test(role + task)) {
    return {
      content: `As your ${role.toLowerCase()}, here are three first steps that fit the time you have.${grounded}\n1. Write one paragraph on what done looks like\n2. Ask one person who has done it for 20 minutes of advice\n3. Block two focused hours this week for the first piece`,
      toolCalls: [],
    };
  }
  return { content: `As your ${role.toLowerCase()}: ${task.replace(/\.$/, "")}. The pattern in what you've shared is that small, visible progress keeps you going.${grounded}`, toolCalls: [] };
}

/** The supervisor: agrees with the rules, and otherwise checks the result answers its task. */
function mockSupervise(userText: string): Completion {
  let r: { role?: string | null; agent?: string; task?: string; output?: string; tools_used?: string[]; rule_findings?: string[] } = {};
  try {
    r = JSON.parse(userText.slice(SUPERVISE_MARKER.length).trim());
  } catch {
    // review an empty run
  }
  const who = r.role ?? r.agent ?? "agent";
  const findings = r.rule_findings ?? [];
  const verdict = findings.some((f) => f.startsWith("block")) ? "block" : findings.length ? "flag" : (r.output ?? "").length < 20 ? "flag" : "ok";
  const issues = verdict === "flag" && !findings.length ? ["The answer is too short to act on."] : [];
  const tools = [...new Set(r.tools_used ?? [])];
  return {
    content: JSON.stringify({ verdict, issues, summary: `The ${who} stayed on its task${tools.length ? ` and used ${tools.join(", ")}` : " without tools"}.${findings.length ? " The rule checks found problems." : ""}` }),
    toolCalls: [],
  };
}

function mockMissionPlan(userText: string): Completion {
  let m: { goal?: string; web_search?: boolean } = {};
  try {
    m = JSON.parse(userText.slice(MISSION_PLAN_MARKER.length).trim());
  } catch {
    // plan for an empty goal
  }
  const goal = m.goal ?? "the goal";
  const tasks = [
    { title: "What your notes already say", agent: "helper", role: "Context finder", tools: ["search_memory"], task: `Find what the user's notes say that matters for: ${goal}` },
    m.web_search
      ? { title: "What others have learned", agent: "researcher", task: goal }
      : { title: "Risks to test first", agent: "helper", role: "Skeptic", tools: ["search_memory"], task: `List the biggest risks for: ${goal}, and how to test each cheaply` },
    { title: "First steps", agent: "helper", role: "Planner", tools: ["search_memory"], task: `Draft three concrete first steps for: ${goal}` },
  ];
  return { content: JSON.stringify({ tasks }), toolCalls: [] };
}

function mockMissionReport(userText: string): Completion {
  let m: { goal?: string; results?: { title: string; by: string; status: string; output: string | null }[] } = {};
  try {
    m = JSON.parse(userText.slice(MISSION_REPORT_MARKER.length).trim());
  } catch {
    // report on nothing
  }
  const done = (m.results ?? []).filter((r) => r.output);
  const skipped = (m.results ?? []).length - done.length;
  const allSteps = done.flatMap((r) => [...(r.output ?? "").matchAll(/^\d+\. (.+)$/gm)].map((x) => x[1].trim()));
  const steps = [...new Set(allSteps)].slice(0, 4);
  const report = [
    `${done.length} of ${(m.results ?? []).length} tasks came back for "${m.goal}".`,
    ...done.map((r) => `${r.title}: ${(r.output ?? "").split("\n")[0]}`),
    skipped ? `${skipped} result${skipped === 1 ? " was" : "s were"} left out because the supervisor didn't accept ${skipped === 1 ? "it" : "them"}.` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    content: JSON.stringify({
      report,
      next_step: steps[0] ?? "Pick the smallest piece and do it this week.",
      plan: steps.length ? { goal: (m.goal ?? "Mission").slice(0, 160), why: "From the mission team's findings.", tasks: steps.map((title, i) => ({ title, due_in_days: 2 + i * 3 })) } : undefined,
    }),
    toolCalls: [],
  };
}

export const mockProvider: LlmProvider = {
  name: "mock",
  async complete(messages, tools): Promise<Completion> {
    const lastUserIdx = messages.map((m) => m.role).lastIndexOf("user");
    const userText = text(messages[lastUserIdx]);

    if (userText.startsWith(DAILY_MARKER)) {
      return { content: JSON.stringify(dailyEditorial(userText.slice(DAILY_MARKER.length).trim())), toolCalls: [] };
    }
    if (userText.startsWith(STORY_MARKER)) {
      return { content: story(userText.slice(STORY_MARKER.length).trim()), toolCalls: [] };
    }

    const toolNames = new Set((tools ?? []).map((t) => t.function.name));
    const turn = messages.slice(lastUserIdx + 1);
    const usedTools = turn.flatMap((m) => (m.role === "assistant" && m.tool_calls ? m.tool_calls : []));
    const used = (name: string) => usedTools.some((c) => c.type === "function" && c.function.name === name);

    const voice = userText.match(/^\[council:([a-z_]+)\]/)?.[1];
    if (voice) return mockCouncil(voice, userText, turn, toolNames, used);
    if (userText.startsWith(CHAIR_MARKER)) return mockChair(userText);
    if (userText.startsWith(VERIFY_MARKER)) return mockVerify(userText);
    if (userText.startsWith(RESEARCH_MARKER)) return mockResearch(userText, turn, toolNames, used);
    if (userText.startsWith(NIGHT_MARKER)) return mockNightShift(userText, toolNames, used);
    if (userText.startsWith(SUBTASK_MARKER)) return mockSubtask(userText, turn, toolNames, used);
    if (userText.startsWith(SUPERVISE_MARKER)) return mockSupervise(userText);
    if (userText.startsWith(MISSION_PLAN_MARKER)) return mockMissionPlan(userText);
    if (userText.startsWith(MISSION_REPORT_MARKER)) return mockMissionReport(userText);
    // Handoffs: research goes to the researcher, comparisons to a helper the future self creates.
    const wantsResearch = /\b(look up|find out|research (?:on|about|into)|do some research)\b/i.test(userText);
    const wantsHelper = /\b(compare|pros and cons|trade-?offs?|weigh up)\b/i.test(userText);
    const wantsPlan = /\b(plan|goal|help me|steps|start)\b/i.test(userText);

    if (toolNames.has("search_memory") && !used("search_memory")) {
      return { content: null, toolCalls: [call("search_memory", { query: userText })] };
    }
    if (wantsResearch && toolNames.has("delegate_task") && !used("delegate_task")) {
      return { content: null, toolCalls: [call("delegate_task", { agent: "researcher", task: userText.slice(0, 300) })] };
    }
    if (wantsHelper && toolNames.has("spawn_agent") && !used("spawn_agent")) {
      return { content: null, toolCalls: [call("spawn_agent", { role: "Analyst", task: `Weigh the options in: ${userText.slice(0, 300)}`, tools: ["search_memory"] })] };
    }
    const handoff = turn.find((m) => m.role === "tool" && /^(Result from|The supervisor blocked|.+ couldn't finish)/.test(text(m)));
    if (handoff) {
      const out = text(handoff);
      const who = out.match(/^Result from (.+?)(?: \(|:)/)?.[1] ?? "a helper";
      const content = out.startsWith("Result from")
        ? `I handed that to ${who}. Here's what came back: ${out.split("\n").slice(1).join(" ").slice(0, 280).trim()}${out.includes("supervisor flagged") ? " The supervisor flagged part of it, so check before you rely on it." : ""}`
        : "I tried to hand that off, but it didn't come back with something I can rely on, so I won't guess.";
      return { content, toolCalls: [] };
    }
    if (wantsPlan && toolNames.has("propose_plan") && !used("propose_plan")) {
      return { content: null, toolCalls: [call("propose_plan", planFrom(userText))] };
    }

    const memory = turn.find((m) => m.role === "tool" && text(m).startsWith("## "));
    const remembered = memory ? text(memory).split("\n")[0].replace(/^## /, "").replace(/ \(.*\)$/, "") : null;
    const parts = [
      remembered ? `I remember "${remembered}" from what you've told me.` : "Tell me more about where you are right now.",
      used("propose_plan")
        ? "I've drafted a plan with three small steps. Review it below; nothing is created until you approve it."
        : "What's one thing you could do this week that your future self would thank you for?",
    ];
    return { content: parts.join(" "), toolCalls: [] };
  },
};
