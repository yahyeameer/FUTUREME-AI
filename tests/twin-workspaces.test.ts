import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../src/lib/db";
import { saveProfile } from "../src/lib/futureme";
import { callsConfig, ensureTwinAgent, savePhoneNumberId, setOwnerPhone } from "../src/lib/twin-calls";
import { runInWorkspace, workspaceFromHandle, workspaceHandle } from "../src/lib/tenant";
import { ElevenLabs } from "../src/lib/voice";

// The voice twin on a multi-user server: each workspace brings its own ElevenLabs phone number, and ElevenLabs' calls
// back into TOMORA find the right workspace by its handle.

const A = "a".repeat(32);
let dir: string;
let db: Db;
const requests: { url: string; body: unknown }[] = [];
const fakeFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  requests.push({ url, body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
  return new Response(JSON.stringify({ agent_id: "agent-1", success: true, conversation_id: "conv-1" }), { status: 200, headers: { "content-type": "application/json" } });
};
const api = new ElevenLabs("test-key", fakeFetch, "https://el.test");

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "futureme-twin-ws-"));
  process.env.DATABASE_PATH = path.join(dir, "futureme.db");
  process.env.VAULT_DIR = path.join(dir, "vault");
  process.env.LLM_PROVIDER = "mock";
  process.env.TWIN_PUBLIC_URL = "https://tomora.example.org";
  delete process.env.ELEVENLABS_PHONE_NUMBER_ID;
  delete process.env.FUTUREME_MULTI_USER;
  requests.length = 0;
  db = openDb(":memory:");
  saveProfile(db, { name: "Amina", dream: "Lead an AI research lab", style: "direct" });
  db.prepare("INSERT INTO consents (phrase, code, status) VALUES ('p', 'a b c', 'verified')").run();
  db.prepare("INSERT INTO voice_profiles (voice_id, kind, status, consent_id) VALUES ('ivc-1', 'instant', 'ready', 1)").run();
});
afterEach(() => {
  db.close();
  for (const k of ["DATABASE_PATH", "VAULT_DIR", "TWIN_PUBLIC_URL", "ELEVENLABS_PHONE_NUMBER_ID", "FUTUREME_MULTI_USER"]) delete process.env[k];
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("a workspace's own phone number", () => {
  it("is saved on the Twin page, checked, and the server's number wins when it has one", () => {
    expect(callsConfig(db)).toMatchObject({ phoneNumberId: null, phoneSource: null });
    expect(() => savePhoneNumberId(db, "not an id!")).toThrow(/phone number ID/);
    savePhoneNumberId(db, " phnum_abc123 ");
    expect(callsConfig(db)).toMatchObject({ phoneNumberId: "phnum_abc123", phoneSource: "app" });
    process.env.ELEVENLABS_PHONE_NUMBER_ID = "phnum-server";
    expect(callsConfig(db)).toMatchObject({ phoneNumberId: "phnum-server", phoneSource: "env" });
    delete process.env.ELEVENLABS_PHONE_NUMBER_ID;
    savePhoneNumberId(db, "");
    expect(callsConfig(db).phoneNumberId).toBeNull();
  });

  it("is what calls use, and without one the twin explains how to get one", async () => {
    await expect(setOwnerPhone(db, api, "+252634000001")).rejects.toThrow(/paste its phone number ID on the Voice Twin page/);
    savePhoneNumberId(db, "phnum_abc123");
    await setOwnerPhone(db, api, "+252634000001");
    const dial = requests.find((r) => r.url.endsWith("/outbound-call"));
    expect(dial?.body).toMatchObject({ agent_phone_number_id: "phnum_abc123", to_number: "+252634000001" });
  });
});

describe("callbacks in multi-user mode", () => {
  it("name the workspace by a one-way handle that the server can look up", () => {
    const h = workspaceHandle(A);
    expect(h).toMatch(/^[a-f0-9]{32}$/);
    expect(h).not.toContain(A.slice(0, 8));
    expect(workspaceHandle(A)).toBe(h);
    expect(workspaceFromHandle(h)).toBeNull();
    fs.mkdirSync(path.join(dir, "workspaces", A), { recursive: true });
    expect(workspaceFromHandle(h)).toBe(A);
    expect(workspaceFromHandle("../../etc")).toBeNull();
  });

  it("point ElevenLabs at this workspace's own address", async () => {
    process.env.FUTUREME_MULTI_USER = "1";
    await runInWorkspace(A, () => ensureTwinAgent(db, api));
    const create = requests.find((r) => r.url.endsWith("/agents/create"))!.body as {
      conversation_config: { agent: { prompt: { custom_llm: { url: string } } } };
      platform_settings: { workspace_overrides: { conversation_initiation_client_data_webhook: { url: string } } };
    };
    const h = workspaceHandle(A);
    expect(create.conversation_config.agent.prompt.custom_llm.url).toBe(`https://tomora.example.org/api/twin/llm/ws/${h}/v1`);
    expect(create.platform_settings.workspace_overrides.conversation_initiation_client_data_webhook.url).toBe(`https://tomora.example.org/api/twin/inbound?ws=${h}`);
  });
});
