import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetUsageCache } from "../src/lib/budget";
import { openDb, type Db } from "../src/lib/db";
import { saveProfile } from "../src/lib/futureme";
import { runInWorkspace } from "../src/lib/tenant";
import { setTwinPaused } from "../src/lib/twin";
import { callsSnapshot, ensureTwinAgent, voiceChatTurn } from "../src/lib/twin-calls";
import { ElevenLabs } from "../src/lib/voice";

// Talking to your future self in your own cloned voice: your speech is transcribed, Nemotron writes the reply, and the
// clone says it. ElevenLabs won't run live agents that pair an instant clone with Nemotron, so calls fall back to a
// ready-made voice and this "voice chat" is where the clone is used.

let dir: string;
let db: Db;
let transcript = "How should I spend this week?";
const requests: { method: string; url: string; body: unknown }[] = [];
const BLOCK = "Custom LLM is not allowed when using agents with Instant Voice Clones. Voice (ivc-1) is not allowed.";
const fakeFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  requests.push({ method, url, body });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  if (url.endsWith("/v1/speech-to-text")) return json({ text: transcript });
  if (url.includes("/v1/text-to-speech/")) return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "content-type": "audio/mpeg" } });
  if (url.endsWith("/agents/create") || url.includes("/convai/agents/")) {
    const voice = (body as { conversation_config?: { tts?: { voice_id?: string } } } | null)?.conversation_config?.tts?.voice_id;
    if (voice === "ivc-1") return json({ detail: BLOCK }, 400);
    return json({ agent_id: "agent-1" });
  }
  return json({ status: "ok" });
};
const api = new ElevenLabs("test-key", fakeFetch, "https://el.test");
const wav = () => ({ data: new Uint8Array([82, 73, 70, 70]), filename: "speech.wav", type: "audio/wav" });
const ENV = ["DATABASE_PATH", "VAULT_DIR", "TWIN_DATA_DIR", "TWIN_PUBLIC_URL", "FUTUREME_MULTI_USER", "TWIN_DAILY_VOICE_TURNS", "TWIN_SERVER_DAILY_VOICE_TURNS", "TWIN_PRESET_VOICE_ID", "LLM_PROVIDER"];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "futureme-voice-chat-"));
  process.env.DATABASE_PATH = path.join(dir, "futureme.db");
  process.env.VAULT_DIR = path.join(dir, "vault");
  process.env.TWIN_DATA_DIR = path.join(dir, "voice");
  process.env.TWIN_PUBLIC_URL = "https://tomora.example.org";
  process.env.LLM_PROVIDER = "mock";
  requests.length = 0;
  transcript = "How should I spend this week?";
  resetUsageCache();
  db = openDb(":memory:");
  saveProfile(db, { name: "Amina", dream: "Lead an AI research lab", style: "direct" });
});
afterEach(() => {
  db.close();
  for (const k of ENV) delete process.env[k];
  fs.rmSync(dir, { recursive: true, force: true });
});

const cloneVoice = () => {
  db.prepare("INSERT INTO consents (phrase, code, status) VALUES ('p', 'a b c', 'verified')").run();
  db.prepare("INSERT INTO voice_profiles (voice_id, kind, status, consent_id) VALUES ('ivc-1', 'instant', 'ready', 1)").run();
};

describe("voice chat", () => {
  it("transcribes what you said, has Nemotron answer, and speaks the reply in your cloned voice", async () => {
    cloneVoice();
    const out = await voiceChatTurn(db, api, wav(), [{ role: "user", content: "Hello" }, { role: "assistant", content: "Hi." }]);
    expect(out.heard).toBe("How should I spend this week?");
    expect(out.reply.length).toBeGreaterThan(0);
    expect(out.reply.length).toBeLessThanOrEqual(900);
    expect([...new Uint8Array(out.audio)]).toEqual([1, 2, 3, 4]);
    expect(out.type).toBe("audio/mpeg");
    const tts = requests.find((r) => r.url.includes("/v1/text-to-speech/"))!;
    expect(tts.url).toContain("/v1/text-to-speech/ivc-1");
    expect((tts.body as { text: string }).text).toBe(out.reply);
    // It never touches ElevenLabs' call agents.
    expect(requests.some((r) => r.url.includes("/convai/"))).toBe(false);
  });

  it("needs a cloned ElevenLabs voice, an unpaused twin, and something audible", async () => {
    await expect(voiceChatTurn(db, api, wav())).rejects.toThrow(/Clone your voice with ElevenLabs first/);
    cloneVoice();
    setTwinPaused(db, true);
    await expect(voiceChatTurn(db, api, wav())).rejects.toThrow(/paused/);
    setTwinPaused(db, false);
    transcript = "   ";
    await expect(voiceChatTurn(db, api, wav())).rejects.toThrow(/didn't catch that/);
    await expect(voiceChatTurn(db, api, { data: new Uint8Array(), filename: "x.wav", type: "audio/wav" })).rejects.toThrow(/empty/);
  });

  it("stops after the daily limit of spoken replies, per workspace and for the whole server", async () => {
    cloneVoice();
    process.env.FUTUREME_MULTI_USER = "1";
    process.env.TWIN_DAILY_VOICE_TURNS = "2";
    process.env.TWIN_SERVER_DAILY_VOICE_TURNS = "3";
    await runInWorkspace("a".repeat(32), async () => {
      await voiceChatTurn(db, api, wav());
      await voiceChatTurn(db, api, wav());
      await expect(voiceChatTurn(db, api, wav())).rejects.toThrow(/today's 2 spoken replies/);
    });
    await runInWorkspace("b".repeat(32), async () => {
      await voiceChatTurn(db, api, wav());
      await expect(voiceChatTurn(db, api, wav())).rejects.toThrow(/used today's voice replies/);
    });
  });
});

describe("live calls when ElevenLabs refuses an instant clone", () => {
  it("falls back to the ready-made voice, remembers it, and says so on the page", async () => {
    cloneVoice();
    process.env.TWIN_PRESET_VOICE_ID = "preset-xyz";
    expect(await ensureTwinAgent(db, api)).toBe("agent-1");
    const creates = requests.filter((r) => r.url.endsWith("/agents/create"));
    expect(creates).toHaveLength(2); // the clone was tried first, then the ready-made voice
    expect((creates[0].body as { conversation_config: { tts: { voice_id: string } } }).conversation_config.tts.voice_id).toBe("ivc-1");
    expect((creates[1].body as { conversation_config: { tts: { voice_id: string } } }).conversation_config.tts.voice_id).toBe("preset-xyz");
    expect(callsSnapshot(db).callsUseReadyVoice).toBe(true);

    // Next time it doesn't try the clone again.
    requests.length = 0;
    await ensureTwinAgent(db, api);
    expect(requests.filter((r) => (r.body as { conversation_config?: { tts?: { voice_id?: string } } } | null)?.conversation_config?.tts?.voice_id === "ivc-1")).toHaveLength(0);
  });

  it("doesn't hide other errors", async () => {
    cloneVoice();
    const failing: typeof fetch = async () => new Response(JSON.stringify({ detail: { message: "boom" } }), { status: 500 });
    await expect(ensureTwinAgent(db, new ElevenLabs("k", failing, "https://el.test"))).rejects.toThrow(/boom/);
    expect(callsSnapshot(db).callsUseReadyVoice).toBe(false);
  });
});
