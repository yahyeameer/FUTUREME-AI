import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateDaily, latestDaily } from "../src/lib/daily";
import { openDb, type Db } from "../src/lib/db";
import { chat, completeTask, decideApproval, goalsWithTasks, inProcessBackend, saveProfile } from "../src/lib/futureme";
import type { LlmProvider } from "../src/lib/llm";
import { mockProvider } from "../src/lib/mock-llm";
import { readNote } from "../src/lib/vault";

let dir: string;
let db: Db;
const today = new Date().toISOString().slice(0, 10);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "daily-"));
  process.env.VAULT_DIR = path.join(dir, "vault");
  db = openDb(":memory:");
  saveProfile(db, { name: "Amina", dream: "Lead an AI research lab", style: "direct" });
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.VAULT_DIR;
});

async function approvedPlan() {
  const turn = await chat(db, "Help me plan my first research project", inProcessBackend(mockProvider));
  decideApproval(db, turn.approvals[0], true);
  return goalsWithTasks(db)[0];
}

describe("FutureMe Daily", () => {
  it("starts with an honest first issue when nothing is done", async () => {
    await approvedPlan();
    const issue = await generateDaily(db, mockProvider, today);
    expect(issue.headline).toBe("Amina's story begins");
    expect(issue.wins).toEqual([]);
    expect(issue.open).toHaveLength(3);
  });

  it("reports only completed tasks as wins, each linked to its record", async () => {
    const goal = await approvedPlan();
    completeTask(db, goal.tasks[1].id);
    const issue = await generateDaily(db, mockProvider, today);
    expect(issue.wins).toEqual([expect.objectContaining({ title: goal.tasks[1].title, source: `task #${goal.tasks[1].id}` })]);
    expect(issue.milestones[0].detail).toBe("1 of 3 steps done");
    expect(issue.open.map((i) => i.title)).not.toContain(goal.tasks[1].title);
    expect(readNote(issue.notePath!).data.evidence).toBe("verified");
    expect(latestDaily(db)?.headline).toBe(issue.headline);
  });

  it("falls back to a fact-only front page when the model returns no JSON", async () => {
    const goal = await approvedPlan();
    completeTask(db, goal.tasks[0].id);
    const chatty: LlmProvider = { name: "chatty", complete: async () => ({ content: "Sure! Here's a great issue.", toolCalls: [] }) };
    const issue = await generateDaily(db, chatty, today);
    expect(issue.headline).toBe("Amina made progress this week");
    expect(issue.lead).toBe("Amina completed 1 step this week.");
  });

  it("replaces the same day's issue instead of duplicating it", async () => {
    await approvedPlan();
    await generateDaily(db, mockProvider, today);
    await generateDaily(db, mockProvider, today);
    expect((db.prepare("SELECT COUNT(*) AS n FROM daily_issues").get() as { n: number }).n).toBe(1);
  });
});
