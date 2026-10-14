// Shared domain types for the FutureMe frontend.
// Both the demo service (browser) and the live service (Next.js API over SQLite + the Markdown vault) produce these.

export type ServiceMode = "demo" | "live";

/** Tone of the future-self conversation. Changes how FutureMe speaks, not who it is. */
export type CoachingStyle = "reflective" | "strategic" | "encouraging" | "analytical";

/**
 * Where a piece of information came from. Mirrors the vault's `evidence` frontmatter.
 * - user-stated: the user said or wrote it
 * - ai-inferred: a model interpretation or an imagined scenario (never evidence that something happened)
 * - verified: an application event, such as a completed task
 */
export type Provenance = "user-stated" | "ai-inferred" | "verified";

export interface Profile {
  name: string;
  dream: string;
  /** Year the long-term aspiration points at. */
  horizonYear: number;
  current: string;
  resources: string;
  challenges: string;
  values: string[];
  style: CoachingStyle;
}

// ---------- Memory ----------

export type MemoryKind = "profile" | "goal" | "reflection" | "milestone" | "experience" | "task" | "daily" | "note";

export interface Memory {
  id: string;
  title: string;
  kind: MemoryKind;
  /** Markdown body (without frontmatter). */
  body: string;
  tags: string[];
  provenance: Provenance;
  /** Why this memory exists: "Onboarding", "Approved from a conversation", "Completed task". */
  source: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  /** When false, FutureMe will not retrieve this memory in conversations. */
  retrievable: boolean;
  relatedMemoryIds: string[];
  relatedMilestoneIds: string[];
  /** Vault-relative path when the memory is a Markdown note. */
  path?: string;
}

export interface MemoryDraft {
  title: string;
  body: string;
  kind: MemoryKind;
  tags: string[];
  /** Saved from an imagined scenario: stored as an AI interpretation, never as something that happened. */
  imagined?: boolean;
}

// ---------- Roadmap ----------

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";

export interface Task {
  id: string;
  milestoneId: string;
  title: string;
  notes?: string;
  status: TaskStatus;
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
  blockedReason?: string;
  dependsOn?: string[];
}

export type MilestoneStatus = "done" | "active" | "upcoming";

export interface Milestone {
  id: string;
  title: string;
  why?: string;
  targetDate?: string;
  createdAt: string;
  order: number;
  memoryIds: string[];
}

export interface TaskPatch {
  title?: string;
  notes?: string;
  status?: TaskStatus;
  dueDate?: string | null;
  blockedReason?: string;
}

// ---------- Approvals (agent proposals that change data) ----------

export interface PlanProposal {
  goal: string;
  why?: string;
  tasks: { title: string; dueInDays?: number }[];
}

export interface MemoryProposal {
  title: string;
  body: string;
  kind: MemoryKind;
  tags: string[];
}

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type Approval =
  | { id: string; kind: "plan"; status: ApprovalStatus; createdAt: string; decidedAt?: string; plan: PlanProposal }
  | { id: string; kind: "memory"; status: ApprovalStatus; createdAt: string; decidedAt?: string; memory: MemoryProposal };

// ---------- Conversation ----------

export type ToolName = "search_memory" | "propose_plan" | "propose_memory" | "review_progress" | string;

export interface ToolCall {
  name: ToolName;
  label: string;
  status: "running" | "done" | "failed";
  detail?: string;
}

export interface Citation {
  memoryId: string;
  title: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  citations: Citation[];
  tools?: ToolCall[];
  approvalIds?: string[];
  tone?: CoachingStyle;
  blocks?: RichBlock[];
  /** Set when the response came from deterministic demo content, not a model. */
  simulated?: boolean;
}

/** Structured content an assistant message can carry besides text and approvals. */
export type RichBlock =
  | { type: "progress"; title: string; completed: number; total: number; lines: { label: string; status: TaskStatus }[] }
  | { type: "memory"; memoryId: string }
  | { type: "milestone"; milestoneId: string };

/** Events a conversation turn emits while it runs. */
export type TurnEvent =
  | { type: "tool"; tool: ToolCall }
  | { type: "delta"; text: string }
  | { type: "done"; message: Message; workspace: Workspace }
  | { type: "error"; error: string };

// ---------- Reflection ----------

export interface Reflection {
  id: string;
  createdAt: string;
  aspiration: string;
  horizonYear: number;
  title: string;
  /** First-person narrative, one paragraph per entry. */
  narrative: string[];
  moments: { title: string; body: string }[];
  shifts: { area: string; from: string; to: string }[];
  challenges: { title: string; body: string; provenance: Provenance }[];
  path?: string;
}

// ---------- FutureMe Daily ----------

export interface SourceRef {
  kind: "task" | "milestone" | "memory" | "reflection";
  id: string;
  label: string;
}

export interface DailyItem {
  title: string;
  detail?: string;
  source: SourceRef;
}

export type ArticleSection = "progress" | "reflection" | "research" | "learning";

export interface DailyArticle {
  id: string;
  section: ArticleSection;
  kicker: string;
  headline: string;
  dek?: string;
  body: string[];
  sources: SourceRef[];
  /** Illustrative content that does not come from the user's records or a real source. */
  simulated?: boolean;
}

export interface TrendItem {
  id: string;
  title: string;
  summary: string;
  sourceName: string;
  url?: string;
  date?: string;
  simulated: boolean;
}

export interface DailyEdition {
  id: string;
  date: string;
  issueNumber: number;
  lead: DailyArticle;
  progress: DailyItem[];
  unfinished: DailyArticle | null;
  openItems: DailyItem[];
  lessons: DailyArticle | null;
  people: DailyArticle | null;
  trends: TrendItem[];
  nextEdition: string | null;
  path?: string;
}

// ---------- Skills ----------

export type SkillRunStatus = "ready" | "running" | "awaiting_approval" | "completed" | "failed";

export interface SkillInput {
  name: string;
  label: string;
  placeholder?: string;
  kind: "text" | "milestone";
  required?: boolean;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  inputs: SkillInput[];
  permissions: string[];
  available: boolean;
  unavailableReason?: string;
}

export interface SkillRun {
  id: string;
  skillId: string;
  status: Exclude<SkillRunStatus, "ready">;
  startedAt: string;
  finishedAt?: string;
  summary: string;
  output: string[];
  approvalIds: string[];
  simulated: boolean;
}

// ---------- Activity ----------

export type ActivityKind = "goal_created" | "task_completed" | "reflection_saved" | "memory_saved" | "plan_approved" | "plan_rejected" | "daily_published" | "skill_run";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  title: string;
  at: string;
  href?: string;
}

// ---------- Workspace snapshot ----------

export interface Capabilities {
  /** Task statuses this backend can store. */
  taskStatuses: TaskStatus[];
  editTasks: boolean;
  archiveMemories: boolean;
  /** Whether "do not retrieve" is enforced by the agent's memory search. */
  memoryRetrievalControl: boolean;
  editPlansBeforeApproval: boolean;
  streaming: boolean;
}

export interface Runtime {
  mode: ServiceMode;
  /** Human-readable description of what answers the conversation. */
  agent: string;
  model: string;
  /** True when replies are scripted demo content or the built-in stand-in model. */
  simulated: boolean;
  storage: string;
  inference: string;
}

export interface Workspace {
  runtime: Runtime;
  capabilities: Capabilities;
  profile: Profile | null;
  milestones: Milestone[];
  tasks: Task[];
  approvals: Approval[];
  memories: Memory[];
  reflection: Reflection | null;
  conversation: Message[];
  editions: DailyEdition[];
  activity: ActivityItem[];
  skills: Skill[];
  skillRuns: SkillRun[];
}
