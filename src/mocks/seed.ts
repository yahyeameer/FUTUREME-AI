import type { ActivityItem, Approval, ChosenRoad, CouncilSession, Simulation, Memory, Message, Milestone, Mission, NightShift, PlanProposal, Profile, Reflection, SkillRun, Task } from "@/types";

// Deterministic demo data: one fictional person, Hodan, a developer in Hargeisa.
// Dates are offsets from the moment the demo was first opened (the anchor), so the story always reads as recent.

export interface DemoState {
  version: 1;
  anchor: number;
  seq: number;
  profile: Profile | null;
  milestones: Milestone[];
  tasks: Task[];
  approvals: Approval[];
  memories: Memory[];
  reflection: Reflection | null;
  conversation: Message[];
  editionDates: string[];
  activity: ActivityItem[];
  skillRuns: SkillRun[];
  /** Added after the first release, so older saved demos may not have them. */
  councils?: CouncilSession[];
  simulations?: Simulation[];
  chosenRoad?: ChosenRoad | null;
  nightShifts?: NightShift[];
  missions?: DemoMission[];
}

export function seedState(anchor: number): DemoState {
  const at = (days: number, hour = 10, minute = 0) => {
    const d = new Date(anchor);
    d.setDate(d.getDate() + days);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };
  const day = (days: number) => at(days).slice(0, 10);
  const horizonYear = new Date(anchor).getFullYear() + 10;

  const profile: Profile = {
    name: "Hodan",
    dream:
      "I run an AI research lab in Hargeisa that trains young Somali engineers and builds tools for farmers and small businesses across the Horn of Africa.",
    horizonYear,
    current: "Full-stack developer at a local fintech. I build side projects with AI agents in the evenings.",
    resources: "Strong TypeScript, a laptop, two focused hours most evenings, a mentor in Nairobi, and a supportive family.",
    challenges: "Unreliable access to GPUs and cloud credits, little free time, and no research publications yet.",
    values: ["family", "craft", "courage", "community"],
    style: "reflective",
  };

  const milestones: Milestone[] = [
    {
      id: "ms-portfolio",
      title: "Build a public portfolio of AI projects",
      why: "Proof of craft I can point to when I ask for compute, partners and students.",
      targetDate: day(-20),
      createdAt: at(-62),
      order: 0,
      memoryIds: ["mem-meetup"],
    },
    {
      id: "ms-beero",
      title: "Ship Beero, an SMS crop-advice assistant for farmers",
      why: "The first tool the lab would be known for, built with the farmers who need it.",
      targetDate: day(34),
      createdAt: at(-15),
      order: 1,
      memoryIds: ["mem-gabiley", "mem-compute", "mem-goal-beero"],
    },
    {
      id: "ms-paper",
      title: "Publish a first research write-up",
      why: "A lab needs a body of work. One honest write-up from the Beero pilot is the start.",
      targetDate: day(95),
      createdAt: at(-9),
      order: 2,
      memoryIds: ["mem-amina-call", "mem-perfect"],
    },
    {
      id: "ms-cohort",
      title: "Mentor a first cohort of five engineers",
      why: "Training people is the reason for the lab, not a side effect of it.",
      targetDate: day(210),
      createdAt: at(-9),
      order: 3,
      memoryIds: ["mem-dream"],
    },
  ];

  const tasks: Task[] = [
    { id: "t-deploy", milestoneId: "ms-portfolio", title: "Deploy two agent projects publicly", status: "done", completedAt: at(-41, 21), createdAt: at(-62) },
    { id: "t-case", milestoneId: "ms-portfolio", title: "Write a case study for each project", status: "done", completedAt: at(-30, 20), createdAt: at(-62) },
    { id: "t-meetup", milestoneId: "ms-portfolio", title: "Present at the Hargeisa developer meetup", status: "done", completedAt: at(-21, 19), createdAt: at(-62) },

    { id: "t-interviews", milestoneId: "ms-beero", title: "Interview five farmers in Gabiley about planting decisions", status: "done", completedAt: at(-12, 17), createdAt: at(-15) },
    { id: "t-problem", milestoneId: "ms-beero", title: "Write the problem statement and share it with my mentor", status: "done", completedAt: at(-8, 21), createdAt: at(-15) },
    {
      id: "t-prototype",
      milestoneId: "ms-beero",
      title: "Build a Somali-language SMS prototype for planting-date questions",
      notes: "Good enough = it answers planting-date questions by SMS. Nothing more for the first test.",
      status: "in_progress",
      dueDate: day(4),
      createdAt: at(-15),
    },
    {
      id: "t-credits",
      milestoneId: "ms-beero",
      title: "Secure 20 hours of GPU credits",
      status: "blocked",
      blockedReason: "Waiting for a reply from the cloud credits programme.",
      dueDate: day(6),
      createdAt: at(-15),
    },
    { id: "t-test", milestoneId: "ms-beero", title: "Test the prototype with two farmers", status: "todo", dueDate: day(10), dependsOn: ["t-prototype"], createdAt: at(-15) },
    { id: "t-repo", milestoneId: "ms-beero", title: "Publish the repository with a clear README", status: "todo", dueDate: day(18), createdAt: at(-15) },

    { id: "t-question", milestoneId: "ms-paper", title: "Choose one narrow question from the Beero pilot", status: "todo", createdAt: at(-9) },
    { id: "t-outline", milestoneId: "ms-paper", title: "Draft an outline and ask Amina for feedback", status: "todo", dependsOn: ["t-question"], createdAt: at(-9) },
    { id: "t-draft", milestoneId: "ms-paper", title: "Write the first 1,500 words", status: "todo", dependsOn: ["t-outline"], createdAt: at(-9) },

    { id: "t-curriculum", milestoneId: "ms-cohort", title: "Draft a six-week curriculum", status: "todo", createdAt: at(-9) },
    { id: "t-room", milestoneId: "ms-cohort", title: "Ask the innovation hub for a free evening room", status: "todo", createdAt: at(-9) },
  ];

  const m = (x: Omit<Memory, "archived" | "retrievable" | "relatedMilestoneIds"> & Partial<Pick<Memory, "archived" | "retrievable" | "relatedMilestoneIds">>): Memory => ({
    archived: false,
    retrievable: true,
    relatedMilestoneIds: [],
    ...x,
  });

  const memories: Memory[] = [
    m({
      id: "mem-dream",
      title: "10-Year Dream",
      kind: "profile",
      body: profile.dream,
      tags: ["dream", "goal"],
      provenance: "user-stated",
      source: "Onboarding",
      createdAt: at(-62, 20),
      updatedAt: at(-62, 20),
      relatedMemoryIds: ["mem-values", "mem-reflection"],
      relatedMilestoneIds: ["ms-cohort", "ms-beero"],
      path: "Profile/10-year-dream.md",
    }),
    m({
      id: "mem-values",
      title: "Values",
      kind: "profile",
      body: "Family, craft, courage, community.\n\nCraft means I'd rather ship something small and solid than something big and vague.",
      tags: ["values"],
      provenance: "user-stated",
      source: "Onboarding",
      createdAt: at(-62, 20),
      updatedAt: at(-62, 20),
      relatedMemoryIds: ["mem-dream", "mem-sunday"],
      path: "Profile/values.md",
    }),
    m({
      id: "mem-gabiley",
      title: "Farmer interviews in Gabiley",
      kind: "experience",
      body:
        "Spoke with five farmers over two days.\n\n- Most decide planting dates from radio forecasts and what neighbours do.\n- Three of five have basic phones; everyone uses SMS.\n- The biggest fear is planting just before a dry spell.\n- Nobody asked for an app. They asked for a reliable answer, in Somali, at the right moment.\n\nFaadumo said she would test anything that saves her one failed planting.",
      tags: ["beero", "research", "farmers"],
      provenance: "user-stated",
      source: "Written after completing a task",
      createdAt: at(-12, 21),
      updatedAt: at(-12, 21),
      relatedMemoryIds: ["mem-goal-beero"],
      relatedMilestoneIds: ["ms-beero"],
      path: "Experiences/farmer-interviews-in-gabiley.md",
    }),
    m({
      id: "mem-meetup",
      title: "Presenting at the Hargeisa developer meetup",
      kind: "experience",
      body:
        "About forty people came. I was nervous for the first five minutes and then it was fine.\n\nTwo students asked whether I take interns. I didn't have an answer. I want to have one next year.",
      tags: ["community", "speaking"],
      provenance: "user-stated",
      source: "Journal entry",
      createdAt: at(-21, 22),
      updatedAt: at(-21, 22),
      relatedMemoryIds: ["mem-dream"],
      relatedMilestoneIds: ["ms-portfolio", "ms-cohort"],
      path: "Experiences/presenting-at-the-hargeisa-developer-meetup.md",
    }),
    m({
      id: "mem-amina-call",
      title: "Call with Amina about research direction",
      kind: "experience",
      body:
        "Amina (my mentor in Nairobi) said a first paper doesn't need a new model. It needs a clear question and honest data.\n\nHer suggestion: write up what the Beero pilot teaches about delivering advice over SMS, including what fails.",
      tags: ["mentor", "research"],
      provenance: "user-stated",
      source: "Journal entry",
      createdAt: at(-9, 19),
      updatedAt: at(-9, 19),
      relatedMemoryIds: ["mem-perfect", "mem-gabiley"],
      relatedMilestoneIds: ["ms-paper"],
      path: "Experiences/call-with-amina-about-research-direction.md",
    }),
    m({
      id: "mem-perfect",
      title: "I postpone sharing work until it feels perfect",
      kind: "reflection",
      body:
        "Noticed it again this week: the README for Beero has been 'almost ready' for days.\n\nWhen I shared the rough problem statement with Amina, the feedback was more useful than anything I'd have got from a polished version.",
      tags: ["pattern", "courage"],
      provenance: "user-stated",
      source: "Journal entry",
      createdAt: at(-6, 22),
      updatedAt: at(-6, 22),
      relatedMemoryIds: ["mem-amina-call"],
      relatedMilestoneIds: ["ms-beero", "ms-paper"],
      path: "Reflections/i-postpone-sharing-work-until-it-feels-perfect.md",
    }),
    m({
      id: "mem-evenings",
      title: "I do my best work in the early evening",
      kind: "note",
      body: "Between 7 and 9 pm, after dinner, before the family settles. Mornings are for the day job.",
      tags: ["energy", "routine"],
      provenance: "user-stated",
      source: "Approved from a conversation",
      createdAt: at(-15, 21),
      updatedAt: at(-15, 21),
      relatedMemoryIds: ["mem-sunday"],
      path: "Profile/i-do-my-best-work-in-the-early-evening.md",
    }),
    m({
      id: "mem-sunday",
      title: "Sunday dinners are not negotiable",
      kind: "note",
      body: "No deadlines on Sundays. Family first, then the work.",
      tags: ["family", "boundaries"],
      provenance: "user-stated",
      source: "Journal entry",
      createdAt: at(-25, 18),
      updatedAt: at(-25, 18),
      relatedMemoryIds: ["mem-values", "mem-evenings"],
      path: "Profile/sunday-dinners-are-not-negotiable.md",
    }),
    m({
      id: "mem-compute",
      title: "GPU access is the bottleneck",
      kind: "note",
      body: "Local GPUs are unreliable and cloud credits are expensive. Applied to a credits programme; no reply yet.\n\nFallback: a smaller model that runs on CPU for the SMS prototype.",
      tags: ["beero", "compute", "blocker"],
      provenance: "user-stated",
      source: "Journal entry",
      createdAt: at(-7, 20),
      updatedAt: at(-7, 20),
      relatedMemoryIds: ["mem-goal-beero"],
      relatedMilestoneIds: ["ms-beero"],
      path: "Goals/gpu-access-is-the-bottleneck.md",
    }),
    m({
      id: "mem-goal-beero",
      title: "Ship Beero, an SMS crop-advice assistant for farmers",
      kind: "goal",
      body:
        "## Why this matters\n\nThe first tool the lab would be known for, built with the farmers who need it.\n\n## Tasks\n\n- [x] [[Interview five farmers in Gabiley about planting decisions]]\n- [x] [[Write the problem statement and share it with my mentor]]\n- [ ] [[Build a Somali-language SMS prototype for planting-date questions]]\n- [ ] [[Secure 20 hours of GPU credits]]\n- [ ] [[Test the prototype with two farmers]]\n- [ ] [[Publish the repository with a clear README]]",
      tags: ["goal", "beero"],
      provenance: "user-stated",
      source: "Approved plan",
      createdAt: at(-15, 21),
      updatedAt: at(-8, 21),
      relatedMemoryIds: ["mem-gabiley", "mem-compute"],
      relatedMilestoneIds: ["ms-beero"],
      path: "Goals/ship-beero.md",
    }),
    m({
      id: "mem-reflection",
      title: `Future Reflection: Hargeisa, ${horizonYear}`,
      kind: "reflection",
      body: `An imagined letter from ${horizonYear}. See the Reflection page for the full scenario.`,
      tags: ["reflection", "future-self"],
      provenance: "ai-inferred",
      source: "Generated reflection",
      createdAt: at(-61, 20),
      updatedAt: at(-61, 20),
      relatedMemoryIds: ["mem-dream"],
      path: "Reflections/future-reflection.md",
    }),
    m({
      id: "mem-summary",
      title: "Summary: momentum on Beero, hesitation on sharing",
      kind: "note",
      body:
        "Interpretation, not fact: the farmer interviews and the problem statement show steady progress on Beero. The repeated delay on publishing the README matches the pattern you described about sharing work only when it feels perfect.",
      tags: ["summary"],
      provenance: "ai-inferred",
      source: "Weekly Review skill",
      createdAt: at(-2, 21),
      updatedAt: at(-2, 21),
      relatedMemoryIds: ["mem-perfect", "mem-gabiley"],
      relatedMilestoneIds: ["ms-beero"],
      path: "Reflections/summary-momentum-on-beero.md",
    }),
    m({
      id: "mem-rideshare",
      title: "Old idea: a ride-sharing app for Hargeisa",
      kind: "note",
      body: "Parked. Crowded market, and it doesn't build toward the lab.",
      tags: ["idea"],
      provenance: "user-stated",
      source: "Journal entry",
      createdAt: at(-80, 22),
      updatedAt: at(-50, 22),
      archived: true,
      relatedMemoryIds: [],
      path: "Notes/old-idea-ride-sharing.md",
    }),
  ];

  const reflection: Reflection = {
    id: "refl-1",
    createdAt: at(-61, 20),
    aspiration: profile.dream,
    horizonYear,
    title: "The lab on the hill",
    narrative: [
      `It's ${horizonYear}. I'm writing this from the second floor of a building near the old market, where the lab has four desks, one stubborn air conditioner and a whiteboard nobody is allowed to erase on Thursdays.`,
      "It didn't start with a lab. It started with five conversations in Gabiley and an SMS prototype that answered one kind of question badly, then a little better.",
      "The hardest years were the ones where nothing looked like progress from the outside: evenings after the day job, a credits application that went unanswered, a first write-up I nearly didn't publish because it admitted what failed.",
      "What changed was smaller than I expected. I started showing work before it was ready. People helped more than I thought they would.",
    ],
    moments: [
      {
        title: "The first farmer who texted back",
        body: "Someone you've never met uses the prototype and replies with a question it can't answer yet. That question becomes the roadmap.",
      },
      {
        title: "Publishing the honest write-up",
        body: "The write-up includes what didn't work. It's the reason a university group gets in touch.",
      },
      {
        title: "Saying yes to the first intern",
        body: "One of the students from the meetup asks again. This time you have an answer, a desk and a six-week plan.",
      },
    ],
    shifts: [
      { area: "Habits", from: "Building alone after dinner", to: "Two evenings a week building in the open, with others" },
      { area: "Priorities", from: "Polishing before sharing", to: "Sharing early, polishing what people use" },
      { area: "Skills", from: "Shipping web products", to: "Running small, careful field studies" },
      { area: "Relationships", from: "One mentor, consulted occasionally", to: "A small circle of collaborators and students" },
    ],
    challenges: [
      { title: "Compute", body: "Unreliable access to GPUs and cloud credits.", provenance: "user-stated" },
      { title: "Time", body: "Little free time next to a full-time job.", provenance: "user-stated" },
      { title: "Credibility", body: "No research publications yet.", provenance: "user-stated" },
      {
        title: "Waiting for perfect",
        body: "You've described postponing sharing work until it feels finished. That habit could slow every milestone above.",
        provenance: "ai-inferred",
      },
    ],
    path: "Reflections/future-reflection.md",
  };

  const conversation: Message[] = [
    {
      id: "msg-1",
      role: "user",
      content: "I keep putting off testing the prototype with farmers. Why do I do that?",
      createdAt: at(-1, 20, 12),
      citations: [],
    },
    {
      id: "msg-2",
      role: "assistant",
      content:
        "Six days ago you wrote that you postpone sharing work until it feels perfect. This looks like the same pattern, just with a different audience.\n\nIn Gabiley, the farmers were generous with rough questions. Faadumo said she'd test anything that saves her one failed planting. The prototype doesn't need to be finished to be useful to her; it needs to be good enough to learn from.\n\nWhat would \"good enough to learn from\" look like for this first test?",
      createdAt: at(-1, 20, 13),
      citations: [
        { memoryId: "mem-perfect", title: "I postpone sharing work until it feels perfect" },
        { memoryId: "mem-gabiley", title: "Farmer interviews in Gabiley" },
      ],
      tools: [{ name: "search_memory", label: "Searched your memory", status: "done", detail: "“testing prototype farmers”: 2 notes" }],
      tone: "reflective",
      simulated: true,
    },
    {
      id: "msg-3",
      role: "user",
      content: "Good enough would be answering planting-date questions by SMS. Nothing else.",
      createdAt: at(-1, 20, 16),
      citations: [],
    },
    {
      id: "msg-4",
      role: "assistant",
      content:
        "That's a clear bar, and a much smaller one than the version in your head. I'd like to remember it so we can hold the prototype to it later. It's waiting for your approval below.\n\nWhen could you put it in front of Faadumo?",
      createdAt: at(-1, 20, 17),
      citations: [{ memoryId: "mem-gabiley", title: "Farmer interviews in Gabiley" }],
      tools: [{ name: "propose_memory", label: "Proposed a memory", status: "done", detail: "Waiting for your approval" }],
      approvalIds: ["ap-good-enough"],
      tone: "reflective",
      simulated: true,
    },
  ];

  const approvals: Approval[] = [
    {
      id: "ap-good-enough",
      kind: "memory",
      status: "pending",
      createdAt: at(-1, 20, 17),
      memory: {
        title: "Good enough for the first Beero test",
        body: "The prototype is ready to test when it answers planting-date questions by SMS. Nothing else is required for the first test.",
        kind: "goal",
        tags: ["beero", "definition-of-done"],
      },
    },
  ];

  const activity: ActivityItem[] = [
    { id: "a-1", kind: "reflection_saved", title: "Future Reflection saved to your vault", at: at(-61, 20), href: "/reflection" },
    { id: "a-2", kind: "task_completed", title: "Deploy two agent projects publicly", at: at(-41, 21), href: "/roadmap?milestone=ms-portfolio" },
    { id: "a-3", kind: "task_completed", title: "Write a case study for each project", at: at(-30, 20), href: "/roadmap?milestone=ms-portfolio" },
    { id: "a-4", kind: "task_completed", title: "Present at the Hargeisa developer meetup", at: at(-21, 19), href: "/roadmap?milestone=ms-portfolio" },
    { id: "a-5", kind: "plan_approved", title: "Plan approved: Ship Beero", at: at(-15, 21), href: "/roadmap?milestone=ms-beero" },
    { id: "a-6", kind: "task_completed", title: "Interview five farmers in Gabiley about planting decisions", at: at(-12, 17), href: "/roadmap?milestone=ms-beero" },
    { id: "a-7", kind: "memory_saved", title: "Memory saved: Farmer interviews in Gabiley", at: at(-12, 21), href: "/memory/mem-gabiley" },
    { id: "a-8", kind: "goal_created", title: "Goals added: research write-up, first cohort", at: at(-9, 19), href: "/roadmap" },
    { id: "a-9", kind: "task_completed", title: "Write the problem statement and share it with my mentor", at: at(-8, 21), href: "/roadmap?milestone=ms-beero" },
    { id: "a-10", kind: "memory_saved", title: "Memory saved: I postpone sharing work until it feels perfect", at: at(-6, 22), href: "/memory/mem-perfect" },
    { id: "a-11", kind: "skill_run", title: "Weekly Review completed", at: at(-2, 21), href: "/skills" },
  ];

  return {
    version: 1,
    anchor,
    seq: 100,
    profile,
    milestones,
    tasks,
    approvals,
    memories,
    reflection,
    conversation,
    editionDates: [day(-7), day(-2)],
    activity: activity.reverse(),
    skillRuns: [
      {
        id: "run-weekly-1",
        skillId: "weekly-review",
        status: "completed",
        startedAt: at(-2, 21),
        finishedAt: at(-2, 21, 1),
        summary: "2 tasks completed in the last 7 days. 1 blocked. 1 in progress.",
        output: [
          "Completed: Write the problem statement and share it with my mentor.",
          "Blocked: Secure 20 hours of GPU credits (waiting for a reply).",
          "In progress: Build a Somali-language SMS prototype.",
        ],
        approvalIds: [],
        simulated: true,
      },
    ],
  };
}

/** An empty demo, used after "Start fresh" so onboarding can be explored. */
export function emptyState(anchor: number): DemoState {
  return {
    version: 1,
    anchor,
    seq: 1,
    profile: null,
    milestones: [],
    tasks: [],
    approvals: [],
    memories: [],
    reflection: null,
    conversation: [],
    editionDates: [],
    activity: [],
    skillRuns: [],
  };
}

/** A demo mission, stored complete and played back over time; its plan proposal is filed when playback ends. */
export interface DemoMission extends Mission {
  proposal?: PlanProposal;
}
