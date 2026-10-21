import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "../src/lib/db";
import { seal, unseal } from "../src/lib/secret-box";
import { getTwinSetting, setTwinSetting } from "../src/lib/twin";
import { ensureTwinAgent } from "../src/lib/twin-calls";
import { deleteTwinData, exportTwinData } from "../src/lib/twin-data";
import { activeVoice, createInstantClone, ElevenLabs, getTranscriber, previewVoice, revokeVoice, startConsent, testEngine, verifyConsent, voiceSnapshot } from "../src/lib/voice";
import { chooseEngine, engineConfig, QWEN_CLONE_MODEL, saveEngine } from "../src/lib/voice-engines";

let dir: string;
let db: Db;
let transcript = "";
const requests: { method: string; url: string; headers: Record<string, string>; body: unknown }[] = [];

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const mp3 = () => new Response(new Uint8Array([73, 68, 51]), { headers: { "content-type": "audio/mpeg" } });

// Stands in for OpenRouter, Qwen (DashScope), ElevenLabs and a self-hosted speech server.
const fakeFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  requests.push({ method, url, headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)), body });
  const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? (init?.headers as Record<string, string> | undefined)?.["xi-api-key"];
  if (auth?.includes("bad")) return json({ error: { message: "Invalid API key" } }, 401);
  if (url.endsWith("/audio/transcriptions")) return json({ text: transcript });
  if (url.endsWith("/audio/speech")) return mp3();
  if (url.endsWith("/multimodal-generation/generation")) return json({ output: { audio: { url: "https://oss.example.com/a.wav" } } });
  if (url === "https://oss.example.com/a.wav") return new Response(new Uint8Array([82, 73, 70, 70]), { headers: { "content-type": "audio/wav" } });
  if (url.endsWith("/tts/customization")) return json({ output: body?.input?.action === "create" ? { voice: "qwen-tts-vc-futureme-1" } : {} });
  if (url.endsWith("/v1/voices")) return json({ voices: [{ voice_id: "mine", category: "cloned" }, { voice_id: "rachel", category: "premade" }] });
  if (url.includes("/v1/text-to-speech/")) return mp3();
  if (url.endsWith("/v1/speech-to-text")) return json({ text: transcript });
  return new Response("not found", { status: 404 });
};
const wav = () => ({ data: new Uint8Array([82, 73, 70, 70, 1, 2]), filename: "consent.wav", type: "audio/wav" });
const sent = (part: string) => requests.filter((r) => r.url.includes(part));

const ENV = ["ELEVENLABS_API_KEY", "OPENROUTER_API_KEY", "DASHSCOPE_API_KEY"];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "futureme-engines-"));
  process.env.TWIN_DATA_DIR = path.join(dir, "voice");
  process.env.VAULT_DIR = path.join(dir, "vault");
  process.env.FUTUREME_SECRET = "test secret";
  process.env.TWIN_PUBLIC_URL = "https://futureme.example.com";
  for (const k of ENV) delete process.env[k];
  vi.stubGlobal("fetch", fakeFetch);
  requests.length = 0;
  db = openDb(":memory:");
});
afterEach(() => {
  vi.unstubAllGlobals();
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function consent() {
  const { id, phrase } = startConsent(db);
  transcript = phrase;
  const stt = getTranscriber(db);
  if (!stt) throw new Error("no transcriber");
  return verifyConsent(db, stt, id, wav());
}

describe("voice engine keys", () => {
  it("encrypts keys, never shows them, and lets the environment win", () => {
    expect(unseal(seal("sk-or-123"))).toBe("sk-or-123");
    saveEngine(db, { engine: "openrouter", key: "sk-or-v1-abcd1234", model: "fish-audio/s2.1-pro" });
    const raw = getTwinSetting(db, "engine_key:openrouter")!;
    expect(raw).not.toContain("abcd1234");
    expect(engineConfig(db, "openrouter")).toMatchObject({ key: "sk-or-v1-abcd1234", keySource: "app", keyHint: "1234" });
    const snapshot = JSON.stringify(voiceSnapshot(db));
    expect(snapshot).not.toContain("sk-or-v1-abcd1234");
    expect(snapshot).toContain('"keyHint":"1234"');

    process.env.OPENROUTER_API_KEY = "sk-env-9999";
    expect(engineConfig(db, "openrouter")).toMatchObject({ key: "sk-env-9999", keySource: "env" });

    // A key sealed under another secret can't be read, and says so.
    delete process.env.OPENROUTER_API_KEY;
    process.env.FUTUREME_SECRET = "a different secret";
    expect(engineConfig(db, "openrouter")).toMatchObject({ key: null, keyLost: true });
  });

  it("checks base URLs and needs a key before an engine is picked", () => {
    expect(() => saveEngine(db, { engine: "openai", baseUrl: "file:///etc/passwd", model: "kokoro" })).toThrow(/https/);
    expect(() => saveEngine(db, { engine: "openai", baseUrl: "https://user:pw@tts.example.com/v1" })).toThrow(/key field/);
    expect(() => chooseEngine(db, "qwen", null)).toThrow(/Qwen TTS key/);
    saveEngine(db, { engine: "qwen", key: "sk-qwen-1" });
    chooseEngine(db, "qwen", null);
    expect(voiceSnapshot(db)).toMatchObject({ engine: "qwen", configured: true, canConsent: false });
    expect(() => chooseEngine(db, "openrouter", "qwen")).toThrow(/Delete your voice first/);
  });
});

describe("testing an engine", () => {
  it("speaks a line with each engine, using what's typed before what's saved", async () => {
    const or = await testEngine(db, { engine: "openrouter", key: "sk-or-typed", model: "mistralai/voxtral-mini-tts-2603", voice: "en_paul_neutral" });
    expect(or).toMatchObject({ type: "audio/mpeg", ownVoice: false });
    expect(sent("/audio/speech")[0]).toMatchObject({
      url: "https://openrouter.ai/api/v1/audio/speech",
      headers: { Authorization: "Bearer sk-or-typed" },
      body: { model: "mistralai/voxtral-mini-tts-2603", voice: "en_paul_neutral", response_format: "mp3" },
    });

    const q = await testEngine(db, { engine: "qwen", key: "sk-qwen-1" });
    expect(q.type).toBe("audio/wav");
    expect(sent("/generation")[0]).toMatchObject({
      url: "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
      body: { model: "qwen3-tts-flash", input: { voice: "Cherry" } },
    });

    saveEngine(db, { engine: "openai", baseUrl: "https://tts.nebius.example/v1/", model: "Qwen/Qwen3-TTS", voice: "Vivian" });
    await testEngine(db, { engine: "openai" });
    expect(sent("tts.nebius.example")[0]).toMatchObject({ url: "https://tts.nebius.example/v1/audio/speech", body: { model: "Qwen/Qwen3-TTS", voice: "Vivian" } });
    expect(sent("tts.nebius.example")[0].headers.Authorization).toBeUndefined();

    await testEngine(db, { engine: "elevenlabs", key: "el-key" });
    expect(sent("/v1/text-to-speech/")[0].url).toContain("/v1/text-to-speech/rachel");
  });

  it("explains a rejected key", async () => {
    await expect(testEngine(db, { engine: "openrouter", key: "bad-key" })).rejects.toThrow(/didn't accept that key \(401\)\. Invalid API key/);
    await expect(testEngine(db, { engine: "qwen" })).rejects.toThrow(/Paste a Qwen TTS key/);
  });
});

describe("cloning with another engine", () => {
  it("Qwen: enrolls the consent recording, speaks with it, and deletes it", async () => {
    saveEngine(db, { engine: "openrouter", key: "sk-or-1" }); // hears the consent phrase
    saveEngine(db, { engine: "qwen", key: "sk-qwen-1" });
    chooseEngine(db, "qwen", null);
    expect((await consent()).verified).toBe(true);
    expect(sent("/audio/transcriptions")[0].body).toMatchObject({ model: "openai/whisper-large-v3", input_audio: { format: "wav" } });

    await createInstantClone(db, [wav()]);
    expect(activeVoice(db)).toMatchObject({ provider: "qwen", voice_id: "qwen-tts-vc-futureme-1", model: QWEN_CLONE_MODEL });
    const enroll = sent("/tts/customization")[0].body as { model: string; input: { action: string; target_model: string; audio: { data: string } } };
    expect(enroll).toMatchObject({ model: "qwen-voice-enrollment", input: { action: "create", target_model: QWEN_CLONE_MODEL } });
    expect(enroll.input.audio.data).toMatch(/^data:audio\/wav;base64,/);
    // Only the consent recording is kept: Qwen doesn't use extra samples.
    expect(fs.readdirSync(process.env.TWIN_DATA_DIR!)).toHaveLength(1);

    await previewVoice(db, "Hello from the future.");
    expect(sent("/generation").at(-1)!.body).toMatchObject({ model: QWEN_CLONE_MODEL, input: { text: "Hello from the future.", voice: "qwen-tts-vc-futureme-1" } });
    // The test plays your own voice when this engine holds it.
    expect((await testEngine(db, { engine: "qwen", voice: "" })).ownVoice).toBe(true);

    // Calls stay on ElevenLabs.
    await expect(ensureTwinAgent(db, new ElevenLabs("k", fakeFetch))).rejects.toThrow(/Calls run on ElevenLabs/);

    await revokeVoice(db, null);
    expect(sent("/tts/customization").at(-1)!.body).toMatchObject({ input: { action: "delete", voice: "qwen-tts-vc-futureme-1" } });
    expect(voiceSnapshot(db)).toMatchObject({ voices: [], active: null });
    expect(fs.readdirSync(process.env.TWIN_DATA_DIR!)).toHaveLength(0);
  });

  it("OpenRouter: nothing is enrolled; the consent recording and its transcript go with each request", async () => {
    saveEngine(db, { engine: "openrouter", key: "sk-or-1", model: "fish-audio/s2.1-pro" });
    chooseEngine(db, "openrouter", null);
    await consent();
    await createInstantClone(db, []);
    expect(activeVoice(db)).toMatchObject({ provider: "openrouter" });
    await previewVoice(db);
    const req = sent("/audio/speech").at(-1)!.body as { model: string; voice?: string; input_references: { type: string }[] };
    expect(req.model).toBe("fish-audio/s2.1-pro");
    expect(req.voice).toBeUndefined();
    expect(req.input_references).toEqual([
      { type: "input_audio", input_audio: { data: expect.stringMatching(/^data:audio\/wav;base64,/) } },
      { type: "text", text: transcript },
    ]);
  });

  it("self-hosted engines can't clone", async () => {
    saveEngine(db, { engine: "openrouter", key: "sk-or-1" });
    saveEngine(db, { engine: "openai", baseUrl: "https://tts.example.com/v1", model: "kokoro" });
    chooseEngine(db, "openai", null);
    await consent();
    await expect(createInstantClone(db, [])).rejects.toThrow(/preset voices only/);
  });
});

describe("twin data and engine keys", () => {
  it("export leaves keys out, and delete-all keeps them", async () => {
    saveEngine(db, { engine: "openrouter", key: "sk-or-v1-abcd1234" });
    chooseEngine(db, "openrouter", null);
    setTwinSetting(db, "inbox_id", "inbox-1");
    expect(JSON.stringify(exportTwinData(db))).not.toContain("engine_key");
    await deleteTwinData(db, null, null);
    expect(getTwinSetting(db, "inbox_id")).toBeNull();
    expect(engineConfig(db, "openrouter").key).toBe("sk-or-v1-abcd1234");
    expect(voiceSnapshot(db).engine).toBe("openrouter");
  });
});
