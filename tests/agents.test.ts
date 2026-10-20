import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmProvider } from "../src/lib/llm";

// One switchable provider for every agent, so a test can play a misbehaving model.
const provider: { current: LlmProvider | null } = { current: null };
vi.mock("../src/lib/llm", async (orig) => {
  const mod = await orig<typeof import("../src/lib/llm")>();
  return { ...mod, getProvider: () => provider.current ?? mod.getProvider() };
});
// No network in tests: the web tools return fixed results.
vi.mock("../src/lib/web", async (orig) => {
  const mod = await orig<typeof import("../src/lib/web")>();
  return {
    ...mod,
    searchProvider: () => "duckduckgo",
    webSearch: async () => [
      { title: "SMS advisory for farmers", url: "https://example.org/sms-advice", snippet: "Text-message advice raised yields in a field trial." },
      { title: "Planting calendars", url: "https://example.org/calendars", snippet: "Planting-date guidance is the most requested topic." },
    ],
    fetchPage: async (url: string) => ({ url, title: "Page", text: "Body" }),
  };
});

const { openDb } = await import("../src/lib/db");
const { agentTeam } = await import("../src/lib/agents");
const { PACKS, TEAM } = await import("../src/lib/team-info");
const { chat, completeTask, decideApproval, getProfile, inProcessBackend, pendingApprovals, saveProfile } = await import("../src/lib/futureme");
const { mockProvider } = await import("../src/lib/mock-llm");
const { runCouncil, saveCouncilBrief } = await import("../src/lib/council");
const { verifyMessage } = await import("../src/lib/verify");
const { runResearch } = await import("../src/lib/research");
const { runNightShift, nextRunAt } = await import("../src/lib/night-shift");
const { listPacks, setActivePack } = await import("../src/lib/packs");
const { readNote } = await import("../src/lib/vault");
const { isPrivateAddress, parseDuckDuckGo } = await import("../src/lib/web");

type Db = ReturnType<typeof openDb>;
let dir: string;
let db: Db;
const scripted = (content: string): LlmProvider => ({ name: "scripted", complete: async () => ({ content, toolCalls: [] }) });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "futureme-agents-"));
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

describe("agent team file", () => {
  it("defines every agent the app calls, with narrow tool lists", () => {
    const team = new Map(agentTeam().map((a) => [a.name, a]));
    for (const name of ["root", "voice_horizon", "voice_next_year", "voice_skeptic", "voice_mentor", "council_chair", "verifier", "researcher", "night_shift", "helper_memory", "helper_web", "mission_lead", "supervisor"]) {
      expect(team.has(name), name).toBe(true);
    }
    expect(team.get("root")!.tools).toEqual(["search_memory", "propose_memory", "propose_plan", "delegate_task", "spawn_agent", "save_file", "read_file", "list_files", "docker_mcp"]);
    expect(team.get("helper_memory")!.tools).toEqual(["search_memory"]);
    expect(team.get("supervisor")!.tools).toEqual([]);
    expect(team.get("voice_skeptic")!.tools).toEqual(["search_memory"]);
    expect(team.get("council_chair")!.tools).toEqual([]);
    expect(team.get("researcher")!.tools).toEqual(["web_search", "fetch_url"]);
    expect(team.get("council")!.subAgents).toHaveLength(4);
  });

  it("matches the browser's copy of the team", () => {
    const fromYaml = agentTeam().map((a) => ({ name: a.name, tools: a.tools, subAgents: a.subAgents, description: a.description }));
    expect(TEAM.map((a) => ({ name: a.name, tools: a.tools, subAgents: a.subAgents, description: a.description }))).toEqual(fromYaml);
  });
});

describe("council", () => {
  it("asks every voice, merges a brief and saves it as an AI interpretation", async () => {
    const c = await runCouncil(db, "Should I apply to the regional AI fellowship?");
    expect(c.voices.map((v) => v.name)).toEqual(["voice_horizon", "voice_next_year", "voice_skeptic", "voice_mentor"]);
    expect(c.voices.every((v) => v.reply.length > 20)).toBe(true);
    expect(c.brief.summary).toMatch(/future selves/);
    expect(c.brief.next_step).toBeTruthy();
    expect(c.citations.length).toBeGreaterThan(0);

    const notePath = saveCouncilBrief(db, c.id);
    const note = readNote(notePath);
    expect(note.data.evidence).toBe("ai-inferred");
    expect(note.body).toContain("Should I apply");
    expect(saveCouncilBrief(db, c.id)).toBe(notePath);
  });
});

describe("fact checker", () => {
  it("marks a remembered note as supported, with its real path", async () => {
    const turn = await chat(db, "I keep putting off my research write-up", inProcessBackend(mockProvider));
    const v = await verifyMessage(db, turn.id);
    const supported = v.claims.filter((c) => c.status === "supported");
    expect(supported.length).toBeGreaterThan(0);
    expect(supported.every((c) => c.source && fs.existsSync(path.join(dir, "vault", c.source)))).toBe(true);
    const row = db.prepare("SELECT verification FROM messages WHERE id = ?").get(turn.id) as { verification: string };
    expect(JSON.parse(row.verification).verdict).toBeDefined();
  });

  it("downgrades a claim that cites a note that doesn't exist", async () => {
    const turn = await chat(db, "Hello", inProcessBackend(mockProvider));
    provider.current = scripted(JSON.stringify({ claims: [{ text: "You won a national award in 2024.", status: "supported", source: "Goals/award.md" }] }));
    const v = await verifyMessage(db, turn.id);
    expect(v.claims[0]).toMatchObject({ status: "unverified", source: null });
    expect(v.verdict).toBe("check");
  });
});

describe("research", () => {
  it("keeps only links the tools returned and proposes an AI-labelled memory", async () => {
    const r = await runResearch(db, "SMS crop advice for farmers");
    expect(r.status).toBe("awaiting_approval");
    expect(r.sources.map((s) => s.url)).toEqual(["https://example.org/sms-advice", "https://example.org/calendars"]);
    const approval = pendingApprovals(db).find((a) => a.id === r.approval_id)!;
    expect(approval.kind).toBe("memory");
    decideApproval(db, approval.id, true);
    const note = readNote("Research/research-sms-crop-advice-for-farmers.md");
    expect(note.data.evidence).toBe("ai-inferred");
    expect(note.body).toContain("https://example.org/sms-advice");
  });

  it("fails rather than citing a source nobody read", async () => {
    provider.current = scripted(JSON.stringify({ summary: "A study shows 40% gains.", findings: [{ point: "40% gains", url: "https://made-up.example/study" }] }));
    const r = await runResearch(db, "SMS crop advice");
    expect(r.status).toBe("failed");
    expect(r.approval_id).toBeNull();
    expect(pendingApprovals(db)).toEqual([]);
  });
});

describe("night shift", () => {
  it("publishes the Daily and picks focus only from open tasks", async () => {
    const turn = await chat(db, "Help me plan my research write-up", inProcessBackend(mockProvider));
    decideApproval(db, turn.approvals[0], true);
    const n = await runNightShift(db, "manual");
    expect(n.status).toBe("completed");
    expect(n.daily_date).toBe(new Date().toISOString().slice(0, 10));
    expect(n.focus.length).toBeGreaterThan(0);
    const open = (db.prepare("SELECT id FROM tasks WHERE status != 'done'").all() as { id: number }[]).map((t) => t.id);
    expect(n.focus.every((f) => open.includes(f.id))).toBe(true);
    expect(n.brief).toContain("Amina");
  });

  it("ignores task ids the model invents, and proposes a next step for a finished goal", async () => {
    const turn = await chat(db, "Help me plan my research write-up", inProcessBackend(mockProvider));
    decideApproval(db, turn.approvals[0], true);
    for (const t of db.prepare("SELECT id FROM tasks").all() as { id: number }[]) completeTask(db, t.id);
    const n = await runNightShift(db, "manual");
    expect(n.focus).toEqual([]);
    expect(n.approvals).toHaveLength(1);
    expect(pendingApprovals(db).map((a) => a.kind)).toEqual(["plan"]);

    provider.current = scripted(JSON.stringify({ brief: "Morning.", focus: [999, 1000] }));
    const m = await runNightShift(db, "manual");
    expect(m.focus).toEqual([]);
  });

  it("schedules the next run for later today or tomorrow", () => {
    const now = new Date(2026, 9, 15, 6, 0);
    expect(nextRunAt("05:30", now).getDate()).toBe(16);
    expect(nextRunAt("07:00", now).getHours()).toBe(7);
  });
});

describe("persona packs", () => {
  it("lists the packs and adds the chosen persona to the future self's prompt", async () => {
    const packs = listPacks();
    expect(packs.map((p) => p.id)).toEqual(["creator", "founder", "researcher", "student"]);
    expect(packs.every((p) => p.persona.startsWith("You are the user's future self"))).toBe(true);
    expect(PACKS).toEqual(packs);
    expect(() => setActivePack(db, "nope")).toThrow(/No persona pack/);

    setActivePack(db, "founder");
    const seen: string[] = [];
    const capture: LlmProvider = { name: "capture", complete: async (messages) => (seen.push(String(messages[0].content)), { content: "Hi.", toolCalls: [] }) };
    await chat(db, "Hello", inProcessBackend(capture));
    expect(seen[0]).toContain("Persona pack: You are the user's future self, as a founder");
    expect(getProfile(db)!.name).toBe("Amina");
  });
});

describe("web tools", () => {
  it("parses DuckDuckGo results and unwraps their redirect links", () => {
    const html = `<div class="result results_links web-result"><h2><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fa&amp;rut=x">Example &amp; A</a></h2><a class="result__snippet" href="#">First <b>result</b></a></div>
      <div class="result result--ad"><a class="result__a" href="https://ads.example/x">Ad</a></div>`;
    expect(parseDuckDuckGo(html)).toEqual([{ title: "Example & A", url: "https://example.org/a", snippet: "First result" }]);
  });

  it("refuses private and loopback addresses", () => {
    for (const ip of ["127.0.0.1", "10.0.0.2", "192.168.1.1", "172.20.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"]) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["93.184.216.34", "1.1.1.1", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});
