import type { ChatMessage, Completion, LlmProvider, ToolCall } from "./llm";

// Deterministic stand-in for the model, used in tests and when no Nebius key is configured.
// It follows the same tool-calling protocol as the real model so the agent loop is exercised end to end.

export const STORY_MARKER = "[future-story]";
export const DAILY_MARKER = "[daily-issue]";

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
    const wantsPlan = /\b(plan|goal|help me|steps|start)\b/i.test(userText);

    if (toolNames.has("search_memory") && !used("search_memory")) {
      return { content: null, toolCalls: [call("search_memory", { query: userText })] };
    }
    if (wantsPlan && toolNames.has("propose_plan") && !used("propose_plan")) {
      return { content: null, toolCalls: [call("propose_plan", planFrom(userText))] };
    }

    const memory = turn.find((m) => m.role === "tool" && text(m).startsWith("## "));
    const remembered = memory ? text(memory).split("\n")[0].replace(/^## /, "").replace(/ \(.*\)$/, "") : null;
    const parts = [
      remembered ? `I remember "${remembered}" from what you've told me.` : "Tell me more about where you are right now.",
      used("propose_plan")
        ? "I've drafted a plan with three small steps. Approve it on the Plan page and I'll track it with you."
        : "What's one thing you could do this week that your future self would thank you for?",
    ];
    return { content: parts.join(" "), toolCalls: [] };
  },
};
