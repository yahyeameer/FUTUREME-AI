import type {
  CoachingStyle,
  DailyEdition,
  MemoryDraft,
  PlanProposal,
  Profile,
  SkillRun,
  TaskPatch,
  TurnEvent,
  Workspace,
} from "@/types";

// Replaceable service layer. The UI depends only on these interfaces.
// Every mutation resolves to a fresh Workspace snapshot, so the UI never reports a change the backend didn't make.

export interface WorkspaceService {
  load(): Promise<Workspace>;
}

export interface ProfileService {
  saveProfile(profile: Profile): Promise<Workspace>;
  setStyle(style: CoachingStyle): Promise<Workspace>;
}

export interface ConversationService {
  /** Runs one turn with the future-self agent, yielding tool, text and completion events. */
  sendMessage(text: string, opts: { style: CoachingStyle; signal?: AbortSignal }): AsyncIterable<TurnEvent>;
}

export interface ApprovalService {
  decide(approvalId: string, decision: "approve" | "reject", editedPlan?: PlanProposal): Promise<Workspace>;
}

export interface RoadmapService {
  updateTask(taskId: string, patch: TaskPatch): Promise<Workspace>;
}

export interface MemoryService {
  createMemory(draft: MemoryDraft): Promise<Workspace>;
  updateMemory(id: string, patch: Partial<MemoryDraft> & { archived?: boolean; retrievable?: boolean }): Promise<Workspace>;
  deleteMemories(ids: string[]): Promise<Workspace>;
}

export interface ReflectionService {
  generateReflection(): Promise<Workspace>;
}

export interface DailyService {
  publishEdition(): Promise<{ workspace: Workspace; edition: DailyEdition }>;
}

export interface SkillService {
  runSkill(skillId: string, inputs: Record<string, string>, onUpdate: (run: SkillRun) => void): Promise<{ workspace: Workspace; run: SkillRun }>;
}

export interface FutureMeService
  extends WorkspaceService,
    ProfileService,
    ConversationService,
    ApprovalService,
    RoadmapService,
    MemoryService,
    ReflectionService,
    DailyService,
    SkillService {
  readonly mode: Workspace["runtime"]["mode"];
}
