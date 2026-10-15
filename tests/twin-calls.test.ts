import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../src/lib/db";
import { runTool, saveProfile } from "../src/lib/futureme";
import { getTwinSetting, setTwinPaused } from "../src/lib/twin";
import {
  confirmOwnerPhone,
  dialDueCalls,
  ensureTwinAgent,
  replyOnCall,
  scheduleSelfCall,
  SECRET_HEADER,
  SELF_CALLS_PER_DAY,
  setOwnerPhone,
  startWebCall,
  syncCalls,
  webCallConnected,
} from "../src/lib/twin-calls";
import { readNote } from "../src/lib/vault";
import { ElevenLabs, revokeVoice } from "../src/lib/voice";

let dir: string;
let db: Db;
const requests: { method: string; url: string; body: unknown }[] = [];
let conversations: Record<string, unknown> = {};
let outboundCount = 0;

// A stand-in for ElevenLabs' agent, phone and conversation endpoints.
const fakeFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  requests.push({ method, url, body });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  if (url.endsWith("/v1/convai/agents/create")) return json({ agent_id: "agent-1" });
  if (url.endsWith("/v1/convai/agents/agent-1")) return json({ agent_id: "agent-1" });
  if (url.includes("/v1/convai/conversation/token")) return json({ token: "webrtc-token" });
  if (url.endsWith("/v1/convai/twilio/outbound-call")) return json({ success: true, message: "ok", conversation_id: `conv-${++outboundCount}`, callSid: "CA1" });
  const conv = url.match(/\/v1\/convai\/conversations\/(.+)$/);
  if (conv) return conversations[conv[1]] ? json(conversations[conv[1]]) : json({ detail: "not found" }, 404);
  if (method === "DELETE") return json({ status: "ok" });
  return new Response("not found", { status: 404 });
};
const api = new ElevenLabs("test-key", fakeFetch, "https://el.test");
const outbound = () => requests.filter((r) => r.url.endsWith("/outbound-call"));
const sysRef = (ref: string) => [{ role: "system" as const, content: `futureme-call:${ref}` }];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "futureme-calls-"));
  process.env.VAULT_DIR = path.join(dir, "vault");
  process.env.TWIN_DATA_DIR = path.join(dir, "voice");
  process.env.LLM_PROVIDER = "mock";
  process.env.TWIN_PUBLIC_URL = "https://futureme.example.com/";
  process.env.ELEVENLABS_PHONE_NUMBER_ID = "phnum-1";
  delete process.env.DOCKER_AGENT_URL;
  delete process.env.TWIN_LLM_SECRET;
  requests.length = 0;
  conversations = {};
  outboundCount = 0;
  db = openDb(":memory:");
  saveProfile(db, { name: "Amina Yusuf", dream: "Lead an AI research lab in Hargeisa", style: "direct" });
  // A cloned voice, as Phase 1 leaves it.
  db.prepare("INSERT INTO consents (phrase, code, status) VALUES ('p', 'a b c', 'verified')").run();
  db.prepare("INSERT INTO voice_profiles (voice_id, kind, status, consent_id) VALUES ('ivc-1', 'instant', 'ready', 1)").run();
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function verifyPhone(number = "+252634000001") {
  await setOwnerPhone(db, api, number);
  confirmOwnerPhone(db, getTwinSetting(db, "phone_code")!);
}

function addTask(title = "Send the grant draft to Hodan") {
  const goal = db.prepare("INSERT INTO goals (title) VALUES ('Win the research grant')").run().lastInsertRowid;
  return Number(db.prepare("INSERT INTO tasks (goal_id, title) VALUES (?, ?)").run(goal, title).lastInsertRowid);
}

describe("the twin's ElevenLabs agent", () => {
  it("points ElevenLabs at this app as a custom LLM, with a secret, and only updates when something changed", async () => {
    expect(await ensureTwinAgent(db, api)).toBe("agent-1");
    const create = requests.find((r) => r.url.endsWith("/agents/create"))!.body as {
      conversation_config: { agent: { first_message: string; prompt: { llm: string; custom_llm: { url: string; request_headers: Record<string, string> } } }; tts: { voice_id: string } };
      platform_settings: { auth: { enable_auth: boolean } };
    };
    const agent = create.conversation_config.agent;
    expect(agent.first_message).toBe("{{opening_line}}");
    expect(agent.prompt.llm).toBe("custom-llm");
    expect(agent.prompt.custom_llm.url).toBe("https://futureme.example.com/api/twin/llm/v1");
    expect(agent.prompt.custom_llm.request_headers[SECRET_HEADER]).toHaveLength(32);
    expect(create.conversation_config.tts.voice_id).toBe("ivc-1");
    expect(create.platform_settings.auth.enable_auth).toBe(true);

    await ensureTwinAgent(db, api);
    expect(requests.filter((r) => r.url.includes("/convai/agents/"))).toHaveLength(1);
    db.prepare("UPDATE voice_profiles SET voice_id = 'ivc-2'").run();
    await ensureTwinAgent(db, api);
    expect(requests.at(-1)).toMatchObject({ method: "PATCH", url: "https://el.test/v1/convai/agents/agent-1" });
  });

  it("needs a cloned voice and a public URL", async () => {
    delete process.env.TWIN_PUBLIC_URL;
    await expect(ensureTwinAgent(db, api)).rejects.toThrow(/TWIN_PUBLIC_URL/);
    db.prepare("DELETE FROM voice_profiles").run();
    await expect(ensureTwinAgent(db, api)).rejects.toThrow(/Clone your voice/);
  });

  it("is deleted with the voice", async () => {
    await ensureTwinAgent(db, api);
    await revokeVoice(db, api);
    expect(requests.some((r) => r.method === "DELETE" && r.url.endsWith("/convai/agents/agent-1"))).toBe(true);
    expect(getTwinSetting(db, "agent_id")).toBeNull();
  });
});

describe("browser calls", () => {
  it("answers only for a live call this app started", async () => {
    const web = await startWebCall(db, api, "my research plan");
    expect(web.conversationToken).toBe("webrtc-token");
    expect(web.dynamicVariables.opening_line).toMatch(/^Hey Amina\. It's you, from \d{4}\. Not a recording: an AI version/);

    const reply = await replyOnCall(db, [...sysRef(web.dynamicVariables.call_ref), { role: "user", content: "I'm stuck on the grant." }]);
    expect(reply.length).toBeGreaterThan(5);
    expect(reply).not.toMatch(/can't continue/);

    const forged = web.dynamicVariables.call_ref.replace(/\.(.)/, (_, c) => `.${c === "a" ? "b" : "a"}`);
    expect(await replyOnCall(db, [...sysRef(forged), { role: "user", content: "hi" }])).toMatch(/can't continue this call/);
    expect(await replyOnCall(db, [{ role: "user", content: "hi" }])).toMatch(/can't continue this call/);

    setTwinPaused(db, true);
    expect(await replyOnCall(db, [...sysRef(web.dynamicVariables.call_ref), { role: "user", content: "hi" }])).toMatch(/paused/);
    await expect(startWebCall(db, api)).rejects.toThrow(/paused/);
  });

  it("files the transcript in the vault's Calls folder when the call ends", async () => {
    const web = await startWebCall(db, api);
    webCallConnected(db, web.callId, "conv-web");
    conversations["conv-web"] = { status: "processing" };
    expect(await syncCalls(db, api)).toBe(0);
    conversations["conv-web"] = {
      status: "done",
      transcript: [
        { role: "agent", message: "Hey Amina. It's you.", time_in_call_secs: 0 },
        { role: "user", message: "Should I apply for the grant?", time_in_call_secs: 4 },
        { role: "agent", message: "Yes. Send the draft to Hodan tonight.", time_in_call_secs: 9 },
      ],
      analysis: { transcript_summary: "Amina decided to apply for the grant." },
      metadata: { call_duration_secs: 95 },
    };
    expect(await syncCalls(db, api)).toBe(1);
    const row = db.prepare("SELECT status, note_path, duration_secs FROM calls WHERE id = ?").get(web.callId) as { status: string; note_path: string; duration_secs: number };
    expect(row).toMatchObject({ status: "done", duration_secs: 95 });
    expect(row.note_path).toMatch(/^Calls\//);
    const note = readNote(row.note_path);
    expect(note.data.evidence).toBe("verified");
    expect(note.body).toContain("_Written by AI from the transcript._");
    expect(note.body).toContain("**You:** Should I apply for the grant?");
    expect(note.body).toContain("**Future you (AI):** Yes. Send the draft to Hodan tonight.");
  });
});

describe("phone calls", () => {
  it("verifies the user's own number with a code read out on a call", async () => {
    await expect(scheduleSelfCall(db, api, { mode: "future_call", topic: "the lab" })).rejects.toThrow(/Verify your phone/);
    await setOwnerPhone(db, api, "+252 63 400 0001");
    const [dial] = outbound();
    const code = getTwinSetting(db, "phone_code")!;
    expect(dial.body).toMatchObject({ agent_id: "agent-1", agent_phone_number_id: "phnum-1", to_number: "+252634000001" });
    const opening = (dial.body as { conversation_initiation_client_data: { dynamic_variables: { opening_line: string } } }).conversation_initiation_client_data.dynamic_variables.opening_line;
    expect(opening).toContain("an AI assistant");
    expect(opening).toContain(code.split("").join(", "));

    expect(() => confirmOwnerPhone(db, "000000" === code ? "111111" : "000000")).toThrow(/doesn't match/);
    confirmOwnerPhone(db, code);
    expect(getTwinSetting(db, "owner_phone_verified")).toBe("+252634000001");
  });

  it("schedules Call From the Future and dials it only when due, and never past the daily limit", async () => {
    await verifyPhone();
    const later = new Date(Date.now() + 3_600_000).toISOString();
    const scheduled = await scheduleSelfCall(db, api, { mode: "future_call", topic: "whether to move to Hargeisa", at: later });
    expect(scheduled.status).toBe("scheduled");
    expect(await dialDueCalls(db, api)).toBe(0);
    await dialDueCalls(db, api, new Date(Date.now() + 2 * 3_600_000));
    const dial = outbound().at(-1)!.body as { to_number: string; conversation_initiation_client_data: { dynamic_variables: { opening_line: string } } };
    expect(dial.to_number).toBe("+252634000001");
    expect(dial.conversation_initiation_client_data.dynamic_variables.opening_line).toMatch(/calling from \d{4}\. Well, an AI version of your future self\. .*whether to move to Hargeisa/);

    // The verification call and the call above count; the rest fill the day.
    for (let i = 2; i < SELF_CALLS_PER_DAY; i++) await scheduleSelfCall(db, api, { mode: "future_call", topic: `topic ${i}` });
    await expect(scheduleSelfCall(db, api, { mode: "future_call", topic: "one too many" })).rejects.toThrow(/daily limit/);
  });

  it("stops dialling when the twin is paused or the number changes", async () => {
    await verifyPhone();
    await scheduleSelfCall(db, api, { mode: "future_call", topic: "x", at: new Date(Date.now() + 60_000).toISOString() });
    setTwinPaused(db, true);
    expect(await dialDueCalls(db, api, new Date(Date.now() + 120_000))).toBe(0);
    setTwinPaused(db, false);
    db.prepare("UPDATE twin_settings SET value = '+252634999999' WHERE key = 'owner_phone_verified'").run();
    await dialDueCalls(db, api, new Date(Date.now() + 120_000));
    expect(db.prepare("SELECT status, error FROM calls WHERE mode = 'future_call'").get()).toMatchObject({ status: "failed", error: expect.stringMatching(/verified phone/) });
  });
});

describe("Promise Keeper", () => {
  it("marks the call's own task done only during that live call", async () => {
    await verifyPhone();
    const taskId = addTask();
    const other = addTask("Something else");
    const call = await scheduleSelfCall(db, api, { mode: "promise_check", taskId });
    const ref = `${call.id}.${call.ref_token}`;
    const dial = outbound().at(-1)!.body as { conversation_initiation_client_data: { dynamic_variables: { opening_line: string } } };
    expect(dial.conversation_initiation_client_data.dynamic_variables.opening_line).toContain("You told me you'd send the grant draft to Hodan. Did you do it?");

    expect((await runTool(db, "confirm_task_done", JSON.stringify({ call_ref: `${call.id}.wrongtoken123` }))).output).toMatch(/^Error/);
    const done = await runTool(db, "confirm_task_done", JSON.stringify({ call_ref: ref }));
    expect(done.output).toMatch(/Marked "Send the grant draft to Hodan" done/);
    expect(db.prepare("SELECT status FROM tasks WHERE id = ?").get(taskId)).toEqual({ status: "done" });
    expect(db.prepare("SELECT status FROM tasks WHERE id = ?").get(other)).toEqual({ status: "todo" });

    // Once the call is over, its ref is dead.
    conversations[`conv-${outboundCount}`] = { status: "done", transcript: [{ role: "user", message: "Yes, I sent it." }] };
    await syncCalls(db, api);
    const again = await runTool(db, "confirm_task_done", JSON.stringify({ call_ref: ref }));
    expect(again.output).toMatch(/only works during a Promise Keeper call/);
  });

  it("can't be used from a different kind of call", async () => {
    addTask();
    const web = await startWebCall(db, api);
    const out = await runTool(db, "confirm_task_done", JSON.stringify({ call_ref: web.dynamicVariables.call_ref }));
    expect(out.output).toMatch(/only works during a Promise Keeper call/);
  });
});
