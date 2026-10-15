import type { AgentInfo, Pack } from "@/types";

// What the browser knows about FutureMe's agent team, for labels and for demo mode, which can't read agents/futureme.yaml.
// tests/agents.test.ts checks this list against the YAML, so the two can't drift apart.
export const TEAM: AgentInfo[] = [
  {
    name: "root",
    label: "Future self",
    role: "chat",
    description: "FutureMe, the user's future self ten years from now.",
    tools: ["search_memory", "propose_memory", "propose_plan"],
    subAgents: [],
  },
  {
    name: "council",
    label: "Council lead",
    role: "council",
    description:
      "Chairs a council of future selves and merges their views into one decision brief.",
    tools: [],
    subAgents: [
      "voice_horizon",
      "voice_next_year",
      "voice_skeptic",
      "voice_mentor",
    ],
  },
  {
    name: "voice_horizon",
    label: "You at your horizon",
    role: "voice",
    description: "The user at their horizon year, having reached the dream.",
    tools: ["search_memory"],
    subAgents: [],
  },
  {
    name: "voice_next_year",
    label: "You, one year from now",
    role: "voice",
    description:
      "The user one year from now, focused on what is realistic this year.",
    tools: ["search_memory"],
    subAgents: [],
  },
  {
    name: "voice_skeptic",
    label: "The skeptic",
    role: "voice",
    description: "A friendly skeptic who looks for the risk in the plan.",
    tools: ["search_memory"],
    subAgents: [],
  },
  {
    name: "voice_mentor",
    label: "The mentor",
    role: "voice",
    description: "An older mentor who has seen many people try this.",
    tools: ["search_memory"],
    subAgents: [],
  },
  {
    name: "council_chair",
    label: "Council chair",
    role: "council",
    description:
      "Merges the council's answers into a decision brief. Used by the app, which calls each voice itself.",
    tools: [],
    subAgents: [],
  },
  {
    name: "verifier",
    label: "Fact checker",
    role: "check",
    description:
      "Checks a future-self reply against the user's notes before they rely on it.",
    tools: ["search_memory"],
    subAgents: [],
  },
  {
    name: "researcher",
    label: "Researcher",
    role: "research",
    description:
      "Researches a topic on the web and summarises it with real links.",
    tools: ["web_search", "fetch_url"],
    subAgents: [],
  },
  {
    name: "night_shift",
    label: "Night shift",
    role: "schedule",
    description:
      "Runs overnight. Reviews the day and prepares a short morning brief with tomorrow's focus.",
    tools: ["search_memory", "propose_plan"],
    subAgents: [],
  },
  {
    name: "twin",
    label: "Voice twin",
    role: "twin",
    description:
      "The user's AI twin. Drafts calls and emails to their saved contacts; never sends or agrees on its own.",
    tools: ["search_memory", "propose_call", "propose_email", "propose_commitment"],
    subAgents: [],
  },
  {
    name: "twin_voice",
    label: "Future self on a call",
    role: "twin",
    description: "The future self on a live voice call. Short spoken replies; can mark a promised task done when the user says it is.",
    tools: ["search_memory", "confirm_task_done"],
    subAgents: [],
  },
];

export const teamLabel = (name: string) =>
  TEAM.find((a) => a.name === name)?.label ?? name;

// The persona packs in agents/packs/, for demo mode. tests/agents.test.ts checks this copy too.
export const PACKS: Pack[] = [
  {
    id: "creator",
    name: "The Creator",
    tagline: "Your future self who makes a living from their craft.",
    persona:
      "You are the user's future self, ten years from now, making a living from your craft and an audience that trusts you. You think in reps, shipping in public and finding your people. You help them make the next piece instead of polishing the last one.",
    file: "agents/packs/creator.yaml",
  },
  {
    id: "founder",
    name: "The Founder",
    tagline: "Your future self as someone who built a company from nothing.",
    persona:
      "You are the user's future self, ten years from now, as a founder who built a company from nothing. You think in customers, cash and speed. You've shipped too late before and you push for talking to users this week, not next month. You're candid about trade-offs and you celebrate scrappy progress.",
    file: "agents/packs/founder.yaml",
  },
  {
    id: "researcher",
    name: "The Researcher",
    tagline: "Your future self who leads a research lab.",
    persona:
      "You are the user's future self, ten years from now, leading a research lab. You think in questions, evidence and publishing early. You've learned that rigour beats speed only after something exists, so you push for small experiments and writing things down.",
    file: "agents/packs/researcher.yaml",
  },
  {
    id: "student",
    name: "The Graduate",
    tagline: "Your future self who studied their way into the field.",
    persona:
      "You are the user's future self, ten years from now, who studied their way into the field they dreamed of. You think in learning plans, mentors and deliberate practice. You know what it's like to juggle classes, money and family, and you help them pick the one skill that compounds.",
    file: "agents/packs/student.yaml",
  },
];
