import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../src/lib/db";
import { saveProfile } from "../src/lib/futureme";
import { runInWorkspace, workspaceHandle } from "../src/lib/tenant";
import { getTwinSetting, setTwinSetting } from "../src/lib/twin";
import { savePhoneNumberId, scheduleSelfCall } from "../src/lib/twin-calls";
import { closeSchedulerDbs, tickAll, workspaceIds } from "../src/lib/twin-scheduler";
import { ElevenLabs } from "../src/lib/voice";

// Scheduled calls on a multi-user server: the scheduler visits every workspace and places each one's due calls with
// that workspace's own key and phone number, and nobody else's.

const A = "a".repeat(32);
const B = "b".repeat(32);
let dir: string;
const requests: { url: string; body: unknown }[] = [];
const fakeFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  requests.push({ url, body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
  const body = url.endsWith("/outbound-call") ? { success: true, message: "ok", conversation_id: `conv-${requests.length}`, callSid: "CA1" } : url.includes("/conversations") ? { conversations: [] } : { agent_id: "agent-1" };
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
};
const api = new ElevenLabs("test-key", fakeFetch, "https://el.test");
// Only a workspace that "saved a key" gets a client, as getVoiceApi does with a real key.
const voiceApi = (db: Db) => (getTwinSetting(db, "test_has_key") ? api : null);

async function setUpWorkspace(id: string, { phoneId, withKey, dueCall }: { phoneId: string; withKey: boolean; dueCall: boolean }) {
  const file = path.join(dir, "workspaces", id, "futureme.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = openDb(file);
  await runInWorkspace(id, async () => {
    saveProfile(db, { name: id === A ? "Amina" : "Yusuf", dream: "A future worth calling about", style: "direct" });
    db.prepare("INSERT INTO consents (phrase, code, status) VALUES ('p', 'a b c', 'verified')").run();
    db.prepare("INSERT INTO voice_profiles (voice_id, kind, status, consent_id) VALUES ('ivc-1', 'instant', 'ready', 1)").run();
    savePhoneNumberId(db, phoneId);
    setTwinSetting(db, "owner_phone", "+252634000001");
    setTwinSetting(db, "owner_phone_verified", "+252634000001");
    if (withKey) setTwinSetting(db, "test_has_key", "1");
    if (dueCall) {
      const call = await scheduleSelfCall(db, api, { mode: "future_call", topic: "the lab", at: new Date(Date.now() + 3_600_000).toISOString() });
      db.prepare("UPDATE calls SET scheduled_for = datetime('now', '-1 minute') WHERE id = ?").run(call.id);
    }
  });
  db.close();
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "futureme-sched-"));
  process.env.DATABASE_PATH = path.join(dir, "futureme.db");
  process.env.FUTUREME_MULTI_USER = "1";
  process.env.LLM_PROVIDER = "mock";
  process.env.TWIN_PUBLIC_URL = "https://tomora.example.org";
  delete process.env.ELEVENLABS_PHONE_NUMBER_ID;
  requests.length = 0;
});
afterEach(() => {
  closeSchedulerDbs();
  for (const k of ["DATABASE_PATH", "FUTUREME_MULTI_USER", "TWIN_PUBLIC_URL"]) delete process.env[k];
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("the scheduler on a multi-user server", () => {
  it("places each workspace's due call with its own phone number and callback address", async () => {
    await setUpWorkspace(A, { phoneId: "phnum_amina", withKey: true, dueCall: true });
    await setUpWorkspace(B, { phoneId: "phnum_yusuf", withKey: false, dueCall: true });
    expect(workspaceIds().sort()).toEqual([A, B]);
    requests.length = 0;

    const { ticks, errors } = await tickAll(null, voiceApi);
    expect(errors).toEqual([]);
    // B has no ElevenLabs key, so only A ran, and placed its one due call.
    expect(ticks).toEqual([expect.objectContaining({ workspace: A, dialled: 1 })]);
    const dials = requests.filter((r) => r.url.endsWith("/outbound-call"));
    expect(dials).toHaveLength(1);
    expect(dials[0].body).toMatchObject({ agent_phone_number_id: "phnum_amina", to_number: "+252634000001" });
    const agent = requests.find((r) => r.url.endsWith("/agents/create"))!.body as { conversation_config: { agent: { prompt: { custom_llm: { url: string } } } } };
    expect(agent.conversation_config.agent.prompt.custom_llm.url).toContain(`/ws/${workspaceHandle(A)}/`);

    // The call is recorded in A's own database (placed, then synced); B's call is still waiting for a key.
    const status = (id: string) => {
      const d = openDb(path.join(dir, "workspaces", id, "futureme.db"));
      try {
        return (d.prepare("SELECT status FROM calls WHERE mode = 'future_call'").get() as { status: string }).status;
      } finally {
        d.close();
      }
    };
    expect(status(A)).not.toBe("scheduled");
    expect(status(B)).toBe("scheduled");

    // A second pass doesn't dial the same call again.
    requests.length = 0;
    await tickAll(null, voiceApi);
    expect(requests.filter((r) => r.url.endsWith("/outbound-call"))).toHaveLength(0);
  });

  it("keeps going when one workspace fails", async () => {
    await setUpWorkspace(A, { phoneId: "phnum_amina", withKey: true, dueCall: false });
    fs.mkdirSync(path.join(dir, "workspaces", B), { recursive: true });
    fs.writeFileSync(path.join(dir, "workspaces", B, "futureme.db"), "not a database");
    const { ticks, errors } = await tickAll(null, voiceApi);
    expect(ticks.map((t) => t.workspace)).toEqual([A]);
    expect(errors).toEqual([expect.objectContaining({ workspace: B })]);
  });
});
