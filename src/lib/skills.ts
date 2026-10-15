import type { ServiceMode, Skill } from "@/types";

// Reusable agent skills. In live mode a skill is a structured request to the future-self agent,
// so it runs through the same tools and approval gate as a conversation.

interface SkillDef extends Omit<Skill, "available" | "unavailableReason"> {
  /** Prompt sent to the agent in live mode. `null` means the live backend has no tool for it yet. */
  livePrompt: ((inputs: Record<string, string>) => string) | null;
  liveUnavailableReason?: string;
}

export const SKILL_DEFS: SkillDef[] = [
  {
    id: "plan-day",
    name: "Plan My Day",
    description: "Picks up to three tasks for today from your active milestone, in-progress work first.",
    inputs: [{ name: "focus", label: "Anything to prioritise?", placeholder: "Optional, e.g. the prototype", kind: "text" }],
    permissions: ["Read tasks and milestones"],
    livePrompt: (i) => `Plan my day: pick at most three of my open tasks for today and explain the order in two sentences.${i.focus ? ` Prioritise: ${i.focus}.` : ""}`,
  },
  {
    id: "break-down",
    name: "Break Down My Goal",
    description: "Turns a milestone or goal into small, concrete tasks. Nothing is saved until you approve the plan.",
    inputs: [{ name: "goal", label: "Goal", placeholder: "e.g. Publish a first research write-up", kind: "milestone", required: true }],
    permissions: ["Read memory", "Propose a plan (needs approval)"],
    livePrompt: (i) => `Help me break this goal into a plan with small concrete steps: ${i.goal}`,
  },
  {
    id: "research",
    name: "Research and Summarize",
    description: "The researcher agent searches the web, reads the best sources and summarises them with their links.",
    inputs: [{ name: "topic", label: "Topic", placeholder: "e.g. SMS advisory services for farmers", kind: "text", required: true }],
    permissions: ["Web search", "Read web pages", "Save a summary to memory (needs approval)"],
    // Runs through the researcher agent (POST runResearch), not the future self.
    livePrompt: null,
    liveUnavailableReason: "Web search is turned off on this server (WEB_SEARCH=off).",
  },
  {
    id: "weekly-review",
    name: "Weekly Review",
    description: "Summarises the last seven days from completed, blocked and in-progress tasks.",
    inputs: [],
    permissions: ["Read tasks and milestones"],
    livePrompt: () => "Give me a short weekly review of my progress from my goals and tasks: what I finished, what's blocked, and one thing to focus on next.",
  },
  {
    id: "action-plan",
    name: "Prepare an Action Plan",
    description: "Drafts a step-by-step plan for something new you want to do. You review it before anything is created.",
    inputs: [{ name: "objective", label: "What do you want to do?", placeholder: "e.g. Apply for the regional AI fellowship", kind: "text", required: true }],
    permissions: ["Read memory", "Propose a plan (needs approval)"],
    livePrompt: (i) => `Help me plan the steps to: ${i.objective}`,
  },
];

export function skillsFor(mode: ServiceMode, opts: { research?: boolean } = {}): Skill[] {
  return SKILL_DEFS.map(({ livePrompt, liveUnavailableReason, ...s }) => {
    const available = mode === "demo" || livePrompt !== null || (s.id === "research" && !!opts.research);
    return { ...s, available, unavailableReason: available ? undefined : liveUnavailableReason };
  });
}

export function skillDef(id: string) {
  return SKILL_DEFS.find((s) => s.id === id);
}
