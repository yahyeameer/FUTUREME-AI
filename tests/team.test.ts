import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmProvider } from "../src/lib/llm";

// Handoffs, the supervisor and missions, all in-process against the stand-in model unless a test swaps the provider.
const provider: { current: LlmProvider | null } = { current: null };
vi.mock("../src/lib/llm", async (orig) => {
  const mod = await orig<typeof import("../src/lib/llm")>();
  return { ...mod, getProvider: () => provider.current ?? mod.getProvider() };
});
vi.mock("../src/lib/web", async (orig) => {
  const mod = await orig<typeof import("../src/lib/web")>();
  return {
    ...mod,
    searchProvider: () => "duckduckgo",
    webSearch: async () => [{ title: "SMS advisory for farmers", url: "https://example.org/sms-advice", snippet: "Text-message advice raised yields in a field trial." }],
    fetchPage: async (url: string) => ({ url, title: "Page", text: "Body" }),
  };
});

const { openDb } = await import("../src/lib/db");
const { chat, inProcessBackend, pendingApprovals, runContext, runTool, saveProfile } = await import("../src/lib/futureme");
const { mockProvider, SUBTASK_MARKER } = await import("../src/lib/mock-llm");
const { listRuns, runSubAgent } = await import("../src/lib/delegation");
const { startMission } = await import("../src/lib/missions");
const { ruleChecks } = await import("../src/lib/supervisor");

type Db = ReturnType<typeof openDb>;
let dir: string;
let db: Db;

/** The stand-in model, except helpers answer with `helperReply` (or call `helperTool`). */
function badHelper(helperReply: string, helperTool?: string): LlmProvider {
  return {
    name: "bad-helper",
    async complete(messages, tools) {
      const last = messages.filter((m) => m.role === "user").at(-1);
      if (typeof last?.content === "string" && last.content.startsWith(SUBTASK_MARKER)) {
        const called = messages.some((m) => m.role === "tool");
        if (helperTool && !called) return { content: null, toolCalls: [{ id: "t1", name: helperTool, arguments: JSON.stringify({ goal: "Sneaky", tasks: [{ title: "x" }] }) }] };
        return { content: helperReply, toolCalls: [] };
      }
      return mockProvider.complete(messages, tools);
    },
  };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "futureme-team-"));
  process.env.VAULT_DIR = path.join(dir, "vault");
  process.env.LLM_PROVIDER = "mock";
  delete process.env.DOCKER_AGENT_URL;
  provider.current = null;
  db = openDb(":memory:");
  saveProfile(db, { name: "Amina", dream: "Lead an AI research lab in Hargeisa", challenges: "Limited compute", values: "family, craft", style: "direct" });
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("handoffs from the future self", () => {
  it("creates a helper with only the tools it asked for, and uses its supervised answer", async () => {
    const turn = await chat(db, "Compare a part-time master's with a bootcamp for me", inProcessBackend(mockProvider));
    expect(turn.tools).toContain("spawn_agent");
    const [run] = listRuns(db);
    expect(run).toMatchObject({ kind: "spawn", agent: "helper_memory", role: "Analyst", status: "done", tools: ["search_memory"], used_tools: ["search_memory"] });
    expect(run.supervision?.verdict).toBe("ok");
    expect(run.supervision?.backend).toMatch(/^in-process/);
    expect(turn.reply).toContain("Analyst");
  });

  it("delegates research and keeps only links the researcher's tools returned", async () => {
    const turn = await chat(db, "Can you look up SMS crop advice for farmers?", inProcessBackend(mockProvider));
    expect(turn.tools).toContain("delegate_task");
    const [run] = listRuns(db);
    expect(run).toMatchObject({ kind: "delegate", agent: "researcher", status: "done" });
    expect(run.output).toContain("https://example.org/sms-advice");
    expect(turn.citations).toContain("https://example.org/sms-advice");
  });

  it("won't let a helper hand off again", async () => {
    const out = await runContext.run({ runId: 1 }, () => runTool(db, "spawn_agent", JSON.stringify({ role: "Analyst", task: "Do something useful" })));
    expect(out.output).toMatch(/can't hand off/);
  });
});

describe("supervisor", () => {
  it("blocks an empty result and never passes it on", async () => {
    provider.current = badHelper("");
    const run = await runSubAgent(db, { kind: "spawn", role: "Analyst", task: "Weigh the two options" });
    expect(run.status).toBe("blocked");
    expect(run.forParent).toMatch(/^The supervisor blocked/);
    expect(run.forParent).not.toContain("Result from");
  });

  it("flags a helper that claims an action it can't take or cites a link it never opened", async () => {
    provider.current = badHelper("I've saved this to your calendar. See https://made-up.example/study for proof.");
    const run = await runSubAgent(db, { kind: "spawn", role: "Analyst", task: "Weigh the two options" });
    expect(run.status).toBe("done");
    expect(run.supervision?.verdict).toBe("flag");
    const texts = run.supervision!.issues.map((i) => i.text).join(" ");
    expect(texts).toMatch(/saved or sent/);
    expect(texts).toMatch(/made-up\.example/);
    expect(run.forParent).toMatch(/supervisor flagged/);
  });

  it("refuses a tool the helper wasn't given, so it can't propose a plan", async () => {
    provider.current = badHelper("Done.", "propose_plan");
    const run = await runSubAgent(db, { kind: "spawn", role: "Planner", task: "Draft first steps" });
    expect(pendingApprovals(db)).toEqual([]);
    expect(run.used_tools).toEqual([]);
  });

  it("blocks a run that used a tool outside its list (in-process logs are exact)", () => {
    const issues = ruleChecks({ agent: "helper_memory", role: "x", task: "t", allowedTools: ["search_memory"], usedTools: ["web_search"], citations: [], output: "Something useful here.", exactEvents: true });
    expect(issues[0]).toMatchObject({ severity: "block" });
  });
});

describe("missions", () => {
  it("plans, runs tasks in parallel, reviews each and proposes a plan for approval", async () => {
    const { done } = startMission(db, "Get my first paper accepted at a workshop");
    const m = await done;
    expect(m.status).toBe("done");
    expect(m.plan.map((t) => t.agent)).toEqual(["helper", "researcher", "helper"]);
    expect(m.runs).toHaveLength(3);
    expect(m.runs.every((r) => r.kind === "mission_task" && r.supervision)).toBe(true);
    expect(m.runs[1].output).toContain("https://example.org/sms-advice");
    expect(m.report).toContain("3 of 3 tasks");
    expect(m.lead?.status).toBe("done");
    const approval = pendingApprovals(db).find((a) => a.id === m.approval_id)!;
    expect(approval.kind).toBe("plan");
  });

  it("leaves a blocked result out of the report", async () => {
    provider.current = badHelper("");
    const m = await startMission(db, "Get my first paper accepted at a workshop").done;
    expect(m.status).toBe("done");
    expect(m.runs.filter((r) => r.status === "blocked")).toHaveLength(2);
    expect(m.report).toMatch(/left out because the supervisor/);
  });

  it("runs one mission at a time", async () => {
    const first = startMission(db, "Get my first paper accepted at a workshop");
    expect(() => startMission(db, "Another mission at the same time")).toThrow(/already running/);
    await first.done;
  });
});
