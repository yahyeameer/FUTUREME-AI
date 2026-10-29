import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetUsageCache } from "../src/lib/budget";
import { openDb, type Db } from "../src/lib/db";
import { saveProfile } from "../src/lib/futureme";
import { runInWorkspace } from "../src/lib/tenant";
import { ensureTwinAgent, startWebCall } from "../src/lib/twin-calls";
import { ElevenLabs, expireClonedVoice, setPresetVoice, voiceSnapshot } from "../src/lib/voice";

// The voice twin on a judges' demo server: a ready-made voice so nobody has to clone theirs, short calls, a daily cap on
// voice calls, and cloned voices that are deleted after a few days.

const A = "a".repeat(32);
let dir: string;
let db: Db;
const requests: { method: string; url: string; body: unknown }[] = [];
const fakeFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  requests.push({ method, url, body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
  if (url.endsWith("/agents/create")) return json({ agent_id: "agent-1" });
  if (url.includes("/conversation/token")) return json({ token: "webrtc-token" });
  return json({ status: "ok", agent_id: "agent-1" });
};
const api = new ElevenLabs("test-key", fakeFetch, "https://el.test");
const ENV = ["ELEVENLABS_API_KEY", "TWIN_PRESET_VOICE_ID", "TWIN_MAX_CALL_SECONDS", "TWIN_DAILY_VOICE_CALLS", "TWIN_SERVER_DAILY_VOICE_CALLS", "TWIN_VOICE_TTL_DAYS", "FUTUREME_MULTI_USER", "DATABASE_PATH", "TWIN_PUBLIC_URL", "TWIN_DATA_DIR", "VAULT_DIR"];
const created = () => requests.find((r) => r.url.endsWith("/agents/create"))!.body as { conversation_config: { tts: { voice_id: string }; conversation: { max_duration_seconds: number } } };
const cloneVoice = (when = "datetime('now')") => {
  db.prepare("INSERT INTO consents (phrase, code, status) VALUES ('p', 'a b c', 'verified')").run();
  db.prepare(`INSERT INTO voice_profiles (voice_id, kind, status, consent_id, created_at) VALUES ('ivc-1', 'instant', 'ready', 1, ${when})`).run();
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "futureme-judge-voice-"));
  process.env.DATABASE_PATH = path.join(dir, "futureme.db");
  process.env.VAULT_DIR = path.join(dir, "vault");
  process.env.TWIN_DATA_DIR = path.join(dir, "voice");
  process.env.LLM_PROVIDER = "mock";
  process.env.TWIN_PUBLIC_URL = "https://tomora.example.org";
  requests.length = 0;
  resetUsageCache();
  db = openDb(":memory:");
  saveProfile(db, { name: "Amina", dream: "Lead an AI research lab", style: "direct" });
});
afterEach(() => {
  db.close();
  for (const k of ENV) delete process.env[k];
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("a ready-made voice", () => {
  it("needs an ElevenLabs key, and then lets a call start without cloning anything", async () => {
    await expect(ensureTwinAgent(db, api)).rejects.toThrow(/Clone your voice first, or choose a ready-made voice/);
    expect(() => setPresetVoice(db, true)).toThrow(/needs an ElevenLabs key/);
    expect(voiceSnapshot(db).preset).toEqual({ chosen: false, available: false });

    process.env.ELEVENLABS_API_KEY = "server-key";
    expect(voiceSnapshot(db).preset.available).toBe(true);
    setPresetVoice(db, true);
    expect(voiceSnapshot(db).preset.chosen).toBe(true);
    await ensureTwinAgent(db, api);
    expect(created().conversation_config.tts.voice_id).toBe("21m00Tcm4TlvDq8ikWAM");
  });

  it("can be changed on the server, and a cloned voice still wins", async () => {
    process.env.ELEVENLABS_API_KEY = "server-key";
    process.env.TWIN_PRESET_VOICE_ID = "preset-xyz";
    setPresetVoice(db, true);
    await ensureTwinAgent(db, api);
    expect(created().conversation_config.tts.voice_id).toBe("preset-xyz");

    requests.length = 0;
    cloneVoice();
    await ensureTwinAgent(db, api);
    const update = requests.find((r) => r.method === "PATCH")!.body as { conversation_config: { tts: { voice_id: string } } };
    expect(update.conversation_config.tts.voice_id).toBe("ivc-1");
  });
});

describe("short calls", () => {
  it("end at TWIN_MAX_CALL_SECONDS, never below a minute or above ten", async () => {
    cloneVoice();
    process.env.TWIN_MAX_CALL_SECONDS = "180";
    await ensureTwinAgent(db, api);
    expect(created().conversation_config.conversation.max_duration_seconds).toBe(180);
    const { maxCallSeconds } = await import("../src/lib/twin-guard");
    process.env.TWIN_MAX_CALL_SECONDS = "5";
    expect(maxCallSeconds()).toBe(60);
    process.env.TWIN_MAX_CALL_SECONDS = "99999";
    expect(maxCallSeconds()).toBe(600);
  });
});

describe("daily voice calls on a shared server", () => {
  it("stop a workspace after its limit, and the whole server after the server's", async () => {
    cloneVoice();
    process.env.FUTUREME_MULTI_USER = "1";
    process.env.TWIN_DAILY_VOICE_CALLS = "2";
    process.env.TWIN_SERVER_DAILY_VOICE_CALLS = "3";
    await runInWorkspace(A, async () => {
      await startWebCall(db, api);
      await startWebCall(db, api);
      await expect(startWebCall(db, api)).rejects.toThrow(/today's 2 voice calls/);
    });
    await runInWorkspace("b".repeat(32), async () => {
      await startWebCall(db, api);
      await expect(startWebCall(db, api)).rejects.toThrow(/demo server has used today's voice calls/);
    });
  });

  it("are not limited on a single-user install", async () => {
    cloneVoice();
    for (let i = 0; i < 5; i++) await startWebCall(db, api);
  });
});

describe("cloned voices on a demo server", () => {
  it("are deleted after TWIN_VOICE_TTL_DAYS, at ElevenLabs and here", async () => {
    cloneVoice("datetime('now', '-5 days')");
    expect(await expireClonedVoice(db, api)).toBe(false); // off by default
    process.env.TWIN_VOICE_TTL_DAYS = "7";
    expect(await expireClonedVoice(db, api)).toBe(false); // not old enough
    process.env.TWIN_VOICE_TTL_DAYS = "3";
    expect(await expireClonedVoice(db, api)).toBe(true);
    expect(requests.some((r) => r.method === "DELETE" && r.url.includes("/v1/voices/ivc-1"))).toBe(true);
    expect(voiceSnapshot(db).voices).toEqual([]);
  });
});

describe("explaining ElevenLabs errors", () => {
  it("says which permission a key is missing, and how to fix it", async () => {
    const { explainElevenLabs } = await import("../src/lib/voice");
    const body = JSON.stringify({ detail: { type: "authentication_error", code: "unauthorized", message: "The API key you used is missing the permission convai_write to execute this operation.", status: "missing_permissions" } });
    const text = explainElevenLabs(401, body);
    expect(text).toContain("(convai_write)");
    expect(text).toMatch(/Developers → API Keys/);
    expect(explainElevenLabs(401, JSON.stringify({ detail: { code: "invalid_api_key", message: "Invalid API key" } }))).toMatch(/didn't accept that API key/);
    expect(explainElevenLabs(402, JSON.stringify({ detail: { message: "quota exceeded" } }))).toMatch(/quota is used up/);
    expect(explainElevenLabs(400, JSON.stringify({ detail: { status: "can_not_use_instant_voice_cloning", message: "Your plan can not use instant voice cloning" } }))).toMatch(/doesn't include voice cloning/);
    expect(explainElevenLabs(500, "boom")).toBe("ElevenLabs answered 500: boom");
  });

  it("checks that a key can manage agents, using a throwaway agent it deletes again", async () => {
    const calls: string[] = [];
    const ok: typeof fetch = async (input, init) => {
      calls.push(`${init?.method ?? "GET"} ${String(input).replace("https://el.test", "")}`);
      return new Response(JSON.stringify({ agent_id: "tmp-1" }), { status: 200, headers: { "content-type": "application/json" } });
    };
    expect(await new ElevenLabs("k", ok, "https://el.test").agentAccessProblem()).toBeNull();
    expect(calls).toEqual(["POST /v1/convai/agents/create", "DELETE /v1/convai/agents/tmp-1"]);

    const denied: typeof fetch = async () => new Response(JSON.stringify({ detail: { status: "missing_permissions", message: "The API key you used is missing the permission convai_write to execute this operation." } }), { status: 401 });
    expect(await new ElevenLabs("k", denied, "https://el.test").agentAccessProblem()).toMatch(/convai_write/);

    const down: typeof fetch = async () => new Response("overloaded", { status: 503 });
    expect(await new ElevenLabs("k", down, "https://el.test").agentAccessProblem()).toBeNull();
  });
});
