import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const A = "a".repeat(32);
const B = "b".repeat(32);
let dir: string;
const ENV = ["DATABASE_PATH", "FUTUREME_MULTI_USER", "FUTUREME_DAILY_CALLS", "FUTUREME_DAILY_TOKENS", "FUTUREME_SERVER_DAILY_TOKENS", "FUTUREME_MAX_WORKSPACES", "FUTUREME_ACCESS_CODE", "NEBIUS_API_KEY", "NEBIUS_MODEL"];

beforeEach(() => {
  vi.resetModules();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "futureme-budget-"));
  process.env.DATABASE_PATH = path.join(dir, "futureme.db");
  process.env.FUTUREME_MULTI_USER = "1";
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV) delete process.env[k];
  fs.rmSync(dir, { recursive: true, force: true });
});

const load = async () => {
  const budget = await import("../src/lib/budget");
  const { runInWorkspace } = await import("../src/lib/tenant");
  budget.resetUsageCache();
  return { ...budget, runInWorkspace };
};

describe("limits", () => {
  it("are on by default in multi-user mode, off otherwise, and configurable", async () => {
    const { limits } = await load();
    expect(limits()).toEqual({ calls: 120, tokens: 250_000, serverTokens: 3_000_000 });
    process.env.FUTUREME_DAILY_CALLS = "10";
    process.env.FUTUREME_DAILY_TOKENS = "0";
    expect(limits()).toMatchObject({ calls: 10, tokens: 0 });
    delete process.env.FUTUREME_MULTI_USER;
    delete process.env.FUTUREME_DAILY_CALLS;
    delete process.env.FUTUREME_DAILY_TOKENS;
    expect(limits()).toEqual({ calls: 0, tokens: 0, serverTokens: 0 });
  });
});

describe("counting", () => {
  it("stops one workspace at its call limit without touching another, and persists the count", async () => {
    process.env.FUTUREME_DAILY_CALLS = "2";
    const { chargeCall, usageToday, runInWorkspace, BudgetError, resetUsageCache } = await load();
    runInWorkspace(A, () => {
      chargeCall();
      chargeCall();
      expect(() => chargeCall()).toThrow(BudgetError);
      expect(() => chargeCall()).toThrow(/limit of 2 model calls/);
    });
    expect(() => runInWorkspace(B, () => chargeCall())).not.toThrow();
    resetUsageCache();
    expect(runInWorkspace(A, () => usageToday().usage.calls)).toBe(2);
    expect(fs.existsSync(path.join(dir, "workspaces", A, "usage.json"))).toBe(true);
  });

  it("stops a workspace at its token budget, and everyone at the server's", async () => {
    process.env.FUTUREME_DAILY_TOKENS = "1000";
    process.env.FUTUREME_SERVER_DAILY_TOKENS = "1500";
    const { chargeCall, chargeTokens, runInWorkspace } = await load();
    runInWorkspace(A, () => {
      chargeCall();
      chargeTokens(1000);
      expect(() => chargeCall()).toThrow(/today's model budget for this workspace/);
    });
    runInWorkspace(B, () => {
      chargeCall();
      chargeTokens(600);
      expect(() => chargeCall()).toThrow(/demo server has used its model budget/);
    });
  });

  it("starts again the next day", async () => {
    process.env.FUTUREME_DAILY_CALLS = "1";
    const { chargeCall, runInWorkspace } = await load();
    fs.mkdirSync(path.join(dir, "workspaces", A), { recursive: true });
    fs.writeFileSync(path.join(dir, "workspaces", A, "usage.json"), JSON.stringify({ day: "2000-01-01", calls: 99, tokens: 99 }));
    expect(() => runInWorkspace(A, () => chargeCall())).not.toThrow();
  });
});

describe("the model provider", () => {
  it("counts each real call and its tokens, and refuses before calling the API once the limit is reached", async () => {
    process.env.NEBIUS_API_KEY = "test";
    process.env.NEBIUS_MODEL = "test-model";
    process.env.FUTUREME_DAILY_CALLS = "1";
    const fetchMock = vi.fn(async () =>
      Response.json({ id: "x", object: "chat.completion", created: 0, model: "test-model", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "hi" } }], usage: { prompt_tokens: 30, completion_tokens: 12, total_tokens: 42 } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { usageToday, runInWorkspace } = await load();
    const { nebiusProvider } = await import("../src/lib/llm");
    await runInWorkspace(A, async () => {
      const reply = await nebiusProvider().complete([{ role: "user", content: "hello" }]);
      expect(reply.content).toBe("hi");
      expect(usageToday().usage).toMatchObject({ calls: 1, tokens: 42 });
      await expect(nebiusProvider().complete([{ role: "user", content: "again" }])).rejects.toThrow(/limit of 1 model calls/);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("sign-in when the demo is full", () => {
  const post = async (fields: Record<string, string>) => {
    const { POST } = await import("../src/app/api/login/route");
    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.set(k, v);
    return POST(new Request("http://localhost:3000/api/login", { method: "POST", body, headers: { "x-forwarded-for": "8.8.8.8" } }));
  };

  it("refuses a new workspace but still reopens an existing one", async () => {
    process.env.FUTUREME_ACCESS_CODE = "open sesame";
    process.env.FUTUREME_MAX_WORKSPACES = "1";
    fs.mkdirSync(path.join(dir, "workspaces", A), { recursive: true });
    const full = await post({ code: "open sesame" });
    expect(full.headers.get("location")).toMatch(/error=full/);
    expect(full.headers.getSetCookie()).toEqual([]);
    expect((await post({ code: "open sesame", workspace: A })).headers.getSetCookie()[1]).toMatch(new RegExp(`^futureme_ws=${A};`));
  });
});
