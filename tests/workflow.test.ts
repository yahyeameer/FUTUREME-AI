import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../src/lib/db";
import {
  chat,
  completeTask,
  decideApproval,
  generateStory,
  getProfile,
  goalsWithTasks,
  inProcessBackend,
  pendingApprovals,
  runTool,
  saveProfile,
} from "../src/lib/futureme";
import { mockProvider } from "../src/lib/mock-llm";
import { listNotes, readNote } from "../src/lib/vault";

let dir: string;
let db: Db;
const backend = inProcessBackend(mockProvider);
const profile = {
  name: "Amina",
  dream: "Lead an AI research lab in Hargeisa",
  current: "Full-stack developer",
  resources: "Strong coding skills and a supportive family",
  challenges: "Limited access to compute",
  values: "family, craft, courage",
  style: "direct",
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "futureme-"));
  process.env.VAULT_DIR = path.join(dir, "vault");
  db = openDb(":memory:");
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.VAULT_DIR;
});

describe("core workflow", () => {
  it("runs onboarding -> story -> chat with memory -> approved plan -> completed task", async () => {
    saveProfile(db, profile);
    expect(getProfile(db)?.name).toBe("Amina");
    expect(listNotes()).toEqual(["Profile/10-year-dream.md", "Profile/profile.md", "Profile/values.md"]);

    const story = await generateStory(db, mockProvider);
    expect(story.content).toContain("Amina");
    expect(readNote(story.note_path!).data.evidence).toBe("ai-inferred");

    const turn = await chat(db, "Help me plan my first research project", backend);
    expect(turn.tools).toEqual(["search_memory", "propose_plan"]);
    expect(turn.citations.length).toBeGreaterThan(0);
    expect(turn.approvals).toHaveLength(1);
    expect(goalsWithTasks(db)).toEqual([]); // nothing created before approval

    decideApproval(db, turn.approvals[0], true);
    expect(pendingApprovals(db)).toEqual([]);
    const [goal] = goalsWithTasks(db);
    expect(goal.title).toBe("My first research project");
    expect(goal.tasks).toHaveLength(3);
    expect(listNotes().filter((n) => n.startsWith("Tasks/"))).toHaveLength(3);

    completeTask(db, goal.tasks[0].id);
    const done = goalsWithTasks(db)[0].tasks[0];
    expect(done.status).toBe("done");
    const taskNote = listNotes().find((n) => n.startsWith("Tasks/write-down"))!;
    expect(readNote(taskNote).data.evidence).toBe("verified");
  });

  it("remembers earlier context in later turns", async () => {
    saveProfile(db, profile);
    const turn = await chat(db, "What do I value most?", backend);
    expect(turn.citations).toContain("Profile/values.md");
    expect(turn.reply).toMatch(/I remember/);
  });

  it("does nothing on a rejected proposal", async () => {
    saveProfile(db, profile);
    const turn = await chat(db, "Help me plan a marathon", backend);
    decideApproval(db, turn.approvals[0], false);
    expect(goalsWithTasks(db)).toEqual([]);
    expect(() => decideApproval(db, turn.approvals[0], true)).toThrow(/No pending approval/);
  });

  it("returns readable errors for bad tool arguments instead of throwing", async () => {
    expect((await runTool(db, "propose_plan", "{not json")).output).toMatch(/not valid JSON/);
    expect((await runTool(db, "propose_plan", JSON.stringify({ goal: "x", tasks: [] }))).output).toMatch(/invalid arguments/);
    expect((await runTool(db, "delete_everything", "{}")).output).toMatch(/unknown tool/);
    expect(pendingApprovals(db)).toEqual([]);
  });

  it("requires onboarding before chatting", async () => {
    await expect(chat(db, "hi", backend)).rejects.toThrow(/onboarding/);
  });
});
